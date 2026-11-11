import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT = process.env.NORTHSTAR_RESEARCH_DIR ? resolve(process.env.NORTHSTAR_RESEARCH_DIR) : HERE;
export const V6 = process.env.NORTHSTAR_V6_DIR ? resolve(process.env.NORTHSTAR_V6_DIR) : resolve(HERE, "../research-v6-legacy");
export const BENCHMARK = "SPY";
export const EXISTING_STOCKS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AMD", "AVGO", "JPM", "XOM"] as const;
export const NEW_STOCKS = ["TSLA", "NFLX", "PLTR", "COIN", "MSTR", "HOOD", "SMCI", "MU", "INTC", "CRM", "ORCL", "UBER", "SHOP", "SOFI"] as const;
export const STOCKS = [...EXISTING_STOCKS, ...NEW_STOCKS] as const;
export const SYMBOLS = [BENCHMARK, ...STOCKS] as const;
export const STARTING_CASH = 25000;
export const BAR_SECONDS = 300;

const priceMeta = JSON.parse(readFileSync(`${HERE}/price-meta.json`, "utf8"));
export const REQUESTED_START = Number(process.env.NORTHSTAR_REQUESTED_START ?? priceMeta.requestedStart);
export const REQUESTED_END = Number(process.env.NORTHSTAR_REQUESTED_END ?? priceMeta.requestedEnd);

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
  });
}

export function round(value: number, places = 6): number {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function nyParts(time: number): { day: string; minutes: number; epoch: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(time * 1000));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")), epoch: time };
}

export function digestBars(symbol: string, bars: Bar[]): string {
  const hash = createHash("sha256");
  for (const bar of bars) hash.update(`${symbol}|${bar.time}|${bar.open}|${bar.high}|${bar.low}|${bar.close}|${bar.volume}\n`);
  return hash.digest("hex");
}
