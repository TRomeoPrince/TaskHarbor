# Telegram Web Terminal — isolated TaskHarbor feature

This module provides a provider-agnostic task lifecycle and reward ledger foundation. It does **not** connect to Gmail Farmer, automate account creation, handle account passwords, or submit third-party registrations.

## Scope
- Independent worker task assignment
- Controlled lifecycle: available → in_progress → submitted → pending_review → approved → paid
- Rejection and cancellation paths
- Admin-only approval, rejection and payout confirmation
- Pending versus paid reward totals
- Audit events for state changes

## Integration design
The future UI should authenticate workers through TaskHarbor's existing login, and the API must authorize every task by worker ID. Use durable PostgreSQL transactions and unique task IDs before production; the current in-memory engine is a testable prototype, **not** a production persistence layer. Never trust client-supplied worker IDs or source reward values.

For authorized Telegram task providers, use a separate adapter that consumes message and edit events and correlates them by (Telegram account, chat ID, message ID). Verify provider authorization before implementing interactive callbacks. Do not use this module to distribute credentials or coordinate bulk third-party account creation.

## Tests
From repository root: `node --test telegram-terminal/*.test.js`.

## Deployment
No changes to the production entry point, database schema, or deployment configuration are made on this branch.
