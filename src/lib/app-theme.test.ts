import { describe, expect, it } from "vitest";
import {
  APP_THEME_MODES, APP_THEME_SWATCHES, nextAppTheme, parseAppTheme, themeClassState
} from "./app-theme";

describe("PortfolioPilot appearance themes", () => {
  it("keeps old localStorage values compatible", () => {
    expect(parseAppTheme("light", true)).toBe("light");
    expect(parseAppTheme("dark", false)).toBe("dark");
    expect(parseAppTheme("tradescope", false)).toBe("tradescope");
  });
  it("preserves system preference on unconfigured or unknown values", () => {
    expect(parseAppTheme(null, true)).toBe("dark");
    expect(parseAppTheme(null, false)).toBe("light");
    expect(parseAppTheme("legacy-unknown", true)).toBe("dark");
  });
  it("cycles through all 3 modes in stable order without hiding the existing ones", () => {
    expect([...APP_THEME_MODES]).toEqual(["light", "dark", "tradescope"]);
    expect(nextAppTheme("light")).toBe("dark");
    expect(nextAppTheme("dark")).toBe("tradescope");
    expect(nextAppTheme("tradescope")).toBe("light");
  });
  it("reuses Tailwind dark contrast utilities only for both dark modes", () => {
    expect(themeClassState("light")).toEqual({ dark: false, tradescope: false });
    expect(themeClassState("dark")).toEqual({ dark: true, tradescope: false });
    expect(themeClassState("tradescope")).toEqual({ dark: true, tradescope: true });
  });
  it("has distinct usable color palettes and a brighter mint gain accent", () => {
    const palettes = APP_THEME_MODES.map(mode => APP_THEME_SWATCHES[mode]);
    expect(new Set(palettes.map(p => p.background)).size).toBe(3);
    expect(APP_THEME_SWATCHES.tradescope.accent).toBe("#d4a958");
    expect(APP_THEME_SWATCHES.tradescope.positive).toBe("#2ec990");
  });
});
