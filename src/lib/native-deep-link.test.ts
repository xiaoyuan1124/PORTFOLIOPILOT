import { describe, expect, it } from "vitest";
import {
  buildNotificationSettingsDeepLink,
  buildResearchDeepLink,
  parseNativeDeepLink
} from "./native-deep-link";

describe("native deep-link routing", () => {
  it("round-trips a stock research target", () => {
    const link = buildResearchDeepLink("TWSE:2330", "stock");

    expect(parseNativeDeepLink(link)).toEqual({
      section: "research",
      researchKey: "TWSE:2330",
      researchType: "stock"
    });
  });

  it("round-trips an ETF research target without losing encoded characters", () => {
    const link = buildResearchDeepLink("TPEx:006201", "etf");

    expect(parseNativeDeepLink(link)).toEqual({
      section: "research",
      researchKey: "TPEx:006201",
      researchType: "etf"
    });
  });

  it("routes notification settings and rejects malformed or foreign links", () => {
    expect(parseNativeDeepLink(buildNotificationSettingsDeepLink())).toEqual({
      section: "settings"
    });
    expect(parseNativeDeepLink("portfoliopilot://research?key=TWSE%3A2330")).toBeNull();
    expect(parseNativeDeepLink("https://example.com/research?key=TWSE%3A2330&type=stock")).toBeNull();
    expect(parseNativeDeepLink("not a url")).toBeNull();
  });
});
