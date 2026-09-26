import type { AppState, ResearchStock } from "./types";

export const demoState: AppState = {
  usdTwd: 31.8,
  holdings: [
    { id: "h1", symbol: "2330", name: "台積電", market: "TW", type: "stock", quantity: 8, price: 1210, averageCost: 1035, currency: "TWD", sector: "半導體" },
    { id: "h2", symbol: "009816", name: "台灣TOP50", market: "TW", type: "etf", quantity: 900, price: 11.8, averageCost: 10.9, currency: "TWD", sector: "台灣大型股" },
    { id: "h3", symbol: "QQQM", name: "Invesco NASDAQ 100 ETF", market: "US", type: "etf", quantity: 1.25, price: 305, averageCost: 278, currency: "USD", sector: "美國科技" },
    { id: "h4", symbol: "NVDA", name: "NVIDIA", market: "US", type: "stock", quantity: 1.5, price: 192, averageCost: 171, currency: "USD", sector: "半導體" },
    { id: "h5", symbol: "CASH-TWD", name: "台幣現金", market: "TW", type: "cash", quantity: 1, price: 18000, averageCost: 18000, currency: "TWD", sector: "現金" }
  ],
  etfCompositions: [],
  journal: [
    {
      id: "j1",
      date: "2026-09-20",
      symbol: "009816",
      title: "台股核心部位",
      thesis: "作為台股長期核心配置，降低單押個股的決策頻率。",
      invalidation: "追蹤方法或成分規則出現重大改變時重新評估。"
    }
  ],
  activities: [
    { id: "a1", date: "2026-04-01", type: "deposit", symbol: "", amount: 45000, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "初始投入" },
    { id: "a2", date: "2026-07-01", type: "deposit", symbol: "", amount: 6000, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "定期投入" },
    { id: "a3", date: "2026-09-10", type: "dividend", symbol: "2330", amount: 120, currency: "TWD", fxRate: 1, quantity: 0, price: 0, note: "示範股息" }
  ],
  snapshots: [
    { date: "2026-09-22", total: 55320, cost: 51100, gain: 4220, usdTwd: 31.7 },
    { date: "2026-09-23", total: 56140, cost: 51100, gain: 5040, usdTwd: 31.72 },
    { date: "2026-09-24", total: 56880, cost: 51100, gain: 5780, usdTwd: 31.75 },
    { date: "2026-09-25", total: 57460, cost: 51100, gain: 6360, usdTwd: 31.78 },
    { date: "2026-09-26", total: 58220, cost: 51100, gain: 7120, usdTwd: 31.8 }
  ]
};

export const emptyState: AppState = {
  usdTwd: 31.8,
  holdings: [],
  etfCompositions: [],
  journal: [],
  activities: [],
  snapshots: []
};

export const demoResearch: ResearchStock[] = [
  { symbol: "2330", name: "台積電", sector: "半導體", revenueYoY: [31.2, 35.8, 39.4], grossMargin: [57.8, 58.6, 59.7], foreign10d: 12450, trust10d: 920, pe: 24.8, pb: 8.3, statusNote: "示範資料：營收與毛利趨勢皆改善。" },
  { symbol: "3017", name: "奇鋐", sector: "AI散熱", revenueYoY: [27.4, 34.2, 41.7], grossMargin: [25.1, 26.7, 28.2], foreign10d: 3180, trust10d: 760, pe: 29.1, pb: 9.1, statusNote: "示範資料：符合成長與雙法人條件。" },
  { symbol: "2454", name: "聯發科", sector: "IC設計", revenueYoY: [18.8, 22.4, 24.1], grossMargin: [48.2, 47.9, 48.5], foreign10d: 5400, trust10d: -120, pe: 22.4, pb: 5.7, statusNote: "示範資料：部分條件未通過。" },
  { symbol: "3037", name: "欣興", sector: "PCB", revenueYoY: [24.6, 27.1, 33.5], grossMargin: [18.2, 20.1, 22.9], foreign10d: 2880, trust10d: 410, pe: 31.6, pb: 4.8, statusNote: "示範資料：符合內建掃描規則。" },
  { symbol: "2890", name: "永豐金", sector: "金融", revenueYoY: [12.4, 15.1, 11.8], grossMargin: [0, 0, 0], foreign10d: 8220, trust10d: 510, pe: 14.2, pb: 1.6, statusNote: "示範資料：金融業不適用製造業毛利率條件。" }
];
