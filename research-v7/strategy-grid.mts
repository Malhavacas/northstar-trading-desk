import { canonical, sha256 } from "./config.mts";

export const FAMILIES = [
  "REACTION_CONTINUATION",
  "EXTREME_REACTION_FADE",
  "VOLUME_CONFIRMED_CONTINUATION",
  "VWAP_REJECTION_FADE",
  "OVERNIGHT_CONFIRMED_CONTINUATION",
  "EARNINGS_DRIFT",
] as const;
export type Family = typeof FAMILIES[number];

export interface StrategyParams {
  family: Family;
  reactionThresholdBps: number;
  horizonBars: number;
  stopBps: number;
  targetBps: number;
  volumeRatioMin: number | null;
  positionFraction: 0.2;
  maxConcurrentPositions: 5;
  cooldownMinutes: 60;
  additionalEntryBars: 0 | 1;
}
export interface GridConfig {
  configId: string;
  family: Family;
  variant: number;
  params: StrategyParams;
}

const thresholds: Record<Family, number[]> = {
  REACTION_CONTINUATION: [5, 10, 20, 40],
  EXTREME_REACTION_FADE: [20, 40, 60, 100],
  VOLUME_CONFIRMED_CONTINUATION: [5, 10, 20, 40],
  VWAP_REJECTION_FADE: [20, 40, 60, 100],
  OVERNIGHT_CONFIRMED_CONTINUATION: [10, 20, 40, 60],
  EARNINGS_DRIFT: [0, 10, 20, 40],
};
const horizons: Record<Family, number[]> = {
  REACTION_CONTINUATION: [1, 3, 6, 12, 24, 48],
  EXTREME_REACTION_FADE: [1, 3, 6, 12, 24, 48],
  VOLUME_CONFIRMED_CONTINUATION: [1, 3, 6, 12, 24, 48],
  VWAP_REJECTION_FADE: [1, 3, 6, 12, 24, 48],
  OVERNIGHT_CONFIRMED_CONTINUATION: [1, 3, 6, 12, 24, 48],
  EARNINGS_DRIFT: [12, 24, 48, 78, 156, 234],
};
const riskPresets = [
  { stopBps: 20, targetBps: 20 },
  { stopBps: 30, targetBps: 45 },
  { stopBps: 50, targetBps: 50 },
  { stopBps: 75, targetBps: 75 },
];

export function createGrid(additionalEntryBars: 0 | 1 = 0): GridConfig[] {
  const grid: GridConfig[] = [];
  for (const family of FAMILIES) {
    let variant = 0;
    for (const reactionThresholdBps of thresholds[family]) {
      for (const horizonBars of horizons[family]) {
        for (const risk of riskPresets) {
          const params: StrategyParams = {
            family, reactionThresholdBps, horizonBars, ...risk,
            volumeRatioMin: family === "VOLUME_CONFIRMED_CONTINUATION" ? 1.5 : null,
            positionFraction: 0.2, maxConcurrentPositions: 5, cooldownMinutes: 60, additionalEntryBars,
          };
          grid.push({ configId: sha256(canonical(params)).slice(0, 20), family, variant, params });
          variant += 1;
        }
      }
    }
  }
  if (grid.length !== 576 || new Set(grid.map((item) => item.configId)).size !== 576) {
    throw new Error("Grelha v7 não reconcilia 576 configurações únicas.");
  }
  return grid;
}

export function isNeighbor(a: GridConfig, b: GridConfig): boolean {
  if (a.family !== b.family) return false;
  const dimensions: (keyof StrategyParams)[] = ["reactionThresholdBps", "horizonBars", "stopBps", "targetBps"];
  return dimensions.filter((key) => a.params[key] !== b.params[key]).length === 1;
}

export const EXECUTION_RULES = {
  startingCashUsd: 25000,
  positionFraction: 0.2,
  maxConcurrentPositions: 5,
  noLeverage: true,
  onePositionPerSymbol: true,
  cooldownMinutes: 60,
  entry: "Next bar open after closed signal; latency variant shifts exactly one additional complete bar.",
  ambiguousBar: "Stop first; gaps through stop/target fill at bar open, never at a better unavailable price.",
  rthFamilies: "EOD exit for five families; EARNINGS_DRIFT uses RTH bars across sessions and time exit.",
  shortSelling: "Hypothetical only; no borrow/locate capability, Reg SHO feasibility or borrow rate is assumed.",
  noPartialFills: true,
  noHiddenMarketImpact: true,
  costs: {
    commissionPerShareUsd: 0.0035,
    minimumCommissionPerOrderUsd: 0.35,
    spreadBpsPerSide: 2,
    slippageBpsPerSide: 1,
    stressMultipliers: [1, 1.5, 2],
    note: "Explicit research assumptions, not broker quotes; SEC/TAF, borrow and market impact are not modeled.",
  },
  selection: {
    is: "trades>=30, PF>1.10, netPnl>0, maxDD<=5%; rank by IS return/maxDD, deterministic configId tie-break.",
    validation: "trades>=10, PF>1, netPnl>0; stress 1.5x netPnl>0; >=3/4 IS subperiods positive; concentration<=60%.",
    freeze: "Maximum five candidates, ranked only by IS among validation-passing configurations, before TEST.",
    holdout: "trades>=10, PF>1, netPnl>0, maxDD<=5%; no reranking or reoptimization after opening.",
    promotion: "New paper validation only, never live and never automatic activation.",
  },
} as const;
