# Next update

## Implemented: holds, corrections, staged screenshots, desktop builder

Completed: visible locked Held balances; server-enforced 72-hour hold plus final admin moderation; same-task corrections and evidence history; step-specific image imports and access checks; offline desktop JSON builder fixed at USD 0.12 and 19 May 2000. See templates/README.md for the current workflow. One active task continues to include hold/moderation.

## Admin-controlled copy fields

Add structured label/value fields to general tasks. Admins can add or remove fields and toggle a Copy button beside each selected value. Workers can copy that value with one tap and receive a brief Copied confirmation. Render values as plain text in monospace; do not interpret supplied values as HTML. Copy must preserve the exact value, including intentional spaces.

User preference: password values need not be masked automatically. Only expose task data to the assigned worker and authorized admins; do not include private task fields in the available-task listing. This feature is generic task data formatting, not account-creation automation.

## Live client updates

Deliver task availability, assignment, review decisions, wallet changes, and withdrawal status updates without a manual page refresh. Prefer authenticated server-sent events with a reconnect strategy and a fresh state fetch after reconnect. Send change notifications and fetch authorized data rather than broadcasting private task or financial data. Preserve in-progress form edits when updating the screen. Show connection status if live updates disconnect.

Implemented with authenticated change notifications, reconnects, and preserved action-form drafts.

## Currency amounts and local currency selection

User request: remove user-facing inputs expressed "in cents". People should enter normal amounts in the selected currency, for example USD 5.00 rather than 500 cents.

Add an option for workers to display wallet balances and withdrawal amounts in local currencies. Apply the selected currency consistently to balances, withdrawal entry, and the withdrawal confirmation. Decide supported currencies and exchange-rate handling before implementation; no rates have been selected or assumed.

Keep precise integer minor-unit accounting internally, using each currency's correct precision. Distinguish display conversions from the actual payout currency. Show the applicable rate, fees, and final amount before confirming a withdrawal; preserve that information with the request so later rate changes cannot silently change it.

Implemented with local currency selection and locked withdrawal quotes. USD remains the accounting currency.
