export type Market = "TW" | "US";
export type AssetType = "stock" | "etf" | "cash";
export type Currency = "TWD" | "USD";

export interface Holding {
  id: string;
  symbol: string;
  name: string;
  market: Market;
  type: AssetType;
  quantity: number;
  price: number;
  averageCost: number;
  currency: Currency;
  sector: string;
}

export interface ResearchStock {
  symbol: string;
  name: string;
  sector: string;
  revenueYoY: [number, number, number];
  grossMargin: [number, number, number];
  foreign10d: number;
  trust10d: number;
  pe: number;
  pb: number;
  statusNote: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  symbol: string;
  title: string;
  thesis: string;
  invalidation: string;
}

export interface AppState {
  holdings: Holding[];
  journal: JournalEntry[];
  usdTwd: number;
}
