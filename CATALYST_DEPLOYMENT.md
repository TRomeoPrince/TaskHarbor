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

## Contact, support and opt-in notifications

`feature/contact-notifications` adds private phone details, a member/admin support inbox and opt-in alerts. Administrators can see saved contact numbers; other members cannot. Support messages never include private task instructions in outgoing alerts. New tasks notify members; submissions notify admins; support replies notify the relevant participant. `/contact` shows an in-app alert inbox even when external delivery is not configured.

Apply `contacts-schema.sql` transactionally before deploying this build. `neon-schema.sql` also includes the same additive definitions for fresh development databases. Test on a separate Neon branch first. The installation timestamp intentionally excludes historical tasks/submissions from alerts. No account, task, evidence, balance, referral or withdrawal migration is performed. No automatic credits or payments are added.

Configure these server-only environment values in AppSail:

- `SUPPORT_EMAIL`: public support email (default `admin@taskharbor.cc.cd`). `SUPPORT_TELEGRAM_URL`: optional verified https://t.me/ channel link. No WhatsApp contact is offered. The private inbox remains available.
- `PUBLIC_ORIGIN`: existing canonical HTTPS site origin.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: generate a persistent keypair using `npx web-push generate-vapid-keys`; use a valid mailto/HTTPS subject. Keep the private key server-only. Each device must opt in; iOS users must open an installed Home Screen web app on a supported iOS version.
- `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE` (`true` for implicit TLS/465), `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`: an authorized sending account with verified domain/sender. Non-implicit SMTP requires STARTTLS. Do not use a member's email as the sender.

With missing delivery configuration, the UI reports setup is pending and disables that channel. Email opt-in sends a one-time confirmation valid for 24 hours; only the signed-in owner can redeem it. Enabling email must be completed by the member. Public support details and a sender account still need to be supplied by the owner before real outbound delivery can be verified.

The worker scans every 30 seconds independently of publish/submit requests. Source keys, inbox rows and delivery jobs deduplicate repeated scans; jobs use row locks and a five-minute delivery lease. Failures retry up to five times with backoff; expired push endpoints are removed. Disabling a channel cancels pending alerts and delivery rechecks consent. Provider acceptance followed by a process crash can still cause a retry: SMTP/Web Push do not offer end-to-end exactly-once delivery. Push tags and stable email Message-IDs help clients group duplicates. Use one AppSail instance for existing SSE behavior; the outbox itself supports concurrent workers.

Before rollout, run PostgreSQL CI, check member-to-member privacy and admin support replies, then test opt-in, confirmation, push delivery on phone/PC, opt-out and delivery failures against approved test accounts. Do not enable email/push for existing members automatically. Do not backfill historical alerts or subscribe the administrator's browser without their action. New notification links target the relevant task card/support conversation, whose normal authorization remains in force.

ImprovMX receiving: configure the domain MX records for mx1.improvmx.com (10) and mx2.improvmx.com (20), plus its SPF include. Forwarding is separate from app notification sending. The ImprovMX Free plan has no SMTP sends; do not configure a forwarding alias as an SMTP login. An authorized sending service/account is still required. Telegram channel creation and its final link must be verified in the owner account before setting SUPPORT_TELEGRAM_URL.


## Dashboard route and support email (October 31, 2026)

The signed-in workspace has an explicit `/dashboard` and `/dashboard/` URL. The home page `/` remains the public welcome and sign-in entry point; successful sign-in normalizes the address bar to `/dashboard`, clearing stale `#sign-in` and `#sign-up` fragments. All primary navigation links point to the new route. The same existing session cookie is used; no accounts, balances, session rows, tasks, or payments are migrated. Keep `PUBLIC_ORIGIN=https://www.taskharbor.cc.cd` consistent with the actual canonical site and validate on both www and apex hostnames.

**Transactional support correspondence** (distinct from opt-in marketing/task alerts):
- User submits a support conversation/message on `/contact`, or an administrator replies within the authenticated support console.
- The existing notifications worker enqueues a durable email to the owner's verified business inbox for member messages, and emails the originating member at their registered address for administrator replies. The worker retries provider outages. It does not send email until all mandatory mail infrastructure is configured.
- Set `SUPPORT_EMAIL=admin@taskharbor.cc.cd` **only after the receiving mailbox or forwarding alias has been verified**. Set `SUPPORT_INBOX_EMAIL` to the same verified address, or another verified team inbox, to direct notifications. Both directions require a configured support inbox.
- Set `SMTP_HOST`, `SMTP_PORT` (usually 587), `SMTP_SECURE` (`false` with STARTTLS for 587), `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM` for an authenticated outbound sender. The receiving MX/forwarder (e.g., ImprovMX) alone **cannot send** outgoing replies. Verify the sender's domain and configure SPF, DKIM and DMARC as required by the sending provider. Never commit any SMTP credentials or tokens.
- The `MAIL_FROM` address must be authorized by the SMTP provider. For brand-consistent delivery use `TaskHarbor <admin@taskharbor.cc.cd>` or a verified support subdomain sender; configure sender/display name through the provider as needed.
- Support emails include conversation text and a link to the private TaskHarbor thread. Do not include account passwords, access tokens, or sensitive identification files in support messages. URLs remain subject to normal account authorization.
- Admin replies **within TaskHarbor** are automatically emailed to the member and recorded in its audit trail. If the administrator instead replies directly from Gmail/Outlook, that email is **not** imported into the TaskHarbor thread; inbound mail ingestion/webhooks are a separate future feature.
- Support emails are considered service correspondence initiated by a worker, and do not depend on preferences for optional new-task email alerts. General alerts still honor email confirmation and opt-out.
- Email failures do not reverse or duplicate support messages. Inspect `notification_outbox` for pending/sent/failed delivery status when diagnosing. Queue entries deduplicate by event key and recipient.

**Acceptance checks after AppSail deployment**:
1. Sign in at `https://www.taskharbor.cc.cd/#sign-in` and confirm URL becomes `https://www.taskharbor.cc.cd/dashboard`.
2. Navigate Dashboard → Payouts → Profile → Contact → Dashboard without any new sign-in, including with hard reload. Test apex/www hostname links and a fresh browser profile.
3. Check member/admin role separation, private threads, wallet balances, and task claims.
4. With verified SMTP/receiving inbox, send a support message from a *test member*. Confirm it reaches the configured TaskHarbor inbox; reply **inside the admin support console** and confirm receipt by that test member email. Ensure neither email is sent twice.
5. Without SMTP, verify messages remain available in the in-app support inbox and no misleading email-delivery claims are shown.

Release gate: full GitHub PostgreSQL tests and actual live browser checks are both required before describing email delivery and navigation as production-verified.
