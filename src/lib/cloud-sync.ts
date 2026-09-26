import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import type { AppState, Holding, JournalEntry } from "./types";
import { getSupabaseBrowserClient } from "./supabase";

type HoldingRow = {
  client_id: string;
  symbol: string;
  name: string;
  market: "TW" | "US";
  asset_type: "stock" | "etf" | "cash";
  quantity: number | string;
  price: number | string;
  average_cost: number | string;
  currency: "TWD" | "USD";
  sector: string;
};

type JournalRow = {
  client_id: string;
  entry_date: string;
  symbol: string;
  title: string;
  thesis: string;
  invalidation: string;
};

type PreferenceRow = {
  usd_twd: number | string;
  updated_at: string;
};

export async function getCurrentCloudUser(): Promise<User | null> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export function onCloudAuthChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
) {
  const supabase = getSupabaseBrowserClient();
  return supabase.auth.onAuthStateChange(callback).data.subscription;
}

export async function signInCloud(email: string, password: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signUpCloud(email: string, password: string) {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOutCloud() {
  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadCloudState(): Promise<{ state: AppState | null; updatedAt: string | null }> {
  const supabase = getSupabaseBrowserClient();
  const user = await getCurrentCloudUser();
  if (!user) throw new Error("請先登入雲端帳號。");

  const [holdingsResult, journalResult, preferenceResult] = await Promise.all([
    supabase
      .from("holdings")
      .select("client_id,symbol,name,market,asset_type,quantity,price,average_cost,currency,sector")
      .order("created_at", { ascending: true }),
    supabase
      .from("journal_entries")
      .select("client_id,entry_date,symbol,title,thesis,invalidation")
      .order("entry_date", { ascending: false }),
    supabase
      .from("portfolio_preferences")
      .select("usd_twd,updated_at")
      .maybeSingle()
  ]);

  if (holdingsResult.error) throw holdingsResult.error;
  if (journalResult.error) throw journalResult.error;
  if (preferenceResult.error) throw preferenceResult.error;

  const holdings = (holdingsResult.data ?? []).map((row: HoldingRow): Holding => ({
    id: row.client_id,
    symbol: row.symbol,
    name: row.name,
    market: row.market,
    type: row.asset_type,
    quantity: Number(row.quantity),
    price: Number(row.price),
    averageCost: Number(row.average_cost),
    currency: row.currency,
    sector: row.sector
  }));

  const journal = (journalResult.data ?? []).map((row: JournalRow): JournalEntry => ({
    id: row.client_id,
    date: row.entry_date,
    symbol: row.symbol,
    title: row.title,
    thesis: row.thesis,
    invalidation: row.invalidation
  }));

  const preference = preferenceResult.data as PreferenceRow | null;
  const hasCloudData = holdings.length > 0 || journal.length > 0 || Boolean(preference);
  if (!hasCloudData) return { state: null, updatedAt: null };

  return {
    state: {
      holdings,
      etfCompositions: [],
      journal,
      activities: [],
      snapshots: [],
      usdTwd: Number(preference?.usd_twd ?? 31.8)
    },
    updatedAt: preference?.updated_at ?? null
  };
}

export async function saveCloudState(state: AppState) {
  const supabase = getSupabaseBrowserClient();
  const user = await getCurrentCloudUser();
  if (!user) throw new Error("請先登入雲端帳號。");

  const { error } = await supabase.rpc("replace_portfolio_state", {
    p_usd_twd: state.usdTwd,
    p_holdings: state.holdings,
    p_journal: state.journal
  });

  if (error) throw error;
}
