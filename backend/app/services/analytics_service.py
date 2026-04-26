"""
Analytics Service

Uses Pandas for data processing and Plotly for chart generation.
Provides analytics for teacher and student dashboards.

DATA MODEL RELATIONSHIPS:
─────────────────────────
Department → has many Sections (per year)
Department → has many Subjects (per year)
Section    → belongs to Department + Year
Subject    → belongs to Department + Year
Teacher    → assigned to Subject + [Sections] via teacher_assignments
Student    → belongs to Section + Year + Department
Assessment → created by Teacher for Subject + [Sections]
Submission → by Student for Assessment
"""

import pandas as pd
import plotly.graph_objects as go
from datetime import datetime
from bson import ObjectId

from app.database import get_database


async def get_teacher_analytics(teacher_id: str) -> dict:
    """
    Compute teacher analytics across ALL their assessments.

    This is an aggregate view — all subjects, all sections.
    The teacher sees total performance across everything they teach.
    """
    db = get_database()

    # 1. Get all assessments created by this teacher
    #    Field is "teacher_id" (set in assessment_service.py:108)
    assessments = await db.assessments.find(
        {"teacher_id": teacher_id}
    ).to_list(length=500)

    if not assessments:
        return _empty_teacher_response()

    assessment_ids = [str(a["_id"]) for a in assessments]
    assessment_map = {str(a["_id"]): a.get("title", "Untitled") for a in assessments}

    # Also fetch subject names for context
    subject_ids = list(set(a.get("subject_id") for a in assessments if a.get("subject_id")))
    subject_map = {}
    for sid in subject_ids:
        try:
            subj = await db.subjects.find_one({"_id": ObjectId(sid)})
            if subj:
                subject_map[sid] = subj.get("name", "Unknown")
        except Exception:
            pass

    # Map assessment → subject name
    assessment_subject = {}
    for a in assessments:
        aid = str(a["_id"])
        sid = a.get("subject_id", "")
        assessment_subject[aid] = subject_map.get(sid, "Unknown")

    # 2. Fetch all coding submissions (only finalized — teacher must review first)
    coding_subs = await db.coding_submissions.find(
        {"assessment_id": {"$in": assessment_ids}, "status": "finalized"}
    ).to_list(length=5000)

    # 3. Fetch all MCQ submissions
    mcq_subs = await db.mcq_submissions.find(
        {"assessment_id": {"$in": assessment_ids}}
    ).to_list(length=5000)

    # 4. Fetch all Manual submissions (only finalized — teacher must review first)
    manual_subs = await db.manual_submissions.find(
        {"assessment_id": {"$in": assessment_ids}, "status": "finalized"}
    ).to_list(length=5000)

    # 5. Build unified DataFrame
    rows = []
    for s in coding_subs:
        # Only finalized coding subs reach here (filtered in query)
        score = s.get("final_score") or s.get("ai_score") or s.get("score") or 0
        max_marks = s.get("max_marks") or 1
        aid = s.get("assessment_id", "")
        rows.append({
            "student_id": s.get("student_id"),
            "assessment_id": aid,
            "assessment_title": assessment_map.get(aid, "Unknown"),
            "subject": assessment_subject.get(aid, "Unknown"),
            "score": score,
            "max_marks": max_marks,
            "percentage": (score / max_marks * 100) if max_marks > 0 else 0,
            "status": "finalized",
            "type": "coding",
            "submitted_at": s.get("submitted_at") or s.get("created_at"),
        })

    for s in mcq_subs:
        score = s.get("score") or 0
        max_marks = s.get("total_marks") or 1
        aid = s.get("assessment_id", "")
        rows.append({
            "student_id": s.get("student_id"),
            "assessment_id": aid,
            "assessment_title": assessment_map.get(aid, "Unknown"),
            "subject": assessment_subject.get(aid, "Unknown"),
            "score": score,
            "max_marks": max_marks,
            "percentage": (score / max_marks * 100) if max_marks > 0 else 0,
            "status": "evaluated",
            "type": "mcq",
            "submitted_at": s.get("submitted_at") or s.get("created_at"),
        })

    for s in manual_subs:
        manual_eval = s.get("manual_evaluation", {})
        # Only finalized manual subs reach here (filtered in query)
        score = s.get("teacher_adjusted_score") if s.get("teacher_adjusted_score") is not None else manual_eval.get("total_score", 0)
        max_marks = manual_eval.get("total_marks") or 1
        aid = s.get("assessment_id", "")
        rows.append({
            "student_id": s.get("student_id"),
            "assessment_id": aid,
            "assessment_title": assessment_map.get(aid, "Unknown"),
            "subject": assessment_subject.get(aid, "Unknown"),
            "score": score,
            "max_marks": max_marks,
            "percentage": (score / max_marks * 100) if max_marks > 0 else 0,
            "status": "finalized",
            "type": "manual",
            "submitted_at": s.get("submitted_at") or s.get("created_at"),
        })

    if not rows:
        return _empty_teacher_response()

    df = pd.DataFrame(rows)

    # 5. Compute stats
    total_students = int(df["student_id"].nunique())
    total_submissions = len(df)
    average_score = round(float(df["percentage"].mean()), 1)
    pass_count = int((df["percentage"] >= 50).sum())
    pass_percentage = round(pass_count / total_submissions * 100, 1) if total_submissions > 0 else 0

    stats = {
        "total_students": total_students,
        "total_submissions": total_submissions,
        "average_score": average_score,
        "pass_percentage": pass_percentage,
    }

    # 6. Generate Plotly charts

    # Chart 1: Bar — Average Score per Assessment
    avg_by_assessment = df.groupby("assessment_title")["percentage"].mean().reset_index()
    avg_by_assessment.columns = ["Assessment", "Average Score"]
    avg_by_assessment = avg_by_assessment.sort_values("Average Score", ascending=False)
    bar_fig = go.Figure(go.Bar(
        x=avg_by_assessment["Assessment"],
        y=avg_by_assessment["Average Score"].round(1),
        marker_color="#6366f1",
        text=avg_by_assessment["Average Score"].round(1),
        textposition="outside",
    ))
    bar_fig.update_layout(
        title="Average Score per Assessment",
        xaxis_title="Assessment",
        yaxis_title="Average Score (%)",
        yaxis_range=[0, 110],
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="#e2e8f0"),
        margin=dict(t=40, b=60, l=50, r=20),
    )

    # Chart 2: Pie — Pass vs Fail
    fail_count = total_submissions - pass_count
    pie_fig = go.Figure(go.Pie(
        labels=["Pass (≥50%)", "Fail (<50%)"],
        values=[pass_count, fail_count],
        marker_colors=["#22c55e", "#ef4444"],
        hole=0.4,
        textinfo="label+percent",
    ))
    pie_fig.update_layout(
        title="Pass vs Fail Distribution",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="#e2e8f0"),
        margin=dict(t=40, b=20, l=20, r=20),
    )

    # Chart 3: Line — Submissions over time
    df["date"] = pd.to_datetime(df["submitted_at"], errors="coerce")
    df_with_date = df.dropna(subset=["date"])
    if not df_with_date.empty:
        daily = df_with_date.groupby(df_with_date["date"].dt.date).size().reset_index()
        daily.columns = ["Date", "Submissions"]
        daily = daily.sort_values("Date")
        line_fig = go.Figure(go.Scatter(
            x=daily["Date"].astype(str),
            y=daily["Submissions"],
            mode="lines+markers",
            line=dict(color="#6366f1", width=2),
            marker=dict(size=6),
            fill="tozeroy",
            fillcolor="rgba(99,102,241,0.1)",
        ))
    else:
        line_fig = go.Figure()

    line_fig.update_layout(
        title="Submission Trend",
        xaxis_title="Date",
        yaxis_title="Submissions",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="#e2e8f0"),
        margin=dict(t=40, b=40, l=50, r=20),
    )

    charts = {
        "score_distribution": bar_fig.to_json(),
        "pass_fail": pie_fig.to_json(),
        "submission_trend": line_fig.to_json(),
    }

    return {"stats": stats, "charts": charts}


async def get_student_analytics(student_id: str) -> dict:
    """
    Compute analytics for a single student across ALL their submissions.

    Shows aggregate performance — all subjects combined.
    The student sees their overall journey.
    """
    db = get_database()

    # Fetch coding submissions
    coding_subs = await db.coding_submissions.find(
        {"student_id": student_id, "status": "finalized"}
    ).to_list(length=500)

    # Fetch MCQ submissions
    mcq_subs = await db.mcq_submissions.find(
        {"student_id": student_id}
    ).to_list(length=500)

    # Fetch Manual submissions
    manual_subs = await db.manual_submissions.find(
        {"student_id": student_id}
    ).to_list(length=500)

    # Get assessment details (title + subject)
    all_assessment_ids = list(set(
        [s.get("assessment_id") for s in coding_subs] +
        [s.get("assessment_id") for s in mcq_subs] +
        [s.get("assessment_id") for s in manual_subs]
    ))

    assessment_info = {}  # aid -> {title, subject_id}
    subject_ids = set()
    for aid in all_assessment_ids:
        if aid:
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

    # Fetch subject names
    subject_map = {}
    for sid in subject_ids:
        try:
            subj = await db.subjects.find_one({"_id": ObjectId(sid)})
            if subj:
                subject_map[sid] = subj.get("name", "Unknown")
        except Exception:
            pass

    # Build rows
    rows = []
    for s in coding_subs:
        # Only finalized coding subs reach here (filtered in query)
        score = s.get("final_score") or s.get("ai_score") or s.get("score") or 0
        max_marks = s.get("max_marks") or 1
        aid = s.get("assessment_id", "")
        info = assessment_info.get(aid, {})
        rows.append({
            "assessment_id": aid,
            "assessment_title": info.get("title", "Unknown"),
            "subject": subject_map.get(info.get("subject_id", ""), "Unknown"),
            "score": score,
            "max_marks": max_marks,
            "percentage": (score / max_marks * 100) if max_marks > 0 else 0,
            "status": "finalized",
            "type": "coding",
            "submitted_at": s.get("submitted_at") or s.get("created_at"),
        })

    for s in mcq_subs:
        score = s.get("score") or 0
        max_marks = s.get("total_marks") or 1
        aid = s.get("assessment_id", "")
        info = assessment_info.get(aid, {})
        rows.append({
            "assessment_id": aid,
            "assessment_title": info.get("title", "Unknown"),
            "subject": subject_map.get(info.get("subject_id", ""), "Unknown"),
            "score": score,
            "max_marks": max_marks,
            "percentage": (score / max_marks * 100) if max_marks > 0 else 0,
            "status": "evaluated",
            "type": "mcq",
            "submitted_at": s.get("submitted_at") or s.get("created_at"),
        })

    for s in manual_subs:
        manual_eval = s.get("manual_evaluation", {})
        manual_status = s.get("status", "evaluated")
        # Only include finalized manual submissions in student analytics
        if manual_status != "finalized":
            continue
        score = s.get("teacher_adjusted_score") if s.get("teacher_adjusted_score") is not None else manual_eval.get("total_score", 0)
        max_marks = manual_eval.get("total_marks") or 1
        aid = s.get("assessment_id", "")
        info = assessment_info.get(aid, {})
        rows.append({
            "assessment_id": aid,
            "assessment_title": info.get("title", "Unknown"),
            "subject": subject_map.get(info.get("subject_id", ""), "Unknown"),
            "score": score,
            "max_marks": max_marks,
            "percentage": (score / max_marks * 100) if max_marks > 0 else 0,
            "status": "finalized",
            "type": "manual",
            "submitted_at": s.get("submitted_at") or s.get("created_at"),
        })

    if not rows:
        return _empty_student_response()

    df = pd.DataFrame(rows)

    total_submissions = len(df)
    average_score = round(float(df["percentage"].mean()), 1)
    best_score = round(float(df["percentage"].max()), 1)
    pass_rate = round(float((df["percentage"] >= 50).sum() / len(df) * 100), 1) if len(df) > 0 else 0

    # Parse dates and sort
    df["date"] = pd.to_datetime(df["submitted_at"], errors="coerce")
    df_sorted = df.sort_values("date", ascending=False)

    # Recent submissions (last 10 for table)
    recent = df_sorted.head(10)[[
        "assessment_title", "subject", "score", "max_marks", "percentage", "type", "status"
    ]].to_dict("records")

    # ALL submissions for charts (sorted by date ascending)
    df_chart = df.dropna(subset=["date"]).sort_values("date")
    all_subs = []
    for _, r in df_chart.iterrows():
        all_subs.append({
            "title": r["assessment_title"],
            "subject": r["subject"],
            "score": round(float(r["score"]), 1),
            "max_marks": round(float(r["max_marks"]), 1),
            "percentage": round(float(r["percentage"]), 1),
            "type": r["type"],
            "date": r["date"].strftime("%b %d, %Y") if pd.notna(r["date"]) else None,
        })

    # Unique subjects for filter dropdown
    subjects = sorted(df["subject"].unique().tolist())

    # Subject-wise averages
    subject_averages = {}
    for subj, grp in df.groupby("subject"):
        subject_averages[subj] = round(float(grp["percentage"].mean()), 1)

    return {
        "stats": {
            "total_submissions": total_submissions,
            "average_score": average_score,
            "best_score": best_score,
            "pass_rate": pass_rate,
        },
        "recent_submissions": recent,
        "all_submissions": all_subs,
        "subjects": subjects,
        "subject_averages": subject_averages,
    }


def _empty_teacher_response():
    """Return empty analytics when no data exists."""
    return {
        "stats": {
            "total_students": 0,
            "total_submissions": 0,
            "average_score": 0,
            "pass_percentage": 0,
        },
        "charts": {
            "score_distribution": "{}",
            "pass_fail": "{}",
            "submission_trend": "{}",
        },
    }


def _empty_student_response():
    """Return empty analytics when no data exists."""
    return {
        "stats": {
            "total_submissions": 0,
            "average_score": 0,
            "best_score": 0,
            "pass_rate": 0,
        },
        "recent_submissions": [],
        "all_submissions": [],
        "subjects": [],
        "subject_averages": {},
    }

