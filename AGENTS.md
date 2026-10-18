# TaskHarbor continuation

Read CODEX_CLOUD_HANDOFF.md before implementing changes. The user approved a flat USD 0.01 referral reward per qualifying approved email task at all times, including after 30 days. Preserve historical awards and balances; payment still requires the 72-hour hold and final approval.

Use Node.js >=24. No external npm dependencies are required. Run `node --test test/*.test.js` for verification. Tests use isolated databases. Never run tests against live private data.

Preserve user work, monetary history and task state. Do not commit `.env`, real credentials, databases, WAL/SHM files, backups, exported live tasks or private screenshots. Keep migration/deployment actions separate from feature changes. Do not implement Telegram account creation automation or verification bypasses.
