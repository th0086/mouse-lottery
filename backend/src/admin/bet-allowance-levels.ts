export type BetAllowanceLevel = {
  level: number;
  depositMin: number;
  betMinExclusive: number;
  grantedChances: number;
};

export const DEFAULT_BET_ALLOWANCE_LEVELS: BetAllowanceLevel[] = [
  { level: 1, depositMin: 200, betMinExclusive: 0, grantedChances: 1 },
  { level: 2, depositMin: 350, betMinExclusive: 0, grantedChances: 2 },
  { level: 3, depositMin: 550, betMinExclusive: 0, grantedChances: 3 },
  { level: 4, depositMin: 999, betMinExclusive: 0, grantedChances: 5 },
  { level: 5, depositMin: 1299, betMinExclusive: 0, grantedChances: 7 },
  { level: 6, depositMin: 1999, betMinExclusive: 0, grantedChances: 10 },
];

export function normalizeBetAllowanceLevels(levels: BetAllowanceLevel[]): BetAllowanceLevel[] {
  return levels
    .map((item, index) => ({
      level: index + 1,
      depositMin: Math.max(0, Math.floor(item.depositMin)),
      // Kept for backward-compatible DB shape, but business logic is now deposit-only.
      betMinExclusive: 0,
      grantedChances: Math.max(0, Math.floor(item.grantedChances)),
    }))
    .slice(0, 6);
}
