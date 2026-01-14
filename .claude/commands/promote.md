# Promote Git Branches

Full promotion workflow: commit and push development, then merge into main and push.

## Instructions

### Step 1: Ensure on Development Branch
- Run `git branch` to check current branch
- If not on development, run `git checkout development`

### Step 2: Check Development Branch Status
- Run `git status` to see all changes (staged, unstaged, untracked)
- Run `git diff` to review unstaged changes
- Run `git log origin/development..HEAD --oneline` to see unpushed commits

### Step 3: Commit All Changes on Development
- If there are any uncommitted changes:
  - Run `git add .` to stage all changes
  - Ask the user for a commit message, or generate one based on the changes
  - Run `git commit -m "commit message"` with appropriate message
  - Include `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>` in commit

### Step 4: Push Development to Remote
- Run `git push origin development`
- Report success or handle any errors

### Step 5: Switch to Main Branch
- Run `git checkout main`
- Run `git pull origin main` to ensure main is up to date with remote

### Step 6: Merge Development into Main
- Run `git merge development`
- If there are merge conflicts, stop and help the user resolve them
- Report merge status

### Step 7: Push Main to Remote
- Run `git push origin main`
- Report success or handle any errors

### Step 8: Return to Development Branch
- Run `git checkout development`
- Confirm switch back to development

### Step 9: Summary
Provide a summary including:
- Commits made on development
- Merge status
- Both branches pushed successfully
- Current branch (should be development)
