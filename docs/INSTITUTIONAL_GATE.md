# Institutional 10-Day Gate

PortfolioPilot V0.8 adds official 10-trading-day institutional net-flow gates.

## Sources

TWSE listed securities:

`https://www.twse.com.tw/rwd/zh/fund/T86?date=YYYYMMDD&selectType=ALLBUT0999&response=json`

TPEx OTC securities:

`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?type=Daily&sect=AL&date=ROC/MM/DD&response=json`

## Trading-day selection

The updater starts from the latest official quote date and walks backward through calendar days.

A date counts only when TWSE T86 returns a valid non-empty institutional table. For each accepted trading day, the corresponding TPEx table must also pass a minimum completeness check.

The cache is not published unless exactly 10 completed trading days are resolved.

## Definitions

PortfolioPilot uses:

- foreign net = foreign / China investor net **excluding the foreign-dealer book**, matching the TWSE T86 field;
- investment trust net = 投信買賣超股數.

For TPEx, the parser uses the corresponding ex-foreign-dealer foreign net and investment-trust net positions in the official daily table.

All quantities remain in **shares**, not lots.

## Aggregation

For each stock:

```
foreign10d = sum(foreign_net over the 10 resolved trading days)
trust10d   = sum(trust_net over the same 10 trading days)
```

The two strategy gates are:

```
foreign10d > 0
AND
trust10d > 0
```

Missing per-stock rows on an otherwise valid trading day contribute no additional net flow.

## Scanner status after V0.8

Three of the four intended gates are official:

1. three consecutive monthly revenue YoY > 20%;
2. foreign 10D net buy > 0;
3. investment trust 10D net buy > 0.

Quarterly gross-margin improvement remains pending. Results are therefore labelled **3/4 通過**, not complete strategy matches.
