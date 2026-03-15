---
name: GroupGo Sync
description: Pulls latest and reads the handoff doc to get up to speed. No implementation. Use this to catch up on context before discussing changes with the user.
---

## Step 1 — Pull latest

```bash
git pull origin v2-generic-events
```

If this fails, stop and report the error.

## Step 2 — Read the handoff doc

Read `docs/groupgo-windsurf-handoff.md` in full.

## Step 3 — Report status

Tell the user:
- What is currently in `## Pending — Next Session` (list the task titles)
- What was most recently completed (last entry in `## Completed`)
- Whether the Implementation Prompt is ready to run or empty

Then wait for instructions. Do not implement anything unless asked.
