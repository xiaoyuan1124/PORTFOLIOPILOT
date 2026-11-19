/** Adaptive axis for a local net-worth chart. Never manufactures observations. */
export type NetWorthChartScale = {
  domain: [number, number];
  ticks: number[];
  step: number;
  minimum: number | null;
  maximum: number | null;
  unchanged: boolean;
};

function niceStep(value: number): number {
  // Currency NAV is displayed to cents at most, while large portfolios use
  // rounded, human-readable tick intervals (1, 2, 2.5, 5, 10).
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return Math.max(0.01, nice * magnitude);
}

function roundForStep(value: number) {
  return Number(value.toFixed(2));
}

/** Only recorded (non-null) local NAV values determine the axis bounds. */
export function netWorthChartScale(values: Array<number | null>): NetWorthChartScale {
  const real = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!real.length) return { domain: [0, 1], ticks: [0, 0.25, 0.5, 0.75, 1], step: 0.25, minimum: null, maximum: null, unchanged: true };

  const minimum = Math.min(...real);
  const maximum = Math.max(...real);
  const unchanged = maximum === minimum;
  const spread = maximum - minimum;
  // Zoom in on actual variation. A strictly flat series stays flat;
  // its domain merely receives visual breathing room.
  const step = niceStep(unchanged ? Math.max(Math.abs(maximum) * 0.001, 1) / 2 : spread / 4);
  let low = roundForStep(Math.floor(minimum / step) * step - step);
  let high = roundForStep(Math.ceil(maximum / step) * step + step);
  // Net worth cannot have a negative zero-origin simply from chart padding.
  if (minimum >= 0) low = Math.max(0, low);
  if (low === high) high = roundForStep(low + step * 2);

  const count = Math.min(100, Math.round((high - low) / step));
  const ticks = Array.from({ length: count + 1 }, (_, index) => roundForStep(low + step * index));

  return { domain: [low, high], ticks, step, minimum, maximum, unchanged };
}

export function formatNetWorthTick(value: number, step: number): string {
  const decimals = step < 1 ? 2 : 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

/** Full-amount reference axis; explicit zero origin. No synthetic data points. */
export function netWorthFullScale(values: Array<number | null>): NetWorthChartScale {
  const real = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!real.length) return netWorthChartScale(values);
  const minimum = Math.min(...real);
  const maximum = Math.max(...real);
  const low = Math.min(0, minimum);
  const spread = Math.max(0.01, maximum - low);
  const step = niceStep(spread / 4);
  const high = roundForStep(Math.ceil(maximum / step) * step + step);
  const count = Math.max(1, Math.min(12, Math.round((high - low) / step)));
  const ticks = Array.from({ length: count + 1 }, (_, index) => roundForStep(low + step * index));
  return { domain: [low, high], ticks, step, minimum, maximum, unchanged: minimum === maximum };
}
