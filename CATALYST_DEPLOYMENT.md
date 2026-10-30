# TaskHarbor: Catalyst AppSail + Neon

The laptop copy continues to use SQLite with `npm start`. The PostgreSQL version
uses `npm run start:postgres`; it never falls back to SQLite if Neon is unavailable.
Schema initialization and importing records are explicit commands, not startup hooks.

## Prepare a separate staging database

Use a separate empty Neon staging database/branch. Set its `DATABASE_URL` privately
in the local process environment or an ignored `.env`. Do not paste credentials in
chat, commit `.env`, or test against the database serving real users.

```powershell
npm.cmd ci
npm.cmd run db:schema -- --apply
npm.cmd run db:check
```

`db:schema` creates missing tables and widens rate/money columns to BIGINT without
deleting rows. Back up an existing target before applying a schema upgrade.
`db:check` is read-only. Use Node 24 or later.

The optional PostgreSQL tests require `TEST_DATABASE_URL`. They create and drop
their own schemas; use a disposable staging database with CREATE SCHEMA permission:

```powershell
npm.cmd test
```

Without `TEST_DATABASE_URL`, the ordinary SQLite/browser suite runs and the two
PostgreSQL integration tests are explicitly skipped.

## Preserve live records before changing hosts

First identify the SQLite database used by the process currently serving the
public site. A new `data/app.sqlite` in another checkout is not the live database.
Keep the current site running until the staging app has been checked. For final
cutover, pause task/payment changes and make a consistent SQLite backup. Use the
existing `save-backup.js` only after confirming its source is the correct database.

Import the frozen backup into an EMPTY target, before starting the PostgreSQL app:

```powershell
npm.cmd run db:import -- --source=C:\path\to\backup.sqlite
npm.cmd run db:import -- --source=C:\path\to\backup.sqlite --apply
npm.cmd run db:check
```

The first command reports counts without importing. The second preserves existing
IDs, password hashes, referrals, sessions, task state, evidence/image bytes,
withdrawals and ledger records in one transaction. It verifies table counts and
refuses to merge into any nonempty destination table. SQLite timestamps are
interpreted as UTC. It never modifies the source. It does not recalculate rewards,
holds, referrals or balances. Keep the backup privately after cutover.

## AppSail settings

Use a managed **Node 24** runtime and the repository root as the source directory.
Install runtime dependencies with `npm ci --omit=dev`; include `node_modules` in
the build directory when uploading a prepared build. Do not upload `data`, `.env`,
`.git`, private backups, or live task exports.

| Setting | Value |
| --- | --- |
| Startup command | `node server-postgres.js` |
| DATABASE_URL | Neon connection URL, privately configured, TLS enabled |
| PUBLIC_ORIGIN | The HTTPS URL used for the current deployment |
| ADMIN_EMAIL / ADMIN_PASSWORD | Only required to bootstrap a deliberately new empty app |
| EXCHANGE_RATE_API_KEY | Existing private key, optional |
| App instances | One initially: live SSE notifications are process-local |

AppSail supplies `X_ZOHO_CATALYST_LISTEN_PORT`. The PostgreSQL server uses that port
and binds to `0.0.0.0`. Do not set this variable yourself. On the laptop it binds
to `127.0.0.1:3000`. The existing app admin/password hashes survive data import;
bootstrap variables do not reset imported accounts.

Validate the generated Catalyst staging URL before changing the public domain:
home, preview image MIME and dimensions, login, private task visibility, a test
workflow with synthetic data, referral URLs, and withdrawal quotes. No real payout
is required. The disposable test engine used during preparation is PGlite with
the PostgreSQL wire driver; repeat the integration checks on an isolated Neon
staging database before production cutover, particularly concurrent requests.

Only after the imported records and balances are reconciled should the existing
domain be pointed to Catalyst and PUBLIC_ORIGIN changed to https://taskharbor.cc.cd.
Keep the old copy stopped from accepting writes after that switch; otherwise the
two databases diverge. Retain it as a rollback copy until cutover is verified.

References:
- https://docs.catalyst.zoho.com/en/serverless/help/appsail/catalyst-managed-runtimes/key-concepts/
- https://docs.catalyst.zoho.com/en/serverless/help/appsail/appsail-configurations/
- https://neon.com/docs/get-started-with-neon/workflow-primer

## Optional task-workflow and compensation update (October 30, 2026)

This feature is developed separately on `feature/catalyst-task-workflows`.
It introduces **two additive PostgreSQL tables**, `task_policies` and `task_compensations`, without changing existing task or wallet records. Old tasks retain their legacy timing behavior.

**Before updating a running deployment:**

1. Confirm which server and database actually serve `taskharbor.cc.cd`. Never assume the SQLite and Neon deployments share data.
2. Create and independently verify a consistent backup of the **actual live database**, including identities, evidence, wallet, referral and payout entries. Keep the old running code available for rollback.
3. On a separate **non-production Neon staging database**, run `npm ci` and `npm run db:schema -- --apply` to create the two new tables, then run `npm test` with `TEST_DATABASE_URL` pointed at a disposable database. Use the isolated GitHub Actions PostgreSQL CI as an additional check.
4. Reconcile staging records/balances and complete manual end-to-end checks for Gmail claim, delayed detail release, adjustable work time, and compensation.
5. When approving production rollout, back up production again, apply the **additive schema migration first**, and then deploy the matching `server-postgres.js` build. Do not deploy the new app before the tables exist, or start a second writer against a diverging database.
6. Have the administrator review old expired Telegram-source submissions individually. **Do not bulk-credit users automatically.** The new admin action credits the original task reward exactly once as a **TaskHarbor-funded compensation**, not provider approval; it bypasses the standard 72-hour hold, does **not** issue referral bonuses, preserves submission history, closes the task, and records a notice. The admin must confirm that the original provider task expired and the member already performed work.
7. TaskHarbor's operational USD ledger is not a payment gateway; actual mobile-money/airtime settlement remains manual.

The separate VeTella FaceAtlas project has its **own** external approval, minimum-ten-contributions and payment conditions. Do not use Telegram-source compensation to override them. Task-specific deadline settings do not themselves implement a multi-contributor listing or automatic contractor reconciliation.
