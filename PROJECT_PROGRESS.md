# Project Progress

_Last updated: 2026-11-25 (session 1, continued; all phases implemented except the live deploy)_

## Phase status
| Phase | Status |
|---|---|
| 0 Backup & safety | ☑ done, verified |
| 1 Project understanding | ☑ done |
| 2 Technical audit | ☑ `docs/AUDIT_REPORT.md` |
| 3 Roadmap | ☑ `IMPLEMENTATION_ROADMAP.md` |
| Stage A: critical fixes & backend foundation | ☑ done |
| Stage B: evaluation engines | ☑ done; live smoke tests passed (Gemini JSON, Judge0 batch, Vision OCR, rubric grading, code feedback) |
| Stage C: new features | ☑ review queue, structural plagiarism, topic mastery, admin governance, question bank, AI question generator |
| Stage D: frontend redesign | ☑ new React app (design system, 3 portals, exam flows, SVG charts), 19 Vitest tests, screenshot QA |
| Stage E: hardening, deploy, docs | ◐ hardening, Docker, Render blueprint, deployment guide, README and master documentation done; **live deploy pending owner accounts** |

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

## Frontend (Stage D)
* Rebuilt from scratch in `frontend/src`: React 19 + Vite 8 + Tailwind v4 tokens (light/dark), lazy routes, role guards (`components/guards.jsx`).
* Design system in `components/ui/` (primitives + domain badges); charts in `components/charts.jsx` with a Chart/Table toggle on every chart.
* Portals: admin (overview, approvals, people, academics, assignments, audit), teacher (dashboard, builder, workspace, coding/manual/MCQ review, similarity compare, review queue, question bank, class analytics, student profile, report), student (dashboard, timed MCQ/coding/handwritten exams with server-clock deadline, results, released paper, progress).
* Removed: old pages/components, placeholder images, Plotly.
* Tests: `npm test` (Vitest, 19: api client, route guards, charts, deadline clock, formatters). Backend: `pytest` 59 passing.
* Visual QA by headless Chrome screenshots (desktop, dark mode, 390 px mobile); no page errors.
* Analytics: `hardest_questions[]` now includes `question_text`.

## Production hardening (Stage E)
* Security headers middleware (nosniff, frame DENY, CSP, HSTS in production); API docs off in production.
* Rate limiter: real client IP behind proxies (`TRUSTED_PROXY_HOPS`), idle-key pruning.
* Optional `BOOTSTRAP_TOKEN` gates first-admin creation on a fresh public deploy.
* Monaco bundled locally (no CDN at exam time); inline theme script moved to `public/theme-init.js`.
* `backend/Dockerfile` (non-root, healthcheck, single worker) built and smoke-tested locally in production mode.
* `render.yaml` blueprint (API + static frontend with strict CSP); the production build was tested under that exact CSP with no violations.
* Guide: `docs/DEPLOYMENT.md` (Atlas, Gemini, Render, first sign-in, verification, data migration, env reference).
* Sign-up uses department/year/section dropdowns via public `GET /api/auth/signup-options` (exact-name typing failed before).
* MCQ `shuffle_questions` / `shuffle_options` now enforced per student (seeded, stable); builder toggles added.
* Exam resume returns `server_time` so the timer keeps its clock-skew correction.
* Documentation: `docs/MASTER_DOCUMENTATION.md` (50 sections, generated API table), new `README.md`.

## Data migrations
Applied to `grademaster_dev` only. One duplicate MCQ submission was moved to `submission_duplicates_archive`.
⚠ The original `grademaster` DB has **not** been migrated. That happens at deployment, with owner approval.

## External actions needed from owner
Follow `docs/DEPLOYMENT.md` sections 1-4: create a MongoDB Atlas cluster, a Gemini API key and a Render account, then
deploy the blueprint. Decide whether production starts empty or receives the existing local data (section 6).

## Next steps
1. Owner: create accounts and deploy per `docs/DEPLOYMENT.md` sections 1-4; then run the section 5 verification.
2. Owner decision: start production empty, or migrate the local `grademaster` data (section 6; needs explicit approval).
3. Merge `feature/gradmaster-transformation` into `main`: only with owner approval (normal merge, no force-push).
4. After going live: update section 40 of the master documentation from "pending" to the live URLs and results.
