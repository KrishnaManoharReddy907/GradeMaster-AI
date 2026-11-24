# Project Progress

_Last updated: 2026-11-24 (session 1)_

## Phase status
| Phase | Status |
|---|---|
| 0 Backup & safety | ☑ done, verified |
| 1 Project understanding | ☑ done |
| 2 Technical audit | ☑ `docs/AUDIT_REPORT.md` |
| 3 Roadmap | ☑ `IMPLEMENTATION_ROADMAP.md` |
| Stage A: critical fixes & backend foundation | ☑ done, 45 tests passing |
| Stage B: evaluation engines | ☑ done (live Gemini/Vision/Judge0 smoke test still pending) |
| Stage C: new features | ◐ review queue, plagiarism view, topic mastery, admin governance done; question bank + AI generator next |
| Stage D: frontend redesign | ☐ |
| Stage E: hardening, deploy, docs | ☐ |

## What changed in the backend (commit `299f33e`)
* `app/core/`: config (pydantic-settings), security, deps (role + ownership), errors, observability (logging, request id, rate limit)
* `app/ai/`: `llm.py` async gateway; `code_feedback.py`
* `app/evaluation/plagiarism.py`: winnowing engine
* `app/jobs/`: Mongo-backed worker (`evaluate_coding`, `mcq_explanations`)
* `app/storage/files.py`: GridFS
* `database.py`: tz-aware client + migrations 001-003 (indexes, dedupe→archive, user flags, support collections)
* Routes and services rewritten: auth, admin, assessments, submissions, teacher review, OCR/manual, analytics
* Removed dead agents: agent_pipeline, bug_agent, plagiarism_agent, llm_code_fix_agent, submission_analysis_agent
* `requirements.txt` pinned core; `requirements-ml.txt` optional (torch/CodeBERT/ollama); `requirements-dev.txt`

## API contract changes the frontend must adopt (Stage D)
* Errors: `{detail, code}`; validation `422` with `errors[]`.
* Login: unapproved faculty get `403 code=pending_approval`; response adds `expires_in`.
* First admin: `POST /api/auth/bootstrap-admin` (signup no longer accepts admin).
* Student: `POST /api/student/assessments/{id}/start` returns the personal `deadline`; detail returns `attempt`, `public_test_cases`.
* MCQ submit returns `results_visible`; status hides scores/answers until released.
* Coding submit is auto-evaluated in background (`job_id`); `POST /teacher/evaluate/{id}` queues a job → poll `GET /api/teacher/jobs/{id}`.
* `/api/student/all-submissions` → rows per assessment with `parts[]`, `status` ∈ submitted/in_review/graded.
* Handwritten: upload takes `assessment_id` form field, returns `upload_id`; process takes `{raw_text, assessment_id}`; evaluate takes `{assessment_id, answers, upload_ids, ocr}` and returns no scores; teacher sees originals via `GET /api/teacher/uploads/{file_id}`.
* Manual review: `PUT /teacher/manual-submission/{id}/review` with `question_scores[]` (or `teacher_adjusted_score`), `teacher_feedback`, `finalize`.
* New: `/api/teacher/review-queue`, `/api/teacher/assessments/{id}/plagiarism`, `/api/teacher/plagiarism/compare?a&b`,
  `/api/teacher/assessments/{id}/finalize-coding`, `PATCH/DELETE /api/teacher/assessments/{id}`,
  `/api/analytics/students/{id}`, admin `/users`, `/staff`, `/users/{id}/status`, `/reject-user/{id}`, `/audit-log`, `/system-health`, `/overview`, `PUT /subjects/{id}/topics`, `DELETE /teacher-assignments/{id}`.
* Analytics responses are plain data (no server-side Plotly JSON).

## Data migrations
Applied to `grademaster_dev` only. One duplicate MCQ submission was moved to `submission_duplicates_archive`.
⚠ The original `grademaster` DB has **not** been migrated. That happens at deployment, with owner approval.

## External actions needed from owner
None yet (deployment accounts are requested in Stage E).

## Next steps
1. C3/C4: question bank collection + AI question generator endpoints (+ tests).
2. Stage D: frontend redesign against the new contracts (design system first).
3. Live smoke test with real Gemini/Vision/Judge0 keys from `.env` on the dev DB.
