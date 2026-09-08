---
owner: engineering
status: active
updated_at: 2026-05-21
---

# Changelog

## 2026-05-21 - v0.1.1-game-runtime-and-settlement

- Updated admin/runtime docs to use jackpot increment configuration instead of draw interval.
- Documented new admin endpoints for jackpot increment (`GET /admin/jackpot-increment`, `PATCH /admin/jackpot-increment`).
- Documented payout rule where each winner receives one-tenth of the split jackpot amount.
- Documented settlement rule where `super_admin` winners skip external winning callback confirmation API.

## 2026-04-22 - v0.1.0-doc-baseline

- Added documentation architecture and index.
- Added product specs in English and Chinese.
- Added first draft API endpoint map.
- Added operations and admin playbook drafts.
- Initialized root project README.
- Reserved `architecture.md` as living architecture source of truth.
