# Project Progress

_Last updated: 2026-11-24_

## Phase status
| Phase | Status |
|---|---|
| 0 Backup & safety | ☑ done, verified |
| 1 Project understanding | ☑ done (full backend read, frontend core read) |
| 2 Technical audit | ☑ `docs/AUDIT_REPORT.md` (4 critical, 22 high) |
| 3 Roadmap | ☑ `IMPLEMENTATION_ROADMAP.md` |
| Stage A — critical fixes & foundation | ◐ starting |
| Stages B–E | ☐ |

## Phase 0 record
* Original backup: `GradeMaster-AI-ORIGINAL-BACKUP`, 8115 files, Git intact, hashes verified.
* Dev copy: `GradeMaster-AI-NEW` (no node_modules/venv/pycache; reinstalled). Frontend builds; backend `/api/health` OK.
* GitHub: `backup/pre-transformation` pushed (commit `9776579`, preserves the previously-uncommitted
  `main.py` / `submission_service.py` changes). Work branch `feature/gradmaster-transformation`.
* MongoDB backup (EJSON + indexes + manifest) restored into a scratch DB, compared doc-for-doc, scratch DB dropped.
* Dev DB `grademaster_dev` seeded from backup; `database.py` reads `MONGO_DB_NAME`.

## Verified vulnerabilities (live, on dev DB)
* Forged JWT with `supersecret` → admin access (S1).
* Self-signup as `hod` → auto-approved → downloads any student's report (S2).
⚠ **These also affect the original project as it runs today.** Don't expose the original deployment publicly.

## Commits on feature branch
* `cff6343` stop tracking `__pycache__`
* (next) docs + configurable DB name + lockfile fix

## External actions needed from owner
None yet. (Deployment accounts will be requested in Stage E.)

## Next steps
1. Stage A1–A4: config/settings, signup restriction, unified deps, ownership checks.
2. Stand up pytest with `grademaster_test` and write tests for every fix.
