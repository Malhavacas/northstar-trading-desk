import { classifyNewsHeadline, type NewsCategory } from "../app/contracts/news.ts";
import { BAR_SECONDS, canonical, nyParts, round, sha256, type Bar } from "./config.mts";

export { classifyNewsHeadline };
export type { NewsCategory };
export const ENTERPRISE_CATEGORIES: NewsCategory[] = [
  "EARNINGS", "GUIDANCE", "ANALYST", "M_AND_A", "CAPITAL_RAISE", "LEGAL_REGULATORY", "PRODUCT_CONTRACT",
];
export type Cohort = "RTH" | "NEXT_RTH_OPEN";
export type SessionContext = "RTH" | "PRE_MARKET" | "AFTER_CUTOFF" | "OVERNIGHT";

export interface NewsArticle {
  id: number | string;
  headline: string;
  created_at: string;
  updated_at?: string;
  source?: string;
  symbols?: string[];
  [key: string]: unknown;
}

export interface EventAlignment {
  signalIndex: number;
  entryIndex: number;
  signalClose: number;
  entryBarOpenTime: number;
  entryTime: number;
  entryDay: string;
  cohort: Cohort;
  sessionContext: SessionContext;
}

export interface EventCluster {
  clusterId: string;
  symbol: string;
  articleIds: string[];
  sources: string[];
  category: NewsCategory;
  categories: NewsCategory[];
  enterprise: boolean;
  normalizedHeadline: string;
  publishedAt: number;
  latestPublishedAt: number;
  sourceUpdatedAt: number | null;
  signalIndex: number;
  entryIndex: number;
  signalBarOpenTime: number;
  signalClose: number;
  entryBarOpenTime: number;
  entryTime: number;
  day: string;
  entryDay: string;
  cohort: Cohort;
  sessionContext: SessionContext;
  reactionReturn: number;
  gapReturn: number | null;
  confirmationReturn: number | null;
  reactionDirection: -1 | 0 | 1;
  volumeRatio: number | null;
  vwap: number | null;
  rejectionVwap: boolean;
  confounded12: boolean;
  overlappingClusterIds12: string[];
}

export interface MarketModel {
  alpha: number;
  beta: number;
  observations: number;
  estimationEndIndex: number;
  gapBars: number;
}

export function normalizeHeadline(headline: string): string {
  return headline.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ").slice(0, 300);
}

export function lowerBound(bars: Bar[], target: number, value: (bar: Bar) => number = (bar) => bar.time): number {
  let low = 0;
  let high = bars.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (value(bars[middle]) < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function upperBound(bars: Bar[], target: number, value: (bar: Bar) => number): number {
  let low = 0;
  let high = bars.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (value(bars[middle]) <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function cleanBars(payload: { bars: Bar[]; quality: { excludedDaysWithInternalGaps?: string[] } }): Bar[] {
  const excluded = new Set(payload.quality.excludedDaysWithInternalGaps ?? []);
  return payload.bars.filter((bar) => !excluded.has(nyParts(bar.time).day));
}

export function alignEvent(bars: Bar[], publishedAt: number): EventAlignment | { exclusion: string } {
  if (!bars.length || !Number.isFinite(publishedAt)) return { exclusion: "NO_PRICE_HISTORY" };
  const publication = nyParts(publishedAt);
  const firstOpen = lowerBound(bars, publishedAt);
  const publicationHasSession = firstOpen < bars.length && nyParts(bars[firstOpen].time).day === publication.day
    || (firstOpen > 0 && nyParts(bars[firstOpen - 1].time).day === publication.day);
  const immediateRth = publicationHasSession && publication.minutes >= 570 && publication.minutes <= 885;
  let signalIndex: number;
  let cohort: Cohort;
  let sessionContext: SessionContext;

  if (immediateRth) {
    signalIndex = upperBound(bars, publishedAt, (bar) => bar.time + BAR_SECONDS);
    cohort = "RTH";
    sessionContext = "RTH";
    if (signalIndex >= bars.length || nyParts(bars[signalIndex].time).day !== publication.day) {
      return { exclusion: "NO_SAME_SESSION_SIGNAL" };
    }
  } else {
    signalIndex = firstOpen;
    if (publicationHasSession && publication.minutes >= 570) {
      while (signalIndex < bars.length && nyParts(bars[signalIndex].time).day === publication.day) signalIndex += 1;
    }
    cohort = "NEXT_RTH_OPEN";
    sessionContext = !publicationHasSession ? "OVERNIGHT" : publication.minutes < 570 ? "PRE_MARKET" : "AFTER_CUTOFF";
    if (signalIndex >= bars.length) return { exclusion: "NO_NEXT_RTH_SESSION" };
    const firstOfDay = signalIndex === 0 || nyParts(bars[signalIndex - 1].time).day !== nyParts(bars[signalIndex].time).day;
    if (!firstOfDay) return { exclusion: "NEXT_RTH_SIGNAL_NOT_SESSION_OPEN" };
  }

  const entryIndex = signalIndex + 1;
  if (entryIndex >= bars.length) return { exclusion: "NO_ENTRY_BAR" };
  const signal = bars[signalIndex];
  const entry = bars[entryIndex];
  if (nyParts(entry.time).day !== nyParts(signal.time).day || entry.time !== signal.time + BAR_SECONDS) {
    return { exclusion: "ENTRY_NOT_NEXT_COMPLETE_RTH_BAR" };
  }
  const signalClose = signal.time + BAR_SECONDS;
  const entryTime = entry.time + 1;
  if (!(publishedAt <= signalClose && signalClose < entryTime)) return { exclusion: "CAUSAL_ORDER_VIOLATION" };
  return {
    signalIndex, entryIndex, signalClose, entryBarOpenTime: entry.time, entryTime,
    entryDay: nyParts(entry.time).day, cohort, sessionContext,
  };
}

export function previousSessionClose(bars: Bar[], signalIndex: number): number | null {
  if (signalIndex <= 0) return null;
  const previous = bars[signalIndex - 1];
  return nyParts(previous.time).day !== nyParts(bars[signalIndex].time).day ? previous.close : null;
}

export function causalVolumeRatio(bars: Bar[], signalIndex: number, lookback = 20): number | null {
  if (signalIndex < lookback) return null;
  const prior = bars.slice(signalIndex - lookback, signalIndex);
  const average = prior.reduce((sum, bar) => sum + bar.volume, 0) / lookback;
  return average > 0 ? bars[signalIndex].volume / average : null;
}

export function causalVwap(bars: Bar[], signalIndex: number): number | null {
  const day = nyParts(bars[signalIndex].time).day;
  let start = signalIndex;
  while (start > 0 && nyParts(bars[start - 1].time).day === day) start -= 1;
  let value = 0;
  let volume = 0;
  for (let index = start; index <= signalIndex; index += 1) {
    const bar = bars[index];
    const typical = (bar.high + bar.low + bar.close) / 3;
    value += typical * bar.volume;
    volume += bar.volume;
  }
  return volume > 0 ? value / volume : null;
}

export function hasVwapRejection(bar: Bar, vwap: number | null, direction: -1 | 0 | 1): boolean {
  if (vwap == null || direction === 0) return false;
  if (direction > 0) return bar.close < vwap && bar.high - Math.max(bar.open, bar.close) > 0;
  return bar.close > vwap && Math.min(bar.open, bar.close) - bar.low > 0;
}

function alignedReturn(bars: Bar[], index: number, spy: Bar[], spyIndex: Map<number, number>): number[] | null {
  if (index <= 0) return null;
  const assetBar = bars[index];
  const previousAsset = bars[index - 1];
  const marketIndex = spyIndex.get(assetBar.time);
  if (marketIndex == null || marketIndex <= 0) return null;
  const marketBar = spy[marketIndex];
  const previousMarket = spy[marketIndex - 1];
  if (previousMarket.time !== previousAsset.time || previousAsset.close <= 0 || previousMarket.close <= 0) return null;
  return [assetBar.close / previousAsset.close - 1, marketBar.close / previousMarket.close - 1];
}

export function estimateMarketModel(bars: Bar[], signalIndex: number, spy: Bar[], spyIndex: Map<number, number>, estimationBars = 60, gapBars = 12): MarketModel | null {
  const end = signalIndex - gapBars;
  const start = end - estimationBars + 1;
  if (start <= 0 || end >= signalIndex) return null;
  const pairs: number[][] = [];
  for (let index = start; index <= end; index += 1) {
    const pair = alignedReturn(bars, index, spy, spyIndex);
    if (!pair) return null;
    pairs.push(pair);
  }
  const assetMean = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const marketMean = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  let covariance = 0;
  let variance = 0;
  for (const pair of pairs) {
    covariance += (pair[1] - marketMean) * (pair[0] - assetMean);
    variance += (pair[1] - marketMean) ** 2;
  }
  if (!(variance > 0)) return null;
  const beta = covariance / variance;
  const alpha = assetMean - beta * marketMean;
  return { alpha, beta, observations: pairs.length, estimationEndIndex: end, gapBars };
}

export function abnormalReturns(bars: Bar[], signalIndex: number, spy: Bar[], spyIndex: Map<number, number>, model: MarketModel, horizons = [1, 3, 6, 12], directionOverride?: -1 | 0 | 1): {
  arByHorizon: Record<string, number>;
  rawReturnByHorizon: Record<string, number>;
  continuationByHorizon: Record<string, number>;
  endIndices: Record<string, number>;
} | null {
  const arByHorizon: Record<string, number> = {};
  const rawReturnByHorizon: Record<string, number> = {};
  const continuationByHorizon: Record<string, number> = {};
  const endIndices: Record<string, number> = {};
  const direction = directionOverride ?? Math.sign(bars[signalIndex].close - bars[signalIndex].open);
  let car = 0;
  const maximum = Math.max(...horizons);
  if (signalIndex + maximum >= bars.length) return null;
  for (let offset = 1; offset <= maximum; offset += 1) {
    const pair = alignedReturn(bars, signalIndex + offset, spy, spyIndex);
    if (!pair) return null;
    car += pair[0] - model.alpha - model.beta * pair[1];
    if (horizons.includes(offset)) {
      const raw = bars[signalIndex + offset].close / bars[signalIndex].close - 1;
      arByHorizon[String(offset)] = car;
      rawReturnByHorizon[String(offset)] = raw;
      continuationByHorizon[String(offset)] = raw * direction;
      endIndices[String(offset)] = signalIndex + offset;
    }
  }
  return { arByHorizon, rawReturnByHorizon, continuationByHorizon, endIndices };
}

export function clusterIdentity(symbol: string, headline: string, firstArticleId: string): string {
  return sha256(`${symbol}|${normalizeHeadline(headline)}|${firstArticleId}`).slice(0, 20);
}

export function eventFingerprint(event: EventCluster): string {
  return sha256(canonical(event));
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function median(values: number[]): number {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

export function seededRandom(seedText: string): () => number {
  let state = Number.parseInt(sha256(seedText).slice(0, 8), 16) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function summarizeByDay(values: { day: string; value: number }[], seed: string, iterations = 1000) {
  const numbers = values.map((item) => item.value);
  if (!numbers.length) return { n: 0, days: 0, mean: null, median: null, standardDeviation: null, bootstrap95: null };
  const byDay = new Map<string, number[]>();
  for (const item of values) byDay.set(item.day, [...(byDay.get(item.day) ?? []), item.value]);
  const days = [...byDay.keys()].sort();
  const random = seededRandom(seed);
  const bootstrapped: number[] = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample: number[] = [];
    for (let index = 0; index < days.length; index += 1) {
      const day = days[Math.floor(random() * days.length)];
      sample.push(...byDay.get(day)!);
    }
    bootstrapped.push(mean(sample));
  }
  bootstrapped.sort((a, b) => a - b);
  return {
    n: numbers.length,
    days: days.length,
    mean: round(mean(numbers), 8),
    median: round(median(numbers), 8),
    standardDeviation: round(standardDeviation(numbers), 8),
    bootstrap95: [round(bootstrapped[Math.floor(iterations * 0.025)], 8), round(bootstrapped[Math.floor(iterations * 0.975)], 8)],
  };
}
