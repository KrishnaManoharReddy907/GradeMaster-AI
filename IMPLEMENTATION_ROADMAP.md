# GradeMaster AI — Implementation Roadmap (Phase 3)

Derived from `docs/AUDIT_REPORT.md`. Status markers: ☐ todo · ◐ in progress · ☑ done (tested) · ⚠ blocked on owner action.

## 1. Where we are

React 19 + Vite SPA → FastAPI monolith (routes / services / agents) → MongoDB, plus Judge0 (code execution),
Google Vision (OCR), Gemini 2.5 Flash (MCQ explanations, OCR clean-up, manual scoring, reports),
local Ollama (code feedback/fix) and CodeBERT (plagiarism). Three portals (admin, teacher, student),
three assessment types (MCQ, coding, handwritten/manual) plus "mixed".

The product idea is sound and stays. The weaknesses are in the engineering: broken authentication,
missing authorization, grading-integrity bugs, AI calls that block the server, nothing that can be
deployed, no tests, and a template-grade UI.

## 2. Target architecture (MongoDB kept)

```
frontend (React 19, Vite, Tailwind v4, design system, code-split routes)
   │  VITE_API_URL, bearer JWT
backend/app
 ├─ core/        config (pydantic-settings), security, deps (role matrix), errors, logging, rate limit
 ├─ routes/      thin HTTP layer, one router per domain, Pydantic in/out
 ├─ services/    domain logic (raise typed errors, never return {"error":...})
 ├─ ai/          LLM gateway (Gemini async + optional Ollama, retries, JSON-schema output),
 │               OCR providers (Vision → Gemini-vision fallback), prompt-injection guard
 ├─ evaluation/  coding (Judge0 batch), manual (rubric + keywords + semantic), plagiarism
 ├─ jobs/        Mongo-backed background job queue (evaluation, OCR) with status polling
 ├─ storage/     GridFS file store for handwritten uploads
 └─ db/          connection, index + migration runner
MongoDB (local dev / Atlas in production)
```

Key decisions:

| Decision | Choice | Why |
|---|---|---|
| Database | **Stay on MongoDB** | The brief forbids silent technology changes; the document model fits embedded questions. |
| File storage | GridFS | Works on Atlas free tier with no extra cloud account; files live with the data. |
| Background work | In-process async worker + `jobs` collection | Removes 30-minute requests without needing Redis/Celery; job state survives restarts. |
| LLM | Gemini primary (async), Ollama optional | Ollama can't run on cloud hosting; Gemini is already a dependency. |
| Plagiarism | Normalised-token winnowing (default) + CodeBERT (optional extra) | Runs in 512 MB of RAM, catches renaming and reformatting, symmetric; CodeBERT still available locally. |
| Auth | Short-lived JWT + `token_version` check | Revocation and deactivation without a session store. |

## 3. Execution phases

### Stage A — Critical fixes & backend foundation
- ☐ A1 `core/config.py` settings loaded first; refuse weak/missing `JWT_SECRET` (S1)
- ☐ A2 Signup restricted to student/faculty; staff roles admin-created (S2)
- ☐ A3 `core/deps.py`: one role matrix, approval + active checks (S4, B1)
- ☐ A4 Ownership checks on every teacher endpoint (S3)
- ☐ A5 Typed exceptions + global handlers, generic client errors (B2, S12)
- ☐ A6 Lifespan startup, index + migration runner, aware datetimes (B4, B7, G9)
- ☐ A7 Grading integrity: finalize lock, zero-score bug, duration None, manual review schema (G1, G2, G6, G7)
- ☐ A8 Student gating: questions before start, manual eligibility/deadline, result reveal rule, per-student attempt start (S5, S6, G8, G10)
- ☐ A9 CORS allow-list, rate limiting, upload hardening (S8, S9, S10)
- ☐ A10 Structured logging, request IDs; remove print/debug output (B5)
- ☐ A11 Pytest suite against a throwaway Mongo database; tests for every fix above

### Stage B — Evaluation engines
- ☐ B1 Async LLM gateway with retries, timeouts, JSON-schema output (A1, A7, A10)
- ☐ B2 Coding: Judge0 batch, time/memory limits, output normalisation, background jobs, language-aware analysis, consolidated agents (A2, A3, A5, A6, G12)
- ☐ B3 Plagiarism: symmetric pairwise fingerprinting per assessment + match evidence; CodeBERT optional (A4)
- ☐ B4 Handwritten: GridFS originals, EXIF rotate, page cap, Vision → Gemini-vision fallback, faithful transcription, no truncation (G4, G5, A8, A9)
- ☐ B5 Manual scoring: rubric criteria, word-boundary/stem keywords, injection guard, `needs_review` on AI failure or low confidence (S7, G3, G11)
- ☐ B6 Analytics/report correctness: section_id bug, per-student aggregation, server-side totals (G13, G14, G15)

### Stage C — New features (selected for value, see §4)
- ☐ C1 Topic tagging + topic mastery / weak-topic analytics
- ☐ C2 Teacher review queue with grading-confidence flags
- ☐ C3 AI question generator (teacher-reviewed drafts)
- ☐ C4 Question bank (save / search / reuse)
- ☐ C5 Plagiarism comparison view
- ☐ C6 Personalised student learning insights
- ☐ C7 Admin: user management (create staff, deactivate, reject), audit log, system health

### Stage D — Frontend redesign
- ☐ D1 Design system (tokens, typography, components, light/dark), app shell with sidebar
- ☐ D2 Env-based API client, code splitting, error boundary, standard loading/empty/error states
- ☐ D3 Every page redesigned across the three portals, plus the new feature pages
- ☐ D4 Exam engine: multi-question coding, draft persistence for every type
- ☐ D5 Accessibility pass; Vitest + Testing Library for critical flows

### Stage E — Hardening, deployment, docs
- ☐ E1 Security pass, dependency pinning, production config
- ☐ E2 End-to-end workflow tests for admin/teacher/student
- ☐ E3 Deploy: MongoDB Atlas + backend host + Vercel frontend ⚠ needs owner accounts
- ☐ E4 README, `.env.example`, GitHub push of the feature branch ⚠ merge to main needs approval
- ☐ E5 Master technical document (thesis-level)

## 4. New-feature selection

| Feature | Problem it solves | How it works | Complexity | Extra infra |
|---|---|---|---|---|
| **Topic mastery & weak-topic analytics** | Scores say *how much* a student knows, not *what* they don't know | Questions carry topic tags; every graded item feeds per-student, per-topic mastery (marks-weighted, recency-aware); teacher sees a class topic heatmap | Medium | none |
| **Review queue with confidence flags** | Teachers re-check everything because they can't tell which AI grades are shaky | Each auto-grade gets reasons: AI failure, low OCR confidence, keyword/semantic disagreement, injection suspicion, plagiarism; the queue sorts by risk | Medium | none |
| **Rubric-based manual grading** | One holistic AI score is opaque and unfair for partial answers | Teacher defines criteria with marks; Gemini scores each criterion with evidence quotes; keywords become a criterion; partial marking falls out naturally | Medium | none |
| **AI question generator** | Writing good MCQs and model answers is slow | Teacher gives topic, difficulty and count; Gemini returns structured drafts (options, answer, explanation, model answer, keywords); the teacher edits and accepts | Medium | Gemini (already used) |
| **Question bank** | Questions are retyped every term | Accepted questions saved with tags and difficulty, searchable, inserted into new assessments | Medium | none |
| **Plagiarism comparison view** | A similarity % alone isn't actionable | Pairwise matrix per assessment and side-by-side code with matched fingerprint regions highlighted | Medium | none |
| **Student learning insights** | Feedback is scattered across submissions | A "what to work on next" panel built from topic mastery, recurring bug categories and missed rubric criteria | Low–Med | Gemini optional |
| **Admin governance** | Admins can't create staff, deactivate users, reject sign-ups or see what happened | Staff creation, deactivate/reject, audit-log viewer, health page (DB, Judge0, Gemini, Vision status) | Medium | none |

Considered and deferred (cost or low value right now): adaptive testing (needs item-response data volume), performance
forecasting (too little data to be honest), speech-to-text answers, LMS integration, cross-language plagiarism.

## 5. Testing strategy
Backend: pytest + httpx `AsyncClient` against a disposable `grademaster_test` database; external services
(Gemini, Vision, Judge0) stubbed at the gateway boundary, plus opt-in live smoke tests when keys are present.
Frontend: Vitest + Testing Library for guards, API client and exam engine. Workflow scripts exercise each role end to end.

## 6. Deployment strategy (proposed, needs owner accounts)
MongoDB Atlas M0 (free) · backend on Render (Docker, free/starter) · frontend on Vercel (free) · files in GridFS ·
Judge0 CE public endpoint or RapidAPI key · Gemini + Vision keys as platform secrets. CodeBERT/torch excluded from the
production image (optional extra) to fit the memory limits.
