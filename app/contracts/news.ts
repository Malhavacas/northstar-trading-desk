import { z } from "zod";

export const NEWS_SYMBOLS = [
  "SPY", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AMD", "AVGO", "JPM", "XOM",
  "TSLA", "NFLX", "PLTR", "COIN", "MSTR", "HOOD", "SMCI", "MU", "INTC", "CRM", "ORCL", "UBER", "SHOP", "SOFI",
] as const;

export const NEWS_CATEGORIES = [
  "EARNINGS", "GUIDANCE", "ANALYST", "M_AND_A", "CAPITAL_RAISE",
  "LEGAL_REGULATORY", "PRODUCT_CONTRACT", "MACRO", "OTHER",
] as const;

export type NewsProvider = "ALPACA_NEWS" | "X";
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
export type NewsSourceState = "AVAILABLE" | "UNCONFIGURED" | "ERROR" | "STALE" | "EMPTY";
export type NewsRecordStatus = "ACTIVE" | "UPDATED" | "REMOVED";

export interface NewsSourceStatus {
  provider: NewsProvider;
  configured: boolean;
  state: NewsSourceState;
  readOnly: boolean;
  historicalScope: string;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  storedEvents: number;
  suppressedEvents: number;
  lastReceived: number;
  lastError: string | null;
  message: string;
}

export interface NewsEventView {
  id: number;
  provider: NewsProvider;
  providerEventId: string;
  source: string;
  author: string | null;
  headline: string;
  summary: string | null;
  url: string | null;
  symbols: string[];
  category: NewsCategory;
  status: Exclude<NewsRecordStatus, "REMOVED">;
  publishedAt: Date;
  sourceUpdatedAt: Date | null;
  firstSeenAt: Date;
  receivedAt: Date;
  lastVerifiedAt: Date | null;
  contentVersion: number;
  payloadHash: string;
}

export interface NewsOverview {
  generatedAt: Date;
  sources: NewsSourceStatus[];
  events: NewsEventView[];
  research: {
    status: "IN_PROGRESS" | "COMPLETE";
    title: string;
    summary: string;
    holdoutIntact: boolean;
    xIncludedInBacktest: false;
    notes: string[];
  };
}

export interface NormalizedNewsEvent {
  provider: NewsProvider;
  providerEventId: string;
  source: string;
  author: string | null;
  headline: string;
  summary: string | null;
  url: string | null;
  symbols: string[];
  category: NewsCategory;
  publishedAt: Date;
  sourceUpdatedAt: Date | null;
  firstSeenAt: Date;
  receivedAt: Date;
  payloadHash: string;
  payload: Record<string, unknown>;
}

export interface IngestionSummary {
  provider: NewsProvider;
  state: "SUCCESS" | "UNCONFIGURED" | "ERROR";
  pages: number;
  received: number;
  inserted: number;
  updated: number;
  unchanged: number;
  removed: number;
  message: string;
}

export const newsSyncInputSchema = z.object({
  provider: z.enum(["ALPACA_NEWS", "X", "ALL"]).default("ALL"),
});

export const newsListInputSchema = z.object({
  provider: z.enum(["ALPACA_NEWS", "X", "ALL"]).default("ALL"),
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z]{1,6}$/).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export function classifyNewsHeadline(headline: string): NewsCategory {
  const value = headline.toLowerCase();
  if (/\b(earnings|eps|revenue|quarterly results|q[1-4] results|profit|loss per share)\b/.test(value)) return "EARNINGS";
  if (/\b(guidance|outlook|forecast|raises? full.year|cuts? full.year|withdraws? guidance)\b/.test(value)) return "GUIDANCE";
  if (/\b(upgrade|downgrade|price target|overweight|underweight|buy rating|sell rating|analyst)\b/.test(value)) return "ANALYST";
  if (/\b(acquisition|acquire|merger|takeover|buyout|to buy|to sell.*business|spin.off)\b/.test(value)) return "M_AND_A";
  if (/\b(public offering|secondary offering|stock offering|share sale|capital raise|convertible notes|debt offering)\b/.test(value)) return "CAPITAL_RAISE";
  if (/\b(sec |doj |fda |ftc |lawsuit|investigation|regulatory|court|settlement|fraud|subpoena|ban )\b/.test(value)) return "LEGAL_REGULATORY";
  if (/\b(contract|partnership|partners with|launch|unveil|approv|deal with|agreement|new product)\b/.test(value)) return "PRODUCT_CONTRACT";
  if (/\b(federal reserve|fed |cpi|inflation|jobs report|treasury|tariff|election|gdp|interest rate)\b/.test(value)) return "MACRO";
  return "OTHER";
}
