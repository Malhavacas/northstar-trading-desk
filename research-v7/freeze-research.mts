import { readFileSync, writeFileSync } from "node:fs";
import { canonical, OUT, sha256 } from "./config.mts";
import { createGrid, EXECUTION_RULES } from "./strategy-grid.mts";

const files = [
  "config.mts", "event-core.mts", "build-dataset.mts", "strategy-grid.mts", "strategy-engine.mts",
];
const grid = createGrid();
const dataset = JSON.parse(readFileSync(`${OUT}/event-dataset.json`, "utf8"));
const datasetMeta = JSON.parse(readFileSync(`${OUT}/dataset-meta.json`, "utf8"));
const payload = {
  schemaVersion: 1,
  frozenAt: new Date().toISOString(),
  stage: "DEVELOPMENT_ONLY_UNTIL_CANDIDATE_FREEZE",
  datasetHashSha256: sha256(readFileSync(`${OUT}/event-dataset.json`)),
  eventStudyHashSha256: sha256(readFileSync(`${OUT}/event-study.json`)),
  samples: dataset.samples,
  eligibleStocks: dataset.eligibleStocks,
  configurations: grid.length,
  uniqueConfigurations: new Set(grid.map((item) => item.configId)).size,
  configurationsPerFamily: Object.fromEntries([...new Set(grid.map((item) => item.family))].map((family) => [
    family, grid.filter((item) => item.family === family).length,
  ])),
  grid,
  executionRules: EXECUTION_RULES,
  gates: {
    is: { minTrades: 30, profitFactorExclusive: 1.1, minNetPnl: 0, maxDrawdownPct: 5 },
    validation: { minTrades: 10, profitFactorExclusive: 1, minNetPnl: 0 },
    stress15: { minNetPnl: 0 },
    subperiods: { blocks: 4, minimumPositive: 3 },
    concentration: { maximumPositivePnlSharePct: 60, dimensions: ["symbol", "category", "side"] },
    holdout: { minTrades: 10, profitFactorExclusive: 1, minNetPnl: 0, maxDrawdownPct: 5 },
    maximumCandidates: 5,
  },
  sourceHashes: Object.fromEntries(files.map((file) => [file, sha256(readFileSync(`${OUT}/${file}`))])),
  datasetContentHashSha256: datasetMeta.hashes.eventContentSha256,
  testOpened: false,
  liveTradingAllowed: false,
  realOrdersSubmitted: false,
  xIncludedInBacktest: false,
  credentialsIncluded: false,
};
const raw = JSON.stringify(payload, null, 2);
writeFileSync(`${OUT}/research-freeze.json`, raw);
writeFileSync(`${OUT}/research-freeze.sha256`, `${sha256(raw)}\n`);
console.log(JSON.stringify({
  status: "RESEARCH_FROZEN_BEFORE_ANY_PNL",
  configurations: payload.configurations,
  eligibleStocks: payload.eligibleStocks.length,
  freezeSha256: sha256(raw),
  datasetHashSha256: payload.datasetHashSha256,
  engineSha256: payload.sourceHashes["strategy-engine.mts"],
  canonicalGridDigest: sha256(canonical(grid)),
}, null, 2));
