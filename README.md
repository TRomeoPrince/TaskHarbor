# TaskHarbor local MVP

See [UPDATES.md](UPDATES.md) for the October 18 feature update, restart instructions, automatic currency estimates, images, copy fields, follow-up steps, and live updates. Rewards and new payments stay in USD; workers select their preferred estimated display currency. That document supersedes the original workflow details below where they differ.

Run with Node.js 24 or newer:

```powershell
cd microtasks
npm start
```

Open http://127.0.0.1:3000. On first start the terminal prints the generated admin password for `admin@local.test`. Optionally set ADMIN_EMAIL and ADMIN_PASSWORD before the first start. Register a worker through the app. Use separate browser profiles for worker and administrator. Run `npm test` for accounting and assignment checks. Data persists in `data/app.sqlite`.

## Stack and structure

This MVP uses a Node.js HTTP server, built-in SQLite, and a plain HTML/CSS/JavaScript interface. No dependency installation is needed. `server.js` contains authentication and role-checked API handlers; `store.js` contains transaction and accounting helpers; `schema.sql` defines the database; `public/` holds the UI; `providers.js` defines the future provider boundary; `test/` holds invariant tests. For a hosted multi-instance service, migrate SQLite to PostgreSQL and introduce migrations and a durable background job queue. React/Next.js is an optional UI evolution rather than a requirement for the local workflow.

## Database and workflow

Users have worker or admin roles. Sessions expire after 24 hours. Tasks use UUIDs and move through available → claimed → submitted → approved/rejected. Claiming is a conditional database update: only one worker can change an available task. Assignments remain attached to their worker; this MVP does not expire or reassign claims. Each task allows one submission, and rejected submissions are terminal in this version.

Approval creates exactly one positive earning ledger entry. Available balance is the sum of signed ledger entries. Pending is the total reward for submitted tasks awaiting review; earned is all approved earnings; withdrawn is all paid withdrawal amounts. Requested withdrawals reserve available funds immediately with a negative ledger entry. Rejecting a withdrawal adds one refund entry. Recording a payment changes its status without deducting money twice. Transactions wrap review, reserves, refunds, and imports. All money uses integer USD cents; no floating-point arithmetic is used.

Tables: users (identity/role), sessions (opaque session token/expiry), tasks (assignment/provider identity/reward/status), submissions (one per task/review), ledger (signed financial events), withdrawals (destination/status/payment reference). Foreign keys connect each event to its owner and originating task or withdrawal. Partial unique indexes prevent repeated task earnings and withdrawal refunds. Unique provider/external_id pairs reject duplicate imports, and imports roll back entirely on a duplicate or invalid row.

## Provider boundary

Admins can create tasks manually or import an array of task objects using the UI. Each imported object has title, description, reward (integer cents), and optional provider/externalId. For integrations, implement TaskProvider.fetchTasks and reportResult, normalize provider data into this format, and keep credentials server-side. A future durable outbox should deliver approved results with idempotency keys and retries. No external integration, Telegram session, account-creation automation, verification bypass, or automatic payment is implemented.

## Local scope

The app binds to loopback only. Passwords use salted scrypt; sessions use HttpOnly SameSite cookies; the server checks mutation origins, enforces roles, and escapes rendered task content. Auth attempts have a basic per-address rate limit. Payout tracking records manual payments; it does not send funds. Administrators must verify payment externally before marking a request paid.

Before public deployment: add TLS and Secure cookies, durable rate limiting, email verification/password recovery, audit logs for admin actions, encryption/access controls for payout details, database backups, operational monitoring, pagination, policy checks for imported work, and integration tests for deployment. The local MVP does not provide those operational features.
