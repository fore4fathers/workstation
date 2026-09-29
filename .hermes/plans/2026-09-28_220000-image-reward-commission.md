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

---