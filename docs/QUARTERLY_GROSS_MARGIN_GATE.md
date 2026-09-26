# Official Quarterly Gross-Margin Gate

PortfolioPilot V0.9 completes the fourth Scanner gate with official MOPS quarterly financial statements.

## Official source

Historical listed and OTC quarterly comprehensive-income statements are read from MOPS:

`https://mopsov.twse.com.tw/mops/web/ajax_t163sb04`

The updater sends the same public form parameters used by MOPS, with `TYPEK=sii` for TWSE-listed companies and `TYPEK=otc` for TPEx-listed companies. No paid API, account, brokerage credential, Supabase project, or AI service is involved.

The generated cache is:

`public/data/tw-quarterly-margins.json`

Every cache row retains the market, fiscal quarter, operating revenue, operating cost, gross profit, gross-margin percentage, derivation basis, and source metadata.

## Single-quarter rule

MOPS comprehensive-income statements are cumulative within the fiscal year. PortfolioPilot therefore never compares cumulative YTD gross margins as if they were single-quarter margins.

- Q1: the cumulative statement equals the single quarter.
- Q2: Q2 cumulative minus Q1 cumulative.
- Q3: Q3 cumulative minus Q2 cumulative.
- Q4: annual cumulative minus Q3 cumulative.

For every derived quarter:

`gross margin = single-quarter gross profit / single-quarter operating revenue × 100`

The gate passes only when the latest three complete official single-quarter margins satisfy:

`Q-2 < Q-1 < Q`

Equality does not pass.

## Special industries

The MOPS response contains separate statement families. PortfolioPilot identifies the general-industry table by the official `營業毛利（毛損）` field. Companies found in statement families without a gross-profit field are stored as `notApplicable`.

This is deliberate: financial, insurance, securities/futures, financial-holding and other special statement families must not be forced into a manufacturing-style gross-margin formula.

The Scanner reports four states:

- `pass`: all required values exist and the rule passes.
- `fail`: the official values exist and the rule fails.
- `insufficient`: the rule cannot be evaluated from the required official periods.
- `not_applicable`: the official MOPS statement family does not define the general-industry gross-profit field.

## Fail-closed data policy

The updater refuses to publish a new cache when:

- fewer than three derivable common TWSE/TPEx quarters are available;
- a supposedly valid statement response contains a suspiciously small company set;
- a selected quarter cannot be derived from the required same-year prior cumulative statement;
- a derived market/quarter produces a suspiciously small general-industry company set.

A failed refresh leaves the previously committed cache untouched because the GitHub Action stops before committing.

## Scanner provenance

Each expanded Scanner gate shows:

- actual values used by the rule;
- fiscal/data periods;
- pass/fail/insufficient/not-applicable reason;
- official source name and URL.

This keeps demo data and approximations out of the Official Scanner.
