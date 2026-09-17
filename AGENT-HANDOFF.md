# Agent handoff — AI Workstation

Paste this whole file into another coding agent. It is the current source of truth for **what the product is**, **what already ships**, and **how to change it without breaking the money model or UI system**.

Repo: `/home/kai/Documents/ai-workstation`  
Date of this write-up: 2026-09-03 (session continued later; code still matches).

---

## 1. What this is

A **local prototype** of a crowdsourced AI-training / data-labeling marketplace (Scale/MTurk-style), not an internal-only tool and not production payments.

- **Workers** register or use a demo login, pick published tasks (image / text / intent classification), label items one at a time, earn **demo USD**, chat 1:1 with support.
- **Admins** (seeded) create/publish tasks (paste, CSV, image upload), **release or void** task payouts, approve/reject withdrawals, disable workers, inbox-chat.

Started as a broken template: Express API mostly worked; the React app imported missing pages; the only live UI was a vanilla `web/app.js` innerHTML SPA. That vanilla SPA is **deleted**. React + Vite is the client.

---

## 2. Locked product decisions (do not reopen unless the user says so)

| Topic | Decision |
|---|---|
| Product | Crowdsourced marketplace (wallet, leaderboard, support chat stay) |
| Quality | Auto-score vs hidden **gold** labels. Gold does **not** gate pay. Gold is stripped in `publicItem()` before workers see items. |
| Pay | Submit **auto-credits pending**. Admin **releases** to available (or **voids**). Then worker withdraws; admin approve/reject. Pending cannot be withdrawn. |
| Auth | Worker self-signup (`POST /api/auth/register`). Admin is seeded. Public register always `role=worker`. |
| Scope | Demo-complete + file/CSV ingest. No real rails, email, password reset, bounding boxes, transcription, dark mode, Tailwind, Framer. |
| Instance | Weak machine. Keep Express + Postgres + React 18 + CSS variables. |

---

## 3. How to run

```bash
docker compose up -d          # Postgres 16 on 127.0.0.1:5435  user/pass/db: aw/aw/ai_workstation
npm run seed                  # migrate + seed admin, 9 workers, 3 tasks
npm run dev                   # API :4101 + Vite :5173 (proxy /api /uploads /socket.io)
# or
./demo.sh                     # seed, vite build, serve SPA from Express on :4101
npm test                      # server node:test  (auth, gold hide, pending→release, void, register/disable, chat, health)
```

| Port | What |
|---|---|
| 5435 | Postgres |
| 4101 | Express API + Socket.io + `/uploads` + built SPA (`web/dist` if present) |
| 5173 | Vite (dev only) |

**Demo logins**

| email | password | role |
|---|---|---|
| `john@demo.local` | `john123` | worker, opening available **$189.90** |
| `admin@demo.local` | `admin123` | admin |

JWT in `localStorage` key `aw_token`. Secret default `dev-ai-workstation-secret-change-me`.

`DATABASE_URL` default: `postgresql://aw:aw@127.0.0.1:5435/ai_workstation`

If npm registry times out: this machine already has a **vendored** root `node_modules` (copied from other local projects). `node_modules/` and `web/dist/` are gitignored. Playwright was removed from `web/package.json` on purpose.

The API process has been killed by session/runtime limits before; restart with `node server/src/index.js` after `web/dist` exists, or `npm run dev`.

---

## 4. Architecture

```
web/                  React 18 + Vite + react-router-dom + socket.io-client
  src/App.jsx         role-split routes
  src/api.js          fetch + Bearer; uploadImages() sends JSON base64 (not multipart)
  src/styles.css      must match brand tokens
  src/layouts/        WorkerLayout (tabs/header + chat FAB), AdminLayout (shrinking header)
server/               Express ESM, pg, bcrypt, jsonwebtoken, socket.io
  src/index.js        mounts routes; if web/dist/index.html exists, serves SPA
  src/sql/migrate.js  runs schema.sql then additive ALTERs
  src/sql/seed.js     migrate() then TRUNCATE users CASCADE
```

No multer. Uploads: `POST /api/admin/uploads` `{ files: [{ name, mime, data }] }` data = data URL or raw base64, images only, 5MB, written to `/uploads`.

---

## 5. Money model (critical)

`accounts`: `balance` (available), `frozen` (withdrawal hold), `pending` (task pay waiting on admin).

```
submit task     → pending += pay     ledger task_payout_hold     assignment.payout_status = pending
admin Release   → pending -= pay, balance += pay    ledger task_payout     payout_status = released
admin Void      → pending -= pay     ledger task_payout_void     payout_status = voided
worker withdraw → frozen += amount   ledger withdrawal_hold      status PENDING
admin approve   → frozen -=, balance -=    ledger withdrawal_debit
admin reject    → frozen -=          ledger withdrawal_release
```

Withdraw available = `balance - frozen` (pending excluded).  
Pay is `pay_cents / 100` dollars.  
No clawback of **available** balance in v1 except via withdrawal reject.

Seeded John balance is an opening **available** amount, not pending.

---

## 6. Data (Postgres)

Tables: `users` (role admin|worker, `is_active`, `lifetime_completed`), `accounts`, `ledger`, `withdrawals`, `tasks` (type image|text|intent, `pay_cents`, `is_published`), `task_items` (jsonb `payload` including optional `gold`), `assignments` (unique task+worker, `payout_status`), `submissions` (unique assignment+item, `is_correct`), `conversations` (one per worker), `messages`, `conversation_reads`.

Migrate on seed and on server start (`server/src/sql/migrate.js`). Schema uses `CREATE TABLE IF NOT EXISTS`; extra columns via `ALTER … IF NOT EXISTS`.

---

## 7. API map

Auth: JWT 7d. `requireAuth` / `requireAdmin`.

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | public | |
| POST | `/api/auth/register` | public | worker only; password ≥8; 409 duplicate email |
| GET/PATCH | `/api/me` | auth | PATCH display_name; GET includes account `{balance,frozen,pending}` + stats |
| GET | `/api/tasks` | auth | published catalog + this worker’s assignment_status |
| GET | `/api/tasks/:id` | auth | items with **gold stripped** |
| POST | `/api/tasks/:id/start` | worker | upsert in_progress |
| POST | `/api/tasks/:id/submit` | worker | answers[]; gold → is_correct; credit **pending**; 409 if already submitted |
| GET | `/api/wallet` | auth | account + ledger + withdrawals |
| POST | `/api/wallet/withdraw` | worker | |
| GET | `/api/leaders` | auth | top 10 workers by tasks done |
| GET/POST | `/api/chat` | worker | get-or-create thread; POST emits socket |
| GET | `/api/admin/stats` | admin | workers, open_tasks, pending_withdrawals, pending_payouts, unread_chats |
| GET/POST | `/api/admin/tasks` | admin | create with items[] |
| GET/PATCH | `/api/admin/tasks/:id` | admin | items **with gold**; PATCH `{is_published}` |
| GET | `/api/admin/payouts` | admin | submitted + pending |
| POST | `/api/admin/payouts/:id/release` and `/void` | admin | 409 if not pending |
| GET | `/api/admin/withdrawals` | admin | |
| POST | `/api/admin/withdrawals/:id/approve` and `/reject` | admin | |
| GET | `/api/admin/workers` | admin | |
| POST | `/api/admin/workers/:id/active` | admin | `{is_active}`; workers only |
| POST | `/api/admin/uploads` | admin | JSON base64 images |
| GET | `/api/admin/chat` + `/chat/:id` | admin | inbox |
| POST | `/api/admin/chat/:id` | admin | reply |
| GET | `/health` | public | |

Socket.io: auth via handshake token. Workers join `conv:{id}`; admins join `admin` and `join_conv`. Event `message:new`. Dedup messages by id in the React chat UIs (POST + socket can double).

---

## 8. Frontend routes

Unauthenticated:

- `/` **Landing** (`web/src/pages/Landing.jsx`) — public marketing page
- `/login` — sign in / register (`?register=1` opens register)
- anything else → `/`

Authenticated **worker** (`WorkerLayout`):

- `/` home, `/tasks`, `/tasks/:id` work, `/leaders`, `/wallet`, `/profile`, `/chat`

Authenticated **admin** (`AdminLayout`):

- `/` dashboard, `/tasks`, `/tasks/new`, `/tasks/:id` detail, `/payouts`, `/wallet` withdrawals, `/workers`, `/inbox`, `/profile`

Token: `localStorage.aw_token`. Session refetch on pathname via `GET /api/me`.

### UI chrome (easy to regress)

- **Phone &lt;900px:** worker **bottom tab bar on every worker screen** (including task work + chat). Page `.topbar` titles stay. Compact/floating header must **not** run on phone (`useCompactHeader.js` gates on `min-width: 900px`; CSS also resets `.is-compact .site-nav` under 899px).
- **Desktop ≥900px:** bottom tabs become a **full-bleed top header**. After 24px scroll it shrinks and **detaches** (inset, 52px, rounded, shadow).
- **Chat FAB:** fixed **bottom-left** (`.chat-fab`), above the tab bar on phone; hidden on `/chat`.
- Task work: fade between items (`work-stage is-out/is-in`); arc `.spinner` on load/submit.

Landing hero image: Unsplash laptop photo with Picsum fallback (`Landing.jsx`). Aspect box reserved (no CLS). Copy is short and literal — do not add “empower / seamless / atelier / journey” language.

---

## 9. Brand / UI system

Project skill (load this before visual work):

`.grok/skills/ai-workstation-brand/SKILL.md`  
`.grok/skills/ai-workstation-brand/references/tokens.md`  ← **only source of hex and type**

`web/src/styles.css` `:root` must match `tokens.md`.

Current look (after user rejected Instrument Serif + ivory/navy/gold):

- Fonts: **IBM Plex Sans** 400/500/600 + **IBM Plex Mono** 500 (Google Fonts in `web/index.html`)
- Canvas `#F4F5F7`, surface white, ink `#1B1F24`, accent teal `#1A7A72`
- Money uses ink + mono, **not** gold
- No Tailwind, no Framer, no display serif
- Copy: short. No taglines.

Rejected earlier: Inter+electric blue template; then Atelier (Instrument Serif, ivory, navy, antique gold). Do not bring those back unless asked.

---

## 10. What is done

**Backend:** migrate, register, pending pay, release/void, workers list/disable, task publish + detail, JSON image uploads, socket chat, tests covering the money path.

**Client:** full React worker + admin, landing, login/register, task ingest (paste/CSV/images), payouts queue, withdrawals, workers, inbox, shrinking desktop header, mobile footer, chat FAB, task transitions + spinner.

**Deleted:** `web/app.js` vanilla SPA.

---

## 11. Out of scope (v1)

Real payouts, email, password reset, extra task types, assignment of specific workers, label-by-label QA queue, dark mode, Playwright, Tailwind/Framer.

---

## 12. How to change things safely

- Money: keep pending ≠ available. Update `server/tests/app.test.js` if submit/release/void behavior changes.
- Visual: edit `tokens.md` first, then copy `:root` into `styles.css`. No new hex in components.
- Nav: phone footer always; desktop header + compact only ≥900px; chat is FAB not a header icon.
- Uploads: JSON base64, not multipart (npm/multer was skipped).
- Express `hasDist` is computed at **module load**. After `vite build`, restart `node server/src/index.js` or use Vite `:5173`.
- Seed `TRUNCATE` does not reset serial IDs.
- Weak instance: do not add heavy deps.

---

## 13. Key files

```
README.md
AGENT-HANDOFF.md          ← this file
docker-compose.yml
demo.sh
scripts/dev.js
server/src/index.js
server/src/sql/{schema.sql,migrate.js,seed.js}
server/src/routes/{auth,tasks,submissions,wallet,chat,admin}.js
server/tests/app.test.js
web/src/App.jsx
web/src/styles.css
web/src/layouts/{WorkerLayout,AdminLayout}.jsx
web/src/pages/Landing.jsx
.grok/skills/ai-workstation-brand/
```

When in doubt, read the code in those files over this document if they have diverged.
