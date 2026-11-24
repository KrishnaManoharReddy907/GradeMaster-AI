"""
PDF Report Generation Service

Uses ReportLab to generate professional PDF reports.

STUDENT REPORT: All submissions across all subjects with AI feedback.
ASSESSMENT REPORT: Per-assessment class report with common mistakes analysis.
"""

import io
from datetime import datetime, timezone
from bson import ObjectId
from collections import Counter

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)

from app.database import get_database


# Colors
PRIMARY = colors.HexColor("#6366f1")
SUCCESS = colors.HexColor("#22c55e")
ERROR = colors.HexColor("#ef4444")
TEXT = colors.HexColor("#334155")
LIGHT = colors.HexColor("#64748b")
ROW_ALT = colors.HexColor("#f8fafc")


async def _synthesize_common_issues(feedback_list: list) -> list:
    """Use Gemini to synthesize student feedback into teacher-facing common issues."""
    if not feedback_list:
        return []
    
    # Deduplicate
    unique = list(set(fb.strip() for fb in feedback_list if fb.strip()))
    if not unique:
        return []
    
    # Format feedback for Gemini
    feedback_text = "\n".join(f"- {fb}" for fb in unique[:20])
    
    try:
        from app.ai import llm

        prompt = f"""You are helping a teacher understand common issues in their students' assignment submissions.

Below are individual AI feedback comments given to students after evaluating their answers:
{feedback_text}

Synthesize these into 3-6 bullet points written FOR THE TEACHER (not the student). Each bullet should:
- Describe a common mistake, gap, or area of weakness observed across students
- Cover issues from ALL questions in the assignment, not just one
- Be written in third person ("Students struggled with..." NOT "Your answer...")
- Be concise (1-2 sentences max per bullet)
- Focus on what concepts need more teaching attention
- If most students did well on a topic, mention that too as a strength

Return ONLY the bullet points, one per line, no numbering, no dashes, no bullets — just the text of each point on its own line."""

        text = (await llm.generate_text(prompt, temperature=0.3, max_tokens=2048)).strip()
        lines = [line.strip().lstrip("•-*").strip() for line in text.split("\n") if line.strip()]
        return [line for line in lines if len(line) > 10][:6]
    except Exception:
        # Fallback: just deduplicate and truncate
        return [fb[:250] for fb in unique[:6]]


def _styles():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle("Title2", parent=s["Title"], fontSize=20, textColor=PRIMARY, spaceAfter=4))
    s.add(ParagraphStyle("Sub", parent=s["Normal"], fontSize=11, textColor=LIGHT, spaceAfter=18))
    s.add(ParagraphStyle("H2", parent=s["Heading2"], fontSize=14, textColor=PRIMARY, spaceBefore=14, spaceAfter=8))
    s.add(ParagraphStyle("H3", parent=s["Heading3"], fontSize=11, textColor=TEXT, spaceBefore=10, spaceAfter=4))
    s.add(ParagraphStyle("Body", parent=s["Normal"], fontSize=10, textColor=TEXT, spaceAfter=4))
    s.add(ParagraphStyle("Small", parent=s["Normal"], fontSize=8, textColor=LIGHT))
    s.add(ParagraphStyle("Feedback", parent=s["Normal"], fontSize=9, textColor=TEXT, spaceAfter=4,
                          leftIndent=12, borderColor=PRIMARY, borderWidth=0, borderPadding=4))
    return s


def _header(story, styles, title, subtitle):
    story.append(Paragraph("GradeMaster AI", styles["Title2"]))
    story.append(Paragraph(title, styles["H2"]))
    story.append(Paragraph(subtitle, styles["Sub"]))
    story.append(HRFlowable(width="100%", thickness=1, color=PRIMARY, spaceAfter=12))


def _stat_table(story, data):
    rows = [["Metric", "Value"]]
    for k, v in data.items():
        rows.append([k.replace("_", " ").title(), str(v)])
    t = Table(rows, colWidths=[3 * inch, 2 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 1), (-1, -1), ROW_ALT),
        ("TEXTCOLOR", (0, 1), (-1, -1), TEXT),
        ("ALIGN", (1, 0), (1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(t)
    story.append(Spacer(1, 14))


def _footer(story, styles):
    story.append(Spacer(1, 24))
    story.append(HRFlowable(width="100%", thickness=0.5, color=LIGHT))
    story.append(Paragraph(
        f"Generated on {datetime.now(timezone.utc).strftime('%B %d, %Y at %H:%M UTC')} — GradeMaster AI",
        styles["Small"]
    ))


async def generate_student_report(student_id: str) -> io.BytesIO:
    """
    Student Report — covers ALL submissions across ALL subjects.

    Content:
    1. Student info
    2. Overall stats (total, avg, best, pass rate)
    3. Subject-wise breakdown table
    4. Per-submission details (assessment, subject, score, status)
    5. AI feedback from last 5 coding submissions
    """
    db = get_database()
    styles = _styles()

    # Student info
    try:
        student = await db.users.find_one({"_id": ObjectId(student_id)})
    except Exception:
        student = None
    name = student.get("name", "Unknown") if student else "Unknown"
    email = student.get("email", "") if student else ""

    # Fetch submissions (only finalized for coding/manual)
    coding_subs = await db.coding_submissions.find(
        {"student_id": student_id, "status": "finalized"}
    ).sort("submitted_at", -1).to_list(length=200)

    mcq_subs = await db.mcq_submissions.find(
        {"student_id": student_id}
    ).sort("submitted_at", -1).to_list(length=200)

    manual_subs = await db.manual_submissions.find(
        {"student_id": student_id, "status": "finalized"}
    ).sort("submitted_at", -1).to_list(length=200)

    # Fetch assessment + subject info
    all_aids = set(
        s.get("assessment_id") for s in coding_subs + mcq_subs + manual_subs
        if s.get("assessment_id")
    )
    assessment_info = {}
    subject_ids = set()
    for aid in all_aids:
        try:
            a = await db.assessments.find_one({"_id": ObjectId(aid)})
            if a:
                assessment_info[str(a["_id"])] = {
                    "title": a.get("title", "Untitled"),
                    "subject_id": a.get("subject_id", ""),
                }
                if a.get("subject_id"):
                    subject_ids.add(a["subject_id"])
        except Exception:
            pass

    subject_map = {}
    for sid in subject_ids:
        try:
            subj = await db.subjects.find_one({"_id": ObjectId(sid)})
            if subj:
                subject_map[sid] = subj.get("name", "Unknown")
        except Exception:
            pass

    # Build scored list
    scored = []
    for s in coding_subs:
        score = s.get("final_score") if s.get("final_score") is not None else (s.get("ai_score") or 0)
        mx = s.get("max_marks") or 1
        aid = s.get("assessment_id", "")
        info = assessment_info.get(aid, {})
        sid = info.get("subject_id", "")
        scored.append({
            "title": info.get("title", "Unknown"),
            "subject": subject_map.get(sid, "Unknown"),
            "type": "Coding", "score": score, "max": mx,
            "pct": round(score / mx * 100, 1) if mx > 0 else 0,
            "status": "Finalized",
            "feedback": s.get("ai_insights", {}).get("feedback", ""),
            "issues": s.get("issues", {}),
        })
    for s in mcq_subs:
        score = s.get("score") or 0
        mx = s.get("total_marks") or 1
        aid = s.get("assessment_id", "")
        info = assessment_info.get(aid, {})
        sid = info.get("subject_id", "")
        scored.append({
            "title": info.get("title", "Unknown"),
            "subject": subject_map.get(sid, "Unknown"),
            "type": "MCQ", "score": score, "max": mx,
            "pct": round(score / mx * 100, 1) if mx > 0 else 0,
            "status": "Evaluated", "feedback": "", "issues": {},
        })
    for s in manual_subs:
        manual_eval = s.get("manual_evaluation", {})
        score = s.get("final_score", s.get("teacher_adjusted_score")) if s.get("final_score", s.get("teacher_adjusted_score")) is not None else manual_eval.get("total_score", 0)
        mx = manual_eval.get("total_marks") or 1
        aid = s.get("assessment_id", "")
        info = assessment_info.get(aid, {})
        sid = info.get("subject_id", "")
        fb = manual_eval.get("overall_feedback", "")
        if not fb:
            # Build feedback from per-question AI feedback
            q_feedbacks = []
            for qr in manual_eval.get("results", []):
                qfb = qr.get("feedback", "")
                if qfb:
                    q_feedbacks.append(f"{qr.get('question_id', '?')}: {qfb}")
            fb = " | ".join(q_feedbacks)
        scored.append({
            "title": info.get("title", "Unknown"),
            "subject": subject_map.get(sid, "Unknown"),
            "type": "Manual", "score": score, "max": mx,
            "pct": round(score / mx * 100, 1) if mx > 0 else 0,
            "status": "Finalized",
            "feedback": fb,
            "issues": {},
        })

    # Build PDF
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm,
                            topMargin=18*mm, bottomMargin=18*mm)
    story = []

    _header(story, styles, "Student Performance Report", f"{name} • {email}")

    # Stats
    total = len(scored)
    pcts = [s["pct"] for s in scored]
    avg = round(sum(pcts) / total, 1) if total else 0
    best = round(max(pcts), 1) if pcts else 0
    passed = sum(1 for p in pcts if p >= 50)
    _stat_table(story, {
        "total_submissions": total,
        "average_score": f"{avg}%",
        "best_score": f"{best}%",
        "pass_rate": f"{round(passed / total * 100, 1) if total else 0}%",
    })

    # Subject-wise breakdown
    if scored:
        subj_scores = {}
        for s in scored:
            subj_scores.setdefault(s["subject"], []).append(s["pct"])
        story.append(Paragraph("Subject-wise Performance", styles["H2"]))
        subj_rows = [["Subject", "Submissions", "Average", "Best"]]
        for subj, pcts_list in sorted(subj_scores.items()):
            subj_rows.append([
                subj, str(len(pcts_list)),
                f"{round(sum(pcts_list)/len(pcts_list), 1)}%",
                f"{round(max(pcts_list), 1)}%",
            ])
        st = Table(subj_rows, colWidths=[2.2*inch, 1*inch, 1*inch, 1*inch])
        st.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [ROW_ALT, colors.white]),
        ]))
        story.append(st)
        story.append(Spacer(1, 12))

    # Submission details
    story.append(Paragraph("All Submissions", styles["H2"]))
    detail_rows = [["Assessment", "Subject", "Type", "Score", "%", "Status"]]
    for s in scored[:30]:
        detail_rows.append([
            Paragraph(s["title"][:28], styles["Body"]),
            s["subject"][:15], s["type"],
            f'{round(s["score"],1)}/{s["max"]}',
            f'{s["pct"]}%', s["status"],
        ])
    if len(detail_rows) > 1:
        dt = Table(detail_rows, colWidths=[1.8*inch, 1.0*inch, 0.6*inch, 0.7*inch, 0.5*inch, 0.8*inch])
        dt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (3, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [ROW_ALT, colors.white]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(dt)
    else:
        story.append(Paragraph("No submissions found.", styles["Body"]))

    # AI Feedback summary (last 5 coding with feedback)
    feedback_items = [s for s in scored if s["feedback"]][:5]
    if feedback_items:
        story.append(Spacer(1, 10))
        story.append(Paragraph("AI Feedback Summary", styles["H2"]))
        for item in feedback_items:
            story.append(Paragraph(f"<b>{item['title']}</b> ({item['subject']})", styles["H3"]))
            story.append(Paragraph(item["feedback"][:400], styles["Feedback"]))

    _footer(story, styles)
    doc.build(story)
    buf.seek(0)
    return buf


async def generate_assessment_report(assessment_id: str) -> io.BytesIO:
    """
    Assessment Report — for ONE specific assessment.

    Content:
    1. Assessment info (title, subject, type)
    2. Class stats (students, avg, pass rate)
    3. Per-student scores table
    4. Common mistakes analysis (from AI feedback)
    5. Score distribution insights
    """
    db = get_database()
    styles = _styles()

    # Assessment info
    try:
        assessment = await db.assessments.find_one({"_id": ObjectId(assessment_id)})
    except Exception:
        assessment = None

    if not assessment:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4)
        doc.build([Paragraph("Assessment not found.", styles["Body"])])
        buf.seek(0)
        return buf

    title = assessment.get("title", "Untitled")
    atype = assessment.get("assessment_type", "unknown")

    # Subject name
    subject_name = "Unknown"
    sid = assessment.get("subject_id")
    if sid:
        try:
            subj = await db.subjects.find_one({"_id": ObjectId(sid)})
            if subj:
                subject_name = subj.get("name", "Unknown")
        except Exception:
            pass

    # Fetch submissions (only finalized for coding/manual)
    coding_subs = await db.coding_submissions.find(
        {"assessment_id": assessment_id, "status": "finalized"}
    ).to_list(length=500)
    mcq_subs = await db.mcq_submissions.find(
        {"assessment_id": assessment_id}
    ).to_list(length=500)
    manual_subs = await db.manual_submissions.find(
        {"assessment_id": assessment_id, "status": "finalized"}
    ).to_list(length=500)

    # Student names
    student_ids = set(
        s.get("student_id") for s in coding_subs + mcq_subs + manual_subs
        if s.get("student_id")
    )
    student_map = {}
    for sid_val in student_ids:
        try:
            u = await db.users.find_one({"_id": ObjectId(sid_val)})
            if u:
                student_map[str(u["_id"])] = u.get("name", "Unknown")
        except Exception:
            pass

    # Build scored list
    student_scores = {}
    all_pcts = []
    all_feedback = []

    for s in coding_subs:
        score = s.get("final_score") if s.get("final_score") is not None else (s.get("ai_score") or 0)
        mx = s.get("max_marks") or 1
        pct = round(score / mx * 100, 1) if mx > 0 else 0
        sid_val = s.get("student_id", "")
        all_pcts.append(pct)
        student_scores.setdefault(sid_val, []).append({
            "score": score, "max": mx, "pct": pct,
            "status": "Finalized", "type": "Coding"
        })
        fb = s.get("ai_insights", {}).get("feedback", "")
        if fb:
            all_feedback.append(fb)
        issues = s.get("issues", {})
        if isinstance(issues, dict):
            bugs = issues.get("bugs", [])
            if bugs:
                all_feedback.extend([b.get("description", "") for b in bugs if isinstance(b, dict)])

    for s in mcq_subs:
        score = s.get("score") or 0
        mx = s.get("total_marks") or 1
        pct = round(score / mx * 100, 1) if mx > 0 else 0
        sid_val = s.get("student_id", "")
        all_pcts.append(pct)
        student_scores.setdefault(sid_val, []).append({
            "score": score, "max": mx, "pct": pct,
            "status": "Evaluated", "type": "MCQ"
        })

    for s in manual_subs:
        manual_eval = s.get("manual_evaluation", {})
        score = s.get("final_score", s.get("teacher_adjusted_score")) if s.get("final_score", s.get("teacher_adjusted_score")) is not None else manual_eval.get("total_score", 0)
        mx = manual_eval.get("total_marks") or 1
        pct = round(score / mx * 100, 1) if mx > 0 else 0
        sid_val = s.get("student_id", "")
        all_pcts.append(pct)
        student_scores.setdefault(sid_val, []).append({
            "score": score, "max": mx, "pct": pct,
            "status": "Finalized", "type": "Manual"
        })
        # Collect AI feedback from manual evaluation
        for qr in manual_eval.get("results", []):
            qfb = qr.get("feedback", "")
            if qfb:
                all_feedback.append(qfb)

    # Build PDF
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm,
                            topMargin=18*mm, bottomMargin=18*mm)
    story = []

    _header(story, styles, "Assessment Report",
            f"{title} • {subject_name} • {atype.upper()}")

    # Stats
    total_students = len(student_scores)
    total_subs = len(all_pcts)
    avg = round(sum(all_pcts) / total_subs, 1) if total_subs else 0
    passed = sum(1 for p in all_pcts if p >= 50)
    pass_pct = round(passed / total_subs * 100, 1) if total_subs else 0
    highest = round(max(all_pcts), 1) if all_pcts else 0
    lowest = round(min(all_pcts), 1) if all_pcts else 0

    _stat_table(story, {
        "total_students": total_students,
        "total_submissions": total_subs,
        "average_score": f"{avg}%",
        "pass_rate": f"{pass_pct}%",
        "highest_score": f"{highest}%",
        "lowest_score": f"{lowest}%",
    })

    # Per-student table
    story.append(Paragraph("Student Performance", styles["H2"]))
    rows = [["Student", "Type", "Score", "Max", "%", "Status"]]
    for sid_val, scores in sorted(student_scores.items(), key=lambda x: -(max(s["pct"] for s in x[1]))):
        sname = student_map.get(sid_val, "Unknown")
        for sc in scores:
            rows.append([
                sname[:22], sc["type"],
                str(round(sc["score"], 1)), str(sc["max"]),
                f"{sc['pct']}%", sc["status"],
            ])
    if len(rows) > 1:
        dt = Table(rows, colWidths=[1.8*inch, 0.6*inch, 0.6*inch, 0.5*inch, 0.6*inch, 0.8*inch])
        dt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (2, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [ROW_ALT, colors.white]),
        ]))
        story.append(dt)
    else:
        story.append(Paragraph("No submissions yet.", styles["Body"]))

    # Score distribution insights
    if all_pcts:
        story.append(Spacer(1, 10))
        story.append(Paragraph("Score Distribution", styles["H2"]))
        ranges = {"90-100%": 0, "70-89%": 0, "50-69%": 0, "30-49%": 0, "0-29%": 0}
        for p in all_pcts:
            if p >= 90: ranges["90-100%"] += 1
            elif p >= 70: ranges["70-89%"] += 1
            elif p >= 50: ranges["50-69%"] += 1
            elif p >= 30: ranges["30-49%"] += 1
            else: ranges["0-29%"] += 1
        dist_rows = [["Range", "Count", "Percentage"]]
        for rng, cnt in ranges.items():
            dist_rows.append([rng, str(cnt), f"{round(cnt/total_subs*100, 1)}%"])
        dist_t = Table(dist_rows, colWidths=[1.5*inch, 1*inch, 1*inch])
        dist_t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [ROW_ALT, colors.white]),
        ]))
        story.append(dist_t)

    # Common Issues & Teaching Insights
    # Try to pull cached AI recommendation from assessment_reports collection
    cached_report = await db.assessment_reports.find_one({"assessment_id": assessment_id})
    teaching_rec = ""
    if cached_report:
        report_data = cached_report.get("report_data", {})
        # Check type-specific insights for teaching recommendation
        for key in ["manual_insights", "mcq_insights", "coding_insights"]:
            insights = report_data.get(key, {})
            if insights.get("teaching_recommendation"):
                teaching_rec = insights["teaching_recommendation"]
                break

    if teaching_rec:
        story.append(Spacer(1, 10))
        story.append(Paragraph("AI Teaching Recommendation", styles["H2"]))
        story.append(Paragraph(teaching_rec, styles["Body"]))

    if all_feedback:
        story.append(Spacer(1, 10))
        story.append(Paragraph("Common Issues & Mistakes", styles["H2"]))
        # Synthesize teacher-facing summary from student feedback
        summary = await _synthesize_common_issues(all_feedback)
        for line in summary:
            story.append(Paragraph(f"• {line}", styles["Feedback"]))

    _footer(story, styles)
    doc.build(story)
    buf.seek(0)
    return buf
