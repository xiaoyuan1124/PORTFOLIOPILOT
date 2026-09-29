import type { Holding } from "./types";

export type TwVenue = "TWSE" | "TPEx";

export type TwSecurityIdentity = {
  market: TwVenue;
  code: string;
};

export function twSecurityKey(market: TwVenue, code: string) {
  return `${market}:${code.trim().toUpperCase()}`;
}

export function resolveHeldTwSecurityKeys(
  holdings: Holding[],
  securities: TwSecurityIdentity[]
) {
  const venuesByCode = new Map<string, Set<TwVenue>>();

  for (const security of securities) {
    const code = security.code.trim().toUpperCase();
    if (!code) continue;
    const venues = venuesByCode.get(code) ?? new Set<TwVenue>();
    venues.add(security.market);
    venuesByCode.set(code, venues);
  }

  const held = new Set<string>();

  for (const holding of holdings) {
    if (holding.market !== "TW" || holding.type === "cash") continue;

    const code = holding.symbol.trim().toUpperCase();
    if (!code) continue;

    if (holding.priceSource === "TWSE" || holding.priceSource === "TPEx") {
      held.add(twSecurityKey(holding.priceSource, code));
      continue;
    }

    const venues = venuesByCode.get(code);
    if (venues?.size === 1) {
      held.add(twSecurityKey([...venues][0]!, code));
    }
  }

  return held;
}

export function isHeldTwSecurity(
  heldKeys: Set<string>,
  market: TwVenue,
  code: string
) {
  return heldKeys.has(twSecurityKey(market, code));
}
