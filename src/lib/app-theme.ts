/** Three appearance modes. "dark"/"light" keep backward compatibility with stored preferences. */
export const APP_THEME_MODES = ["light", "dark", "tradescope"] as const;
export type AppTheme = (typeof APP_THEME_MODES)[number];

export const APP_THEME_LABELS: Record<AppTheme, string> = {
  light: "淺色",
  dark: "深色",
  tradescope: "TradeScope"
};

export const APP_THEME_SWATCHES: Record<AppTheme, { background: string; surface: string; accent: string; positive: string }> = {
  light: { background: "#f4f2ed", surface: "#ffffff", accent: "#315f49", positive: "#2c8155" },
  dark: { background: "#101412", surface: "#151a18", accent: "#a7d8b8", positive: "#77c69b" },
  tradescope: { background: "#0b0e0c", surface: "#121615", accent: "#d4a958", positive: "#2ec990" }
};

export function parseAppTheme(saved: string | null, prefersDark: boolean): AppTheme {
  if (saved === "light" || saved === "dark" || saved === "tradescope") return saved;
  return prefersDark ? "dark" : "light";
}

export function nextAppTheme(current: AppTheme): AppTheme {
  const at = APP_THEME_MODES.indexOf(current);
  return APP_THEME_MODES[(at + 1) % APP_THEME_MODES.length];
}

/** Existing Tailwind dark:* utilities are reused, and the third palette is layered on top. */
export function themeClassState(theme: AppTheme): { dark: boolean; tradescope: boolean } {
  return { dark: theme !== "light", tradescope: theme === "tradescope" };
}
