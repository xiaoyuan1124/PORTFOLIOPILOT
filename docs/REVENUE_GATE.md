# Official 3-Month Revenue Gate

PortfolioPilot V0.7 replaces the Scanner's revenue demo condition with real historical monthly-revenue data from MOPS.

## Source

Historical monthly revenue archive:

`https://mopsov.twse.com.tw/nas/t21/{market}/t21sc03_{roc_year}_{month}_{company_type}.html`

Market paths:

- `sii`: TWSE listed companies
- `otc`: TPEx OTC companies

PortfolioPilot fetches both company types `0` and `1` for the latest three reported months.

## Normalized row

Each row keeps:

- code
- name
- market
- industry (joined from the current official revenue table when available)
- period
- monthly revenue
- previous-month revenue
- previous-year same-month revenue
- MoM %
- YoY %
- cumulative revenue
- previous-year cumulative revenue
- cumulative YoY %
- note

## Scanner gate

The first scanner gate is now deterministic and official:

```
month_1 YoY > 20%
AND month_2 YoY > 20%
AND month_3 YoY > 20%
```

A company missing any one of the three expected periods is not treated as passing.

## Important limitation

Passing this revenue gate is **not** a stock recommendation and is not the complete PortfolioPilot strategy.

The intended full strategy also requires:

- quarterly gross margin improving for two consecutive comparisons;
- foreign investors net-buying over the latest 10 completed trading sessions;
- investment trusts net-buying over the same 10 completed trading sessions.

Until those datasets are connected and validated, the UI calls results **第一關通過**, not complete candidates.
