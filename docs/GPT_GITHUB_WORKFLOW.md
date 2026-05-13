# GPT ↔ GitHub Working Protocol

This repository is being developed through ChatGPT + GitHub connector + Vercel deploys. The main risk is not code complexity; it is slow iteration caused by too many small file operations, stale SHAs, and partially applied patches.

## Operating Rule

Do not use GitHub like a live text editor.

Use this order:

1. Define the mission.
2. Identify the exact files needed.
3. Fetch current file SHAs once, just before editing.
4. Make the smallest coherent batch of changes.
5. Never write placeholder text into production files.
6. Stop and let Vercel build.
7. Fix only build-breaking issues before adding more features.

## Modes

### Strategy Mode

No commits. Decide what should exist.

Outputs:
- product decision
- page/workflow map
- acceptance criteria

### Build Mode

Commits allowed. Only build the next product milestone.

Outputs:
- changed files
- expected behavior
- test path

### Repair Mode

Commits allowed. No new features.

Outputs:
- failing path
- root cause
- patch
- retest path

### Design Mode

Commits allowed only if real assets and rollback path exist.

Outputs:
- visual scope
- files changed
- cache-bust plan

## Commit Rules

- Prefer one coherent batch over many micro-commits.
- Do not fetch-update the same path repeatedly unless there is a SHA conflict.
- If a SHA conflict occurs, refetch that file only, then retry.
- Do not use placeholder replacement strings such as `REPLACED_FOR_BREVITY`.
- If a file is large, replace it with a smaller compile-safe version rather than partial placeholder edits.

## Build Rules

Before large feature changes, answer:

- What is the user trying to do?
- What screen do they start from?
- What screen should they land on next?
- What confirms success?
- What is the next action after success?

Every app screen should answer:

- Where am I?
- What just happened?
- What do I do next?
- What does done look like?
- How does this advance the Story Capsule?

## Vercel Rules

After a deploy-triggering commit:

- Wait for Vercel build result before adding unrelated changes.
- If Vercel fails, switch to Repair Mode.
- Do not continue feature work until the build is green.

## StorySitting Product Rules

The app is not a generic SaaS portal. It is a guided production system.

Primary pipeline:

Story Room → Contributions → Staff Review → Memory Cards → Story Map → Guided Session → Story Capsule → Delivery

Primary wedge:

Homeplace Story Capsule: preserve the stories of a home, farm, business, room, recipe tradition, vehicle, or meaningful place before it changes hands.

## Current Priority Stack

1. Keep app compiling.
2. Make every screen action-guided.
3. Make contribution → Memory Card → Story Map → Capsule path reliable.
4. Improve intake and contributor clarity.
5. Add production automation only after manual path is stable.
