# Hamster Spin

First implementation baseline for Hamster Spin.

## Quick Start (Planned)

This repository will host:
- Next.js frontend (single-screen game page)
- NestJS backend (auth, admin, lottery logic)
- MongoDB persistence
- Shared account model and RBAC

For architecture details, see [architecture.md](architecture.md).
For full docs index, see [docs/README.md](docs/README.md).

## Current Status

- Documentation baseline: initialized
- Runtime implementation: in progress

## Environment Files

- `backend/.env`: local backend development
- `frontend/.env.local`: local frontend development
- `.env`: root deployment/backend fallback configuration

Example files are provided in `backend/.env.example`, `frontend/.env.local.example`, and `.env.example`.

## Core Product Constraints

- Non-winning final status must be `Expired`
- Jackpot split uses floor division
- Draw interval is adjustable by admin
- Shared admin account can also play on frontend
- One super admin is auto-created during setup
- Admin entry is visible on frontend only for authorized users
- Local MongoDB test URI: `mongodb://localhost:27017/mouse_lottery?authSource=admin`
