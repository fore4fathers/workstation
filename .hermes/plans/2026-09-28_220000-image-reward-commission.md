# Image-based Reward Commission System Implementation Plan (Using Existing DB)

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build an image-based reward commission system where users view 20 images per set, identify the correct object from randomly shuffled labels derived from existing `task_items` payload metadata (`{gold, labels, image_url}`), and earn commission added to their total balance for correct selections. Uses existing `tasks`, `task_items`, `assignments`, `submissions`, and `accounts` tables — no external API calls.

**Architecture:** A Flask REST API endpoint that serves image identification tasks (20 images per set). Each image's `task_item` payload contains `{gold, labels, image_url}`. The `gold` field is the correct answer; `labels` are distractor options shown to the user. Users see 4 shuffled name options (1 correct `gold` + 3 random labels from other images). Correct selection adds commission to user balance via existing payout infrastructure pattern (same as `settlePayout` from `/server/src/routes/admin.js`).

**Architecture diagram:**
```
User Browser --> Flask /task endpoint --> Fetch 20 task_items from DB --> Shuffle labels --> Present 4-option MC
                              --> POST /answer --> Validate selection (selected == gold) --> UPDATE accounts.balance += commission --> Record image_commission
```

**Tech Stack:** Python 3.12, Flask, psycopg[binary], PostgreSQL 16 (existing schema), existing admin payout settlement logic pattern.

## Repository findings (2026-09-29)

The active application in this repository is Express/React with PostgreSQL, not Flask. The commission implementation already exists under `server/src/routes/drive-sets.js`, with admin assignment/list routes in `server/src/routes/admin.js`; use these routes and the existing migrations rather than adding a second Flask API.

The reported worker-side 403 came from `web/src/pages/worker/DriveSets.jsx` calling `/api/admin/drive-sets`. That endpoint is correctly restricted to admins. Worker task details are available from the authenticated `/api/tasks/:id` endpoint. The worker page was also reading an undefined `taskData` variable after loading task data into `itemsData`; both issues are corrected in the frontend.

**Implemented follow-up (2026-09-29):** Workers now load only the first `total_items` database records for their assigned set through a worker-owned endpoint. The server generates stable choices from each record's `gold` and labels, validates the selected label against those choices, and keeps the answer key private. Commission rates are configurable per set; answers update account balance idempotently and progress/earnings are derived from the stored answer records. The admin Drive Sets page refreshes progress every five seconds, and the worker page shows answered count, correct count, earned commission, and per-answer feedback.

**Mobile and equal reward update (2026-09-29):** Other-language responses now earn the same configured rate as the closest match. New assignments keep those rates in sync, and a one-time migration tops up previous other-language rewards to the set's closest-match rate. The worker set list becomes readable mobile cards with a full-width Start/Continue action; the page scrolls vertically on mobile. Worker navigation sends both Available Tasks and Label Sets to the active label-set page, removes the obsolete My Tasks entry, and uses a lighter blue sidebar. Admin navigation and page headings use Label Sets terminology.

---
