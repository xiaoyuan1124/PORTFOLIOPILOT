import { describe, expect, it } from "vitest";
import { emptyState } from "./demo-data";
import {
  decodeNativeStateEnvelope,
  encodeNativeStateEnvelope
} from "./durable-storage";

describe("native durable storage envelope", () => {
  it("round-trips a validated PortfolioPilot state with its revision", () => {
    const raw = encodeNativeStateEnvelope(emptyState, 1234);
    const decoded = decodeNativeStateEnvelope(raw);

    expect(decoded.version).toBe(1);
    expect(decoded.revision).toBe(1234);
    expect(decoded.state).toEqual(emptyState);
  });

  it("rejects unsupported envelopes instead of silently accepting them", () => {
    expect(() =>
      decodeNativeStateEnvelope(JSON.stringify({
        version: 2,
        revision: 1234,
        state: emptyState
      }))
    ).toThrow("Native storage envelope is invalid.");
  });

  it("rejects malformed state inside an otherwise valid envelope", () => {
    expect(() =>
      decodeNativeStateEnvelope(JSON.stringify({
        version: 1,
        revision: 1234,
        state: { holdings: "not-an-array" }
      }))
    ).toThrow();
  });
});
