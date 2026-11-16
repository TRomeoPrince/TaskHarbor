# TaskHarborplan.md — Product Blueprint, Audit and Build Checklist

**Status:** Blueprint locked for phased implementation; NOT complete or production-verified.  
**Last audited:** 2026-11-16 (Africa/Kampala).  
**Canonical location:** repository root, default `main` branch.  
**Product:** TaskHarbor — **Real Tasks. Real Skills. Real Opportunities.**

> This is the single source of truth for the intended product. Build stages must update checkboxes, evidence, decisions, and the changelog here. Do not infer “complete” from code presence, a mockup, a passing unit test, or an unverified deployment.

## 1. Sources and intent

This plan consolidates (1) the previous “My Vision for TaskHarbor” conversation recorded in the uploaded 39.6-second screen video `20261116-0244-40.5072549.mp4`; (2) the user's TaskHarbor history and constraints; (3) a read-only GitHub audit of `TRomeoPrince/TaskHarbor` branches and representative code on 2026-11-16; and (4) existing `AGENTS.md`, `BACKLOG.md` and `CATALYST_DEPLOYMENT.md`. The video shows **a product concept and illustrative task cards**, not a live website or real available work. Example earnings, openings, and acceptance rates shown in the vision must never be presented as actual TaskHarbor activity.

**North star:** TaskHarbor should feel like a **place to work**, not merely a site to click. Create a professional, Uganda/Africa-friendly yet globally usable digital-work marketplace that links businesses needing legitimate work to people with time and skills. Combine:
- Clickworker-like accessible microtasks;
- Mindrift-like AI training and evaluation assignments;
- Toloka-like data annotation and quality control;
- Upwork-like longer skilled projects; and
- TaskHarbor's own verifiable claim → work → evidence → review → earnings → withdrawal model.

Do **not** clone those services, overpromise payouts, or pigeonhole all jobs into identical “submit a screenshot” forms. The task type determines its workspace, payout unit, workflow and quality criteria.

### Product principles
1. **Clarity before commitment:** show enough public information and payment/approval conditions before the worker claims; reveal private instructions only when authorized.
2. **Real work, real accounting:** no fabricated jobs, openings, users, testimonials, earnings or acceptance percentages. Show **pending**, **held**, **available**, **withdrawn**, and **lifetime earned** accurately and separately.
3. **Safety of existing work:** preserve users, roles, sessions, private data, claims, task history, reviews, compensation, referrals and immutable financial records. Never reset the live database to ship a redesign.
4. **Flexible by category:** a quick action, partner survey, audio transcription, annotation batch, AI assessment and a multiday skilled assignment need different submission interfaces.
5. **Mobile-first, desktop capable:** low-bandwidth friendly, responsive, keyboard-accessible and readable. Do not make mobile users operate a desktop form squeezed onto a phone.
6. **Reviewable and auditable:** tasks and payments have explicit sources, policies, evidence requirements, reviewer decisions, idempotency and appeal paths.
7. **Budget-aware delivery:** reuse the existing Node/Catalyst/Neon stack, hosting and code where suitable. Avoid a speculative rewrite, unnecessary paid services or live-data experiments.

## 2. Brand and UI/UX blueprint

**Identity:** Modern, trustworthy, professional, warm, easy to scan; **not a gambling dashboard** and not a dark-only interface. Primary evergreen/forest green; light white/off-white backgrounds; pale gray/light-green surfaces; restrained teal or warm-gold accents. Clear dark text, soft borders/shadows, rounded cards, consistent spacing, clean sans-serif typography (Inter or a comparable locally/fallback available font), crisp icons, obvious focus states and accessible contrast.

**Design system to implement:** documented CSS tokens for backgrounds, text, semantic status colors, borders, radii, spacing, type scale, card grids, responsive breakpoints, loading/empty/error states, button variants, badges, accessible forms, dialog/drawer behavior and table/card transitions. Use progressive enhancement; avoid heavy UI dependencies unless demonstrably needed.

**Public landing page:** clear promise; how work and approvals operate; browse eligible categories without exposing private information; transparent payout and country-eligibility policies; links to support/terms/privacy; distinguish a developing product from a fully operational global marketplace.

**Desktop worker nav:** Dashboard · Find Work · My Tasks · Earnings · Referrals · Support · Profile. Mobile: compact prioritized navigation with a clearly accessible More menu. Do not route authenticated users back to sign-in when they click Dashboard; canonical `/dashboard` must work while retaining the public `/` entry.

**Three distinct experiences, one shared backend:**
- **Worker:** discover jobs, assess eligibility, claim, work, submit, correct, track earnings and payments, manage referrals and support.
- **Business/client:** register/verify organizations, propose and fund projects, upload approved datasets, define budgets, see progress and retrieve accepted deliverables; launch later behind permissions rather than pretend it is operational now.
- **Admin/operations:** publish/import work, approve partners and clients, allocate capacity, verify submissions, run QA, manage disputes, oversight, payments, contacts and profitability. Admin is not a worker with a few extra buttons.

### Worker home/dashboard

Above the fold: greeting/identity, “next best action,” available/eligible work count, **pending review**, active/reserved tasks, and **available balance**. Show quick actions for **Find work**, **Continue tasks** and **Withdraw** when eligible. Below: recommended work that actually matches user eligibility, recent activity, correction requests, hold/review status, recent payout status, notifications, optional skill/qualification progress, referrals and support. Keep admin operational metrics separate from worker wallet metrics.

### Marketplace (“Find Work”) and task-card contract

Search/filter/sort by task type, category, skills, region/eligibility, reward, payment unit, estimate, availability, deadline and provider. Optional “recommended for you”; never label an unconfirmed opportunity available.

Every real task card must display, when known:
- Exact title and category / recognizable task-type icon;
- Concise plain-language outcome and required skill level;
- **Exact displayed reward and currency, with unit** (per accepted task, batch, clip, item, recorded minute, hour or milestone);
- Expected duration **if a real estimate exists**, not a fabricated guarantee;
- Verified remaining slots / available work units, or “not specified”;
- Eligibility, prerequisites/assessment and provider/client disclosure as policy allows;
- Claim/release/deadline and review/payment conditions;
- Clear **View details** link; no premature claim from an ambiguous teaser.

Task-detail screen **before claiming**: complete public brief, what qualifies as accepted, acceptable evidence, approximate workflow, privacy/data-handling notes, cancellation and deadline policy, payment/hold rules, capacity, required device/tools and how disputes work. Confidential task fields are only visible to the assigned eligible worker/admin.

The illustrative audio-transcription, image-annotation and quick-task cards in the reference video are **mockups**, not jobs to publish with invented values.

## 3. Six initial work types and extensible task engine

| Type | Worker workspace | Payment/verification model |
| --- | --- | --- |
| Quick microtask | Numbered instructions, task timer if configured, copyable fields, evidence form, safe image attachments | Fixed amount per accepted task |
| Survey / offerwall | Authorized provider launch and callback/status, clear redirect and eligibility | Partner-defined payout, verified before credit |
| AI evaluation | Prompts/responses/media, structured comparison/rating and QA rubric | Accepted unit or batch |
| Transcription | Secure audio player, speed controls, optional waveform, editor, speaker labels/timestamps, autosave and shortcuts | Clip or verified recorded minute |
| Data annotation | Image/text/video labeling or evaluation interface, schema-driven labels, autosave, QA review | Accepted item, batch or project |
| Skilled project | Scope/milestones, deliverable upload, discussions, deadlines, revision and acceptance checkpoints | Contract or accepted milestone |

**Extensible schema:** `task_type` + `workspace_schema/version` + `reward_policy` + `eligibility_policy` + `claim_policy` + `review_policy` + `submission_schema` + `deadline_policy` + `provider_source` + `client/project` metadata, rather than six unrelated hard-coded task tables. Version the templates so existing claimed tasks continue to use the form they started with. Keep baseline tasks backward-compatible and avoid forcing a database migration before mapping legacy rows.

**Common lifecycle:** Draft → Published/Available → Claimed/In progress → Submitted → Under review → Approved + hold/final verification → Available for withdrawal; with parallel explicit paths for Needs correction → Resubmitted, Rejected/appeal, Cancelled/Expired and administrative compensation (separate event type, never an upstream approval). State changes must be authorized and auditable, with server-side concurrency control.

**Reservations:** configurable per task/type; existing 30-minute claim lease remains a *legacy/default policy*, not an arbitrary global maximum. Allow multiple concurrent valid claims for a worker up to a category-specific, abuse-protected cap and multiple independent work units/slots per project. A larger approved assignment can legitimately require several days (previous example: $7 work may require 12 days). Preserve claim times, deadlines, extensions, submission history and duplicate protections.

**Review:** evidence history, QA sampling, correction cycles, reason codes, SLA expectations, appeals and reviewer identities. Keep the existing manual approval and 72-hour-hold policy for tasks to which it applies; upstream partner confirmation and client acceptance can add further conditions. Never credit a displayed reward merely because a user clicked through a partner link.

## 4. Accounts, trust, notifications, support and financial rules

### Workers and qualifications
- Sign-up, secure log-in, recovery, email verification, sessions that survive normal same-site navigation, privacy controls and password protections.
- Skills profile, language/device/availability declarations, tests or assessments for restricted categories, fair “new worker” entry path and reliability based on **legitimate** completed work.
- Suggested jobs must respect geographic eligibility, prerequisites, account standing and remaining capacity.

### Earnings and payouts
- Exact cents/minor-units or equivalent safe integer accounting; no floating-point USD ledger balances. Worker views: pending review, held/unreleased, available, withdrawn, lifetime earned, detailed transaction history, payout fees, method and status.
- Preserve existing USD ledger and optional local-currency **display estimates** and locked withdrawal quote behavior; never imply an exchange estimate is the final paid amount.
- Existing UGX mobile-money/airtime policy and any actual payment rails require explicit verification. Manual withdrawal approval and reference recording continue until an audited authorized payout integration exists.
- Idempotent credit/reserve/refund/compensation and referral awards; double-clicks, retries and webhook duplicates cannot double-pay.
- **Referral rule from prior decisions:** flat USD **$0.01** per qualifying approved referred email task, including beyond day 30, subject to the required hold and moderation. Preserve all earned historical referral records; do not blindly broaden this incentive to every new task category.
- Previously approved “expired provider task” goodwill compensation is an explicit administrator decision at the original eligible amount (historical $0.12 example), not fake provider approval, not bulk auto-credit and not a referral trigger.

### Notifications and support
- In-app activity feed for task decisions, corrections, expiring claims, suitable new tasks, payout updates and support replies. Use authenticated events and refetch safe API data; no broadcasting private evidence or finances.
- Opt-in email/push, respecting consent and setup state. No promise of delivery until SMTP/VAPID credentials and actual end-to-end tests succeed.
- Private member↔support conversation threads with task/submission/withdrawal reference, admin replies, status and timestamps. Admin contact directory must remain role-restricted.
- No recording/video/ID/password collection into generic support threads. Avoid storing unnecessary sensitive material.

## 5. Business portal and admin operations

**Business/client (later gated release):** verified organization and seat/permissions; new project with service type, unit economics, budget, deliverables, privacy agreement, files/dataset references and acceptance criteria; quote/funding status; progress and spend; QA/accepted output export; billing records and dispute handling. Client work is not auto-published until verified, funded/authorized and policy-approved.

**Admin/Ops:** role-based permissions matching actual teams (Operations/Review includes quality/risk/compliance; Web Development includes UX; Social/Marketing combined; Community/Support; Payments/Finance coordinated with task operations). Provide:
- Bulk project upload and individual task creation; reusable templates, policies and validation previews;
- Project/work-unit assignment, batch state, capacity, reservations and deadline extension;
- Submission review queue with evidence, corrections, moderation/hold, appeals, auditing and QA samples;
- Partner onboarding and reconciliation; non-paying/expired provider alerts;
- Payout approvals, ledger reconciliation and finance reports with separation of duties;
- Support inbox, admin-only directory, consent-aware notifications, abuse/anomaly detection;
- Real stats from stored data only: published/claimed/completed tasks, approval/rework, funded vs payable liabilities, workers active by defensible time window, provider/client margin. Never invent traffic or client logos.

## 6. Existing technical architecture and intended evolution

**Current hosted-direction stack:** Cloudflare/DNS → Zoho Catalyst AppSail (Node.js 24, `server-postgres.js`) → Neon PostgreSQL; client currently plain HTML/CSS/JS; server owns sessions/role checks. The legacy laptop MVP uses `server.js` + SQLite and is **not** interchangeable with live Neon. Keep one AppSail instance initially for current in-process SSE; for growth, use a durable DB/outbox/pub-sub mechanism and a separately dependable job worker if Catalyst scale-to-zero makes background polling unreliable. Do not rely on a per-process timer as guaranteed 24/7 processing without verification.

**Existing code observed in GitHub:**
- `server-postgres.js`, `postgres.js`, `db-postgres.js`, `*-postgres.js`: hosted API/data/workflow.
- `neon-schema.sql`, `contacts-schema.sql`, `scripts/init-postgres.js`: PostgreSQL schema setup/migration.
- `server.js`, `store.js`, `schema.sql`, `workflow.js`: legacy SQLite engine for reference/backward tests.
- `public/index.html`, `public/app.js`, `public/style.css`, `public/dashboard-v2.css`: worker/admin UI.
- `public/contact.html`, `public/contact.js`, `public/contact-v3.css`, `contact-notifications.js`: support, alerts and opt-in channels.
- `public/profile.*`, `public/payouts.*`, `public/preview.png`: member pages and social preview.
- `features-postgres.js`, `workflow-postgres.js`, `quick-task.js`: task policies, review and specialized workflow.
- `test/*.test.js`: unit/browser/static/PostgreSQL tests; DB tests require an isolated `TEST_DATABASE_URL`.

**Proposed additive architecture/file tree (not yet implemented; final names can adapt):**

    public/
      [existing files remain]
      assets/                         # icons/optimized assets as needed
      work/                           # find-work and task-detail views
      workspace/                      # renderer and category-specific editors
      earnings/ referral/             # authenticated views
    domain/
      tasks/                          # template policy validation, state machine, eligibility
      projects/                       # project + unit orchestration
      rewards/                        # immutable ledger and idempotent settlement
      reviews/                        # QA, corrections, disputes
      providers/                      # adapter contracts and callback verification
      qualifications/                 # assessments and matching
    migrations/                       # additive, versioned SQL migrations
    jobs/                             # durable provider sync/reconciliation and alerts
    tests/                            # future integration/end-to-end/security coverage
    docs/                             # optional diagrams, API/schema documentation

These are conceptual module boundaries, **not a mandate to rename or rewrite** working files. Prefer incremental modules and compatibility routes, reuse existing business logic, and add feature flags for client/enterprise/AI modules.

**Data entities:** users, sessions, worker profile/skills, projects, clients, task templates, task work units/slots, claims, submissions/revisions, attachments (private), review decisions, quality signals, qualifications, provider events, balances/ledger, withdrawal quotes/requests, referral attribution/awards, notifications/support, audit events. Before introducing tables, map all legacy records and constraints; make migrations additive and reversible when feasible. Keep secrets in AppSail environment, external files in secure access-controlled storage where necessary; avoid unbounded database blobs.

**Provider approach:** partner-specific verified APIs/webhooks only. BitLabs/CPX and other discussed partners are **leads/integration candidates**, not guaranteed approved, profitable or integrated. Track pending/held/confirmed/rejected callbacks with signed verification, reconciliation, throttles and idempotency. Never scrape private accounts or claim the provider paid when it has not.

## 7. Audit snapshot — 2026-11-16 (static repository inspection only)

**Repository:** `https://github.com/TRomeoPrince/TaskHarbor`, default branch `main`, write access available. Branch heads inspected:

| Branch | Inspected head | Relevant state |
| --- | --- | --- |
| `main` | `669c2919334efdfe84c33a153a19ea8197f46d10` | Local SQLite MVP, 40+ code/test files, no `server-postgres.js`; **not safe as production deploy source** |
| `catalyst-neon-staging` | `4ebc1532420a7c5b7367f226bb2a43452e9531a1` | Hosted Node/Postgres path, migration/import/Neon tests and live-event infrastructure |
| `feature/contact-notifications` | `114bb43995e3b99b584ed0456738b5f9574bd205` | Support and opt-in notifications; previously supplied as a deployed commit, but deployment is **not independently confirmed today** |
| `design/taskharbor-professional-v2` | `410e7841b11c0569e48a6c74abdfb2fe7c69b043` | More developed light professional dashboard and task-listing UX |
| `release/taskharbor-professional-20261031` | `380f62eba1f05194f7816b64f13267469290e02e` | Dashboard V2, support V3, admin overview, tests and hosted server; release readiness **unverified** |
| `fix/dashboard-route-support-email-20261031` | `40e8e9196f9635e86dccb8a77b0ca3aafe702aa2` | Follow-up work for canonical Dashboard URL and support SMTP documentation; likely safest *candidate* to evaluate before further work |

**Observed from code (NOT proof of correct live behavior):**
- [x] Local baseline user/task/claim/review/ledger/withdrawal mechanics exist in `main`.
- [x] Hosted PostgreSQL server/schema and migration scripts exist in staging/release branches.
- [x] Task-specific deadlines, Gmail details, corrections, moderation/holds and compensation code appears on hosted work branches.
- [x] Dashboard V2 task filters/disclosures, admin overview, profile, payouts and support V3 UI appear on release/fix branches.
- [x] Support notification queues, inbox, email/push configuration and their tests appear on release/fix branches.
- [x] Automated test files exist for browser, workflow, Postgres, notifications, dashboard and release conditions.
- [ ] **Not verified:** which exact git SHA/code and schema version are currently serving `https://www.taskharbor.cc.cd` and the Catalyst URL.
- [ ] **Not verified:** current state of the live Neon database, backups, project/environment configuration, external delivery credentials or provider approvals.
- [ ] **Not verified:** complete test suite results on the selected latest candidate and isolated Neon staging database **in this audit**; presence of tests is not a green test run.
- [ ] **Not verified:** authenticated Dashboard navigation on production. Release branch has a `/dashboard` server mapping but some links still target `/`; verify the fix branch and tests.
- [ ] **Not verified:** production SMTP delivery, Web Push, all site pages, cross-host cookies, and authenticated task/payout flows end-to-end.

**Audit warning:** `main` is an older SQLite MVP while the most advanced hosted work sits on divergent branches. **Do not deploy main or force-merge all branches.** Establish actual production baseline and diff the candidate release/fix branch against it. Keep a branch-and-data rollback route; plan-only commit on `main` changes no running app.

## 8. Approved execution discipline and phase checklist

**Gate:** Before each major code batch, state objective/scope and ask **“Confirm next step?”**. Start only after the user's reply, unless separately authorized. After completion: record actual commit/branch, files changed, test commands/results, deployment evidence (if any), remaining risks and mark only verified checkboxes here. Use connected GitHub/code tools for ordinary work; reserve local PowerShell/human intervention for genuinely inaccessible operations or private secret/dashboard approval. Prefer short inexpensive tool batches and no redundant agents.

### Phase 0 — Protect and baseline production (NEXT BUILD STEP)
- [ ] Identify live AppSail revision/commit and Neon environment without publishing credentials.
- [ ] Diff live source against `release/taskharbor-professional-20261031` and `fix/dashboard-route-support-email-20261031`; select one working base and record why.
- [ ] Verify an actual recent recoverable database backup and documented rollback (admin approval required for live change).
- [ ] Run `npm test` + JavaScript syntax/static checks on the chosen branch with safe synthetic data.
- [ ] Run PostgreSQL tests only against a disposable isolated test DB/Neon branch, not production.
- [ ] Establish CI/build outcome and measure baseline page/auth/navigation behavior, especially `/dashboard`, `/payouts`, `/profile`, `/contact`.
- [ ] Record baseline evidence/results here; keep public site unmodified.

**Exit:** exact live baseline + safe working branch + known-good tests and backup/rollback, no production mutation.

### Phase 1 — Reliability, identity and navigation (priority 1)
- [ ] Fix authenticated `/dashboard` route, persistent sessions and cross-page header behavior without redirect loops or loss of state.
- [ ] Check apex/www/Catalyst cookie scope, CSRF/origin rules, unauthorized/private data handling, account recovery and registration flows.
- [ ] Ensure safe task lease renewal/expiration, multiple active claims where allowed and per-task timing policy (legacy tasks remain compatible).
- [ ] Audit ledger idempotency, hold/review, reservations, withdrawals, referral 1-cent rule and compensation.
- [ ] Add regression tests for route/auth and accounting edge cases; staged smoke test.

**Exit:** signed-in worker can navigate Dashboard↔Payouts↔Profile↔Support safely and keep active work; money balances unchanged.

### Phase 2 — Unified brand and marketplace UI
- [ ] Implement design tokens and responsive, accessible worker shell.
- [ ] Public landing and worker dashboard reflect real data only; admin gets a separate operational home.
- [ ] Build Find Work filters, search, categories, sort, real availability, skill/eligibility warnings, empty/loading states.
- [ ] Build full required task-card contract and detail-before-claim workflow.
- [ ] Build My Tasks with status filters, deadlines, continue/correct/resubmit actions and task timeline.
- [ ] Test mobile widths, keyboard, reduced motion, slow network and navigation.

**Exit:** accurate task discovery with no false listings and no regressions in existing claim/submit/review APIs.

### Phase 3 — Extensible job, project and payout policies
- [ ] Add schema-versioned template/policy model and six task types without overriding legacy rows.
- [ ] Separate project/job/unit/claim identities and support configurable multi-slot allocations; no duplicate reward.
- [ ] Expose task-type workspace contracts and submissions with audit/idempotency.
- [ ] Implement flexible reward-unit policies (item/batch/clip/minute/milestone), holds and client budget guardrails.
- [ ] Add server-side eligibility, concurrency, cancellation, expiry, extension, appeals and edit-preserving autosave API.
- [ ] Add migration and rollback tests; backfill only with reconciliation.

**Exit:** old tasks still work and at least one synthetic task per type can complete the correct policy state transitions.

### Phase 4 — Category-specific workspaces
- [ ] Complete quick-task/evidence workspace with correct timer, private fields and corrections.
- [ ] Offerwall redirect/provider-pending status with signed callback verification.
- [ ] AI evaluation rubric and reviewer/QA tools.
- [ ] Audio transcription player/editor with speed, timestamps, autosave and safe file access.
- [ ] Image/text annotation component and versioned labels, QA.
- [ ] Skilled projects: milestones, deliverables, reviews and revision history.
- [ ] Test partial saves, offline/network loss, timeout, accessibility and privacy.

**Exit:** each work category uses the right tools and accepts/denies evidence independently; no single generic form forced everywhere.

### Phase 5 — Worker productivity, skills, support and trust
- [ ] Qualification tests/skills taxonomy and matching with new-worker fairness.
- [ ] Recommendations, progress, alerts and task-related disputes.
- [ ] Earnings timeline, payout transparency, referral dashboard and trust profile.
- [ ] End-to-end notifications, consent/config diagnostics and staff support workflows.
- [ ] User privacy, retention, rate limiting and abuse safeguards.

**Exit:** worker can independently understand work, QA and every dollar of ledger history.

### Phase 6 — Providers and enterprise workflow
- [ ] Establish legal/technical eligibility and written partner terms before marking any provider active.
- [ ] Partner import/callback adapter, signature verification, idempotency, retries, reconciliation and revenue reports.
- [ ] Business registration/verification, project composer, datasets, pricing/funding controls.
- [ ] Project→work-unit distribution, QC sampling, accepted deliverable export and disputes.
- [ ] Business/admin reporting, financial liability and permissions tests.

**Exit:** verified partner or client work can be created, assigned, reviewed and financially reconciled without unsupported payouts.

### Phase 7 — Operational hardening and public release
- [ ] Threat modeling, secrets/config audit, strict RBAC, privacy/data retention, rate limiting, backup/restore drill and monitoring.
- [ ] Authentication, concurrent claims, review/appeal, callbacks, ledger and payment regression tests.
- [ ] Performance, mobile and accessibility checks; load-limit and AppSail background-worker verification.
- [ ] Reconcile stage vs live balances/tasks/users; use additive migrations with operator-approved backup and rollback.
- [ ] Deploy selected verified release to Catalyst, smoke-test custom domain and AppSail URL, monitor errors, complete sign-off.
- [ ] Update public docs to reflect **actual** availability and eligibility; tag verified release.

**Exit:** protected production release, reconciled records, live smoke tests and documented rollback.

## 9. Verification and release gates

Every phase must include:
- **Evidence:** test command/date/result, selected branch and SHA, affected pages/API endpoints, data migration script and smoke-test notes.
- **Accounting invariants:** one payout/award per eligible event; no lost/resurrected tasks; pending/held/available reconcile with immutable records; historically earned referrals preserved.
- **Security invariants:** role checks on every read/write; no cross-worker task/private field exposure; no secrets/real account credentials committed; no unchecked external webhook.
- **Hosting invariants:** no production schema change from app startup; only deliberate migrations, backups verified first, no dual writers to divergent DBs; no automatic deployment from `main`.
- **User-experience invariants:** responsive and accessible; accurate statuses and reward units; no sign-in bounce during normal navigation; safe resumption of drafts.
- **Release evidence:** staging and production must be distinguished, and code deployed must match tested commit. Do not claim “live” merely because a branch has been pushed.

## 10. Known boundaries and deferred decisions

- Current public site and live credentials could not be independently inspected via the available read-only audit. Confirm live infrastructure during Phase 0.
- External partner acceptance (BitLabs, CPX Research and other leads), payment integrations and nation/country eligibility are not assumed.
- Transcription/AI/annotation example tasks in the video are conceptual and may need actual datasets, usage permissions, storage and client funding before public release.
- Any fully automated payouts, background workers, large file storage or business money collection must pass a separate cost/security/compliance review.
- No automatic copying/scraping of third-party protected jobs or automated account signups. Provider data must come from authorized integration.
- Existing legacy SQLite code should remain a migration/backward-test reference until a safe, verified consolidation; do not delete it to make the tree appear clean.

## 11. Build log

| Date | Phase | Branch/commit | Evidence | Result |
| --- | --- | --- | --- | --- |
| 2026-11-16 | Blueprint/audit | `main` (this document) | Video frames reviewed; GitHub branch trees, representative release source, tests and deployment docs read | Blueprint documented. **No production change, no tests executed in this audit.** |

## 12. Definition of “100% complete”

The exact phrase **“Harbor complete 🟢”** may be used only after **all** checklist items required for the agreed product scope are verified, the corresponding features pass automated + real staging tests, critical user journeys are demonstrated on production, deployed revision/schema match tested source, finances/users are reconciled, backups/rollback are confirmed, and no critical blockers remain. Until then, always report percentage/phase only if backed by checklist evidence.

**Next approval gate:** Phase 0 — protect and baseline the real Catalyst/Neon deployment, select the current release base, run safe synthetic tests and verify authenticated Dashboard navigation **without altering production data**. **Confirm next step?**


## 13. Implementation update — 2026-11-16 (development branch, not production)

**Scope decision:** User gave authorization to continue through the execution phases without individual confirmation pauses. Keep the previously documented safety, audit and production-release gates. **Do not treat this as approval to reset the live Neon database, enable paid services, create fictional provider opportunities or bypass partner legal agreements.**

**Working branch:** [feature/taskharbor-marketplace-20261116](https://github.com/TRomeoPrince/TaskHarbor/tree/feature/taskharbor-marketplace-20261116) forked from `fix/dashboard-route-support-email-20261031` at `40e8e9196f9635e86dccb8a77b0ca3aafe702aa2`. No production deployment was performed.

### Working code delivered in this iteration

- [x] Worker marketplace progressive enhancement (`public/marketplace.js`, `public/marketplace.css`): real-data counts for available/active/review/corrections; title/provider/category search; status/category/minimum USD reward filters; reward/title sorting; empty state; mobile task navigation and responsive CSS. Does not fabricate jobs or change financial logic.
- [x] Admin work-classification editor for already-published tasks (`public/index.html`, `public/marketplace.js`): category, payment unit, skill level, expected duration and explicitly public summary. A task remains claimable through the existing verified API. **Metadata alone does not enforce skills, quota or proof of partner funding.**
- [x] Additive PostgreSQL metadata table and standalone admin-only API (`task-catalog-schema.sql`, `neon-schema.sql`, `task-catalog.js`). Hosted server enriches worker-visible tasks with metadata; missing-schema fallback defaults to `general` and preserves legacy behavior. Migration **not applied to production**.
- [x] Structured worker submission dialogs for AI evaluations, transcription, image/text annotation and skilled-project milestones (`public/workspaces.js`, `public/workspaces.css`). These use validated category-specific fields, optional existing image-evidence format and the existing secure `/api/submit` review/hold flow. Drafts are retained in browser memory during the current page session; not persisted across reloads.
- [x] Added direct asset maps to both legacy/local and hosted servers; added regression unit tests (`test/marketplace.test.js`, `test/task-catalog.test.js`, `test/workspaces.test.js`).
- [x] Updated hosted-branch GitHub Actions test workflow to cover the feature branch and use its isolated PostgreSQL test service. [Successful workflow at workspaces test commit](https://github.com/TRomeoPrince/TaskHarbor/actions/runs/43803325106). **Latest feature commits must pass their own CI before this stage is promoted.**

### Not yet complete / not safe to claim as delivered

- [ ] Verify the actual live Catalyst AppSail revision/Neon schema and create a tested, private production backup and rollback.
- [ ] Run authenticated real-browser/mobile staging acceptance tests; verify canonical routing, cross-host cookies, network resilience and responsive layout with actual rendered pages.
- [ ] Apply `task-catalog-schema.sql` to an isolated Neon staging DB, then an approved backed-up production DB before using admin classification. Test failures/retries.
- [ ] Extend new-task publish/import workflow so metadata is stored atomically at creation; current editor is for published task IDs.
- [ ] Add real server-enforced eligibility, assessments and skill matching, project/work-unit capacity and multi-contributor claims, per-unit/milestone accounting and qualified refund/review paths.
- [ ] Build category-specific media tooling: authenticated audio playback/timestamps, actual visual annotation, secure data/deliverable storage, server-side autosave, richer reviewer QA and appeals. Present structured fields are only an initial form, not complete production annotation suites.
- [ ] Build verified business/client funding, workforce operations, real partner authorization and reconciliation, and robust payout integrations. External business/platform agreements are prerequisites.
- [ ] Complete production security/load/privacy/accessibility testing, SLA and monitoring, staging migration, production deployment, and public verification. Never mark the live site updated from GitHub commits alone.

**Deployment discipline:** Keep `main` unchanged apart from the canonical plan. Develop from the fixed hosted branch; never deploy the original SQLite `main` source onto Catalyst. Check CI, staging backups, source/schema compatibility and approved release before production deployment.

**Status:** Product blueprint and initial marketplace + category-aware forms implemented **on a development branch only**. This is not “Harbor complete” and should not be described as 100% finished.


### Isolated Neon verification — 2026-11-16

- [x] Connected Neon project identified by non-secret id `wandering-dream-19531701`, project name TaskHarbor. Active branch `taskharbor-live-final` (`br-solitary-shadow-baezeass`), with legacy task workflow and contact tables. **Caveat:** AppSail's actual private `DATABASE_URL` has not been independently inspected, so do not claim absolute proof that this is its current target.
- [x] Read-only source counts: 24 users, 13 tasks, 4 submissions, 4 ledger entries, 1 withdrawal. No credentials or personal details were exported.
- [x] Created isolated copy-on-write staging branch `taskharbor-marketplace-validation-20261116` (`br-young-block-baip5s3u`) from `taskharbor-live-final`. This is not the default branch.
- [x] Applied exactly two additive SQL statements from versioned `task-catalog-schema.sql` (CREATE TABLE and CREATE INDEX) in one staging transaction. New `task_catalog` table exists and initially has 0 metadata rows.
- [x] Verified staging still has 24 users, 13 tasks, 4 ledger entries and 1 withdrawal. Rechecked parent: `task_catalog` is **not** installed there; source remains untouched.
- [x] Staging compute limited to 0.25 CU and explicitly sent to Neon suspend endpoint to avoid prolonged active compute charges. This is only an isolated test database copy, **not** a verified independently restorable production backup.
- [ ] Still required: check actual AppSail source SHA + secret environment's database target; run authenticated staging app/browser with matching latest code; verify migration/rollback and complete production backup; get approval for live schema migration and deployment.

**Source / staging separation:** The production branch was queried read-only. No live table was created, no historical credit or user balance was touched, and no public domain was switched.


### Administrator payouts and per-user balance visibility — 2026-11-16

**User request:** Clearly expose requested (not yet paid) withdrawals and show each individual worker's finances in the administrator dashboard without exposing private balances in the public payout feed.

**Implementation on `feature/taskharbor-marketplace-20261116`:**
- [x] New **Member balances** admin-only panel with search by email/username, 100-worker pagination, manual refresh and live-change-aware periodic freshness; sections show available, pending review, held, lifetime earned, paid withdrawals and requested withdrawals in USD.
- [x] New authenticated read-only `GET /api/admin-finances` endpoint implemented in `admin-finances-postgres.js`, with role gate before any private queries and SQL grouped separately by ledger/tasks/moderation/withdrawals to prevent multiplying balances.
- [x] Requests are shown **separately** from available funds; requested amounts are already debited/reserved. Pending and held rewards are not available for withdrawal; no money or task state changes occur through this panel.
- [x] Admin **Withdrawals & payouts** section now defaults to **Requested (unpaid)** and offers All/Paid/Rejected filters; requests appear first, with existing admin record-payment and reject/refund actions preserved.
- [x] Worker sessions retain their own withdrawal histories; the new admin finance table stays hidden and its API rejects workers. The public `/payouts` feed remains completed payments only with masked destination data.
- [x] CI on [run 43805241676](https://github.com/TRomeoPrince/TaskHarbor/actions/runs/43805241676) passed `npm test` including the new synthetic isolated-PostgreSQL reconciliation test and access checks. Source files: `admin-finances-postgres.js`, `public/admin-finances.js`, `public/admin-finances.css`, modified hosted/local static routes, `public/app.js`, `public/index.html`, `test/admin-finances.test.js`.
- [ ] Not yet deployed to Catalyst; production AppSail SHA/database connection and backup must be verified before merging/deploying. No live financial data were changed during this implementation.


### Appearance themes and visual lab — 2026-11-16

**New directive:** TaskHarbor must support **Light** and **Dark** modes now, with room to introduce more themes later.

**Implementation:** `public/theme.js` initializes the appearance in `<head>` before the main styles and scripts on `/dashboard`, `/payouts`, `/profile` and `/contact`. A labeled, keyboard-accessible Appearance selector is added to their shared headers. A stable localStorage key (`taskharbor.theme`) preserves the choice across pages, and another-tab updates are synchronized. Unknown values fall back to the existing light/nature identity; blocked browser storage does not break the UI. Future themes are added to the registry plus a matching CSS token set.

**Styling:** `public/theme.css` is loaded last on all four pages, supplying a semantic token contract with dark-mode overrides for the landing/auth experience, dashboard, task marketplace, task details, mobile navigation, work dialogs, admin finance tables, payouts, profile and support conversations. The light mode remains the existing brand appearance.

**Unit verification:**
- [x] Initial preference is applied before page construction.
- [x] Light and Dark are the only accepted selections; invalid values are rejected or normalized appropriately.
- [x] Selection persists, synchronizes across tabs, and survives blocked localStorage.
- [x] CSS/head/asset wiring validated on all pages and both static servers.
- [x] PostgreSQL + project unit suite passed at [commit 9596c5b](https://github.com/TRomeoPrince/TaskHarbor/actions/runs/43812350561).

**Real-browser side lab:**
- [x] Created `test/visual-lab-server.mjs` with exclusively synthetic worker, task, payout and support fixture data. No live Neon or partner API is used.
- [x] Created `test/theme-browser.mjs` and `.github/workflows/taskharbor-theme-visual-lab.yml`. Headless Chromium actually loads the project's current HTML/CSS/JS.
- [x] Checked initial light appearance, dark body/header/task cards, persisted theme across Dashboard → Payouts → Profile → Support → Dashboard, and mobile viewport 390×844 without horizontal overflow.
- [x] Visual browser run [43812350548](https://github.com/TRomeoPrince/TaskHarbor/actions/runs/43812350548) **passed**; artifact `taskharbor-light-dark-lab` contains light/dark screenshots and measured style results. These are synthetic lab screenshots, **not screenshots from production**.
- [ ] Additional tablets, real devices, all accessibility contrast/focus states and authenticated end-to-end production acceptance must still be tested.
- [ ] Production deployment not done, PR #9 stays draft until AppSail revision, Neon database mapping, backup and staging acceptance gates are cleared.

**Scope status:** Light/Dark theme feature passes automated unit and real-browser synthetic acceptance; the overarching marketplace, role portals and revenue integrations remain incomplete. Do not mark the whole TaskHarbor product as finished on the basis of the theme tests.
