import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cleanBars } from "./event-core.mts";
import { canonical, OUT, sha256, STOCKS, SYMBOLS } from "./config.mts";
import { concentration, profitFactorAbove, runBacktest, type RunResult, type Sample } from "./strategy-engine.mts";
import { buildEngineContext } from "./strategy-engine.mts";
import type { GridConfig } from "./strategy-grid.mts";

const freezeRaw = readFileSync(`${OUT}/research-freeze.json`, "utf8");
if (sha256(freezeRaw) !== readFileSync(`${OUT}/research-freeze.sha256`, "utf8").trim()) throw new Error("Freeze v7 alterado.");
const freeze = JSON.parse(freezeRaw);
if (freeze.testOpened) throw new Error("Desenvolvimento não pode ser retomado depois de abrir TEST.");
for (const [file, hash] of Object.entries(freeze.sourceHashes)) {
  if (sha256(readFileSync(`${OUT}/${file}`)) !== hash) throw new Error(`Fonte congelada alterada: ${file}`);
}
if (sha256(readFileSync(`${OUT}/event-dataset.json`)) !== freeze.datasetHashSha256) throw new Error("Dataset alterado após freeze.");
const dataset = JSON.parse(readFileSync(`${OUT}/event-dataset.json`, "utf8"));
const barsBySymbol = Object.fromEntries(SYMBOLS.map((symbol) => {
  const payload = JSON.parse(readFileSync(`${OUT}/snapshot/${symbol}.json`, "utf8"));
  return [symbol, cleanBars(payload)];
}));
const context = buildEngineContext(barsBySymbol, dataset.events, dataset.eligibleStocks);
const matrixPath = `${OUT}/development-runs.jsonl`;
const completed = new Map<string, any>();
const recoveredInvalidLines: number[] = [];
if (existsSync(matrixPath)) {
  for (const [index, line] of readFileSync(matrixPath, "utf8").split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      completed.set(record.config.configId, record);
    } catch {
      recoveredInvalidLines.push(index + 1);
    }
  }
}
if (recoveredInvalidLines.length) {
  console.warn(`RECOVERY invalid JSONL lines ignored and recomputed: ${recoveredInvalidLines.join(",")}`);
}
function atomicWrite(path: string, raw: string) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, raw);
  renameSync(temporary, path);
}
function persistMatrix() {
  const ordered = [...completed.values()].sort((a, b) => a.config.configId.localeCompare(b.config.configId));
  atomicWrite(matrixPath, `${ordered.map((record) => JSON.stringify(record)).join("\n")}\n`);
  const verified = readFileSync(matrixPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  if (verified.length !== ordered.length || new Set(verified.map((record) => record.config.configId)).size !== ordered.length) {
    throw new Error(`Falha de releitura da matriz: ${verified.length}/${ordered.length}.`);
  }
}

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
function execute(config: GridConfig, sample: Sample, sampleName: string, costMultiplier = 1) {
  try {
    return summarize(runBacktest(context, config, sample, { sampleName, costMultiplier }));
  } catch (error) {
    return {
      sample: sampleName, costMultiplier, additionalEntryBars: 0, excludeOverlaps: false,
      metrics: null, rejected: {}, concentration: null, dailyEquity: [],
      error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
    };
  }
}
function isPass(run: any): boolean {
  const m = run.metrics;
  return Boolean(m && m.trades >= 30 && m.netPnl > 0 && profitFactorAbove(m, 1.1) && m.maxDrawdownPct <= 5);
}
function validationPass(run: any): boolean {
  const m = run.metrics;
  return Boolean(m && m.trades >= 10 && m.netPnl > 0 && profitFactorAbove(m, 1));
}
function score(run: any): number {
  return run.metrics ? run.metrics.returnPct / Math.max(run.metrics.maxDrawdownPct, 0.25) : Number.NEGATIVE_INFINITY;
}
function blocks(sample: Sample, count = 4): Sample[] {
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * sample.days.length / count);
    const end = Math.floor((index + 1) * sample.days.length / count);
    return { startIndex: sample.startIndex + start, endIndex: sample.startIndex + end - 1, days: sample.days.slice(start, end) };
  });
}

for (const config of freeze.grid as GridConfig[]) {
  if (completed.has(config.configId)) continue;
  const record = {
    schemaVersion: 1,
    config,
    runs: {
      IS: execute(config, freeze.samples.IS, "IS"),
      VALIDATION: execute(config, freeze.samples.VALIDATION, "VALIDATION"),
    },
    testComputed: false,
  };
  completed.set(config.configId, record);
  if (completed.size % 25 === 0) persistMatrix();
  if (completed.size % 1 === 0) {
    console.log(`MATRIX ${completed.size}/${freeze.grid.length} ${config.family} v${config.variant} IS trades=${record.runs.IS.metrics?.trades ?? "ERR"} pnl=${record.runs.IS.metrics?.netPnl ?? record.runs.IS.error} VAL trades=${record.runs.VALIDATION.metrics?.trades ?? "ERR"} pnl=${record.runs.VALIDATION.metrics?.netPnl ?? record.runs.VALIDATION.error}`);
  }
}

persistMatrix();
const records = [...completed.values()].sort((a, b) => a.config.configId.localeCompare(b.config.configId));
if (records.length !== freeze.grid.length) throw new Error(`Matriz incompleta: ${records.length}/${freeze.grid.length}`);
const prefiltered = records.filter((record) => isPass(record.runs.IS) && validationPass(record.runs.VALIDATION))
  .sort((a, b) => score(b.runs.IS) - score(a.runs.IS) || a.config.configId.localeCompare(b.config.configId));
const selectionDetails: any[] = [];
for (const record of prefiltered) {
  const stress15 = execute(record.config, freeze.samples.VALIDATION, "VALIDATION_STRESS_1_5", 1.5);
  const subperiods = blocks(freeze.samples.IS).map((sample, index) => execute(record.config, sample, `IS_SUBPERIOD_${index + 1}`));
  const positiveSubperiods = subperiods.filter((run) => (run.metrics?.netPnl ?? 0) > 0).length;
  const concentrationPass = record.runs.IS.concentration?.gatePass === true;
  const stressPass = (stress15.metrics?.netPnl ?? 0) > 0;
  const pass = stressPass && positiveSubperiods >= 3 && concentrationPass;
  selectionDetails.push({
    configId: record.config.configId,
    isScore: score(record.runs.IS),
    stress15,
    subperiods,
    positiveSubperiods,
    concentrationPass,
    stressPass,
    pass,
  });
  console.log(`SELECTION ${record.config.configId} pass=${pass} stressPnl=${stress15.metrics?.netPnl ?? stress15.error} positiveSubperiods=${positiveSubperiods} concentration=${concentrationPass}`);
}
const selectedIds = selectionDetails.filter((detail) => detail.pass)
  .sort((a, b) => b.isScore - a.isScore || a.configId.localeCompare(b.configId))
  .slice(0, 5).map((detail) => detail.configId);
const candidates = selectedIds.map((configId) => {
  const record = records.find((item) => item.config.configId === configId)!;
  return { config: record.config, development: record.runs, selection: selectionDetails.find((item) => item.configId === configId) };
});
const candidatePayload = {
  schemaVersion: 1,
  frozenAt: new Date().toISOString(),
  researchFreezeSha256: sha256(freezeRaw),
  selectionRule: freeze.executionRules.selection,
  prefilteredCount: prefiltered.length,
  candidates,
  candidateConfigIds: selectedIds,
  maximumCandidates: 5,
  testOpened: false,
  noRetuningAfterThisFile: true,
  liveTradingAllowed: false,
  realOrdersSubmitted: false,
};
const candidateRaw = JSON.stringify(candidatePayload, null, 2);
atomicWrite(`${OUT}/candidate-freeze.json`, candidateRaw);
atomicWrite(`${OUT}/candidate-freeze.sha256`, `${sha256(candidateRaw)}\n`);
const summary = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  configurations: records.length,
  uniqueConfigurations: new Set(records.map((record) => record.config.configId)).size,
  developmentRuns: records.length * 2,
  errors: records.flatMap((record) => ["IS", "VALIDATION"].filter((sample) => record.runs[sample].error).map((sample) => ({ configId: record.config.configId, sample, error: record.runs[sample].error }))),
  zeroTrades: Object.fromEntries(["IS", "VALIDATION"].map((sample) => [sample, records.filter((record) => record.runs[sample].metrics?.trades === 0).length])),
  negativePnl: Object.fromEntries(["IS", "VALIDATION"].map((sample) => [sample, records.filter((record) => (record.runs[sample].metrics?.netPnl ?? 0) < 0).length])),
  byFamily: Object.fromEntries([...new Set(records.map((record) => record.config.family))].map((family) => [family, {
    configurations: records.filter((record) => record.config.family === family).length,
    isPositive: records.filter((record) => record.config.family === family && (record.runs.IS.metrics?.netPnl ?? 0) > 0).length,
    validationPositive: records.filter((record) => record.config.family === family && (record.runs.VALIDATION.metrics?.netPnl ?? 0) > 0).length,
    prefiltered: prefiltered.filter((record) => record.config.family === family).length,
    candidates: candidates.filter((record) => record.config.family === family).length,
  }])),
  prefilteredCount: prefiltered.length,
  candidateConfigIds: selectedIds,
  candidateFreezeSha256: sha256(candidateRaw),
  selectionDetailsSha256: sha256(canonical(selectionDetails)),
  testComputed: false,
};
atomicWrite(`${OUT}/development-summary.json`, JSON.stringify(summary, null, 2));
atomicWrite(`${OUT}/selection-details.json`, JSON.stringify(selectionDetails, null, 2));
console.log(JSON.stringify({ status: "DEVELOPMENT_COMPLETE_CANDIDATES_FROZEN", ...summary, selectionDetails: undefined }, null, 2));
