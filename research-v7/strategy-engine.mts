import { BENCHMARK, BAR_SECONDS, nyParts, round, STARTING_CASH, type Bar } from "./config.mts";
import type { EventCluster, NewsCategory } from "./event-core.mts";
import type { Cohort } from "./event-core.mts";
import { mean, standardDeviation } from "./event-core.mts";
import type { GridConfig, StrategyParams } from "./strategy-grid.mts";

export interface CostAssumptions {
  commissionPerShare: number;
  minCommissionPerOrder: number;
  spreadBps: number;
  slippageBps: number;
}
export const BASE_COSTS: CostAssumptions = {
  commissionPerShare: 0.0035,
  minCommissionPerOrder: 0.35,
  spreadBps: 2,
  slippageBps: 1,
};
export interface Sample { startIndex: number; endIndex: number; days: string[] }
export interface EngineContext {
  barsBySymbol: Record<string, Bar[]>;
  indexBySymbol: Record<string, Map<number, number>>;
  lastIndexByDay: Record<string, Map<string, number>>;
  spyTimes: Set<number>;
  events: EventCluster[];
  eventsBySymbol: Record<string, EventCluster[]>;
  eligibleStocks: string[];
}
export interface Trade {
  configId: string;
  clusterId: string;
  symbol: string;
  category: NewsCategory;
  cohort: Cohort;
  side: "LONG" | "SHORT";
  signalClose: number;
  entryTime: number;
  exitTime: number;
  entryBarOpenTime: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  grossPnl: number;
  commissions: number;
  priceExecutionCost: number;
  netPnl: number;
  rMultiple: number;
  exitReason: "STOP" | "TARGET" | "TIME" | "EOD";
  overlapped: boolean;
}
export interface Metrics {
  estimate: true;
  startingCash: number;
  endingEquity: number;
  netPnl: number;
  returnPct: number;
  maxDrawdownPct: number;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  profitFactor: number | null;
  averageR: number | null;
  commissions: number;
  priceExecutionCost: number;
  turnoverPct: number;
  averageGrossExposurePct: number;
  annualizedVolatilityPct: number;
  sharpeLikeZeroRate: number | null;
}
export interface RunResult {
  configId: string;
  family: string;
  sample: string;
  costMultiplier: number;
  additionalEntryBars: number;
  excludeOverlaps: boolean;
  trades: Trade[];
  metrics: Metrics;
  rejected: Record<string, number>;
  dailyEquity: { day: string; value: number }[];
  error: string | null;
}
interface Signal {
  event: EventCluster;
  direction: -1 | 1;
  entryIndex: number;
  lastExitIndex: number;
  eodExit: boolean;
  overlapped: boolean;
}
interface Position extends Signal {
  quantity: number;
  entryFill: number;
  entryOpen: number;
  entryFees: number;
  entryTime: number;
  entryBarOpenTime: number;
  stopPrice: number;
  targetPrice: number;
  mark: number;
}

export function buildEngineContext(barsBySymbol: Record<string, Bar[]>, events: EventCluster[], eligibleStocks: string[]): EngineContext {
  const eligible = new Set(eligibleStocks);
  const eligibleEvents = events.filter((event) => eligible.has(event.symbol));
  const indexBySymbol = Object.fromEntries(eligibleStocks.map((symbol) => [
    symbol, new Map((barsBySymbol[symbol] ?? []).map((bar, index) => [bar.time, index])),
  ]));
  const lastIndexByDay = Object.fromEntries(eligibleStocks.map((symbol) => {
    const map = new Map<string, number>();
    (barsBySymbol[symbol] ?? []).forEach((bar, index) => map.set(nyParts(bar.time).day, index));
    return [symbol, map];
  }));
  const eventsBySymbol = Object.fromEntries(eligibleStocks.map((symbol) => [
    symbol, eligibleEvents.filter((event) => event.symbol === symbol).sort((a, b) => a.signalClose - b.signalClose),
  ]));
  return {
    barsBySymbol, indexBySymbol, lastIndexByDay,
    spyTimes: new Set((barsBySymbol[BENCHMARK] ?? []).map((bar) => bar.time)),
    events: eligibleEvents, eventsBySymbol, eligibleStocks,
  };
}

function directionFor(event: EventCluster, params: StrategyParams): -1 | 0 | 1 {
  if (!event.enterprise || event.reactionDirection === 0) return 0;
  if (Math.abs(event.reactionReturn) * 10000 < params.reactionThresholdBps) return 0;
  const sign = event.reactionDirection;
  switch (params.family) {
    case "REACTION_CONTINUATION": return event.cohort === "RTH" ? sign : 0;
    case "EXTREME_REACTION_FADE": return event.cohort === "RTH" ? -sign as -1 | 1 : 0;
    case "VOLUME_CONFIRMED_CONTINUATION":
      return event.cohort === "RTH" && event.volumeRatio != null && event.volumeRatio >= (params.volumeRatioMin ?? 1.5) ? sign : 0;
    case "VWAP_REJECTION_FADE": return event.cohort === "RTH" && event.rejectionVwap ? -sign as -1 | 1 : 0;
    case "OVERNIGHT_CONFIRMED_CONTINUATION":
      return event.cohort === "NEXT_RTH_OPEN" && event.gapReturn != null && event.confirmationReturn != null
        && Math.sign(event.gapReturn) === Math.sign(event.confirmationReturn) ? sign : 0;
    case "EARNINGS_DRIFT": return event.category === "EARNINGS" ? sign : 0;
  }
}

function overlapBetween(context: EngineContext, event: EventCluster, exitTime: number): boolean {
  const events = context.eventsBySymbol[event.symbol] ?? [];
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (events[middle].signalClose < event.signalClose) low = middle + 1;
    else high = middle;
  }
  for (let index = low; index < events.length; index += 1) {
    const other = events[index];
    if (other.signalClose > exitTime) break;
    if (other.clusterId !== event.clusterId) return true;
  }
  return false;
}

function prepareSignal(context: EngineContext, event: EventCluster, config: GridConfig, days: Set<string>, excludeOverlaps: boolean): Signal | { reason: string } {
  const direction = directionFor(event, config.params);
  if (direction === 0) return { reason: "RULE_FILTER" };
  const bars = context.barsBySymbol[event.symbol] ?? [];
  const entryIndex = event.entryIndex + config.params.additionalEntryBars;
  if (entryIndex >= bars.length) return { reason: "NO_LATENCY_ENTRY" };
  const entry = bars[entryIndex];
  const entryDay = nyParts(entry.time).day;
  if (entryDay !== event.entryDay) return { reason: "LATENCY_CROSSSESSION" };
  if (!days.has(entryDay) || !(event.publishedAt <= event.signalClose && event.signalClose < entry.time + 1)) {
    return { reason: "OUTSIDE_SAMPLE_OR_CAUSALITY" };
  }
  const timeExit = entryIndex + config.params.horizonBars - 1;
  const eodIndex = context.lastIndexByDay[event.symbol]?.get(entryDay);
  if (eodIndex == null) return { reason: "NO_EOD" };
  const drift = config.params.family === "EARNINGS_DRIFT";
  const lastExitIndex = drift ? timeExit : Math.min(timeExit, eodIndex);
  if (lastExitIndex >= bars.length || !days.has(nyParts(bars[lastExitIndex].time).day)) return { reason: "EXIT_CROSSES_SAMPLE_BOUNDARY" };
  for (let index = entryIndex; index <= lastExitIndex; index += 1) {
    if (!context.spyTimes.has(bars[index].time)) return { reason: "BENCHMARK_MISSING_IN_EXECUTION_WINDOW" };
  }
  const exitTime = bars[lastExitIndex].time + BAR_SECONDS;
  const overlapped = overlapBetween(context, event, exitTime);
  if (excludeOverlaps && overlapped) return { reason: "OVERLAPPING_EVENT_EXCLUDED" };
  return { event, direction, entryIndex, lastExitIndex, eodExit: !drift && lastExitIndex === eodIndex && timeExit > eodIndex, overlapped };
}

const timelineCache = new Map<string, number[]>();
function timelineFor(context: EngineContext, days: Set<string>): number[] {
  const key = [...days].sort().join("|");
  const cached = timelineCache.get(key);
  if (cached) return cached;
  const times = new Set<number>();
  for (const symbol of context.eligibleStocks) {
    for (const bar of context.barsBySymbol[symbol] ?? []) if (days.has(nyParts(bar.time).day)) times.add(bar.time);
  }
  const timeline = [...times].sort((a, b) => a - b);
  timelineCache.set(key, timeline);
  return timeline;
}

export function runBacktest(context: EngineContext, config: GridConfig, sample: Sample, options: {
  sampleName?: string;
  costMultiplier?: number;
  additionalEntryBars?: 0 | 1;
  excludeOverlaps?: boolean;
} = {}): RunResult {
  const costMultiplier = options.costMultiplier ?? 1;
  const additionalEntryBars = options.additionalEntryBars ?? config.params.additionalEntryBars;
  const excludeOverlaps = options.excludeOverlaps ?? false;
  const effectiveConfig: GridConfig = { ...config, params: { ...config.params, additionalEntryBars } };
  const days = new Set(sample.days);
  const rejected: Record<string, number> = {};
  const reject = (reason: string) => { rejected[reason] = (rejected[reason] ?? 0) + 1; };
  const signals = new Map<number, Signal[]>();
  let signalCount = 0;
  for (const event of context.events) {
    const prepared = prepareSignal(context, event, effectiveConfig, days, excludeOverlaps);
    if ("reason" in prepared) {
      if (prepared.reason !== "RULE_FILTER") reject(prepared.reason);
      continue;
    }
    signalCount += 1;
    const time = context.barsBySymbol[prepared.event.symbol][prepared.entryIndex].time;
    signals.set(time, [...(signals.get(time) ?? []), prepared]);
  }
  for (const entries of signals.values()) entries.sort((a, b) => a.event.symbol.localeCompare(b.event.symbol) || a.event.clusterId.localeCompare(b.event.clusterId));

  const rate = (BASE_COSTS.spreadBps + BASE_COSTS.slippageBps) * costMultiplier / 10000;
  const commissionRate = BASE_COSTS.commissionPerShare * costMultiplier;
  const minimumCommission = BASE_COSTS.minCommissionPerOrder * costMultiplier;
  const positions = new Map<string, Position>();
  const cooldownUntil = new Map<string, number>();
  const trades: Trade[] = [];
  let realizedEquity = STARTING_CASH;
  let peakEquity = STARTING_CASH;
  let maxDrawdownPct = 0;
  let exposureIntegral = 0;
  let exposureObservations = 0;
  const daily = new Map<string, number>();

  const markEquity = () => realizedEquity + [...positions.values()].reduce((sum, position) =>
    sum + position.direction * position.quantity * (position.mark - position.entryFill), 0);
  const closePosition = (position: Position, rawPrice: number, time: number, reason: Trade["exitReason"]) => {
    const exitFill = rawPrice * (1 - position.direction * rate);
    const exitFees = Math.max(minimumCommission, position.quantity * commissionRate);
    const beforeExitFees = position.direction * position.quantity * (exitFill - position.entryFill);
    realizedEquity += beforeExitFees - exitFees;
    const grossPnl = position.direction * position.quantity * (rawPrice - position.entryOpen);
    const netPnl = beforeExitFees - position.entryFees - exitFees;
    const risk = position.quantity * position.entryFill * config.params.stopBps / 10000;
    trades.push({
      configId: config.configId, clusterId: position.event.clusterId, symbol: position.event.symbol,
      category: position.event.category, cohort: position.event.cohort,
      side: position.direction > 0 ? "LONG" : "SHORT", signalClose: position.event.signalClose,
      entryTime: position.entryTime, exitTime: time, entryBarOpenTime: position.entryBarOpenTime,
      entryPrice: position.entryFill, exitPrice: exitFill, quantity: position.quantity,
      grossPnl, commissions: position.entryFees + exitFees,
      priceExecutionCost: grossPnl - beforeExitFees, netPnl,
      rMultiple: risk > 0 ? netPnl / risk : 0, exitReason: reason, overlapped: position.overlapped,
    });
    cooldownUntil.set(position.event.symbol, time + config.params.cooldownMinutes * 60);
    positions.delete(position.event.symbol);
  };

  for (const time of timelineFor(context, days)) {
    // Gap exits occur at the open before any new entry at that timestamp.
    for (const position of [...positions.values()]) {
      const bars = context.barsBySymbol[position.event.symbol];
      const index = context.indexBySymbol[position.event.symbol]?.get(time);
      if (index == null) continue;
      const bar = bars[index];
      position.mark = bar.open;
      if (index === position.entryIndex) continue;
      if (position.direction > 0) {
        if (bar.open <= position.stopPrice) closePosition(position, bar.open, time + 1, "STOP");
        else if (bar.open >= position.targetPrice) closePosition(position, bar.open, time + 1, "TARGET");
      } else {
        if (bar.open >= position.stopPrice) closePosition(position, bar.open, time + 1, "STOP");
        else if (bar.open <= position.targetPrice) closePosition(position, bar.open, time + 1, "TARGET");
      }
    }

    for (const signal of signals.get(time) ?? []) {
      const { event, direction, entryIndex } = signal;
      if ((cooldownUntil.get(event.symbol) ?? 0) > time + 1) { reject("COOLDOWN"); continue; }
      if (positions.has(event.symbol)) { reject("ONE_POSITION_PER_SYMBOL"); continue; }
      if (positions.size >= config.params.maxConcurrentPositions) { reject("MAX_CONCURRENT_POSITIONS"); continue; }
      const bar = context.barsBySymbol[event.symbol][entryIndex];
      const entryFill = bar.open * (1 + direction * rate);
      const equity = markEquity();
      const reserved = [...positions.values()].reduce((sum, position) => sum + position.quantity * position.entryFill, 0);
      const allocation = Math.min(equity * config.params.positionFraction, equity - reserved);
      const quantity = Math.floor(allocation / entryFill);
      if (quantity < 1) { reject("NO_AVAILABLE_CAPACITY"); continue; }
      const entryFees = Math.max(minimumCommission, quantity * commissionRate);
      realizedEquity -= entryFees;
      const stopPrice = entryFill * (1 - direction * config.params.stopBps / 10000);
      const targetPrice = entryFill * (1 + direction * config.params.targetBps / 10000);
      positions.set(event.symbol, {
        ...signal, quantity, entryFill, entryOpen: bar.open, entryFees, entryTime: time + 1,
        entryBarOpenTime: time, stopPrice, targetPrice, mark: bar.open,
      });
    }

    // Intrabar stops/targets: stop first when both are touched in the same bar.
    for (const position of [...positions.values()]) {
      const bars = context.barsBySymbol[position.event.symbol];
      const index = context.indexBySymbol[position.event.symbol]?.get(time);
      if (index == null) continue;
      const bar = bars[index];
      if (position.direction > 0) {
        if (bar.low <= position.stopPrice) { closePosition(position, position.stopPrice, time + 150, "STOP"); continue; }
        if (bar.high >= position.targetPrice) { closePosition(position, position.targetPrice, time + 150, "TARGET"); continue; }
      } else {
        if (bar.high >= position.stopPrice) { closePosition(position, position.stopPrice, time + 150, "STOP"); continue; }
        if (bar.low <= position.targetPrice) { closePosition(position, position.targetPrice, time + 150, "TARGET"); continue; }
      }
      if (index === position.lastExitIndex) {
        closePosition(position, bar.close, time + BAR_SECONDS, position.eodExit ? "EOD" : "TIME");
      } else {
        position.mark = bar.close;
      }
    }

    for (const position of positions.values()) {
      const bars = context.barsBySymbol[position.event.symbol];
      const index = context.indexBySymbol[position.event.symbol]?.get(time);
      if (index != null) position.mark = bars[index].close;
    }
    const equity = markEquity();
    peakEquity = Math.max(peakEquity, equity);
    maxDrawdownPct = Math.max(maxDrawdownPct, peakEquity > 0 ? (peakEquity - equity) / peakEquity * 100 : 100);
    const grossExposure = [...positions.values()].reduce((sum, position) => sum + position.quantity * position.entryFill, 0);
    exposureIntegral += equity > 0 ? grossExposure / equity : 1;
    exposureObservations += 1;
    daily.set(nyParts(time).day, equity);
  }
  if (positions.size) throw new Error(`Motor terminou com ${positions.size} posições por fechar dentro do split.`);

  const wins = trades.filter((trade) => trade.netPnl > 0);
  const losses = trades.filter((trade) => trade.netPnl < 0);
  const grossWins = wins.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLosses = Math.abs(losses.reduce((sum, trade) => sum + trade.netPnl, 0));
  const dailyPoints = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, value }));
  const dailyReturns: number[] = [];
  let previous = STARTING_CASH;
  for (const point of dailyPoints) {
    dailyReturns.push(point.value / previous - 1);
    previous = point.value;
  }
  const volatility = standardDeviation(dailyReturns);
  const turnover = trades.reduce((sum, trade) => sum + trade.quantity * (Math.abs(trade.entryPrice) + Math.abs(trade.exitPrice)), 0);
  const metrics: Metrics = {
    estimate: true, startingCash: STARTING_CASH, endingEquity: round(realizedEquity),
    netPnl: round(realizedEquity - STARTING_CASH), returnPct: round((realizedEquity / STARTING_CASH - 1) * 100),
    maxDrawdownPct: round(maxDrawdownPct), trades: trades.length, wins: wins.length, losses: losses.length,
    winRatePct: round(trades.length ? wins.length / trades.length * 100 : 0),
    profitFactor: grossLosses > 0 ? round(grossWins / grossLosses) : null,
    averageR: trades.length ? round(mean(trades.map((trade) => trade.rMultiple))) : null,
    commissions: round(trades.reduce((sum, trade) => sum + trade.commissions, 0)),
    priceExecutionCost: round(trades.reduce((sum, trade) => sum + trade.priceExecutionCost, 0)),
    turnoverPct: round(turnover / STARTING_CASH * 100),
    averageGrossExposurePct: round(exposureObservations ? exposureIntegral / exposureObservations * 100 : 0),
    annualizedVolatilityPct: round(volatility * Math.sqrt(252) * 100),
    sharpeLikeZeroRate: volatility > 0 ? round(mean(dailyReturns) / volatility * Math.sqrt(252)) : null,
  };
  return {
    configId: config.configId, family: config.family, sample: options.sampleName ?? "CUSTOM",
    costMultiplier, additionalEntryBars, excludeOverlaps, trades, metrics, rejected, dailyEquity: dailyPoints, error: null,
  };
}

export function profitFactorAbove(metrics: Metrics, threshold: number): boolean {
  const grossWin = metrics.profitFactor === null && metrics.wins > 0 && metrics.losses === 0;
  return grossWin || (metrics.profitFactor ?? 0) > threshold;
}

export function concentration(trades: Trade[]) {
  const summarize = (key: (trade: Trade) => string) => {
    const groups = new Map<string, { trades: number; netPnl: number; positivePnl: number }>();
    for (const trade of trades) {
      const group = groups.get(key(trade)) ?? { trades: 0, netPnl: 0, positivePnl: 0 };
      group.trades += 1;
      group.netPnl += trade.netPnl;
      group.positivePnl += Math.max(0, trade.netPnl);
      groups.set(key(trade), group);
    }
    return Object.fromEntries([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => [name, {
      trades: value.trades, netPnl: round(value.netPnl), positivePnl: round(value.positivePnl),
    }]));
  };
  const bySymbol = summarize((trade) => trade.symbol);
  const byCategory = summarize((trade) => trade.category);
  const bySide = summarize((trade) => trade.side);
  const largest = (groups: Record<string, { positivePnl: number }>) => {
    const total = Object.values(groups).reduce((sum, group) => sum + group.positivePnl, 0);
    return total > 0 ? Math.max(...Object.values(groups).map((group) => group.positivePnl / total)) * 100 : 100;
  };
  return {
    bySymbol, byCategory, bySide,
    largestSymbolShareOfPositivePnlPct: round(largest(bySymbol)),
    largestCategoryShareOfPositivePnlPct: round(largest(byCategory)),
    largestSideShareOfPositivePnlPct: round(largest(bySide)),
    gatePass: largest(bySymbol) <= 60 && largest(byCategory) <= 60 && largest(bySide) <= 60,
  };
}
