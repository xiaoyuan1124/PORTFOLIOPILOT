import { z } from "zod";
import { isExternalActivityType, isTradeActivityType, normalizeActivitySecurityFields } from "./activity-data";

export const ETF_WEIGHT_EPSILON = 1e-6;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDateKey(value: string) {
  if (!DATE_KEY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === (month ?? 1) - 1 &&
    date.getUTCDate() === day;
}

export const dateKeySchema = z.string().trim()
  .regex(DATE_KEY_PATTERN, "日期必須使用 YYYY-MM-DD 格式。")
  .refine(isCalendarDateKey, "日期不是有效的曆日。");

export const holdingSchema = z.object({
  id: z.string().min(1),
  symbol: z.string().min(1).max(32),
  name: z.string().min(1).max(160),
  market: z.enum(["TW", "US"]),
  type: z.enum(["stock", "etf", "cash"]),
  quantity: z.number().finite().positive("持股數量必須大於 0。"),
  price: z.number().finite().nonnegative("目前價格／現金餘額不可小於 0。"),
  averageCost: z.number().finite().nonnegative(),
  currency: z.enum(["TWD", "USD"]),
  sector: z.string().min(1).max(120),
  account: z.string().trim().min(1).max(120).optional(),
  priceSource: z.enum(["manual", "TWSE", "TPEx"]).optional(),
  priceAsOf: dateKeySchema.optional()
}).superRefine((holding, ctx) => {
  if (holding.type !== "cash" && holding.price <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["price"],
      message: "股票／ETF 目前價格必須大於 0。"
    });
  }

  if (holding.type !== "cash" && holding.averageCost <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["averageCost"],
      message: "股票／ETF 平均成本必須大於 0。"
    });
  }

  if ((holding.market === "TW" && holding.currency !== "TWD") ||
      (holding.market === "US" && holding.currency !== "USD")) {
    ctx.addIssue({
      code: "custom",
      path: ["currency"],
      message: "持股市場與幣別不一致，可能造成資產換匯錯誤。"
    });
  }

  if (holding.type === "cash" && (holding.priceSource !== undefined || holding.priceAsOf !== undefined)) {
    ctx.addIssue({
      code: "custom",
      path: ["priceSource"],
      message: "現金不可附帶證券市場價格來源或資料日。"
    });
  }

  if ((holding.priceSource === "TWSE" || holding.priceSource === "TPEx") && holding.market !== "TW") {
    ctx.addIssue({
      code: "custom",
      path: ["priceSource"],
      message: "TWSE／TPEx 價格來源只能套用於台灣持股。"
    });
  }

  if ((holding.priceSource === "TWSE" || holding.priceSource === "TPEx") && !holding.priceAsOf) {
    ctx.addIssue({
      code: "custom",
      path: ["priceAsOf"],
      message: "官方價格來源必須同時保留資料日。"
    });
  }

  if (holding.priceAsOf && !holding.priceSource) {
    ctx.addIssue({
      code: "custom",
      path: ["priceSource"],
      message: "價格資料日不可缺少對應來源。"
    });
  }
});

export const inventoryImpactSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("trade"),
    holdingId: z.string().min(1),
    before: holdingSchema.nullable(),
    after: holdingSchema.nullable(),
    fee: z.number().finite().nonnegative(),
    tax: z.number().finite().nonnegative(),
    realizedPnl: z.number().finite(),
    method: z.literal("average_cost")
  }),
  z.object({
    kind: z.literal("corporate_action"),
    holdingId: z.string().min(1),
    before: holdingSchema,
    after: holdingSchema,
    action: z.literal("share_adjustment"),
    ratio: z.number().finite().positive()
  })
]);

export const cashImpactSchema = z.object({
  cashHoldingId: z.string().min(1),
  before: holdingSchema,
  after: holdingSchema,
  delta: z.number().finite().refine((value) => Math.abs(value) > 1e-12, "現金異動不可為 0。"),
  reason: z.enum(["trade", "deposit", "withdrawal", "dividend", "fee"])
});

export const etfConstituentSchema = z.object({
  market: z.enum(["TW", "US"]),
  symbol: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  weightPct: z.number().finite().positive().max(100),
  sector: z.string().trim().min(1).max(120)
});

export const etfCompositionSchema = z.object({
  id: z.string().min(1),
  etfMarket: z.enum(["TW", "US"]),
  etfSymbol: z.string().trim().min(1).max(32),
  etfName: z.string().trim().min(1).max(160),
  asOf: dateKeySchema,
  sourceName: z.string().trim().min(1).max(240),
  sourceUrl: z.string().url(),
  sourceType: z.enum(["user_import", "official_issuer", "official_exchange"]),
  constituents: z.array(etfConstituentSchema).min(1)
}).superRefine((composition, ctx) => {
  const totalWeight = composition.constituents.reduce((sum, item) => sum + item.weightPct, 0);
  if (totalWeight > 100 + ETF_WEIGHT_EPSILON) {
    ctx.addIssue({
      code: "custom",
      path: ["constituents"],
      message: `成分權重合計為 ${totalWeight.toFixed(2)}%，不可超過 100%。`
    });
  }
});

export const journalEntrySchema = z.object({
  id: z.string().min(1),
  date: dateKeySchema,
  symbol: z.string(),
  title: z.string().min(1).max(200),
  thesis: z.string(),
  invalidation: z.string()
});

export const activitySchema = z.object({
  id: z.string().min(1),
  date: dateKeySchema,
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  type: z.enum(["deposit", "withdrawal", "buy", "sell", "dividend", "fee", "corporate_action"]),
  symbol: z.string(),
  amount: z.number().finite().nonnegative(),
  currency: z.enum(["TWD", "USD"]),
  fxRate: z.number().finite().positive(),
  quantity: z.number().finite().nonnegative(),
  price: z.number().finite().nonnegative(),
  note: z.string(),
  account: z.string().trim().min(1).max(120).optional(),
  preFlowValueTwd: z.number().finite().nonnegative().optional(),
  preFlowValueSource: z.enum(["system_current_state", "manual"]).optional(),
  inventoryImpact: inventoryImpactSchema.optional(),
  cashImpact: cashImpactSchema.optional()
}).superRefine((activity, ctx) => {
  if (activity.type !== "corporate_action" && activity.amount <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["amount"],
      message: "交易／現金流金額必須大於 0。"
    });
  }

  if (activity.type === "corporate_action" && activity.amount !== 0) {
    ctx.addIssue({
      code: "custom",
      path: ["amount"],
      message: "非現金股數調整不可帶入現金金額。"
    });
  }

  if ((isTradeActivityType(activity.type) || activity.type === "corporate_action") && !activity.symbol.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["symbol"],
      message: "買進／賣出紀錄必須包含股票代號。"
    });
  }

  if (activity.preFlowValueTwd !== undefined && !isExternalActivityType(activity.type)) {
    ctx.addIssue({
      code: "custom",
      path: ["preFlowValueTwd"],
      message: "TWR 邊界估值只適用於入金或出金。"
    });
  }

  if (activity.preFlowValueSource !== undefined && !isExternalActivityType(activity.type)) {
    ctx.addIssue({
      code: "custom",
      path: ["preFlowValueSource"],
      message: "TWR 邊界來源只適用於入金或出金。"
    });
  }

  if (activity.preFlowValueSource !== undefined && activity.preFlowValueTwd === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["preFlowValueSource"],
      message: "TWR 邊界來源不可缺少對應的邊界估值。"
    });
  }

  if (activity.preFlowValueSource === "system_current_state") {
    if (!activity.time) {
      ctx.addIssue({
        code: "custom",
        path: ["time"],
        message: "系統擷取的 TWR 邊界必須保留事件時間。"
      });
    }
    if (!activity.cashImpact) {
      ctx.addIssue({
        code: "custom",
        path: ["cashImpact"],
        message: "系統擷取的 TWR 邊界必須來自已連動現金帳戶的事件。"
      });
    }
  }

  if (activity.inventoryImpact?.kind === "trade" && !isTradeActivityType(activity.type)) {
    ctx.addIssue({
      code: "custom",
      path: ["inventoryImpact"],
      message: "交易持股連動資訊只能附在買進／賣出交易。"
    });
  }

  if (activity.inventoryImpact?.kind === "corporate_action" && activity.type !== "corporate_action") {
    ctx.addIssue({
      code: "custom",
      path: ["inventoryImpact"],
      message: "股數調整持股連動資訊只能附在 corporate action。"
    });
  }

  if (activity.type === "corporate_action" && activity.inventoryImpact?.kind !== "corporate_action") {
    ctx.addIssue({
      code: "custom",
      path: ["inventoryImpact"],
      message: "股數調整必須保留可回滾的持股連動快照。"
    });
  }

  if (activity.inventoryImpact) {
    const impact = activity.inventoryImpact;
    const anchor = impact.before ?? impact.after;
    const activityAccount = (activity.account?.trim() || "預設帳戶").toLowerCase();

    if (!anchor) {
      ctx.addIssue({
        code: "custom",
        path: ["inventoryImpact"],
        message: "持股連動交易至少需要 before 或 after 快照。"
      });
    } else {
      const expectedSymbol = anchor.symbol.trim().toUpperCase();
      const expectedAccount = (anchor.account?.trim() || "預設帳戶").toLowerCase();

      if ((impact.before && impact.before.id !== impact.holdingId) ||
          (impact.after && impact.after.id !== impact.holdingId)) {
        ctx.addIssue({
          code: "custom",
          path: ["inventoryImpact", "holdingId"],
          message: "持股連動快照的部位 ID 不一致。"
        });
      }
      if (activity.symbol.trim().toUpperCase() !== expectedSymbol) {
        ctx.addIssue({
          code: "custom",
          path: ["symbol"],
          message: "交易代號與持股連動快照不一致。"
        });
      }
      if (activity.currency !== anchor.currency || activityAccount !== expectedAccount) {
        ctx.addIssue({
          code: "custom",
          path: ["inventoryImpact"],
          message: "交易幣別或帳戶與持股連動快照不一致。"
        });
      }
    }

    if (impact.kind === "trade") {
      if (activity.type === "sell" && impact.before === null) {
        ctx.addIssue({
          code: "custom",
          path: ["inventoryImpact", "before"],
          message: "賣出交易不可從不存在的持股開始。"
        });
      }
      if (impact.before === null && (activity.type !== "buy" || impact.after === null)) {
        ctx.addIssue({
          code: "custom",
          path: ["inventoryImpact"],
          message: "首次建倉只能由買進建立新的 after 持股。"
        });
      }
    }
  }

  if (activity.cashImpact) {
    const cash = activity.cashImpact;
    const expectedDeltaSign =
      activity.type === "deposit" || activity.type === "dividend" || activity.type === "sell"
        ? 1
        : activity.type === "withdrawal" || activity.type === "fee" || activity.type === "buy"
          ? -1
          : 0;

    if (cash.before.type !== "cash" || cash.after.type !== "cash") {
      ctx.addIssue({
        code: "custom",
        path: ["cashImpact"],
        message: "現金連動快照只能指向現金部位。"
      });
    }
    if (cash.before.id !== cash.cashHoldingId || cash.after.id !== cash.cashHoldingId) {
      ctx.addIssue({
        code: "custom",
        path: ["cashImpact", "cashHoldingId"],
        message: "現金連動快照的部位 ID 不一致。"
      });
    }
    if (activity.currency !== cash.before.currency) {
      ctx.addIssue({
        code: "custom",
        path: ["cashImpact"],
        message: "活動幣別與現金帳戶幣別不一致。"
      });
    }
    if (expectedDeltaSign === 0 || Math.sign(cash.delta) !== expectedDeltaSign) {
      ctx.addIssue({
        code: "custom",
        path: ["cashImpact", "delta"],
        message: "現金異動方向與活動類型不一致。"
      });
    }
    if (Math.abs(Math.abs(cash.delta) - activity.amount) > 1e-8) {
      ctx.addIssue({
        code: "custom",
        path: ["cashImpact", "delta"],
        message: "活動金額與現金異動金額不一致。"
      });
    }

    const beforeNormalized =
      Math.abs(cash.before.quantity - 1) <= 1e-9 &&
      Math.abs(cash.before.averageCost - cash.before.price) <= 1e-8;
    const afterNormalized =
      Math.abs(cash.after.quantity - 1) <= 1e-9 &&
      Math.abs(cash.after.averageCost - cash.after.price) <= 1e-8;
    if (!beforeNormalized || !afterNormalized) {
      ctx.addIssue({
        code: "custom",
        path: ["cashImpact"],
        message: "現金連動快照必須以 1 × 餘額的標準格式保存。"
      });
    }

    const expectedBalance = cash.before.price + cash.delta;
    if (expectedBalance < -1e-8) {
      ctx.addIssue({
        code: "custom",
        path: ["cashImpact", "delta"],
        message: "現金連動不可產生負餘額。"
      });
    } else {
      const normalizedExpected = expectedBalance <= 1e-8 ? 0 : expectedBalance;
      if (
        Math.abs(cash.after.price - normalizedExpected) > 1e-8 ||
        Math.abs(cash.after.averageCost - normalizedExpected) > 1e-8
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["cashImpact", "after"],
          message: "現金 after 快照必須等於 before 餘額加上本次 delta。"
        });
      }
    }

    if (isTradeActivityType(activity.type) && activity.inventoryImpact?.kind !== "trade") {
      ctx.addIssue({
        code: "custom",
        path: ["inventoryImpact"],
        message: "有現金連動的新式買進／賣出必須同時保留證券持股快照。"
      });
    }

    const expectedReason = isTradeActivityType(activity.type) ? "trade" : activity.type;
    if (cash.reason !== expectedReason) {
      ctx.addIssue({
        code: "custom",
        path: ["cashImpact", "reason"],
        message: "現金連動原因與活動類型不一致。"
      });
    }
  }

  if (activity.type === "corporate_action" && activity.cashImpact) {
    ctx.addIssue({
      code: "custom",
      path: ["cashImpact"],
      message: "非現金股數調整不可附帶現金連動。"
    });
  }
}).transform((activity) => {
  const normalized = {
    ...activity,
    fxRate: activity.currency === "TWD" ? 1 : activity.fxRate,
    ...normalizeActivitySecurityFields(activity.type, activity.symbol, activity.quantity, activity.price)
  };

  if (!isExternalActivityType(activity.type)) {
    delete normalized.time;
    delete normalized.preFlowValueTwd;
    delete normalized.preFlowValueSource;
  }

  return normalized;
});

export const snapshotSchema = z.object({
  date: dateKeySchema,
  total: z.number().finite().nonnegative(),
  cost: z.number().finite().nonnegative(),
  gain: z.number().finite(),
  usdTwd: z.number().finite().positive()
});

export const allocationTargetSchema = z.object({
  key: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  targetPct: z.number().finite().positive("目標配置必須大於 0。").max(100)
});

function duplicateIndexes<T>(items: T[], keyOf: (item: T) => string) {
  const seen = new Set<string>();
  const duplicates: number[] = [];

  items.forEach((item, index) => {
    const key = keyOf(item);
    if (seen.has(key)) duplicates.push(index);
    else seen.add(key);
  });

  return duplicates;
}

function normalizedAccountKey(account?: string) {
  return (account?.trim() || "預設帳戶").toLowerCase();
}

export const appStateSchema = z.object({
  holdings: z.array(holdingSchema),
  etfCompositions: z.array(etfCompositionSchema).default([]),
  journal: z.array(journalEntrySchema),
  activities: z.array(activitySchema).default([]),
  snapshots: z.array(snapshotSchema).default([]),
  allocationTargets: z.array(allocationTargetSchema).default([]),
  usdTwd: z.number().finite().positive(),
  dataMode: z.enum(["personal", "demo"]).default("personal")
}).superRefine((state, ctx) => {
  for (const index of duplicateIndexes(
    state.holdings,
    (holding) => `${holding.market}:${holding.symbol.trim().toUpperCase()}:${normalizedAccountKey(holding.account)}`
  )) {
    ctx.addIssue({
      code: "custom",
      path: ["holdings", index],
      message: "同一市場、代號與帳戶不可重複建立持股。"
    });
  }

  for (const index of duplicateIndexes(state.holdings, (item) => item.id)) {
    ctx.addIssue({
      code: "custom",
      path: ["holdings", index, "id"],
      message: "同一類型資料不可使用重複 ID。"
    });
  }

  for (const index of duplicateIndexes(state.etfCompositions, (item) => item.id)) {
    ctx.addIssue({
      code: "custom",
      path: ["etfCompositions", index, "id"],
      message: "同一類型資料不可使用重複 ID。"
    });
  }

  for (const index of duplicateIndexes(state.journal, (item) => item.id)) {
    ctx.addIssue({
      code: "custom",
      path: ["journal", index, "id"],
      message: "同一類型資料不可使用重複 ID。"
    });
  }

  for (const index of duplicateIndexes(state.activities, (item) => item.id)) {
    ctx.addIssue({
      code: "custom",
      path: ["activities", index, "id"],
      message: "同一類型資料不可使用重複 ID。"
    });
  }

  for (const index of duplicateIndexes(
    state.etfCompositions,
    (composition) => `${composition.etfMarket}:${composition.etfSymbol.trim().toUpperCase()}`
  )) {
    ctx.addIssue({
      code: "custom",
      path: ["etfCompositions", index],
      message: "同一市場與 ETF 代號只能保留一份成分資料。"
    });
  }

  for (const index of duplicateIndexes(state.snapshots, (snapshot) => snapshot.date)) {
    ctx.addIssue({
      code: "custom",
      path: ["snapshots", index, "date"],
      message: "同一天只能有一筆淨值快照。"
    });
  }

  for (const index of duplicateIndexes(state.allocationTargets, (target) => target.key.toLowerCase())) {
    ctx.addIssue({
      code: "custom",
      path: ["allocationTargets", index, "key"],
      message: "同一個配置目標不可重複。"
    });
  }

  if (state.allocationTargets.length) {
    const total = state.allocationTargets.reduce((sum, target) => sum + target.targetPct, 0);
    if (Math.abs(total - 100) > 0.05) {
      ctx.addIssue({
        code: "custom",
        path: ["allocationTargets"],
        message: "配置目標合計必須為 100%。"
      });
    }
  }
});

export const backupSchema = z.union([
  z.object({
    version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10)]),
    exportedAt: z.string(),
    state: appStateSchema
  }).transform((value) => value.state),
  appStateSchema
]);

export const holdingCsvRowSchema = z.object({
  symbol: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(160),
  market: z.enum(["TW", "US"]),
  type: z.enum(["stock", "etf", "cash"]),
  quantity: z.coerce.number().finite().positive("持股數量必須大於 0。"),
  price: z.coerce.number().finite().nonnegative("目前價格／現金餘額不可小於 0。"),
  averageCost: z.coerce.number().finite().nonnegative(),
  currency: z.enum(["TWD", "USD"]),
  sector: z.string().trim().min(1).max(120),
  account: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).max(120).optional()
  )
}).superRefine((holding, ctx) => {
  if (holding.type !== "cash" && holding.price <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["price"],
      message: "股票／ETF 目前價格必須大於 0。"
    });
  }

  if (holding.type !== "cash" && holding.averageCost <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["averageCost"],
      message: "股票／ETF 平均成本必須大於 0。"
    });
  }

  if ((holding.market === "TW" && holding.currency !== "TWD") ||
      (holding.market === "US" && holding.currency !== "USD")) {
    ctx.addIssue({
      code: "custom",
      path: ["currency"],
      message: "持股市場與幣別不一致，可能造成資產換匯錯誤。"
    });
  }
});

export const etfCompositionCsvRowSchema = z.object({
  etfMarket: z.enum(["TW", "US"]),
  etfSymbol: z.string().trim().min(1).max(32),
  etfName: z.string().trim().min(1).max(160),
  asOf: dateKeySchema,
  sourceName: z.string().trim().min(1).max(240),
  sourceUrl: z.string().trim().url(),
  componentMarket: z.enum(["TW", "US"]),
  componentSymbol: z.string().trim().min(1).max(32),
  componentName: z.string().trim().min(1).max(160),
  weightPct: z.coerce.number().finite().positive().max(100),
  sector: z.string().trim().min(1).max(120)
});
