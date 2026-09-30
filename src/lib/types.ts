export type Market = "TW" | "US";
export type AssetType = "stock" | "etf" | "cash";
export type Currency = "TWD" | "USD";
export type ActivityType = "deposit" | "withdrawal" | "buy" | "sell" | "dividend" | "fee" | "corporate_action";
export type PriceSource = "manual" | "TWSE" | "TPEx";
export type EtfCompositionSourceType = "user_import" | "official_issuer" | "official_exchange";
export type DataMode = "personal" | "demo";

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
  account?: string;
  priceSource?: PriceSource;
  priceAsOf?: string;
}

export interface EtfConstituent {
  market: Market;
  symbol: string;
  name: string;
  weightPct: number;
  sector: string;
}

export interface EtfComposition {
  id: string;
  etfMarket: Market;
  etfSymbol: string;
  etfName: string;
  asOf: string;
  sourceName: string;
  sourceUrl: string;
  sourceType: EtfCompositionSourceType;
  constituents: EtfConstituent[];
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

export type InventoryImpact =
  | {
      kind: "trade";
      holdingId: string;
      before: Holding;
      after: Holding | null;
      fee: number;
      tax: number;
      realizedPnl: number;
      method: "average_cost";
    }
  | {
      kind: "corporate_action";
      holdingId: string;
      before: Holding;
      after: Holding;
      action: "share_adjustment";
      ratio: number;
    };

export interface CashImpact {
  cashHoldingId: string;
  before: Holding;
  after: Holding;
  delta: number;
  reason: "trade" | "deposit" | "withdrawal" | "dividend" | "fee";
}

export interface PortfolioActivity {
  id: string;
  date: string;
  time?: string;
  type: ActivityType;
  symbol: string;
  amount: number;
  currency: Currency;
  fxRate: number;
  quantity: number;
  price: number;
  note: string;
  account?: string;
  preFlowValueTwd?: number;
  inventoryImpact?: InventoryImpact;
  cashImpact?: CashImpact;
}

export interface NetWorthSnapshot {
  date: string;
  total: number;
  cost: number;
  gain: number;
  usdTwd: number;
}

export interface AllocationTarget {
  key: string;
  label: string;
  targetPct: number;
}

export interface AppState {
  holdings: Holding[];
  etfCompositions: EtfComposition[];
  journal: JournalEntry[];
  activities: PortfolioActivity[];
  snapshots: NetWorthSnapshot[];
  allocationTargets?: AllocationTarget[];
  usdTwd: number;
  dataMode?: DataMode;
}
