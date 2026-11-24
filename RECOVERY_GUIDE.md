# Recovery Guide

## Resuming work in a new session
1. Read `PROJECT_MASTER_CONTEXT.md`, then `PROJECT_PROGRESS.md` (the "Next steps" section is authoritative).
2. `cd GradeMaster-AI-NEW && git status && git log --oneline -10`. Confirm you're on `feature/gradmaster-transformation`.
3. Uncommitted changes are work in progress from the interrupted session: inspect them, finish or stash. Never discard them.
4. Run the backend tests: `cd backend && .venv\Scripts\python -m pytest -q`.

## Running the dev copy
```powershell
# backend (uses grademaster_dev)
cd GradeMaster-AI-NEW\backend; .\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
# frontend (PowerShell, not Git Bash)
cd GradeMaster-AI-NEW\frontend; npm run dev
```

## Restoring things
| Situation | Action |
|---|---|
| Dev copy badly broken | `git log` → `git switch -c recovery <good-commit>`; or re-copy from the backup folder. |
| Need the exact original code | `GradeMaster-AI-ORIGINAL-BACKUP` (frozen) or branch `backup/pre-transformation` on GitHub. |
| Dev database corrupted | Drop **only** `grademaster_dev` and re-seed it from the backup (script below). |
| Original `grademaster` DB damaged | Restore from the backup into a *new* DB first, verify, then ask the owner before replacing. |

Re-seed a database from the EJSON backup (mongosh):
```js
const fs=require('fs'); const dir='C:/Users/Krishna/GradeMaster-Backups/mongodb/grademaster_20261124_224939';
const t=db.getSiblingDB('grademaster_dev');
Object.keys(JSON.parse(fs.readFileSync(dir+'/_manifest.json','utf8')).collections).forEach(c=>{
  const d=EJSON.parse(fs.readFileSync(dir+'/'+c+'.json','utf8'),{relaxed:false}); if(d.length) t[c].insertMany(d); });
```

## Never do
Modify the backup folder · point the dev copy at `grademaster` · force-push · drop/truncate a non-dev database ·
commit `.env` · print secrets in logs or output.
