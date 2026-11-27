# Technical Analysis Engine v2 — incremental implementation

This branch adds an original, local-only technical-analysis engine and chart workspace. No broker connection, API credentials, automated execution, or live quotes. Existing official daily price history and existing basic chart are retained.

Open-source evaluation:
- KLineChart (Apache-2.0): built-in chart interaction and drawing tools; candidate for a future verified dependency migration.
- TradingView Lightweight Charts (Apache-2.0 with attribution requirements): low-level canvas renderer; candidate for larger histories.
- TechnicalIndicators (MIT): candidate as an independent numerical comparison source.
- React Grid Layout (MIT): candidate for desktop panels.
- Existing React/TypeScript and Vitest are reused in this branch; no new dependency or CDN request is introduced. No third-party code is copied from Shioaji Pro.

Scope: configurable SMA/EMA/WMA, Bollinger, Donchian, Keltner, SAR, SuperTrend, volume with average lines, volume ratio, MACD, RSI, KD, StochRSI, BIAS, Wilder ATR, DMI/ADX, OBV, MFI, CCI, Williams %R, ROC, CMF, Bollinger bandwidth, PVT. Day/week/month; candle, close and OHLC; zoom buttons and drag/pan; synchronized date selection; support/resistance pivot detection; horizontal/trend/rectangle/Fibonacci drawing; storage per symbol; sequential historical replay. Existing daily MA semantics preserved in legacy chart; new chart computes its indicator periods over displayed bars.

Known limits: unadjusted prices; no intraday/market-depth data; drawing storage explicitly loaded per symbol; no full persistence of settings or pinch gesture yet. No historical point-in-time institutional store, full-market pattern detection, cross-symbol comparison, new generic strategy backtest, or advanced workspace in this slice. Do not infer availability of those features. Verify CI, iOS touch interaction, and numerical reference vectors before merge. For future dependencies generate lock with npm install and review licenses/integrity.

Second commit: persist up to 60 observed institutional sessions from the existing official refresh and expose per-stock daily/cumulative foreign and investment-trust charts with incomplete-window checks. No extra requests; initial archive unavailable until successful market refresh. No dealer data or historical backfill. Recharts already installed is used for this panel.

Mobile regression fix: stable workbench chart identifier on the shared wrapper, separate legacy and professional identifiers, restored per-candle date slider (distinct from historical window pan), SVG screen-coordinate conversion for scaled charts, explicit chart mode state. Smoke tests now exercise both chart modes, date selection, indicator subpanels, replay and fullscreen. CI must confirm the new revision.

Phase two: deterministic confirmed pivots and HH/HL/LH/LL, candle rules (doji, hammer family, engulfing, gap, relaxed morning/evening star), W/M and horizontal-neckline head/shoulders, regular price divergence against RSI14, MACD DIF and KD K9. Analysis panel links confirmation date to chart, filters events, and follows replay prefix. Pivots require two future bars relative to the pivot but are never emitted before those bars are observed. No hit-rate claims. Triangle, flag, wedge and other formations, chart markers, adjustment factors and statistical validation remain separate work.
