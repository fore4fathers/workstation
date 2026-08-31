# AI Workstation Demo

A local demo of an AI-training workbench with **admin** and **client/worker** roles.

- **Admin:** create image / text / intent annotation tasks, review the wallet queue, and chat with workers.
- **Worker (client):** home, task catalog, task work, wallet, profile, and support chat.

Inspired by CDOT's back-end patterns (roles, accounts, withdrawals, ledger) and Keymus / cdot-landing's 1:1 support chat, but a greenfield demo: no drive sessions, no tiers, no fake users, no crypto.

## Run

```bash
docker compose up -d          # postgres :5435
node server/src/sql/seed.js   # seed admin + 9 workers + 3 tasks
node server/src/index.js      # api on http://127.0.0.1:4101 (also serves the SPA)
```

Then open `http://127.0.0.1:4101`.

## Demo accounts

| email | password | role |
|---|---|---|
| `john@demo.local` | `john123` | worker — $189.90, 142 done, 98% accuracy |
| `admin@demo.local` | `admin123` | admin |

Passwords are demo-only. Never deploy.

## Ports

| 5435 | Postgres (docker) |
| 4101 | API + SPA + Socket.io |
| 5173 | unused (Vite dev server; the API serves the SPA directly) |

## Tests

```bash
node --test server/tests/*.test.js
```

5 suites (auth, tasks, payout+wallet, chat, health) — all green.

## Layout

```
server/         Express + Socket.io, Postgres, tests
web/            single-file SPA (app.js + styles.css)
docker-compose.yml
```