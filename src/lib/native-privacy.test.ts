import { describe, expect, it } from "vitest";
import { privacyEnabledFromStoredValue } from "./native-privacy";

describe("native privacy preference", () => {
  it("defaults to enabled when the user has never chosen a value", () => {
    expect(privacyEnabledFromStoredValue(null)).toBe(true);
  });

  it("keeps privacy enabled for the explicit enabled value", () => {
    expect(privacyEnabledFromStoredValue("enabled")).toBe(true);
  });

  it("disables privacy only for the explicit disabled value", () => {
    expect(privacyEnabledFromStoredValue("disabled")).toBe(false);
  });

  it("fails closed for unexpected stored values", () => {
    expect(privacyEnabledFromStoredValue("corrupt-value")).toBe(true);
  });
});
