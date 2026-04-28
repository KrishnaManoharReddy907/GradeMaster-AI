"""
Assessment Report Service

Generates per-assessment report data for teachers after assignment deadline.
Provides common metrics + type-specific insights (MCQ, Coding, Manual).
Uses Gemini AI for teaching recommendations.
"""

import os
import json
import statistics
from datetime import datetime, timezone
from bson import ObjectId
from collections import Counter

from google import genai
from google.genai import types
from dotenv import load_dotenv

from app.database import get_database

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
ai_client = genai.Client(api_key=GEMINI_API_KEY)
MODEL_NAME = "gemini-2.5-flash"


async def _get_ai_recommendation(prompt: str) -> str:
    """Get AI-generated teaching recommendation using Gemini."""
    try:
        response = ai_client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.7,
                max_output_tokens=2000,
            )
        )
        return response.text.strip()
    except Exception as e:
        print(f"AI recommendation failed: {e}")
        return "Unable to generate AI recommendation at this time."


async def get_or_generate_report(assessment_id: str, teacher_id: str, force_regenerate: bool = False) -> dict:
    """
    Get assessment report — from cache if available, or generate fresh.
    
    Uses `assessment_reports` collection as cache.
    - First call: generates report + saves to `assessment_reports`
    - Subsequent calls: loads from cache (instant, no AI call)
    - force_regenerate=True: re-computes everything and updates cache
    """
    db = get_database()

    # 1. Check cache (unless forced regeneration)
    if not force_regenerate:
        cached = await db.assessment_reports.find_one({"assessment_id": assessment_id})
        if cached:
            # Remove MongoDB _id before returning
            cached.pop("_id", None)
            return cached

    # 2. Generate fresh report
    report = await _generate_assessment_report_data(assessment_id, teacher_id)
    if "error" in report:
        return report

    # 3. Save to cache
    report["assessment_id"] = assessment_id
    report["teacher_id"] = teacher_id
    report["generated_at"] = datetime.now(timezone.utc).isoformat()

    # Upsert: update if exists, insert if not
    await db.assessment_reports.update_one(
        {"assessment_id": assessment_id},
        {"$set": report},
        upsert=True
    )

    return report


async def _generate_assessment_report_data(assessment_id: str, teacher_id: str) -> dict:
    """
    Generate comprehensive report for a single assessment.
    Only callable after the assessment's end_time has passed.
    """
    db = get_database()

    # 1. Fetch the assessment
    assessment = await db.assessments.find_one({"_id": ObjectId(assessment_id)})
    if not assessment:
        return {"error": "Assessment not found"}

    if assessment.get("teacher_id") != teacher_id:
        return {"error": "Not your assessment"}

    a_type = assessment.get("assessment_type", "unknown")
    total_marks = assessment.get("total_marks", 0)

    # 2. Count eligible students (from assigned sections)
    section_ids = assessment.get("section_ids", [])
    year = assessment.get("year")
    eligible_count = 0
    if section_ids:
        # Try with year first
        if year:
            eligible_count = await db.users.count_documents({
                "role": "student",
                "section": {"$in": section_ids},
                "year": year
            })
        # Fallback without year
        if eligible_count == 0:
            eligible_count = await db.users.count_documents({
                "role": "student",
                "section": {"$in": section_ids}
            })

    # 3. Fetch submissions
    # MCQ: auto-graded, no teacher review needed
    mcq_subs = await db.mcq_submissions.find(
        {"assessment_id": assessment_id}
    ).to_list(length=5000)

    # Coding: only finalized (teacher must review first)
    coding_subs = await db.coding_submissions.find(
        {"assessment_id": assessment_id, "status": "finalized"}
    ).to_list(length=5000)

    # Manual: only finalized (teacher must review first)
    manual_subs = await db.manual_submissions.find(
        {"assessment_id": assessment_id, "status": "finalized"}
    ).to_list(length=5000)

    # 4. Build unified score list
    scores = []
    student_scores = {}  # student_id -> total percentage

    # MCQ scores
    for s in mcq_subs:
        score = s.get("score", 0)
        max_m = s.get("total_marks") or total_marks or 1
        pct = round((score / max_m * 100), 1) if max_m > 0 else 0
        sid = s.get("student_id", "")
        scores.append(pct)
        student_scores[sid] = pct

    # Coding scores (group by student, take latest)
    coding_by_student = {}
    for s in coding_subs:
        sid = s.get("student_id", "")
        if sid not in coding_by_student:
            coding_by_student[sid] = s

    for sid, s in coding_by_student.items():
        score = s.get("final_score") or s.get("ai_score") or s.get("score") or 0
        max_m = s.get("max_marks") or total_marks or 1
        pct = round((score / max_m * 100), 1) if max_m > 0 else 0
        scores.append(pct)
        student_scores[sid] = pct

    # Manual scores (only finalized reach here)
    for s in manual_subs:
        manual_eval = s.get("manual_evaluation", {})
        score = s.get("teacher_adjusted_score") if s.get("teacher_adjusted_score") is not None else manual_eval.get("total_score", 0)
        max_m = manual_eval.get("total_marks") or total_marks or 1
        pct = round((score / max_m * 100), 1) if max_m > 0 else 0
        sid = s.get("student_id", "")
        scores.append(pct)
        student_scores[sid] = pct

    # Unique submitters
    all_submitter_ids = set()
    for s in mcq_subs:
        all_submitter_ids.add(s.get("student_id"))
    for s in coding_subs:
        all_submitter_ids.add(s.get("student_id"))
    for s in manual_subs:
        all_submitter_ids.add(s.get("student_id"))

    total_submissions = len(all_submitter_ids)

    # Also count ALL submissions (including non-finalized) for context
    all_mcq_count = len(mcq_subs)
    all_coding_count = await db.coding_submissions.count_documents({"assessment_id": assessment_id})
    all_manual_count = await db.manual_submissions.count_documents({"assessment_id": assessment_id})
    total_all_submissions = all_mcq_count + all_coding_count + all_manual_count

    # If eligible count is 0 (sections not assigned to students), use actual submitters
    if eligible_count == 0:
        eligible_count = max(total_submissions, total_all_submissions)

    # 5. Compute common metrics
    if scores:
        avg_score = round(statistics.mean(scores), 1)
        median_score = round(statistics.median(scores), 1)
        highest_score = round(max(scores), 1)
        lowest_score = round(min(scores), 1)
        pass_count = sum(1 for p in scores if p >= 50)
        pass_rate = round(pass_count / len(scores) * 100, 1)
    else:
        avg_score = median_score = highest_score = lowest_score = pass_rate = 0.0

    participation_rate = round(total_submissions / eligible_count * 100, 1) if eligible_count > 0 else 0

    # Score distribution (buckets)
    distribution = {"0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0}
    for pct in scores:
        if pct < 20:
            distribution["0-20"] += 1
        elif pct < 40:
            distribution["20-40"] += 1
        elif pct < 60:
            distribution["40-60"] += 1
        elif pct < 80:
            distribution["60-80"] += 1
        else:
            distribution["80-100"] += 1

    # Top & bottom performers
    student_name_map = {}
    for sid in list(student_scores.keys())[:50]:
        try:
            user = await db.users.find_one({"_id": ObjectId(sid)})
            if user:
                student_name_map[sid] = user.get("name", "Unknown")
        except Exception:
            pass

    sorted_students = sorted(student_scores.items(), key=lambda x: x[1], reverse=True)
    top_performers = [
        {"name": student_name_map.get(sid, "Unknown"), "score": round(pct, 1)}
        for sid, pct in sorted_students[:5]
    ]
    bottom_performers = [
        {"name": student_name_map.get(sid, "Unknown"), "score": round(pct, 1)}
        for sid, pct in sorted_students if pct < 60
    ][:5]
    # If no one is below 60%, show the lowest scorers (if any scored below average)
    if not bottom_performers and len(sorted_students) > 1:
        bottom_performers = [
            {"name": student_name_map.get(sid, "Unknown"), "score": round(pct, 1)}
            for sid, pct in sorted_students[-3:] if pct < avg_score
        ]

    common = {
        "total_eligible": eligible_count,
        "total_submissions": total_submissions,
        "total_all_submissions": total_all_submissions,
        "finalized_count": total_submissions,
        "participation_rate": participation_rate,
        "average_score": avg_score,
        "median_score": median_score,
        "highest_score": highest_score,
        "lowest_score": lowest_score,
        "pass_rate": pass_rate,
        "score_distribution": distribution,
        "top_performers": top_performers,
        "bottom_performers": bottom_performers,
    }

    result = {
        "assessment_title": assessment.get("title", ""),
        "assessment_type": a_type,
        "total_marks": total_marks,
        "common": common,
    }

    # 6. Type-specific insights
    if a_type in ("mcq", "mixed") and mcq_subs:
        result["mcq_insights"] = await _compute_mcq_insights(assessment, mcq_subs)

    if a_type in ("coding", "mixed") and coding_subs:
        result["coding_insights"] = await _compute_coding_insights(assessment, coding_subs)

    if a_type == "manual" and manual_subs:
        result["manual_insights"] = await _compute_manual_insights(assessment, manual_subs)

    return result


async def _compute_mcq_insights(assessment, mcq_subs):
    """Analyze MCQ submissions — most-missed questions, option distribution."""
    questions = assessment.get("mcq_questions", []) or assessment.get("questions", [])
    if not questions:
        return {}

    question_map = {}
    for i, q in enumerate(questions):
        qid = str(q.get("question_id", q.get("id", q.get("_id", i + 1))))
        question_map[qid] = {
            "text": q.get("question_text", q.get("question", q.get("text", f"Question {i+1}"))),
            "correct_answer": q.get("correct_option_id", q.get("correct_answer", q.get("correctAnswer", ""))),
            "options": q.get("options", []),
        }

    # Count answers per question
    question_stats = {}
    for qid, qinfo in question_map.items():
        question_stats[qid] = {
            "text": qinfo["text"],
            "correct_answer": qinfo["correct_answer"],
            "total_attempts": 0,
            "correct_count": 0,
            "option_counts": Counter(),
        }

    for sub in mcq_subs:
        answers = sub.get("answers", [])
        # Handle both list format [{question_id, selected_option_id}] and dict format {qid: answer}
        if isinstance(answers, list):
            for ans in answers:
                qid = str(ans.get("question_id", ""))
                selected = ans.get("selected_option_id", "")
                if qid in question_stats:
                    question_stats[qid]["total_attempts"] += 1
                    question_stats[qid]["option_counts"][selected] += 1
                    if selected == question_stats[qid]["correct_answer"]:
                        question_stats[qid]["correct_count"] += 1
        elif isinstance(answers, dict):
            for qid, answer in answers.items():
                if qid in question_stats:
                    question_stats[qid]["total_attempts"] += 1
                    question_stats[qid]["option_counts"][answer] += 1
                    if answer == question_stats[qid]["correct_answer"]:
                        question_stats[qid]["correct_count"] += 1

    # Build question analysis
    question_analysis = []
    for qid, stats in question_stats.items():
        total = stats["total_attempts"]
        if total == 0:
            continue
        correct_pct = round(stats["correct_count"] / total * 100, 1)
        error_rate = round(100 - correct_pct, 1)

        wrong_options = {k: v for k, v in stats["option_counts"].items()
                         if k != stats["correct_answer"]}
        most_wrong_option = max(wrong_options, key=wrong_options.get) if wrong_options else None
        most_wrong_count = wrong_options.get(most_wrong_option, 0) if most_wrong_option else 0

        question_analysis.append({
            "question_id": qid,
            "question_text": stats["text"],
            "correct_answer": stats["correct_answer"],
            "correct_pct": correct_pct,
            "error_rate": error_rate,
            "total_attempts": total,
            "correct_count": stats["correct_count"],
            "most_wrong_option": most_wrong_option,
            "most_wrong_count": most_wrong_count,
            "option_distribution": dict(stats["option_counts"]),
        })

    question_analysis.sort(key=lambda x: x["error_rate"], reverse=True)

    # AI Teaching Recommendation
    struggling = [q for q in question_analysis if q["error_rate"] > 30]
    prompt = f"""You are an educational advisor analyzing MCQ assessment results for a teacher. Write a comprehensive teaching recommendation.

Assessment: {assessment.get('title', 'MCQ Assessment')}
Total Students: {len(mcq_subs)}

Question Analysis (sorted by most missed):
{json.dumps([{
    'question': q['question_text'],
    'correct_percentage': q['correct_pct'],
    'error_rate': q['error_rate'],
    'most_common_wrong_answer': q['most_wrong_option']
} for q in question_analysis], indent=2)}

Write a recommendation that covers ALL of the following sections in this exact order:

1. OVERALL PERFORMANCE: How students performed overall, mentioning pass rates and average correct percentages.
2. WEAKEST AREAS: Which specific questions students struggled with most (reference the actual question text and error rates).
3. MISCONCEPTIONS: What the most common wrong answers suggest about student misunderstandings.
4. TEACHING SUGGESTION: What specific topics the teacher should stress more. Suggest "Consider deeper coverage of these concepts:" followed by the actual concepts.
5. ACTIONABLE ADVICE: One concrete teaching strategy or activity to address the identified weaknesses.

Write 5-7 sentences total. Be specific — reference actual questions, error rates, and wrong answer patterns. Do NOT use markdown formatting, bullet points, or numbered lists. Write in flowing paragraph style."""

    recommendation = await _get_ai_recommendation(prompt)

    return {
        "question_analysis": question_analysis,
        "teaching_recommendation": recommendation,
    }


async def _compute_coding_insights(assessment, coding_subs):
    """Analyze coding submissions — test failures, language distribution."""
    language_counter = Counter()
    test_pass_rates = []
    common_issues = Counter()
    test_failure_details = []

    for s in coding_subs:
        lang = s.get("language", "unknown")
        language_counter[lang] += 1

        # test_results are stored inside issues.test_results, not at top level
        test_results = s.get("issues", {}).get("test_results", []) or s.get("test_results", [])
        if test_results:
            passed = sum(1 for t in test_results if t.get("passed"))
            total = len(test_results)
            test_pass_rates.append(round(passed / total * 100, 1) if total > 0 else 0)

        ai_insights = s.get("ai_insights", {})
        issues = ai_insights.get("issues", [])
        if isinstance(issues, list):
            for issue in issues:
                if isinstance(issue, str):
                    common_issues[issue] += 1
                elif isinstance(issue, dict):
                    common_issues[issue.get("description", str(issue))] += 1

    avg_test_pass = round(statistics.mean(test_pass_rates), 1) if test_pass_rates else 0

    top_issues = [{"issue": issue, "count": count}
                  for issue, count in common_issues.most_common(5)]

    # AI Teaching Recommendation
    questions = assessment.get("coding_questions", []) or assessment.get("questions", [])
    question_titles = [q.get("title", q.get("question", q.get("problem_statement", f"Problem {i+1}")[:50])) for i, q in enumerate(questions)]

    prompt = f"""You are an educational advisor analyzing coding assessment results for a programming teacher. Write a comprehensive teaching recommendation.

Assessment: {assessment.get('title', 'Coding Assessment')}
Total Submissions: {len(coding_subs)}
Average Test Pass Rate: {avg_test_pass}%
Languages Used: {dict(language_counter)}
Problems: {question_titles}
Common Issues Found: {[i['issue'] for i in top_issues[:5]]}

Write a recommendation that covers ALL of the following sections in this exact order:

1. OVERALL PERFORMANCE: How students performed overall, mentioning test pass rates and submission counts.
2. WEAKEST AREAS: Which specific problems or concepts students struggled with most.
3. COMMON MISTAKES: What the most common code issues suggest about student skill gaps.
4. TEACHING SUGGESTION: What specific programming concepts the teacher should stress more. Suggest "Consider deeper coverage of these concepts:" followed by the actual concepts.
5. ACTIONABLE ADVICE: One concrete teaching strategy, exercise, or lab activity to improve student coding skills.

Write 5-7 sentences total. Be specific — reference actual problems, pass rates, and common issues. Do NOT use markdown formatting, bullet points, or numbered lists. Write in flowing paragraph style."""

    recommendation = await _get_ai_recommendation(prompt)

    return {
        "avg_test_pass_rate": avg_test_pass,
        "language_distribution": dict(language_counter),
        "common_issues": top_issues,
        "teaching_recommendation": recommendation,
    }


async def _compute_manual_insights(assessment, manual_subs):
    """Analyze manual submissions — keyword gaps, per-question averages."""
    per_question_scores = {}  # qid -> data
    keywords_per_question = {}  # qid -> {missed: Counter, matched: Counter}
    correctness_dist = Counter()
    completeness_dist = Counter()

    for s in manual_subs:
        manual_eval = s.get("manual_evaluation", {})
        results = manual_eval.get("results", [])

        for r in results:
            qid = r.get("question_id", "unknown")
            q_text = r.get("question_text", "")
            final_score = r.get("final_score", 0)
            max_marks = r.get("max_marks", 1)

            if qid not in per_question_scores:
                per_question_scores[qid] = {
                    "text": q_text,
                    "scores": [],
                    "max_marks": max_marks,
                }
            per_question_scores[qid]["scores"].append(final_score)

            # Keywords per question
            if qid not in keywords_per_question:
                keywords_per_question[qid] = {"missed": Counter(), "matched": Counter(), "text": q_text}
            for kw in r.get("keywords_missed", []):
                keywords_per_question[qid]["missed"][kw] += 1
            for kw in r.get("keywords_matched", []):
                keywords_per_question[qid]["matched"][kw] += 1

            if r.get("correctness"):
                correctness_dist[r["correctness"]] += 1
            if r.get("completeness"):
                completeness_dist[r["completeness"]] += 1

    # Per-question averages
    per_question_avg = []
    for qid, data in per_question_scores.items():
        avg = round(statistics.mean(data["scores"]), 2) if data["scores"] else 0
        max_m = data["max_marks"]
        pct = round(avg / max_m * 100, 1) if max_m > 0 else 0
        per_question_avg.append({
            "question_id": qid,
            "question_text": data["text"],
            "average_score": avg,
            "max_marks": max_m,
            "average_percentage": pct,
        })

    per_question_avg.sort(key=lambda x: x["average_percentage"])

    # Keywords missed PER QUESTION
    keywords_by_question = []
    for qid, kw_data in keywords_per_question.items():
        missed_list = [{"keyword": kw, "count": c} for kw, c in kw_data["missed"].most_common(5)]
        if missed_list:
            keywords_by_question.append({
                "question_id": qid,
                "question_text": kw_data["text"],
                "missed_keywords": missed_list,
            })

    # AI Teaching Recommendation
    prompt = f"""You are an educational advisor analyzing handwritten assignment results for a teacher. Write a comprehensive teaching recommendation.

Assessment: {assessment.get('title', 'Handwritten Assignment')}
Total Submissions: {len(manual_subs)}

Per-Question Performance (sorted weakest first):
{json.dumps([{
    'question_id': q['question_id'],
    'question': q['question_text'],
    'average_score': f"{q['average_score']}/{q['max_marks']}",
    'average_percentage': f"{q['average_percentage']}%"
} for q in per_question_avg], indent=2)}

Keywords Frequently Missed by Students (per question):
{json.dumps([{
    'question': kq['question_text'],
    'missed_keywords': [k['keyword'] for k in kq['missed_keywords']]
} for kq in keywords_by_question], indent=2)}

Correctness Distribution: {dict(correctness_dist)}
Completeness Distribution: {dict(completeness_dist)}

Write a recommendation that covers ALL of the following sections in this exact order:

1. OVERALL PERFORMANCE: How students performed overall across all questions (mention average scores).
2. WEAKEST AREAS: Which specific questions students struggled with most and why (reference question IDs and topics).
3. MOST COMMONLY MISSED KEYWORDS: List the keywords students missed most frequently and explain why these concepts matter.
4. TEACHING SUGGESTION: What specific topics the teacher should stress more in upcoming classes. Suggest "Consider deeper coverage of these concepts:" followed by the actual concepts.
5. ACTIONABLE ADVICE: One concrete teaching strategy or activity to improve understanding.

Write 5-7 sentences total. Be specific — reference actual question numbers, topics, keywords, and scores. Do NOT use markdown formatting, bullet points, or numbered lists. Write in flowing paragraph style."""

    recommendation = await _get_ai_recommendation(prompt)

    return {
        "per_question_avg": per_question_avg,
        "keywords_by_question": keywords_by_question,
        "correctness_distribution": dict(correctness_dist),
        "completeness_distribution": dict(completeness_dist),
        "teaching_recommendation": recommendation,
    }
