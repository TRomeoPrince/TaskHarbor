# Personal task builder and import

Double-click `desktop-builder/Open Task Builder.cmd` or open `desktop-builder/index.html` in a browser. This is a lightweight offline desktop form, not an installed Windows executable. It needs no running server or internet connection to export a task.

Enter the unique source task ID, first name, last name/source instruction, Gmail address, and supplied password. Reward is fixed at USD 0.12 and birth date at 19 May 2000. Save JSON exports one task containing four birthday screenshots attached only to the birthday step. Recovery instructions remain blank until supplied later. The form does not retain entered credentials after it is closed; exported files contain the supplied task details as requested. Keep the builder files together so its scripts and styling remain available.

In the admin site, expand Import tasks from JSON, choose the exported file, and click Import tasks. Use a new source ID for each real task; keep the same ID when retrying an import of that task. Existing duplicate-import checks prevent another task with the same provider/source ID. You can also edit `single-account.json` manually and replace all REPLACE_ values.

After initial submission, manually relay Done to the upstream bot. Use Provide instructions on the recovery step to send the value you receive to the assigned worker. The next step appears after recovery completion and includes the four screenshots. Telegram actions and upstream checks remain manual.

Use Request correction to reopen the initial result, or Request step correction for a particular completed step. The selected step and later steps reopen; prior evidence and review notes remain in history. Workers resubmit on the same task. Reject permanently is still available for final refusal, not for fixable mistakes.

When all steps are complete and upstream accepts the work for holding, click Start 3-day hold. Workers see Held funds separately from Available. Held funds cannot fund withdrawals. The 72-hour period begins when the admin starts the hold. Afterward, use Release after upstream approval only when upstream moderation has actually approved. Time alone never releases funds. Deny held reward removes it from Held without crediting the wallet. If a correction is requested during a hold, resubmission and renewed acceptance start a new 72-hour hold.

Existing previously credited earnings retain their original ledger records; the update does not retroactively freeze or remove released balances. Workers stay limited to one claimed/submitted task, including during hold/moderation. Existing multiple assignments are retained but block additional claims.
