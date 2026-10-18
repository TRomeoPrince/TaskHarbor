# TaskHarbor continuation

Read CODEX_CLOUD_HANDOFF.md before implementing changes. The latest unresolved request is revised referral pricing; ask for both amounts before changing financial policy.

Use Node.js >=24. No external npm dependencies are required. Run `node --test test/*.test.js` for verification. Tests use isolated databases. Never run tests against live private data.

Preserve user work, monetary history and task state. Do not commit `.env`, real credentials, databases, WAL/SHM files, backups, exported live tasks or private screenshots. Keep migration/deployment actions separate from feature changes. Do not implement Telegram account creation automation or verification bypasses.
