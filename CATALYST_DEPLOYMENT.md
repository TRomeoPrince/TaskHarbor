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

## Compact task browsing and navigation

`feature/task-list-navigation` reorganizes both dashboards into one vertical list of compact task rows. Each row shows the title, short safe summary, status and reward. Opening a task shows an overview and expandable public requirements before claiming; assigned private fields, follow-up instructions, messages, evidence and admin review controls are shown in the focused detail view. Existing server authorization still determines which private fields and images are returned.

Workspace links separate Browse tasks, My work, Submissions, Wallet, Referrals and admin Create tasks. Hash routes support browser Back/Forward and notification deep links. Search and status filters narrow the task list. Balances are collapsed by default; the wallet view expands them. Action forms use a native dialog so a task button does not scroll to a remote form at the top of a long page. Live state refreshes preserve an open action form's draft.

This update does not change task assignment, reward amounts, hold rules, wallets, referrals or payment APIs. It requires no additional schema migration beyond the contacts branch's existing migration. The newest contacts branch snapshot contained only five files; the UI branch restores missing application files from tested commit `7acc969` while preserving the newer email/Telegram support settings.

Validation: `npm test` includes task-list/detail navigation tests with synthetic member/admin data. `scripts/check-task-layout.cjs` uses an isolated static fixture server and Playwright to check desktop/390px layouts, list spacing and overflow, overview-before-claim, Back/Forward, admin review, modal behavior and draft preservation. It never connects to a production database. Screenshots from CI are published as the `taskharbor-task-layout` workflow artifact.

## Compact navigation and member progress (PR #4)

Task browsing is a compact vertical list for both roles, with a brief overview before claiming. The admin-only **Member progress** view distinguishes available/claimed slots, submissions awaiting verification, approved work and rejected/compensated work. It shows the assigned member and latest explicitly labelled member progress report, with links to the task/evidence and a Request update action. It counts task slots separately from unique assigned members; a claimed slot is never treated as a completed contribution.

Assigned members can use **Report progress** within their task. FaceAtlas prompts for historical videos (2), new-setting videos (8), English-speaking videos (5), portal status and blockers. These are text self-reports stored in the existing authorized task message history. They neither submit/approve the task nor change balances, deadlines or claim ownership. Follow-up step counts are shown only when configured. Provider approval remains an independent manual check. No percentage is invented for tasks with no structured milestones.

This addition has no schema migration. Admin-only assignee details are omitted from member responses. Progress reports do not collect recordings, passwords or identity documents. Existing API authorization still limits task messages/evidence to the assigned member and administrators. It does not create extra opportunity slots or clear existing claims automatically.

## Public home and session-preserving navigation

`fix/public-home-session` reserves `/` for the welcome page, including when the visitor is signed in. `/dashboard` is the private workspace; `/login` and `/signup` are separate authentication views. The public home checks only the current session and can offer My dashboard; it never fetches wallet/task state or opens workspace live updates. Existing hash-based sign-in/signup links remain compatible.

Dashboard links from Profile, Payouts and Contact point to `/dashboard`; the TaskHarbor brand points Home. Valid sessions are preserved by navigation. A confirmed API 401 sends private pages to `/login?next=...` and login returns only to allowlisted local app paths. Logout explicitly returns to `/`. Browser history restoration rechecks the session. Notification deep links target `/dashboard`.

This patch preserves existing cookie protections, session lifetimes, authorization and all stored records. It has no schema migration of its own. It is based on the compact task/progress branch and does not deploy the separate contacts migration automatically. Deploy matching frontend and backend together, because `/api/session` and the new page aliases are part of this patch. Existing runtime configuration and database remain unchanged.
