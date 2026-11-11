import assert from "node:assert/strict";
import { test } from "node:test";
import type { Bar } from "./config.mts";
import {
  abnormalReturns, alignEvent, causalVolumeRatio, cleanBars, estimateMarketModel, normalizeHeadline,
} from "./event-core.mts";

const second = (iso: string) => Date.parse(iso) / 1000;
function session(day: string, count = 5): Bar[] {
  const start = second(`${day}T14:30:00Z`);
  return Array.from({ length: count }, (_, index) => ({
    time: start + index * 300,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 1000 + index * 10,
  }));
}
const bars = [...session("2026-01-05"), ...session("2026-01-06")];

test("publicação antes do fecho usa a primeira barra completa e entrada seguinte", () => {
  const aligned = alignEvent(bars, second("2026-01-05T14:34:59Z"));
  assert.ok(!("exclusion" in aligned));
  assert.equal(aligned.signalIndex, 0);
  assert.equal(aligned.signalClose, second("2026-01-05T14:35:00Z"));
  assert.equal(aligned.entryIndex, 1);
  assert.equal(aligned.entryTime, bars[1].time + 1);
  assert.ok(second("2026-01-05T14:34:59Z") <= aligned.signalClose && aligned.signalClose < aligned.entryTime);
});

test("publicação exatamente no fecho não entra nessa barra", () => {
  const aligned = alignEvent(bars, second("2026-01-05T14:35:00Z"));
  assert.ok(!("exclusion" in aligned));
  assert.equal(aligned.signalIndex, 1);
  assert.equal(aligned.signalClose, second("2026-01-05T14:40:00Z"));
});

test("pré-abertura e pós-cutoff ficam na coorte NEXT_RTH_OPEN", () => {
  const premarket = alignEvent(bars, second("2026-01-05T13:00:00Z"));
  assert.ok(!("exclusion" in premarket));
  assert.equal(premarket.cohort, "NEXT_RTH_OPEN");
  assert.equal(premarket.sessionContext, "PRE_MARKET");
  assert.equal(premarket.signalIndex, 0);

  const after = alignEvent(bars, second("2026-01-05T19:46:00Z"));
  assert.ok(!("exclusion" in after));
  assert.equal(after.cohort, "NEXT_RTH_OPEN");
  assert.equal(after.sessionContext, "AFTER_CUTOFF");
  assert.equal(after.signalIndex, 5);
  assert.equal(after.entryIndex, 6);
});

test("fim de semana usa a primeira barra da sessão seguinte, nunca extended inventado", () => {
  const aligned = alignEvent(bars, second("2026-01-03T16:00:00Z"));
  assert.ok(!("exclusion" in aligned));
  assert.equal(aligned.signalIndex, 0);
  assert.equal(aligned.sessionContext, "OVERNIGHT");
});

test("evento sem barra de entrada é rejeitado", () => {
  const aligned = alignEvent(session("2026-01-05", 1), second("2026-01-05T14:31:00Z"));
  assert.deepEqual(aligned, { exclusion: "NO_ENTRY_BAR" });
});

test("dias com lacunas são removidos, sem interpolar barras", () => {
  const cleaned = cleanBars({ bars, quality: { excludedDaysWithInternalGaps: ["2026-01-05"] } });
  assert.equal(cleaned.length, 5);
  assert.ok(cleaned.every((bar) => bar.time >= second("2026-01-06T14:30:00Z")));
});

test("volume e estimation window usam apenas o passado causal", () => {
  const ratio = causalVolumeRatio(bars, 5, 5);
  assert.equal(ratio, bars[5].volume / ((1000 + 1010 + 1020 + 1030 + 1040) / 5));
  const asset = Array.from({ length: 100 }, (_, index) => ({
    time: 1000000 + index * 300, open: 100 + index, high: 102 + index, low: 99 + index,
    close: 100.5 + index, volume: 1000,
  }));
  const market = asset.map((bar, index) => ({ ...bar, open: 50 + index * 0.5, close: 50.25 + index * 0.5 }));
  const index = new Map(market.map((bar, cursor) => [bar.time, cursor]));
  const model = estimateMarketModel(asset, 85, market, index)!;
  assert.equal(model.observations, 60);
  assert.equal(model.estimationEndIndex, 73);
  assert.equal(model.gapBars, 12);
  assert.ok(Math.abs(model.beta - 1) < 1e-9);
  const abnormal = abnormalReturns(asset, 85, market, index, model)!;
  assert.ok(Math.abs(abnormal.arByHorizon["12"]) < 1e-9);
});

test("benchmark em falta bloqueia modelo e CAR", () => {
  const asset = session("2026-01-05", 100);
  const estimationGap = asset.filter((_, index) => index !== 50);
  const estimationIndex = new Map(estimationGap.map((bar, cursor) => [bar.time, cursor]));
  assert.equal(estimateMarketModel(asset, 85, estimationGap, estimationIndex), null);

  const outcomeGap = asset.filter((_, index) => index !== 90);
  const outcomeIndex = new Map(outcomeGap.map((bar, cursor) => [bar.time, cursor]));
  assert.equal(abnormalReturns(asset, 85, outcomeGap, outcomeIndex, { alpha: 0, beta: 1, observations: 0, estimationEndIndex: -1, gapBars: 0 }), null);
});

test("normalização de clusters é estável", () => {
  assert.equal(normalizeHeadline("  ABC: lucros, guidance!  "), "abc lucros guidance");
  assert.equal(normalizeHeadline("A—B"), "a b");
});
