# TaskHarbor — Codex Cloud continuation

Prepared 18 October 2026, Africa/Kampala. Read this document before changing behavior. Preserve existing work and financial records. The user approved **USD 0.01 per qualifying approved email task at all times**, including after the first 30 days. This replaces both referral rates for new awards; historical awards and balances remain unchanged.

## Repository and migration state

- Target: https://github.com/TRomeoPrince/TaskHarbor, public, branch `main`.
- The original session ran in a ChatGPT project mirror, with the application under `microtasks/`. Neither the mirror nor that subdirectory was a Git repository. There is no earlier local branch, commit history, staged state or tracked/ignored Git status to recover.
- The target GitHub repository was confirmed empty through the GitHub connector and an actual clone. A separate checkout was created under the local mirror's `migration/TaskHarbor/`. Application files are copied into its **repository root**, where `package.json` now lives. The original running application was not moved, deleted or reset.
- All 42 original non-secret application files are inventoried with SHA-256 hashes in `SOURCE_MANIFEST.json`. The handoff, repository agent instructions and expanded ignore rules are migration additions. Inspect `git log -1` and `git status` for the actual migration commit and current state; a file cannot contain its own commit hash.
- No unrelated `work/`, `outputs/`, or synced `sources/` material from other projects was included. Those original files remain on the local PC.

## Project purpose and user workflow

Provider-agnostic microtask web app, named TaskHarbor. Members register, claim one task, submit evidence, complete follow-ups, receive corrections, and eventually request withdrawals. Admins create/import tasks, communicate with assigned members, review evidence, record upstream decisions and manually record payouts. Telegram interaction is entirely manual; no bot session or external task adapter is connected.

The user's current task template is CREATE GMAIL: first name, optional last name/source instruction, Gmail address (Username), supplied password, and **19 May 2000**. The fixed worker reward is **USD 0.12**. Quick Create publishes this template directly; no JSON import is required. Generated source IDs normalize Gmail dots and plus aliases to prevent repeated publication of the same address through this form. The generic admin task builder and JSON importer remain available. Account creation and verification bypasses are not automated.

The exact visible instruction is: “Register Gmail account using the information provided below.” The warning explicitly requires the provided first name, last name (blank when instructed), Gmail username, password and date of birth. No-last-name wording is “No last name — Leave blank / empty”. Fields have optional Copy buttons and plain-text values; the user explicitly requested unmasked supplied task passwords. That does not mean account login passwords are stored in plain text: login passwords use salted scrypt.

Workflow: initial creation evidence → admin manually taps Done upstream → recovery email arrives → admin uses Provide instructions on the blank recovery step → member completes recovery → birthday step with four screenshots → member makes full birthday public and enables highlighting → sign out → admin checks upstream → starts hold → final moderation → release/deny. Missing requirements are relayed using task messages or Request correction. Birthday instructions appear after recovery completion; no separate automatic upstream check gates them.

## Architecture and files

Node.js >=24, ESM, built-in HTTP, built-in `node:sqlite`, no runtime npm dependencies, no bundler. Browser UI is plain HTML/CSS/JS.

| Files | Responsibility |
| --- | --- |
| `server.js` | HTTP routing, authentication/session cookies, origin check, startup, timers, SSE broadcasting, manual payout recording |
| `auth.js`, `config.js` | scrypt password functions; load optional local `.env` |
| `schema.sql`, `store.js` | persistent SQLite schema, foreign keys, WAL, transactions, claims/expiry, ledger and wallet |
| `features.js` | task creation/import, private authorized state, submissions/steps, image storage/serving, withdrawal quotes |
| `workflow.js` | corrections/resubmissions, evidence history, 72-hour hold and final moderation |
| `community.js` | usernames/profiles, short referral links, referral accrual, masked payout feed |
| `profile.js` | current-user profile and password changes, revocation of other sessions |
| `exchange.js` | automatic USD conversion rates, cache/retry, optional authenticated provider endpoint |
| `quick-task.js` | fixed template publication and deterministic source ID |
| `providers.js` | future TaskProvider interface only; not connected |
| `public/` | dashboard/auth/admin UI, profile, payout history, navigation/icons, clipboard handlers, styles |
| `templates/` | single-account JSON with embedded four birthday reference screenshots and usage notes |
| `desktop-builder/` | offline HTML exporter and Windows launcher; an alternative to site Quick Create, not a native executable |
| `save-backup.js` | consistent online SQLite snapshot using Node's backup API |
| `test/` | 16 current regression/integration tests |
| `README.md`, `UPDATES.md`, `BACKLOG.md` | accumulated documentation; newer handoff/current code supersedes older descriptions |

Images are base64 in import JSON and stored as BLOBs in the private SQLite DB. Step-specific instruction images use a kind containing the step ID and require both task assignment and step visibility. Templates and offline builder already embed required reference images; temporary upload paths are not required to run them.

## Financial, assignment and privacy invariants

- Integer USD cents in ledger; available balance is the signed ledger sum. Held rewards are displayed separately and cannot fund quotes or withdrawals. Pending and held are distinct buckets.
- Initial acceptance starts a **72-hour hold from the admin action**. Time alone never pays. Final admin confirmation of upstream approval after the hold creates one earning entry. Denial never credits held funds. Existing previously credited balances are not retroactively frozen.
- Final moderation and ledger credit are transactional. A unique earning index per task and terminal submission states prevent duplicate payment.
- Corrections reopen the same task/submission or selected step plus later steps, retaining prior evidence/history. Permanent rejection is distinct from a correction request. A renewed hold after correction starts another 72 hours.
- Conditional task assignment plus database transactions prevent duplicate claimants. Each member may have one claimed/submitted task, including hold/moderation.
- Unsubmitted claims expire at 30 minutes, with request-time and 15-second timer enforcement. Submitted tasks are not recycled because an account may already exist. Overdue unfinished follow-ups are flagged to admins. Old claimants lose server permission after reassignment. Existing claims get a deadline when first upgraded; later restarts do not extend it.
- Task descriptions, supplied account details, images and messages are private to assigned member/admin. SSE broadcasts change notifications only; each client refetches authorized state. Open action forms and builder inputs are outside re-rendered lists.
- Currency choice changes display/entry estimates, not ledger or settlement currency. Admin view and payments stay USD. Preview uses a single-use five-minute quote and a binding USD debit; confirm rechecks current balance transactionally. UI limits use the available balance and floor local whole/minor units to avoid overdrafts.
- Platform notice: Ugandan mobile money minimum is UGX 1,000; smaller payouts are airtime. This is a manual policy, not an integrated mobile-money/airtime payment service. The approximate USD threshold uses the current display rate, not fixed $0.24.
- Payout feed requires login, returns latest 100 paid requests, chosen username or masked email, masked destination and amount/date. Full destinations and payment references are not returned in the feed. Admin processing still sees destinations.
- Profile supports optional username, password change using the old password, saved display currency, private account details and referral link. Other sessions are revoked on password change. User-facing terminology is member rather than worker; internal role name remains worker.

## Referrals — approved flat rate

The user confirmed on 18 October 2026 that referrers earn **USD 0.01 per approved email task completed by a referred member at all times**, including after the first 30 days. Both policy rates are now 10,000 integer millionths of USD. There is no Google/UGX pricing baseline for new awards. The existing eligibility rule remains one award per qualifying manual-telegram task, paid only at final moderation release after the 72-hour hold. Denied tasks do not earn awards.

Historical USD 0.072526 / USD 0.004835 awards, ledger credits and fractional remainders are preserved without recalculation. New one-cent awards add to the existing total; duplicate task awards remain blocked. No database migration is required.

Referral links use `/r/` plus an eight-character random code; old UUID links remain valid. Referrer can only be set at registration and cannot subsequently be changed.

## Exchange data and services

ExchangeRate-API account endpoint: `https://v6.exchangerate-api.com/v6/<server-only-key>/latest/USD`, response field `conversion_rates`. Without a configured key, the open `https://open.er-api.com/v6/latest/USD` endpoint is used. Cache follows provider's daily schedule, timer checks every 30 minutes, failed refreshes back off at least hourly. Cached rates over two days are labeled older; local entry unavailable after seven days; USD stays usable. Supported currencies and minor-unit precision are restored from cached rates.

User compared Google/Morningstar UGX 4,136.46 with provider UGX around 3,987.29. This was verified as a source difference, not a calculation error. Adding the supplied account key returned about 3,987.2945, not Google's rate. Normal conversion display still uses ExchangeRate-API; Google was used only for the historical referral-pricing baseline. Do not claim Google live matching.

Other services: GitHub for source; optional ngrok for local HTTPS testing on phones; manually operated Telegram upstream. No OpenAI API, payment gateway, SMTP, Redis, installed MCP server, or third-party npm library is needed to run/test the app. GitHub connector and official web docs were migration tools, not runtime dependencies.

## Private resources NOT in GitHub

The original application's `.env` contains the configured exchange key. `data/app.sqlite`, its WAL/SHM files, and `data/backups/` contain live identities, hashes, sessions, task credentials/evidence, messages and money records. **Never commit them, even to this repository.** A new consistent snapshot was created immediately before migration under `data/backups/before-referrals-<timestamp>.sqlite`. The local original and backups remain untouched by source publication.

To reproduce the exact live state, arrange private transfer of that consistent snapshot into the destination's intended `DB_PATH` (or `data/app.sqlite`) **before first running the app there**, without overwriting an existing database. Do not copy only a live WAL-mode app.sqlite while omitting its WAL. The online snapshot is self-contained. No private DB is bundled in the public source package. If state changed after the snapshot, create a fresh one before a planned switch; avoid two live writers on diverging copies. Authentication hashes and sessions are in the DB; decide session revocation as an explicit deployment action, not a migration cleanup.

Do not upload the API-key screenshot, other chat screenshots with account credentials, or arbitrary synced reference files. Only the four generic birthday-settings images embedded in the application template are included as required product assets.

## Environment variables — names only

| Name | Purpose / Cloud configuration |
| --- | --- |
| `EXCHANGE_RATE_API_KEY` | Server-side credential for ExchangeRate-API. Configure securely in Cloud; do not place its real value in Git. For a network-secret placeholder, validate substitution with this code's URL encoding and HTTPS URL-path key; do not assume it works without testing. A direct private environment value is the current code contract. |
| `ADMIN_EMAIL` | Optional new-database bootstrap admin login identifier. Configure privately; existing DB admins are not changed. |
| `ADMIN_PASSWORD` | Optional new-database admin bootstrap secret. Existing admin hashes come from the transferred DB. Current bootstrap prints the generated/provided admin password; address secret-safe bootstrap logging before real deployment. |
| `PORT` | HTTP port, default 3000. Local testing in this session used 3001. |
| `PUBLIC_ORIGIN` | Exact HTTPS public app origin accepted for mutations; necessary for a reverse proxy/tunnel. Do not retain the old PC's ngrok origin when moving. |
| `DB_PATH` | Private persistent SQLite path; default is repo-local data/app.sqlite. Parent of a custom path must already exist. |
| `NO_LISTEN` | Tests only: 1 prevents auto-listen and automatic provider polling. Do not set it for normal app startup. |

The original `.env` is automatically read by config.js. `.env.example` contains only the configuration name and a dummy value. No real credential values belong in this handoff.

## Setup, run and test

From the repository root, select/install Node.js **24 or newer**, then:

```sh
node --version
node --test test/*.test.js
node server.js
```

`npm test` and `npm start` are equivalent wrappers. There are no external dependencies to install. On Windows with blocked npm.ps1, use `node server.js` or `npm.cmd start` rather than changing execution policy. Development binds to 127.0.0.1 only. Use local browser or the Cloud environment's supported preview/start mechanism after verifying routing. A repository/environment migration is not public production deployment: assess persistent storage, HTTPS origin, service lifecycle and bind/proxy requirements before inviting users.

For networked rate checks, allow `v6.exchangerate-api.com` (or `open.er-api.com` for fallback). Automated tests use mocked provider data and in-memory DBs, so they do not require a live key or live rate service; HTTP integration needs local loopback access. Do not point tests at the live DB.

Cloud documentation checked during migration: https://learn.chatgpt.com/docs/environments/cloud-environments . Configure the environment's current runtime/install/start settings, variables and outbound domains; private environment values are separate from source. The user reports an environment connected to this repository already exists; its actual settings were not visible or modified in this session.

## Validation at migration

All **16 tests passed, 0 failures** on Node 24.21.0 in Windows. Includes auth/origin handling, HTML profile/payout routes, SSE notification, claims/exclusivity and expiry, held-money withdrawal blocking, correction history, staged-image authorization, duplicate earnings, quote replay/rate snapshots, private field visibility, referral fraction/month accounting, masking, profile reauthentication/session revocation, offline export/template fixed data, Quick Create duplicate aliases, and clipboard success/blocked fallbacks. Integration test admin passwords are synthetic fixtures, not real credentials. UI regression tests use a lightweight VM DOM stub; this is not a full cross-browser visual QA pass. Live ExchangeRate-API was separately checked earlier in this session. Repeat tests in the Cloud OS after clone.

## Known limits and next steps

1. Referral pricing is implemented as the approved flat USD 0.01 rate. The next migration prerequisite is the database choice below.
2. Privately configure secrets and decide whether to transfer the live DB or deliberately use a separate empty development DB. Do not silently start with an empty DB and describe it as migration of live accounts.
3. Run all tests in Cloud; verify current browser clipboard works on actual phone/HTTPS. The latest fix bundles clipboard handlers into app.js/profile.js so an older server missing a separate clipboard route cannot silently disable Copy. public/clipboard.js is also retained and tested; avoid editing one copy without updating bundled copies.
4. Verify deployment/preview networking. Server is loopback-only, local Windows launcher does not run on a phone, and a Cloud coding environment is not automatically a persistent app host.
5. Review prototype security before public hosting: TLS, bootstrap logging, proxy/session design, durable rate limits, email verification/password recovery, encryption/access policy for account credentials, DB backups, CSRF review, request/storage limits and abuse controls. Existing safeguards are not a completed production security review.
6. Referral self-referral through multiple identities is not comprehensively prevented; unique email and manual moderation do not prove identity. Payout page is capped at 100, no pagination. Admins should not treat screenshots/Done alone as proof.
7. Expiry only recycles claims without a submission. No automatic cancellation/reassignment of account-creation follow-ups; preserve this distinction unless the user explicitly agrees on a safe replacement workflow.
8. Profile/clipboard/navigation changes are static files and can refresh immediately locally; new endpoints/schema/module changes require restarting the server. Several user-reported Not found/undefined fields came from new frontend files with an older still-running server. No refresh should delete data.
9. Historical README/UPDATES/BACKLOG text can contain superseded descriptions. Treat current code/tests and this handoff as the accurate baseline. No unrelated runtime code changes were made solely for migration.

## Preserve-work instruction

Never reset, delete, discard or roll back existing user work. Keep private state out of Git. Work on the current branch without force pushes. This handoff describes only TaskHarbor; unrelated local project mirrors/reference material were deliberately not uploaded.

## Cloud continuation validation

Cloud checkout began at main commit 83e939e. All original 16 tests passed on Node 24.19.0. The private live DB, backups and .env are absent; the user has not yet chosen a separate development database versus private live DB transfer. No normal app server was started against a new persistent database. Network/startup guidance was saved in the environment draft, pending user review/save and publication. Live fallback exchange access was blocked by proxy HTTP 403 before those settings were applied. Phone/HTTPS testing remains outstanding.

The source manifest reflects pre-migration bytes: 18 files differ only by line endings, .gitignore has documented migration additions, and public/style.css has an unexplained original hash mismatch. Subsequent intentional feature changes also supersede those original hashes; do not overwrite files to force a manifest match.

The flat-rate change updates community.js and referral UI wording, tests first/later awards, duplicate protection, historical fractional carry, and HTTP hold/final release behavior. Run the current full suite for its latest result.

Task cards now label the selected-currency amount as “Reward:” and omit the visible internal task ID/provider line. The complete Cloud suite passes: 17 tests, 0 failures. No hosting target or deployment workflow is configured in this checkout; publishing source to GitHub alone does not establish a live website deployment.
