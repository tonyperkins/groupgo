---
name: GroupGo Session
description: Full implementation session. Pulls latest, reads the handoff doc, implements all pending tasks, updates the doc, and pushes.
---

## Step 1 — Pull latest

```bash
git pull origin v2-generic-events
```

If this fails, stop and report the error. Do not proceed with a stale codebase.

## Step 2 — Read the handoff doc

Read `docs/groupgo-windsurf-handoff.md` in full before doing anything else.
This is the source of truth. Pay attention to:
- The **Gotchas** section
- The **What to NOT touch** section
- The **Pending — Next Session** section
- The **Implementation Prompt** section

## Step 3 — Check for pending work

Look at the `## Implementation Prompt` section of the handoff doc.

If the body says `_Nothing pending._` — stop here and tell the user:
> "Nothing pending in the handoff doc. Let me know what you'd like to work on."

If there are tasks — proceed to Step 4.

## Step 4 — Implement

Run through every task in the Implementation Prompt section in order.
Follow all constraints in the doc (no auth changes, no scoring changes, no
TypeScript interface renames, HTMX admin stays HTMX, etc).

For each task:
- Make the changes
- Verify the change works as described before moving to the next task
- Do not refactor code outside the scope of the task

## Step 5 — Build SPA if needed

If any files under `voter-spa/src/` were modified:

```bash
cd voter-spa && npm run build && cd ..
```

If the build fails, fix it before proceeding.

## Step 6 — Update the handoff doc

In `docs/groupgo-windsurf-handoff.md`:

1. Move all items from `## Pending — Next Session` into `## Completed`
   under a new entry: `### Session — [today's date]`
2. Replace everything after the blockquote in `## Implementation Prompt`
   with: `_Nothing pending._`

## Step 7 — Commit and push

```bash
git add -A
git commit -m "feat: [brief summary of what was implemented]"
git push origin v2-generic-events
```

Then tell the user what was completed and confirm the push succeeded.
