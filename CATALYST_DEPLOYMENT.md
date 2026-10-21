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
