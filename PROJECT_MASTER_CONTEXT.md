# GradeMaster AI — Master Context

Read this first in any new session. It holds the facts that are easy to get wrong.

## Identity (must be preserved)
GradeMaster AI is an academic assessment platform that creates, delivers and AI-evaluates three assessment
types (**MCQ**, **coding**, **handwritten/manual**) for three roles (**admin**, **teacher/faculty**,
**student**), with teacher review and finalization keeping humans in control of final grades, plus analytics
and reports. Original authors: a 3-person student team (CBIT, Dept. of IT, Mini Project-II, 2026).

## Locations
| What | Path |
|---|---|
| Original project (do not modify) | `...\PROJECTS\GradeMaster  AI` (two spaces) |
| Frozen backup copy (never modify) | `...\PROJECTS\GradeMaster-AI-ORIGINAL-BACKUP` |
| **Development copy (all work here)** | `...\PROJECTS\GradeMaster-AI-NEW` |
| MongoDB backup (EJSON, verified restorable) | `C:\Users\Krishna\GradeMaster-Backups\mongodb\grademaster_20261124_224939` |

`...` = `C:\Users\Krishna\OneDrive\Documents\CS CORE SUBJECTS NOTES`

## Facts
* **Database is MongoDB, not MySQL.** Local server `mongodb://localhost:27017`. The original app uses DB
  `grademaster`; the dev copy uses **`grademaster_dev`** (seeded from the backup) via `MONGO_DB_NAME` in
  `backend/.env`. Tests use `grademaster_test`. Never point the dev copy at `grademaster`.
  MySQL 8.0 is installed on the laptop but unrelated to this project.
* Python: global Python 3.13 holds the heavy packages (torch, transformers). The dev venv
  `backend/.venv` uses `--system-site-packages`.
* Frontend: npm only (pnpm lockfile removed). Run `npm` from **PowerShell**: Git Bash lacks `ComSpec`,
  so npm lifecycle scripts fail there.
* Ollama is installed but its server isn't running by default; the code-fix/feedback agents fall back.
* External keys present in `backend/.env` (never print or commit): `GEMINI_API_KEY`,
  `GOOGLE_VISION_API_KEY`, `OPENAI_API_KEY` (unused), `JWT_SECRET`.

## Git
* Remote: `https://github.com/KrishnaManoharReddy907/GradeMaster-AI` (push via Windows credential helper; `gh` CLI not installed).
* `main`: untouched. `backup/pre-transformation`: pushed snapshot including the previously-uncommitted work.
* **`feature/gradmaster-transformation`**: all transformation work. No force pushes, no history rewrites.

## Architectural decisions (log)
1. Keep MongoDB; add a versioned index/migration runner.
2. GridFS for uploaded handwriting; background jobs persisted in a `jobs` collection.
3. Gemini is the primary LLM via an async gateway; Ollama optional; deterministic fallbacks everywhere.
4. Default plagiarism engine = normalised token winnowing; CodeBERT optional (memory limits on hosting).
5. Public signup = student/faculty only; staff roles are admin-created.
