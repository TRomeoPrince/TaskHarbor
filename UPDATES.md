## 18 October 2026 — public welcome page

Visitors now see a responsive welcome page with a brief introduction, illustrated workflow, and three-step explanation. Header Sign in and Sign up links open separate form modes; returning members enter their dashboard automatically. Referral codes from invitation links are retained in signup. Logout returns to the welcome page. The design uses local HTML/CSS/SVG without external assets or new application dependencies. Canva was unavailable, so the design was implemented directly. Existing accounts, task logic and financial policy are unchanged.

## 18 October 2026 — simplified task cards

Task cards show “Reward:” followed by the amount in the selected display currency. Internal task IDs and provider names are no longer displayed on task cards.

## 18 October 2026 — flat referral reward

New referral awards pay USD 0.01 per qualifying approved email task, both before and after the referred member’s first 30 days. The 72-hour hold and final moderation approval still apply. Historical awards, ledger credits and fractional remainders are retained. The dashboard no longer shows the former Google/UGX reward estimates. Earlier referral pricing notes below describe the historical policy.

# October 18 update

### Profile page and payout identity privacy

The /profile page now lets each signed-in user set or remove their username, save a preferred display currency, view their own email/account details and referral link, and change their password. Password changes require the current password, apply a rate limit, and invalidate the user's other sessions. Username uniqueness is enforced by SQLite; optional usernames fall back to masked emails in payout feeds. Generated internal usernames are not shown as chosen public usernames. Display currency now persists to the account and is used across devices. Full emails remain available only on the account's own profile and to existing authorized admin processing views.

Both /payouts and /payouts/ are registered HTML routes, as are /profile and /profile/. The integration suite verifies these routes return HTML. A running server from before the payout update still returns Not found for /payouts even if it serves updated dashboard files: restart the app server once to load new routes, then refresh. Profile/payout pages do not require restarting ngrok or recreating the database.

### Thirty-minute claims, masked payouts, and referrals

A consistent SQLite snapshot was saved under data/backups before this update. Existing accounts, task details, screenshots, ledger balances and withdrawals are preserved. No account or financial history is reset. Schema additions are non-destructive. Existing users receive unique generated site usernames and referral codes; new workers may choose usernames at signup.

Claims without a submission expire after 30 minutes and return to Available, with a 15-second background check and request-time enforcement. The former worker loses permission to submit after reassignment. Existing claimed tasks receive a 30-minute deadline on first upgraded startup; later restarts preserve that deadline. Submitted tasks, correction work and moderation holds are not reassigned to prevent duplicate creation of an already-created account. Overdue unfinished follow-ups are flagged to admins. The deadline is shown on claimed task cards. Returned claims preserve audit history.

The /payouts page is available to logged-in users and lists the most recent 100 paid requests with site username, USD amount and masked destination. Phone examples use 078xxxxxx398; email usernames are masked. Full payout destinations and private payment references are not included in this feed. Admin processing retains the full destination. New payments have a payment timestamp; older records fall back to request time.

Referral links are available in worker dashboards and accept a referral code at registration only. A referral cannot be attached or changed after signup. Existing users are not retroactively assigned to referrers. Qualifying manual-telegram tasks award the referrer USD 0.072526 if initially submitted during the referred worker's first 30 days after signup, otherwise USD 0.004835. Rewards are issued only at final moderation release, once per task. The USD amounts were calculated from Google's USD/UGX quote of 4,136.459 at 17 October 2026 14:42:19 UTC: approximately 300 UGX and 20 UGX. These are fixed USD reward amounts based on that quote, not a continuously scraped Google rate. Normal wallet display conversions still use the configured ExchangeRate-API source.

Referral accounting stores integer millionths of USD. Accumulated whole cents transfer into Available using referral ledger entries; the fractional remainder stays visible and carries forward. Denied tasks do not receive a referral award. Different email accounts belonging to the same person are not automatically detected; email uniqueness and final manual moderation do not establish real-world identity.

### Direct Quick Create

Admins can now publish the fixed CREATE GMAIL template directly from the dashboard's Quick Create form. Enter first name, optional last-name/source instruction, Gmail address, and password. No JSON export/import or external ID entry is needed. The server fixes reward at USD 0.12, birth date at 19 May 2000, and adds the warning, staged follow-ups, and four birthday screenshots. A deterministic source reference is generated from the supplied Gmail address; Gmail dot and plus aliases normalize to the same reference to block repeated creation through this form. Internal task UUIDs remain separate. Manual imports with independently chosen source IDs still require care to avoid reusing an account under another ID.

The offline exporter remains available as a separate file-export option, now with optional autogenerated source ID. Use Quick Create in the authenticated admin site for direct publishing; workers cannot call its endpoint.

### Latest: locked holds, corrections, and personal builder

The current workflow is documented in templates/README.md. Approving initial work now starts a server-enforced 72-hour hold, rather than crediting spendable funds. Final upstream approval requires a separate admin release after the hold. Denied held rewards are never credited. Workers see Pending, Held, and Available separately. Corrections reopen the same submission/step and preserve history; the unique earning constraint prevents duplicate payment. Step images are now imported and shown only with the applicable step, with authenticated access checks. The personal offline desktop builder exports a single fixed-reward/date task with birthday screenshots. Existing credited funds are not retroactively changed. This section supersedes older descriptions of immediate approval credit or missing step-image support.


### Ugandan payout notice

The withdrawal form now states the platform's policy: Ugandan mobile money payouts require at least UGX 1,000; smaller payouts are delivered as airtime. The approximate USD equivalent is calculated using the cached automatic UGX rate rather than fixed at USD 0.24. Withdrawal entry also explicitly distinguishes dollars from whole shillings. This is a policy notice; mobile money and airtime delivery remain manual, and the app does not detect a phone's network or send airtime automatically.

### Saved account API configuration

The supplied ExchangeRate-API account key is saved in the local, Git-ignored `.env` file. `config.js` loads it when starting with either `node server.js` or `npm start`. The server uses the Standard USD endpoint when a key is configured, normalizes its `conversion_rates` response, and retains the existing cache and retry schedule. No API key is returned in client state, event notifications, or stored rate-source metadata. `.env.example` documents the variable without a real key. Include the local `.env` separately when moving the application to another computer.

The account endpoint was verified successfully and returned 3,987.2945 UGX/USD at the time of the check. This is still a different provider quote from the Google/Morningstar screenshot, so changing to the account API does not guarantee matching Google's rate. Restart the app and refresh once to activate the saved configuration. Existing USD balances are unaffected.

### Automatic currency update (latest behavior)

Rates now come automatically from ExchangeRate-API's open USD endpoint. The provider updates daily; the server caches data until the provider's next update, checks its schedule every 30 minutes, and retries outages at most hourly. The source and rate timestamp appear in the UI. Cached rates older than two days are labeled older; rates older than seven days cannot be used for local-currency withdrawal entry. USD remains available if the feed is down. Startup loads the cache and refreshes when due; successful updates notify connected clients.

All new rewards and payouts remain in USD. The admin view stays in USD. Workers can choose any supported feed currency for estimated balances, task rewards, and withdrawal entry. Withdrawal confirmations show the binding USD payment and estimated local equivalent separately; actual conversion proceeds depend on the payment provider. Rate changes cannot change USD amounts already requested. Existing requests retain their recorded terms and are labeled legacy when they previously specified a local payout. Existing unused quotes must be recreated.

Manual rate configuration has been removed. More currencies become available after the first successful automatic sync, with each currency's appropriate decimal precision. Changing display currency does not change a worker's ledger balance. This section supersedes the manual-rate and local-payout descriptions below.

## Start the updated app

Stop the app terminal with Ctrl+C, then run:

```powershell
cd "C:\Users\USER\.codex\.chatgpt-projects\g-p-6a718940f1508191b7636d7eb46c24c5\microtasks"
$env:PORT = "3001"
$env:PUBLIC_ORIGIN = "https://grandpa-skier-sphere.ngrok-free.dev"
node server.js
```

Keep the existing ngrok tunnel running. Refresh open worker and admin pages once. The database gains additional tables automatically; existing users, tasks, balances, and withdrawals remain intact. Existing tasks have no structured fields or follow-up steps; create new tasks to use the task builder.

## Added functionality

- Create task rewards using normal USD amounts (5.00 rather than 500). All withdrawals use normal amounts in the chosen currency.
- Select USD, UGX, KES, TZS, NGN, GHS, EUR, or GBP. USD remains the accounting currency. Admins configure payout rates as local units per USD, with up to six decimal places. Rates expire after seven days. These are manual payout rates, not a live market feed. No rates are invented or preloaded.
- Preview withdrawals before confirming. The confirmation shows the local payout, USD debit, rate timestamp, and zero fee. Quotes expire after five minutes and can only be used once. Submitted requests retain their original conversion rate. USD debits round upward to whole cents if necessary; the preview shows the exact debit.
- Add structured private label/value fields. Toggle a Copy button for each field. Values remain exact and plain text; passwords are not automatically masked. Private instructions, fields, images and messages require assignment or admin access.
- Attach up to three PNG, JPEG, or WebP images per task/submission/follow-up, each up to 3 MB. Evidence is entered in the page rather than a browser prompt. Images are stored in SQLite and served through authenticated access checks.
- Define follow-up steps when creating tasks. Titles are visible before claiming; detailed instructions appear in order after the initial submission. Each step accepts evidence and optional images. Approval is blocked until all steps are complete.
- Send task-specific messages between admins and assigned workers. Messages are stored in the task history. Messages do not silently add mandatory payment conditions to an existing task.
- Authenticated server-sent events notify all connected clients that state changed. Both workers and admins fetch their authorized state automatically, including submissions, messages, withdrawals and reviews. No private content is broadcast in event payloads. Reconnects refresh current state; the connection indicator shows interruption. The task builder, withdrawal inputs, and open action form remain separate from refreshed lists so drafts are preserved.

## Task import format

```json
[
  {
    "title": "Review a document",
    "description": "Read the supplied document and report corrections.",
    "rewardAmount": "2.50",
    "provider": "manual-import",
    "externalId": "doc-001",
    "fields": [{"label": "Reference", "value": "ABC-123", "copy": true}],
    "steps": [{"title": "Confirm corrections", "instruction": "Review the corrected version and submit confirmation."}]
  }
]
```

The older integer `reward` API field remains compatible for existing provider adapters. Prefer `rewardAmount` for new imports. Images in API imports are optional arrays of `{ "data": "base64-encoded PNG/JPEG/WebP" }`; the browser handles encoding file selections.

## Validation

`node --test test/*.test.js` covers currency precision, private field/image access, ordered steps, review gating, duplicate credit prevention, rate snapshots, quote replay prevention, import rollback, authentication, origin protection, and live HTTP change notifications. Tests use isolated in-memory databases and do not modify app data.

Public hosting still needs the deployment protections listed in README.md. Payments remain manual; background browser tabs and sleeping phones may delay delivery until they reconnect. No operating-system push notifications are sent when the site is closed.
