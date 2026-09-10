# AI Workstation

A local prototype of a crowdsourced AI-training platform: workers label image / text / intent data, earn demo money, and chat with support. Admins publish tasks, release payouts, settle withdrawals, and manage workers.

## Run

```bash
docker compose up -d          # postgres :5435
npm run seed                  # admin + 9 workers + 3 tasks
npm run dev                   # API :4101 + Vite :5173
```

Open **http://127.0.0.1:5173**.

One-process demo (builds the SPA, API serves it):

```bash
./demo.sh                     # http://127.0.0.1:4101
```

## Demo accounts

| email | password | role |
|---|---|---|
| `john@demo.local` | `john123` | worker — $189.90 available |
| `admin@demo.local` | `admin123` | admin |

Workers can also register from the login screen. Passwords are demo-only.

## Money model

1. Worker submits a task → pay is **pending** (auto-scored against gold labels if present).
2. Admin **releases** the payout → funds become **available**. Admin can **void** instead.
3. Worker requests a withdrawal from available funds.
4. Admin **approves** or **rejects** the withdrawal.

Pending earnings cannot be withdrawn.

## Task ingest

On **Admin → Tasks → New task**:

- Paste one item per line: `payload | label1,label2 | gold`
- Or CSV: `payload,labels,gold` (labels can be pipe-separated)
- Image tasks also accept file uploads (jpg/png/gif/webp)

Gold labels are hidden from workers and only used for the accuracy stat.

## Ports

| 5435 | Postgres (docker) |
| 4101 | API + Socket.io (+ built SPA in demo/start) |
| 5173 | Vite dev server |

## Tests

```bash
npm test
```

Auth, register/disable, gold hiding, pending→release payout + wallet, void, chat, health.
