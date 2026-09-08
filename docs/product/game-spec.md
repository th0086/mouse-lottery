---
owner: product
status: draft
updated_at: 2026-04-22
---

# Hamster Spin Game Spec (EN)

## Layout Order (Single Screen)

1. Header (Log In / Sign Up)
2. YouTube Live Section (IFrame Player API)
3. Progressive Jackpot
4. Drawn Numbers Display
5. Select Numbers
6. Eligibility Verification
7. Did You Win
8. How to Play

## Phone Number Validation (Kenya)

Accepted input formats:
- `+2547XXXXXXXX`
- `07XXXXXXXX` (auto-convert)
- `+2541XXXXXXXX`
- `01XXXXXXXX` (auto-convert)

Validation error message:
- `Please enter a valid Kenyan mobile number.`

## Eligibility

- User must wager at least `500 KES` cash on KE7 for the day.
- If ineligible, selection area is masked and shows remaining amount needed.

## Number Selection

- Choose 4 digits from `0-9`.
- Actions: `Clear`, `Confirm`.
- Multiple selections per day are allowed.

## Winning and Lifecycle

- Winning requires exact 4-digit match in valid draw window.
- Draw-window 4+49 applies:
	- Sequence scan starts from the first drawn number after the bet is placed.
	- A bet becomes eligible once 4 new numbers have been drawn after placement.
	- A bet remains valid through the 53rd new drawn number after placement.
	- If still not winning, it expires when the 54th new drawn number arrives.
- Non-winning final status: `Expired`.

## Jackpot

- Jackpot increases by `123 KES` per elapsed second.
- Display unit: `KES`.
- Frontend number animation catches up smoothly within 10 seconds.
- If new target arrives during animation, extend and continue toward latest target.

## Payout

- Jackpot is split equally among winners using floor division.
