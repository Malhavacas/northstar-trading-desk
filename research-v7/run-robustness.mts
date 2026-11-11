import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { cleanBars } from "./event-core.mts";
import { canonical, OUT, sha256, SYMBOLS } from "./config.mts";
import { buildEngineContext, concentration, runBacktest, type RunResult, type Sample } from "./strategy-engine.mts";
import { isNeighbor, type GridConfig } from "./strategy-grid.mts";

const freezeRaw = readFileSync(`${OUT}/research-freeze.json`, "utf8");
if (sha256(freezeRaw) !== readFileSync(`${OUT}/research-freeze.sha256`, "utf8").trim()) throw new Error("Freeze v7 alterado.");
const freeze = JSON.parse(freezeRaw);
if (freeze.testOpened) throw new Error("Robustez de desenvolvimento recusada: TEST já aberto.");
for (const [file, hash] of Object.entries(freeze.sourceHashes)) {
  if (sha256(readFileSync(`${OUT}/${file}`)) !== hash) throw new Error(`Fonte congelada alterada: ${file}`);
}
if (sha256(readFileSync(`${OUT}/event-dataset.json`)) !== freeze.datasetHashSha256) throw new Error("Dataset alterado após freeze.");
const candidateRaw = readFileSync(`${OUT}/candidate-freeze.json`, "utf8");
const candidateFreeze = JSON.parse(candidateRaw);
if (candidateFreeze.testOpened || candidateFreeze.candidates.length !== 0) {
  throw new Error("Este painel é exclusivo do cenário sem candidatos; não pode substituir a robustez de candidatos.");
}
const records = new Map<string, any>();
for (const [index, line] of readFileSync(`${OUT}/development-runs.jsonl`, "utf8").split("\n").entries()) {
  if (!line.trim()) continue;
  let record: any;
  try { record = JSON.parse(line); } catch (error) { throw new Error(`JSONL inválido na linha ${index + 1}.`); }
  if (record.testComputed) throw new Error("Registo de desenvolvimento contém TEST.");
  records.set(record.config.configId, record);
}
if (records.size !== freeze.grid.length) throw new Error(`Matriz incompleta: ${records.size}/${freeze.grid.length}.`);

const dataset = JSON.parse(readFileSync(`${OUT}/event-dataset.json`, "utf8"));
const barsBySymbol = Object.fromEntries(SYMBOLS.map((symbol) => {
  const payload = JSON.parse(readFileSync(`${OUT}/snapshot/${symbol}.json`, "utf8"));
  return [symbol, cleanBars(payload)];
}));
const context = buildEngineContext(barsBySymbol, dataset.events, dataset.eligibleStocks);

function summarize(result: RunResult) {
  return {
    sample: result.sample,
    costMultiplier: result.costMultiplier,
    additionalEntryBars: result.additionalEntryBars,
    excludeOverlaps: result.excludeOverlaps,
    metrics: result.metrics,
    rejected: result.rejected,
    concentration: concentration(result.trades),
    dailyEquity: result.dailyEquity,
    error: result.error,
  };
}
function execute(config: GridConfig, sample: Sample, sampleName: string, options: { costMultiplier?: number; additionalEntryBars?: 0 | 1; excludeOverlaps?: boolean } = {}) {
  try {
    return summarize(runBacktest(context, config, sample, { sampleName, ...options }));
  } catch (error) {
    return {
      sample: sampleName,
      costMultiplier: options.costMultiplier ?? 1,
      additionalEntryBars: options.additionalEntryBars ?? 0,
      excludeOverlaps: options.excludeOverlaps ?? false,
      metrics: null,
      rejected: {},
      concentration: null,
      dailyEquity: [],
      error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    };
  }
}
function blocks(sample: Sample): Sample[] {
  return Array.from({ length: 4 }, (_, index) => {
    const start = Math.floor(index * sample.days.length / 4);
    const end = Math.floor((index + 1) * sample.days.length / 4);
    return { startIndex: sample.startIndex + start, endIndex: sample.startIndex + end - 1, days: sample.days.slice(start, end) };
  });
}
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const scenarios = [
  { id: "COST_1_5", options: { costMultiplier: 1.5 } },
  { id: "COST_2", options: { costMultiplier: 2 } },
  { id: "LATENCY_PLUS_1_BAR", options: { additionalEntryBars: 1 as const } },
  { id: "EXCLUDE_OVERLAPS", options: { excludeOverlaps: true } },
] as const;
const anchors = (freeze.grid as GridConfig[]).filter((config) => config.variant === 0);
if (anchors.length !== 6) throw new Error(`Âncoras estruturais inesperadas: ${anchors.length}.`);
const output = [];
for (const config of anchors) {
  const record = records.get(config.configId);
  if (!record || canonical(record.config) !== canonical(config)) throw new Error(`Âncora em falta/alterada: ${config.configId}.`);
  const robustness: any = {
    diagnosticOnly: true,
    selectionChanged: false,
    testComputed: false,
    config,
    anchorRule: "variant=0 in the frozen grid; structural anchor, never ranked or selected by P&L.",
    base: record.runs,
    scenarios: {},
    subperiods: blocks(freeze.samples.IS).map((sample, index) => execute(config, sample, `IS_SUBPERIOD_${index + 1}`)),
  };
  for (const scenario of scenarios) {
    robustness.scenarios[scenario.id] = {
      IS: execute(config, freeze.samples.IS, `${scenario.id}_IS`, scenario.options),
      VALIDATION: execute(config, freeze.samples.VALIDATION, `${scenario.id}_VALIDATION`, scenario.options),
    };
  }
  const neighbors = (freeze.grid as GridConfig[]).filter((other) => other.configId !== config.configId && isNeighbor(config, other));
  const neighborRows = neighbors.map((neighbor) => {
    const neighborRecord = records.get(neighbor.configId);
    return {
      configId: neighbor.configId,
      variant: neighbor.variant,
      params: neighbor.params,
      isNetPnl: neighborRecord.runs.IS.metrics?.netPnl ?? null,
      validationNetPnl: neighborRecord.runs.VALIDATION.metrics?.netPnl ?? null,
      isProfitFactor: neighborRecord.runs.IS.metrics?.profitFactor ?? null,
      isMaxDrawdownPct: neighborRecord.runs.IS.metrics?.maxDrawdownPct ?? null,
    };
  });
  robustness.neighborhood = {
    count: neighborRows.length,
    isPositive: neighborRows.filter((row) => (row.isNetPnl ?? 0) > 0).length,
    validationPositive: neighborRows.filter((row) => (row.validationNetPnl ?? 0) > 0).length,
    isMedianNetPnl: median(neighborRows.map((row) => row.isNetPnl).filter((value) => typeof value === "number")),
    validationMedianNetPnl: median(neighborRows.map((row) => row.validationNetPnl).filter((value) => typeof value === "number")),
    rows: neighborRows,
  };
  robustness.positiveSubperiods = robustness.subperiods.filter((run: any) => (run.metrics?.netPnl ?? 0) > 0).length;
  output.push(robustness);
  console.log(`ROBUSTNESS ${config.family} ${config.configId} scenarios=${scenarios.length} positiveSubperiods=${robustness.positiveSubperiods} neighbors=${neighborRows.length}`);
}
const errors = output.flatMap((item) => {
  const runs = [item.base.IS, item.base.VALIDATION, ...item.subperiods];
  for (const scenario of Object.values(item.scenarios) as any[]) runs.push(scenario.IS, scenario.VALIDATION);
  return runs.filter((run) => run.error).map((run) => ({ configId: item.config.configId, sample: run.sample, error: run.error }));
});
const payload = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  diagnosticOnly: true,
  selectionChanged: false,
  promotionAllowed: false,
  liveTradingAllowed: false,
  realOrdersSubmitted: false,
  testComputed: false,
  testOpened: false,
  researchFreezeSha256: sha256(freezeRaw),
  candidateFreezeSha256: sha256(candidateRaw),
  anchorRule: "Exactly variant=0 for each of six frozen families; selected structurally, not by outcomes.",
  scenarios: scenarios.map((scenario) => scenario.id),
  subperiodsPerAnchor: 4,
  anchors: output,
  errors,
  concentrationSource: "Base IS/VALIDATION and every scenario include symbol/category/side concentration and gatePass.",
  cohortsSource: "event-study.json separates RTH and NEXT_RTH_OPEN; no TEST outcomes.",
  note: "Post-development diagnostics only. No configuration becomes a candidate and no holdout is opened.",
};
const raw = JSON.stringify(payload, null, 2);
const temporary = `${OUT}/robustness.tmp`;
writeFileSync(temporary, raw);
renameSync(temporary, `${OUT}/robustness.json`);
if (sha256(readFileSync(`${OUT}/candidate-freeze.json`, "utf8")) !== sha256(candidateRaw)) throw new Error("Candidate freeze mudou durante robustez.");
writeFileSync(`${OUT}/robustness.sha256`, `${sha256(raw)}\n`);
console.log(JSON.stringify({ status: "ROBUSTNESS_DIAGNOSTIC_COMPLETE", anchors: output.length, errors: errors.length, testComputed: false, candidates: 0, robustnessSha256: sha256(raw) }, null, 2));
