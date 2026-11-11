import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bar } from "./config.mts";
import type { EventCluster } from "./event-core.mts";
import { buildEngineContext, runBacktest } from "./strategy-engine.mts";
import { createGrid, type Family, type GridConfig } from "./strategy-grid.mts";

const start = Date.parse("2026-01-05T14:30:00Z") / 1000;
const sample = { startIndex: 0, endIndex: 0, days: ["2026-01-05"] };
const baseGrid = createGrid();
function bars(count = 8): Bar[] {
  return Array.from({ length: count }, (_, index) => ({
    time: start + index * 300, open: 100, high: 100.3, low: 99.7, close: 100.1, volume: 1000,
  }));
}
function event(id: string, entryIndex = 1, direction: -1 | 1 = 1): EventCluster {
  const signalIndex = entryIndex - 1;
  return {
    clusterId: id, symbol: "TEST", articleIds: [id], sources: ["fixture"], category: "EARNINGS", categories: ["EARNINGS"],
    enterprise: true, normalizedHeadline: `fixture ${id}`, publishedAt: start + signalIndex * 300 + 100,
    latestPublishedAt: start + signalIndex * 300 + 100, sourceUpdatedAt: null,
    signalIndex, entryIndex, signalBarOpenTime: start + signalIndex * 300, signalClose: start + (signalIndex + 1) * 300,
    entryBarOpenTime: start + entryIndex * 300, entryTime: start + entryIndex * 300 + 1,
    day: "2026-01-05", entryDay: "2026-01-05", cohort: "RTH", sessionContext: "RTH",
    reactionReturn: direction * 0.02, gapReturn: null, confirmationReturn: direction * 0.02,
    reactionDirection: direction, volumeRatio: 2, vwap: 100, rejectionVwap: true,
    confounded12: false, overlappingClusterIds12: [],
  };
}
function config(family: Family = "REACTION_CONTINUATION", overrides: Partial<GridConfig["params"]> = {}): GridConfig {
  const base = baseGrid.find((item) => item.family === family)!;
  return { ...base, configId: `TEST-${family}`, params: {
    ...base.params, reactionThresholdBps: 5, horizonBars: 1, stopBps: 200, targetBps: 500, ...overrides,
  } };
}
function context(priceBars: Bar[], events: EventCluster[], spyBars = priceBars) {
  return buildEngineContext({ TEST: priceBars, SPY: spyBars }, events, ["TEST"]);
}

test("grelha pré-registada tem 576 configurações únicas e 96 por família", () => {
  assert.equal(baseGrid.length, 576);
  assert.equal(new Set(baseGrid.map((item) => item.configId)).size, 576);
  for (const family of new Set(baseGrid.map((item) => item.family))) assert.equal(baseGrid.filter((item) => item.family === family).length, 96);
});

test("continuação long é causal, temporal e determinística após custos", () => {
  const series = bars();
  series[0] = { ...series[0], open: 100, close: 102 };
  series[1] = { ...series[1], open: 102, high: 102.4, low: 101.8, close: 102.2 };
  const engine = config();
  const first = runBacktest(context(series, [event("A")]), engine, sample);
  const second = runBacktest(context(series, [event("A")]), engine, sample);
  assert.equal(first.trades.length, 1);
  assert.equal(first.trades[0].side, "LONG");
  assert.equal(first.trades[0].entryTime, series[1].time + 1);
  assert.equal(first.trades[0].exitReason, "TIME");
  assert.equal(first.trades[0].exitTime, series[1].time + 300);
  assert.deepEqual(first, second);
  assert.equal(first.metrics.endingEquity, 25000 + first.trades[0].netPnl);
});

test("fade short em barra ambígua executa stop primeiro", () => {
  const series = bars();
  series[0] = { ...series[0], open: 100, close: 102 };
  series[1] = { ...series[1], open: 100, high: 100.8, low: 99.2, close: 100 };
  const result = runBacktest(context(series, [event("A")]), config("EXTREME_REACTION_FADE", {
    reactionThresholdBps: 20, stopBps: 50, targetBps: 50,
  }), sample);
  assert.equal(result.trades[0].side, "SHORT");
  assert.equal(result.trades[0].exitReason, "STOP");
  assert.ok(result.trades[0].netPnl < 0);
});

test("gap através do stop long recebe o open, não um stop indisponível", () => {
  const series = bars();
  series[0] = { ...series[0], open: 100, close: 102 };
  series[1] = { ...series[1], open: 100, high: 100.2, low: 99.9, close: 100.1 };
  series[2] = { ...series[2], open: 97, high: 97.2, low: 96.8, close: 97.1 };
  const result = runBacktest(context(series, [event("A")]), config("REACTION_CONTINUATION", {
    horizonBars: 3, stopBps: 100, targetBps: 1000,
  }), sample);
  assert.equal(result.trades[0].exitReason, "STOP");
  assert.equal(result.trades[0].exitTime, series[2].time + 1);
  assert.ok(result.trades[0].exitPrice < 97);
});

test("EOD e horizonte temporal são distintos; latência desloca uma barra completa", () => {
  const series = bars();
  series[0] = { ...series[0], open: 100, close: 102 };
  const eod = runBacktest(context(series, [event("A")]), config("REACTION_CONTINUATION", {
    horizonBars: 48, stopBps: 1000, targetBps: 1000,
  }), sample);
  assert.equal(eod.trades[0].exitReason, "EOD");
  assert.equal(eod.trades[0].exitTime, series.at(-1)!.time + 300);

  const latency = runBacktest(context(series, [event("A")]), config(), sample, { additionalEntryBars: 1 });
  assert.equal(latency.trades[0].entryBarOpenTime, series[2].time);
});

test("saída além do split e benchmark em falta bloqueiam o trade", () => {
  const series = bars(2);
  series[0] = { ...series[0], open: 100, close: 102 };
  const boundary = runBacktest(context(series, [event("A")]), config("EARNINGS_DRIFT", {
    reactionThresholdBps: 0, horizonBars: 12,
  }), sample);
  assert.equal(boundary.trades.length, 0);
  assert.equal(boundary.rejected.EXIT_CROSSES_SAMPLE_BOUNDARY, 1);

  const full = bars();
  full[0] = { ...full[0], open: 100, close: 102 };
  const missingSpy = full.filter((_, index) => index !== 1);
  const missing = runBacktest(context(full, [event("A")], missingSpy), config(), sample);
  assert.equal(missing.trades.length, 0);
  assert.equal(missing.rejected.BENCHMARK_MISSING_IN_EXECUTION_WINDOW, 1);
});

test("stress de custos nunca melhora o mesmo trade", () => {
  const series = bars();
  series[0] = { ...series[0], open: 100, close: 102 };
  series[1] = { ...series[1], open: 102, high: 102.3, low: 101.9, close: 102.2 };
  const engine = config();
  const base = runBacktest(context(series, [event("A")]), engine, sample);
  const stress = runBacktest(context(series, [event("A")]), engine, sample, { costMultiplier: 2 });
  assert.ok(stress.trades[0].netPnl < base.trades[0].netPnl);
  assert.ok(stress.trades[0].commissions > base.trades[0].commissions);
});

test("uma posição por símbolo e cooldown de 60 minutos são aplicados", () => {
  const series = bars();
  series[0] = { ...series[0], open: 100, close: 102 };
  series[2] = { ...series[2], open: 100, close: 102 };
  const simultaneous = runBacktest(context(series, [event("A"), event("B")]), config("REACTION_CONTINUATION", {
    horizonBars: 3, stopBps: 1000, targetBps: 1000,
  }), sample);
  assert.equal(simultaneous.trades.length, 1);
  assert.equal(simultaneous.rejected.ONE_POSITION_PER_SYMBOL, 1);

  const cooldown = runBacktest(context(series, [event("A", 1), event("C", 3)]), config(), sample);
  assert.equal(cooldown.trades.length, 1);
  assert.equal(cooldown.rejected.COOLDOWN, 1);
});

test("robustez sem sobreposição exclui eventos confundidos", () => {
  const series = bars();
  series[0] = { ...series[0], open: 100, close: 102 };
  series[1] = { ...series[1], open: 100, close: 102 };
  const engine = config("REACTION_CONTINUATION", { horizonBars: 3 });
  const result = runBacktest(context(series, [event("A", 1), event("B", 2)]), engine, sample, { excludeOverlaps: true });
  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].clusterId, "B");
  assert.equal(result.rejected.OVERLAPPING_EVENT_EXCLUDED, 1);
});
