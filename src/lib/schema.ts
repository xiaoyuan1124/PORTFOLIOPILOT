import { z } from "zod";
import { isCashFxActivityType, isExternalActivityType, isPositionTransferActivityType, isTradeActivityType, normalizeActivitySecurityFields } from "./activity-data";

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

export const cashTransferImpactSchema = z.object({
  fromCashHoldingId: z.string().min(1),
  toCashHoldingId: z.string().min(1),
  fromBefore: holdingSchema,
  fromAfter: holdingSchema,
  toBefore: holdingSchema,
  toAfter: holdingSchema,
  amount: z.number().finite().positive()
});

export const cashFxImpactSchema = z.object({
  fromCashHoldingId: z.string().min(1),
  toCashHoldingId: z.string().min(1),
  fromBefore: holdingSchema,
  fromAfter: holdingSchema,
  toBefore: holdingSchema,
  toAfter: holdingSchema,
  fromAmount: z.number().finite().positive(),
  toAmount: z.number().finite().positive(),
  executionTwdPerUsd: z.number().finite().positive(),
  valuationTwdPerUsd: z.number().finite().positive()
});

export const positionTransferImpactSchema = z.object({
  sourceHoldingId: z.string().min(1),
  destinationHoldingId: z.string().min(1),
  sourceBefore: holdingSchema,
  sourceAfter: holdingSchema.nullable(),
  destinationBefore: holdingSchema.nullable(),
  destinationAfter: holdingSchema,
  quantity: z.number().finite().positive()
});

export const historicalTradeSchema = z.object({
  mode: z.literal("ledger_only"),
  market: z.enum(["TW", "US"]),
  fee: z.number().finite().nonnegative(),
  tax: z.number().finite().nonnegative()
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
  type: z.enum(["deposit", "withdrawal", "buy", "sell", "dividend", "fee", "transfer", "fx_conversion", "position_transfer", "corporate_action"]),
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
  cashImpact: cashImpactSchema.optional(),
  cashTransferImpact: cashTransferImpactSchema.optional(),
  cashFxImpact: cashFxImpactSchema.optional(),
  positionTransferImpact: positionTransferImpactSchema.optional(),
  historicalTrade: historicalTradeSchema.optional()
}).superRefine((activity, ctx) => {
  const zeroAmountInternal =
    activity.type === "corporate_action" ||
    isPositionTransferActivityType(activity.type);

  if (!zeroAmountInternal && activity.amount <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["amount"],
      message: "交易／現金流金額必須大於 0。"
    });
  }

  if (zeroAmountInternal && activity.amount !== 0) {
    ctx.addIssue({
      code: "custom",
      path: ["amount"],
      message: "非現金庫存事件不可帶入現金金額。"
    });
  }

  if ((isTradeActivityType(activity.type) || activity.type === "corporate_action" || isPositionTransferActivityType(activity.type)) && !activity.symbol.trim()) {
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

  if (activity.historicalTrade && !isTradeActivityType(activity.type)) {
    ctx.addIssue({
      code: "custom",
      path: ["historicalTrade"],
      message: "歷史買賣 metadata 只能附在買進／賣出紀錄。"
    });
  }

  if (activity.historicalTrade) {
    const historical = activity.historicalTrade;
    if (
      activity.inventoryImpact ||
      activity.cashImpact ||
      activity.cashTransferImpact ||
      activity.cashFxImpact ||
      activity.positionTransferImpact
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["historicalTrade"],
        message: "Ledger-only 歷史買賣不可附帶目前持股、現金、轉帳或換匯快照。"
      });
    }

    if (!activity.account?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["account"],
        message: "歷史買賣必須保存交易帳戶。"
      });
    }

    const expectedCurrency = historical.market === "TW" ? "TWD" : "USD";
    if (activity.currency !== expectedCurrency) {
      ctx.addIssue({
        code: "custom",
        path: ["currency"],
        message: "歷史買賣市場與交易幣別不一致。"
      });
    }
    if (historical.market === "TW" && Math.abs(activity.fxRate - 1) > 1e-12) {
      ctx.addIssue({
        code: "custom",
        path: ["fxRate"],
        message: "台股歷史買賣的 TWD 匯率必須為 1。"
      });
    }
    if (activity.quantity <= 0 || activity.price <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "歷史買賣必須保存正數成交數量與成交價。"
      });
    }

    const gross = activity.quantity * activity.price;
    const expectedAmount = activity.type === "buy"
      ? gross + historical.fee + historical.tax
      : gross - historical.fee - historical.tax;
    if (
      expectedAmount <= 0 ||
      Math.abs(activity.amount - expectedAmount) > 1e-8 * Math.max(1, Math.abs(expectedAmount))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "歷史買賣金額必須與成交數量、成交價、手續費與交易稅一致。"
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

  if (activity.type === "transfer" && !activity.cashTransferImpact) {
    ctx.addIssue({
      code: "custom",
      path: ["cashTransferImpact"],
      message: "內部現金轉帳必須保留轉出與轉入帳戶的前後快照。"
    });
  }

  if (activity.type !== "transfer" && activity.cashTransferImpact) {
    ctx.addIssue({
      code: "custom",
      path: ["cashTransferImpact"],
      message: "只有內部現金轉帳可以附帶雙現金帳戶快照。"
    });
  }

  if (activity.type === "transfer" && (activity.cashImpact || activity.inventoryImpact)) {
    ctx.addIssue({
      code: "custom",
      path: ["cashTransferImpact"],
      message: "內部現金轉帳不可同時附帶單一現金或證券持股連動。"
    });
  }

  if (activity.cashTransferImpact) {
    const transfer = activity.cashTransferImpact;
    const snapshots = [transfer.fromBefore, transfer.fromAfter, transfer.toBefore, transfer.toAfter];
    const normalized = snapshots.every((cash) =>
      cash.type === "cash" &&
      Math.abs(cash.quantity - 1) <= 1e-9 &&
      Math.abs(cash.averageCost - cash.price) <= 1e-8
    );

    if (transfer.fromCashHoldingId === transfer.toCashHoldingId) {
      ctx.addIssue({
        code: "custom",
        path: ["cashTransferImpact"],
        message: "內部轉帳的轉出與轉入現金帳戶不可相同。"
      });
    }
    if (
      transfer.fromBefore.id !== transfer.fromCashHoldingId ||
      transfer.fromAfter.id !== transfer.fromCashHoldingId ||
      transfer.toBefore.id !== transfer.toCashHoldingId ||
      transfer.toAfter.id !== transfer.toCashHoldingId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cashTransferImpact"],
        message: "內部轉帳快照的現金帳戶 ID 不一致。"
      });
    }
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        path: ["cashTransferImpact"],
        message: "內部轉帳現金快照必須使用 1 × 餘額的標準格式。"
      });
    }

    const currency = transfer.fromBefore.currency;
    if (
      transfer.fromAfter.currency !== currency ||
      transfer.toBefore.currency !== currency ||
      transfer.toAfter.currency !== currency ||
      activity.currency !== currency
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cashTransferImpact"],
        message: "內部轉帳只允許同幣別現金帳戶，且活動幣別必須一致。"
      });
    }
    if (Math.abs(transfer.amount - activity.amount) > 1e-8) {
      ctx.addIssue({
        code: "custom",
        path: ["cashTransferImpact", "amount"],
        message: "內部轉帳活動金額與快照金額不一致。"
      });
    }

    const expectedFrom = transfer.fromBefore.price - transfer.amount;
    const expectedTo = transfer.toBefore.price + transfer.amount;
    if (
      expectedFrom < -1e-8 ||
      Math.abs(transfer.fromAfter.price - Math.max(0, expectedFrom)) > 1e-8 ||
      Math.abs(transfer.fromAfter.averageCost - Math.max(0, expectedFrom)) > 1e-8
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cashTransferImpact", "fromAfter"],
        message: "內部轉帳的轉出 after 快照與 before－amount 不一致。"
      });
    }
    if (
      Math.abs(transfer.toAfter.price - expectedTo) > 1e-8 ||
      Math.abs(transfer.toAfter.averageCost - expectedTo) > 1e-8
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cashTransferImpact", "toAfter"],
        message: "內部轉帳的轉入 after 快照與 before＋amount 不一致。"
      });
    }

    const activityAccount = (activity.account?.trim() || "預設帳戶").toLowerCase();
    const fromAccount = (transfer.fromBefore.account?.trim() || "預設帳戶").toLowerCase();
    if (activityAccount !== fromAccount) {
      ctx.addIssue({
        code: "custom",
        path: ["account"],
        message: "內部轉帳活動帳戶必須對應轉出現金帳戶。"
      });
    }
  }

  if (activity.type === "position_transfer" && !activity.positionTransferImpact) {
    ctx.addIssue({
      code: "custom",
      path: ["positionTransferImpact"],
      message: "證券帳戶移轉必須保留來源與目的持股的前後快照。"
    });
  }

  if (activity.type !== "position_transfer" && activity.positionTransferImpact) {
    ctx.addIssue({
      code: "custom",
      path: ["positionTransferImpact"],
      message: "只有證券帳戶移轉可以附帶雙持股快照。"
    });
  }

  if (
    activity.type === "position_transfer" &&
    (activity.inventoryImpact || activity.cashImpact || activity.cashTransferImpact || activity.cashFxImpact)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["positionTransferImpact"],
      message: "證券帳戶移轉不可同時附帶買賣、現金轉帳或換匯連動。"
    });
  }

  if (activity.positionTransferImpact) {
    const transfer = activity.positionTransferImpact;
    const source = transfer.sourceBefore;
    const sourceAfter = transfer.sourceAfter;
    const destinationBefore = transfer.destinationBefore;
    const destinationAfter = transfer.destinationAfter;
    const sourceAccount = (source.account?.trim() || "預設帳戶").toLowerCase();
    const destinationAccount = (destinationAfter.account?.trim() || "預設帳戶").toLowerCase();
    const activityAccount = (activity.account?.trim() || "預設帳戶").toLowerCase();
    const sourceSymbol = source.symbol.trim().toUpperCase();

    if (transfer.sourceHoldingId === transfer.destinationHoldingId) {
      ctx.addIssue({
        code: "custom",
        path: ["positionTransferImpact"],
        message: "證券移轉的來源與目的持股 ID 不可相同。"
      });
    }
    if (
      source.id !== transfer.sourceHoldingId ||
      (sourceAfter && sourceAfter.id !== transfer.sourceHoldingId) ||
      (destinationBefore && destinationBefore.id !== transfer.destinationHoldingId) ||
      destinationAfter.id !== transfer.destinationHoldingId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["positionTransferImpact"],
        message: "證券移轉快照的持股 ID 不一致。"
      });
    }

    const snapshots = [source, sourceAfter, destinationBefore, destinationAfter]
      .filter((item): item is typeof source => item !== null);
    if (snapshots.some((item) => item.type === "cash")) {
      ctx.addIssue({
        code: "custom",
        path: ["positionTransferImpact"],
        message: "證券帳戶移轉不可包含現金部位。"
      });
    }
    if (snapshots.some((item) =>
      item.market !== source.market ||
      item.symbol.trim().toUpperCase() !== sourceSymbol ||
      item.type !== source.type ||
      item.currency !== source.currency
    )) {
      ctx.addIssue({
        code: "custom",
        path: ["positionTransferImpact"],
        message: "證券移轉的市場、代號、資產類型與幣別必須一致。"
      });
    }
    if (sourceAccount === destinationAccount) {
      ctx.addIssue({
        code: "custom",
        path: ["positionTransferImpact"],
        message: "證券移轉的來源與目的帳戶不可相同。"
      });
    }
    if (
      activity.symbol.trim().toUpperCase() !== sourceSymbol ||
      activity.currency !== source.currency ||
      activityAccount !== sourceAccount
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["positionTransferImpact"],
        message: "證券移轉活動的代號、幣別或來源帳戶與快照不一致。"
      });
    }
    if (
      Math.abs(activity.quantity - transfer.quantity) > 1e-8 ||
      activity.price !== 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "證券移轉活動必須保存實際移轉股數，且不可帶入成交價。"
      });
    }

    const remaining = source.quantity - transfer.quantity;
    if (remaining < -1e-8) {
      ctx.addIssue({
        code: "custom",
        path: ["positionTransferImpact", "quantity"],
        message: "證券移轉股數不可超過來源持股。"
      });
    } else if (remaining <= 1e-8) {
      if (sourceAfter !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["positionTransferImpact", "sourceAfter"],
          message: "來源持股全數移轉後 sourceAfter 必須為 null。"
        });
      }
    } else if (
      !sourceAfter ||
      Math.abs(sourceAfter.quantity - remaining) > 1e-8 ||
      Math.abs(sourceAfter.averageCost - source.averageCost) > 1e-8 ||
      Math.abs(sourceAfter.price - source.price) > 1e-8 ||
      sourceAfter.priceSource !== source.priceSource ||
      sourceAfter.priceAsOf !== source.priceAsOf ||
      (sourceAfter.account?.trim() || "預設帳戶").toLowerCase() !== sourceAccount
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["positionTransferImpact", "sourceAfter"],
        message: "來源持股 after 快照必須只減少移轉股數並保留成本與價格基準。"
      });
    }

    const destinationBeforeQuantity = destinationBefore?.quantity ?? 0;
    const expectedDestinationQuantity = destinationBeforeQuantity + transfer.quantity;
    const expectedDestinationBasis =
      (destinationBefore ? destinationBefore.quantity * destinationBefore.averageCost : 0) +
      transfer.quantity * source.averageCost;
    const expectedDestinationAverageCost = expectedDestinationBasis / expectedDestinationQuantity;

    if (
      Math.abs(destinationAfter.quantity - expectedDestinationQuantity) > 1e-8 ||
      Math.abs(destinationAfter.averageCost - expectedDestinationAverageCost) > 1e-8
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["positionTransferImpact", "destinationAfter"],
        message: "目的持股 after 快照的股數或加權平均成本不一致。"
      });
    }

    if (destinationBefore) {
      const beforeAccount = (destinationBefore.account?.trim() || "預設帳戶").toLowerCase();
      if (beforeAccount !== destinationAccount) {
        ctx.addIssue({
          code: "custom",
          path: ["positionTransferImpact", "destinationAfter"],
          message: "目的持股帳戶在移轉前後不可改變。"
        });
      }
      if (
        Math.abs(source.price - destinationBefore.price) > 1e-8 ||
        source.priceSource !== destinationBefore.priceSource ||
        source.priceAsOf !== destinationBefore.priceAsOf
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["positionTransferImpact", "destinationBefore"],
          message: "來源與既有目的持股必須使用相同目前價格與價格來源／資料日。"
        });
      }
      if (
        Math.abs(destinationAfter.price - destinationBefore.price) > 1e-8 ||
        destinationAfter.priceSource !== destinationBefore.priceSource ||
        destinationAfter.priceAsOf !== destinationBefore.priceAsOf
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["positionTransferImpact", "destinationAfter"],
          message: "既有目的持股的目前價格與來源不可被帳戶移轉改寫。"
        });
      }
    } else if (
      Math.abs(destinationAfter.price - source.price) > 1e-8 ||
      destinationAfter.priceSource !== source.priceSource ||
      destinationAfter.priceAsOf !== source.priceAsOf ||
      destinationAfter.name !== source.name ||
      destinationAfter.sector !== source.sector
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["positionTransferImpact", "destinationAfter"],
        message: "新目的持股必須沿用來源持股的市場價格、來源、名稱與分類。"
      });
    }

    const beforeBasis =
      source.quantity * source.averageCost +
      (destinationBefore ? destinationBefore.quantity * destinationBefore.averageCost : 0);
    const afterBasis =
      (sourceAfter ? sourceAfter.quantity * sourceAfter.averageCost : 0) +
      destinationAfter.quantity * destinationAfter.averageCost;
    if (Math.abs(beforeBasis - afterBasis) > 1e-7 * Math.max(1, Math.abs(beforeBasis))) {
      ctx.addIssue({
        code: "custom",
        path: ["positionTransferImpact"],
        message: "證券移轉前後總成本基礎必須完全守恆。"
      });
    }

    const beforeValue =
      source.quantity * source.price +
      (destinationBefore ? destinationBefore.quantity * destinationBefore.price : 0);
    const afterValue =
      (sourceAfter ? sourceAfter.quantity * sourceAfter.price : 0) +
      destinationAfter.quantity * destinationAfter.price;
    if (Math.abs(beforeValue - afterValue) > 1e-7 * Math.max(1, Math.abs(beforeValue))) {
      ctx.addIssue({
        code: "custom",
        path: ["positionTransferImpact"],
        message: "證券移轉前後總市值不可因帳戶搬移而改變。"
      });
    }
  }

  if (activity.type === "fx_conversion" && !activity.cashFxImpact) {
    ctx.addIssue({
      code: "custom",
      path: ["cashFxImpact"],
      message: "內部換匯必須保留兩個現金帳戶的前後快照與成交匯率。"
    });
  }

  if (activity.type !== "fx_conversion" && activity.cashFxImpact) {
    ctx.addIssue({
      code: "custom",
      path: ["cashFxImpact"],
      message: "只有內部換匯可以附帶跨幣別現金快照。"
    });
  }

  if (
    activity.type === "fx_conversion" &&
    (activity.cashImpact || activity.cashTransferImpact || activity.inventoryImpact)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["cashFxImpact"],
      message: "內部換匯不可同時附帶其他現金轉帳或證券持股連動。"
    });
  }

  if (activity.cashFxImpact) {
    const fx = activity.cashFxImpact;
    const snapshots = [fx.fromBefore, fx.fromAfter, fx.toBefore, fx.toAfter];
    const normalized = snapshots.every((cash) =>
      cash.type === "cash" &&
      Math.abs(cash.quantity - 1) <= 1e-9 &&
      Math.abs(cash.averageCost - cash.price) <= 1e-8
    );

    if (fx.fromCashHoldingId === fx.toCashHoldingId) {
      ctx.addIssue({
        code: "custom",
        path: ["cashFxImpact"],
        message: "內部換匯的轉出與轉入現金帳戶不可相同。"
      });
    }
    if (
      fx.fromBefore.id !== fx.fromCashHoldingId ||
      fx.fromAfter.id !== fx.fromCashHoldingId ||
      fx.toBefore.id !== fx.toCashHoldingId ||
      fx.toAfter.id !== fx.toCashHoldingId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cashFxImpact"],
        message: "內部換匯快照的現金帳戶 ID 不一致。"
      });
    }
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        path: ["cashFxImpact"],
        message: "內部換匯現金快照必須使用 1 × 餘額的標準格式。"
      });
    }
    if (fx.fromBefore.currency === fx.toBefore.currency) {
      ctx.addIssue({
        code: "custom",
        path: ["cashFxImpact"],
        message: "內部換匯必須在 TWD 與 USD 不同幣別帳戶之間進行。"
      });
    }
    if (
      fx.fromAfter.currency !== fx.fromBefore.currency ||
      fx.toAfter.currency !== fx.toBefore.currency ||
      activity.currency !== fx.fromBefore.currency
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cashFxImpact"],
        message: "內部換匯活動幣別或前後快照幣別不一致。"
      });
    }
    if (Math.abs(activity.amount - fx.fromAmount) > 1e-8) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "內部換匯活動金額必須等於實際轉出金額。"
      });
    }

    const expectedFrom = fx.fromBefore.price - fx.fromAmount;
    const expectedTo = fx.toBefore.price + fx.toAmount;
    if (
      expectedFrom < -1e-8 ||
      Math.abs(fx.fromAfter.price - Math.max(0, expectedFrom)) > 1e-8 ||
      Math.abs(fx.fromAfter.averageCost - Math.max(0, expectedFrom)) > 1e-8
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cashFxImpact", "fromAfter"],
        message: "內部換匯的轉出 after 快照與 before－fromAmount 不一致。"
      });
    }
    if (
      Math.abs(fx.toAfter.price - expectedTo) > 1e-8 ||
      Math.abs(fx.toAfter.averageCost - expectedTo) > 1e-8
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cashFxImpact", "toAfter"],
        message: "內部換匯的轉入 after 快照與 before＋toAmount 不一致。"
      });
    }

    const expectedExecutionRate = fx.fromBefore.currency === "TWD"
      ? fx.fromAmount / fx.toAmount
      : fx.toAmount / fx.fromAmount;
    if (
      !Number.isFinite(expectedExecutionRate) ||
      Math.abs(fx.executionTwdPerUsd - expectedExecutionRate) > 1e-8 ||
      Math.abs(activity.fxRate - expectedExecutionRate) > 1e-8
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["cashFxImpact", "executionTwdPerUsd"],
        message: "內部換匯成交匯率必須由實際轉出與實收金額一致推導。"
      });
    }

    const activityAccount = (activity.account?.trim() || "預設帳戶").toLowerCase();
    const fromAccount = (fx.fromBefore.account?.trim() || "預設帳戶").toLowerCase();
    if (activityAccount !== fromAccount) {
      ctx.addIssue({
        code: "custom",
        path: ["account"],
        message: "內部換匯活動帳戶必須對應轉出現金帳戶。"
      });
    }
  }
}).transform((activity) => {
  const normalized = {
    ...activity,
    fxRate: isCashFxActivityType(activity.type)
      ? activity.fxRate
      : activity.currency === "TWD"
        ? 1
        : activity.fxRate,
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
    version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8), z.literal(9), z.literal(10), z.literal(11), z.literal(12), z.literal(13), z.literal(14)]),
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
