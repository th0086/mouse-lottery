# Hamster Spin Architecture (Living Document)

Last updated: 2026-07-17
Status: Active

## 1. Purpose

This file is the source of truth for project organization, system boundaries, and architecture decisions.
Any change that affects runtime behavior, persistence, access control, or integration contracts must update this file in the same change set.

## 2. Product / Technical Scope

- Single-screen player experience in English with embedded live video, jackpot state, draw stream, entry placement, daily missions, invite link, and history panels.
- Stack: TypeScript, Next.js App Router, NestJS, MongoDB, Mongoose.
- Shared account identity across frontend and backend.
- Three operator-facing modes exist inside the same product surface: player, admin, and data.
- Merchant-integrated external login is supported for `ke7stg` and `ke7prod`.
- One super admin account and one data admin account are auto-bootstrapped on backend startup.

## 3. Repository Structure

```text
mouse-lottery/
	README.md
	architecture.md
	obs_tg_alert.lua
	package.json
	tsconfig.json
	backend/
		package.json
		src/
			auth/
			admin/
			announcement/
			callbacks/
			draws/
			merchants/
			users/
	frontend/
		package.json
		src/
			app/
			components/
			lib/
	shared/
		package.json
		src/
	docs/
	deploy/
```

## 4. Domain Boundaries

### 4.1 Frontend

- Renders the player-facing homepage and protected Admin / Data entries.
- Handles local login/register UX and Kenyan phone normalization.
- Handles merchant bootstrap via query parameters (`merchant`, `token`, `phone`, `ref` or `crc`).
- Uses backend `/api/auth/me` as the source of truth for permissions, wallet, invite status, and merchant-derived invite link.
- Hides Admin / Data entry buttons when the session is merchant-redirected.

### 4.2 Backend

- Auth: register, login, refresh, external login, live-session identity lookup.
- Users: shared identity, wallet profile, daily allowance state, merchant tokens, invite metadata, bootstrap accounts.
- Admin: runtime configuration, winners listing/export, data-page PIN verification.
- Draws: draw stream, issue settlement, jackpot accumulation, payout recording, wallet crediting.
- Callbacks: outbound merchant confirmation callbacks and inbound invite-success callback endpoint.
- Merchants: supported merchant validation plus merchant-specific callback and invite URL resolution.

### 4.3 Database

- Persists users, entries, drawn numbers, jackpot state, payout ledger, announcements, and admin configuration.
- User documents also persist merchant integration state including `externalMerchant`, `externalToken`, `externalRef`, and invite reward day markers.

## 5. Rule Ownership

Business-rule authority lives in backend services. Frontend only visualizes state.

- External callback deposit amounts are normalized before persistence using `deposit / 0.95`.
- Daily chance thresholds are evaluated from normalized deposit amounts.
- Ticket placement consumes one daily chance.
- Daily allowance state is Kenya-day based.
- Invite success callback grants at most one additional betting chance per inviter per Kenya day.
- Duplicate same-day invite callbacks must return success without granting an extra chance.
- Jackpot floor split among winners only applies the extra `/10` divisor when jackpot before split is greater than `10,000 KES`.
- CSV export must preserve leading-zero bet numbers for spreadsheet consumers.

## 6. Auth and Permission Model

- Authentication uses JWT access and refresh tokens.
- JWT request validation reloads the current user from MongoDB on each request so permission changes are effective immediately.
- Role model currently includes at least `player`, `super_admin`, and `data_admin`.
- Permission checks are enforced backend-side; frontend only uses permission flags to adjust navigation.
- Data page access is protected by both role/permission and a separate runtime PIN challenge.

## 7. Merchant Integration Model

- Supported merchants are `ke7stg` and `ke7prod`.
- External login accepts `merchant`, `token`, `phone`, and optional `ref`.
- Frontend also accepts `crc` as an alias for `ref` in inbound URLs.
- `ref` is treated as the current account's merchant-provided invite code and is persisted on the user profile as `externalRef`.
- Invite links are built server-side from merchant-specific base URLs:
	- `MERCHANT_KE7STG_INVITE_URL`
	- `MERCHANT_KE7PROD_INVITE_URL`
- Frontend displays the invite link returned by `/api/auth/me` rather than reading env directly.

## 8. Event / Data Flows

### 8.1 Standard Player Flow

1. User logs in locally or via merchant redirect.
2. Backend returns access and refresh tokens.
3. Frontend loads `/api/auth/me`, `/api/game/state`, entries, credits, and announcement state.
4. User places a 4-digit entry.
5. Backend validates allowance, stores the entry, and later settles it against draw windows.

### 8.2 External Merchant Login Flow

1. Merchant redirects user with `merchant`, `token`, `phone`, and optionally `ref` or `crc`.
2. Frontend posts those fields to `/api/auth/external-login`.
3. Backend validates the merchant, finds or creates the shared user, persists merchant token metadata, and stores `externalRef` when provided.
4. Frontend then loads `/api/auth/me` to obtain permissions, wallet, invite state, and resolved invite link.

### 8.3 Invite Success Callback Flow

1. Merchant calls `POST /api/callbacks/invite-success` with header `x-callback-token` and body containing `phone`.
2. Backend verifies `CALLBACK_TOKEN`.
3. Backend finds the inviter account by phone.
4. If the inviter has not already received an invite reward on the current Kenya day, backend increments daily allowance by `1` and records the reward day key.
5. If the inviter has already been rewarded today, backend still returns success with `rewardGranted=false`.

## 9. Architecture Decision Log

### ADL-001
- Decision: Shared account model for frontend and backend.
- Reason: avoids identity divergence and keeps wallet / entry history user-scoped.

### ADL-002
- Decision: Admin entry is rendered in the main frontend but permission-gated.
- Reason: unified product entry with backend-enforced access control.

### ADL-003
- Decision: Super admin and data admin are auto-bootstrapped from env.
- Reason: deterministic environment bring-up and easier operations.

### ADL-004
- Decision: JWT validation reloads current user permissions from the database.
- Reason: prevents stale permission claims after role changes.

### ADL-005
- Decision: Data operations are split from Admin and protected by a separate runtime PIN.
- Reason: reduces accidental exposure of operational data and supports narrower operator roles.

### ADL-006
- Decision: Merchant callback deposit values are normalized by dividing by `0.95` before persistence and allowance evaluation.
- Reason: backend rules must operate on normalized deposit value rather than raw callback value.

### ADL-007
- Decision: Invite link generation is backend-driven using merchant-specific env base URLs and persisted `externalRef`.
- Reason: keeps merchant configuration server-side and avoids duplicating env exposure logic in the frontend.

### ADL-008
- Decision: Invite success reward is limited to one extra chance per inviter per Kenya day, with idempotent same-day success responses.
- Reason: matches merchant callback semantics and prevents duplicate reward inflation.

### ADL-009
- Decision: Jackpot split applies the extra `/10` divisor only when jackpot before split exceeds `10,000 KES`.
- Reason: aligns payout behavior with updated product rule.

### ADL-010
- Decision: Winners CSV export emits bet numbers in a spreadsheet-safe text form.
- Reason: preserves leading zeros during downstream export usage.

## 10. Operational Configuration

- Root `.env` is the primary deployment/runtime env file.
- Backend also supports startup from either repo root or backend workspace by reading `.env` and `../.env`.
- Invite integration currently depends on:
	- `CALLBACK_TOKEN`
	- `MERCHANT_KE7STG_INVITE_URL`
	- `MERCHANT_KE7PROD_INVITE_URL`
	- existing merchant callback URLs

## 11. Living Update Protocol

When behavior or architecture changes:

1. Update the date in this document.
2. Update any affected domain-boundary or flow section.
3. Add or amend ADL entries instead of letting decisions drift implicitly.
4. Keep env-driven integration contracts documented here when new runtime keys are introduced.

## 12. Open Questions

- No blocking architecture questions are open at this time.
