import { createClient } from "@supabase/supabase-js";

// Database types
export interface Pool {
  id: string;
  address: string;
  token_mint_a: string;
  token_mint_b: string;
  token_vault_a: string;
  token_vault_b: string;
  fee_rate: number;
  tick_spacing: number;
  sqrt_price_x64: string;
  tick_current: number;
  liquidity: string;
  tvl_usd?: number;
  is_paused: boolean;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  address: string;
  pool_address: string;
  owner: string;
  tick_lower: number;
  tick_upper: number;
  liquidity: string;
  tokens_owed_a: string;
  tokens_owed_b: string;
  is_open: boolean;
  created_at: string;
}

export interface Swap {
  id: string;
  signature: string;
  pool_address: string;
  user_address: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
  fee_amount: string;
  block_time: string;
}

export interface LiquidityEvent {
  id: string;
  signature: string;
  pool_address: string;
  position_address: string;
  user_address: string;
  event_type: "add" | "remove" | "collect_fees";
  amount_a: string;
  amount_b: string;
  block_time: string;
}

export interface PoolSnapshot {
  id: string;
  pool_address: string;
  snapshot_time: string;
  tvl_usd: number;
  volume_usd: number;
  fees_usd: number;
  tx_count: number;
}

export interface TokenPrice {
  mint_address: string;
  symbol: string;
  price_usd: number;
  updated_at: string;
}

// Database schema type
export interface Database {
  public: {
    Tables: {
      pools: {
        Row: Pool;
        Insert: Omit<Pool, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Pool, "id">>;
      };
      positions: {
        Row: Position;
        Insert: Omit<Position, "id" | "created_at">;
        Update: Partial<Omit<Position, "id">>;
      };
      swaps: {
        Row: Swap;
        Insert: Omit<Swap, "id" | "created_at">;
        Update: Partial<Omit<Swap, "id">>;
      };
      liquidity_events: {
        Row: LiquidityEvent;
        Insert: Omit<LiquidityEvent, "id" | "created_at">;
        Update: Partial<Omit<LiquidityEvent, "id">>;
      };
      pool_snapshots: {
        Row: PoolSnapshot;
        Insert: Omit<PoolSnapshot, "id" | "created_at">;
        Update: Partial<Omit<PoolSnapshot, "id">>;
      };
      token_prices: {
        Row: TokenPrice;
        Insert: Omit<TokenPrice, "id">;
        Update: Partial<TokenPrice>;
      };
    };
  };
}

// Supabase client configuration
// Uses placeholder for build time, real values at runtime
const PLACEHOLDER_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_KEY = "placeholder-key";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || PLACEHOLDER_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || PLACEHOLDER_KEY;

// Check if Supabase is properly configured
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Public client for reading
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Admin client for writing (only use in API routes)
export const supabaseAdmin = createClient<Database>(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// ============================================================================
// QUERY HELPERS
// ============================================================================

export async function getPools(): Promise<Pool[]> {
  const { data, error } = await supabase
    .from("pools")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as Pool[];
}

export async function getPool(address: string): Promise<Pool | null> {
  const { data, error } = await supabase
    .from("pools")
    .select("*")
    .eq("address", address)
    .single();

  if (error || !data) return null;
  return data as Pool;
}

export async function getPoolStats24h(poolAddress: string) {
  const { data, error } = await supabase
    .from("swaps")
    .select("amount_in, fee_amount")
    .eq("pool_address", poolAddress)
    .gte("block_time", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (error) throw error;

  const swapData = (data || []) as Pick<Swap, "amount_in" | "fee_amount">[];

  const volume24h = swapData.reduce(
    (sum, s) => sum + parseFloat(s.amount_in || "0"),
    0
  );

  const fees24h = swapData.reduce(
    (sum, s) => sum + parseFloat(s.fee_amount || "0"),
    0
  );

  return { volume24h, fees24h, txCount24h: swapData.length };
}

export async function getUserPositions(owner: string): Promise<(Position & { pools: Pool | null })[]> {
  const { data, error } = await supabase
    .from("positions")
    .select("*, pools(*)")
    .eq("owner", owner)
    .eq("is_open", true)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as (Position & { pools: Pool | null })[];
}

export async function getUserTransactions(userAddress: string, limit = 50) {
  const { data: swaps, error: swapError } = await supabase
    .from("swaps")
    .select("*")
    .eq("user_address", userAddress)
    .order("block_time", { ascending: false })
    .limit(limit);

  const { data: liquidityEvents, error: liquidityError } = await supabase
    .from("liquidity_events")
    .select("*")
    .eq("user_address", userAddress)
    .order("block_time", { ascending: false })
    .limit(limit);

  if (swapError) throw swapError;
  if (liquidityError) throw liquidityError;

  const swapData = (swaps || []) as Swap[];
  const liquidityData = (liquidityEvents || []) as LiquidityEvent[];

  // Combine and sort by time
  const allTxs = [
    ...swapData.map((s) => ({ ...s, type: "swap" as const })),
    ...liquidityData.map((e) => ({ ...e, type: e.event_type })),
  ].sort(
    (a, b) =>
      new Date(b.block_time).getTime() - new Date(a.block_time).getTime()
  );

  return allTxs.slice(0, limit);
}

export async function getPoolSnapshots(
  poolAddress: string,
  hours = 24 * 7 // 7 days
): Promise<PoolSnapshot[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("pool_snapshots")
    .select("*")
    .eq("pool_address", poolAddress)
    .gte("snapshot_time", since)
    .order("snapshot_time", { ascending: true });

  if (error || !data) return [];
  return data as PoolSnapshot[];
}

export async function getTokenPrice(mintAddress: string): Promise<number> {
  const { data, error } = await supabase
    .from("token_prices")
    .select("price_usd")
    .eq("mint_address", mintAddress)
    .single();

  if (error || !data) return 0;
  const priceData = data as Pick<TokenPrice, "price_usd">;
  return priceData.price_usd;
}
