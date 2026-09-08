---
owner: operations
status: draft
updated_at: 2026-05-21
---

# Admin Playbook

## Access Model

- Admin entry appears in frontend only for users with `admin:access`.
- Admin users can still access frontend game as regular players.

## Primary Admin Actions (V1)

1. Update jackpot increment amount (KES per second).
2. Update YouTube live source.
3. Trigger or import draw result (MVP path).
4. Review draw history and entry states.

## Permission Matrix (Draft)

- `admin:access`: show admin entry in frontend
- `draw:manage`: modify jackpot increment and draw operations
- `live:manage`: update YouTube live configuration
- `users:read`: read player and entry overview

## Operational Notes

- Changes to live config should propagate quickly to frontend.
- Jackpot increment changes must be auditable.
- Winning notifications for `super_admin` are handled internally and skip external callback confirmation API.
- Draw-window matching logic (4+49 for new entries) cannot be overridden from admin UI.
