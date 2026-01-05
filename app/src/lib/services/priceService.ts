"use client";

// Jupiter Price API for token prices
const JUPITER_PRICE_API = "https://price.jup.ag/v6/price";

// Common token mint addresses
export const TOKEN_MINTS = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
} as const;

export interface TokenPrice {
  id: string;
  mintSymbol: string;
  vsToken: string;
  vsTokenSymbol: string;
  price: number;
  timeTaken: number;
}

export interface PriceData {
  [mint: string]: TokenPrice;
}

// Fetch prices from Jupiter Price API
export async function fetchTokenPrices(mints: string[]): Promise<PriceData> {
  try {
    const ids = mints.join(",");
    const response = await fetch(`${JUPITER_PRICE_API}?ids=${ids}`);

    if (!response.ok) {
      throw new Error(`Price fetch failed: ${response.status}`);
    }

    const data = await response.json();
    return data.data || {};
  } catch (error) {
    console.error("Failed to fetch token prices:", error);
    return {};
  }
}

// Fetch single token price in USD
export async function fetchTokenPriceUSD(mint: string): Promise<number | null> {
  try {
    const response = await fetch(`${JUPITER_PRICE_API}?ids=${mint}`);

    if (!response.ok) return null;

    const data = await response.json();
    return data.data?.[mint]?.price ?? null;
  } catch (error) {
    console.error("Failed to fetch token price:", error);
    return null;
  }
}

// Get SOL price in USD
export async function fetchSOLPrice(): Promise<number> {
  const price = await fetchTokenPriceUSD(TOKEN_MINTS.SOL);
  return price ?? 0;
}

// Calculate USD value given token amount and mint
export async function calculateUSDValue(
  amount: number,
  mint: string
): Promise<number> {
  const price = await fetchTokenPriceUSD(mint);
  if (price === null) return 0;
  return amount * price;
}

// Pyth Price Feed IDs (for on-chain oracle integration)
export const PYTH_PRICE_FEEDS = {
  "SOL/USD": "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG",
  "USDC/USD": "Gnt27xtC473ZT2Mw5u8wZ68Z3gULkSTb5DuxJy7eJotD",
  "USDT/USD": "3vxLXJqLqF3JG5TCbYycbKWRBbCJQLxQmBGCkyqEEefL",
} as const;

// Historical price data (mock for now - would use an indexer in production)
export interface HistoricalPrice {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Generate mock historical data for charts
export function generateMockHistoricalPrices(
  basePrice: number,
  days: number = 30
): HistoricalPrice[] {
  const prices: HistoricalPrice[] = [];
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;

  let currentPrice = basePrice * (0.8 + Math.random() * 0.4); // Start 20% different

  for (let i = days; i >= 0; i--) {
    const timestamp = now - i * msPerDay;
    const volatility = 0.03; // 3% daily volatility
    const change = (Math.random() - 0.5) * 2 * volatility;

    const open = currentPrice;
    const close = currentPrice * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.02);
    const low = Math.min(open, close) * (1 - Math.random() * 0.02);
    const volume = 100000 + Math.random() * 900000;

    prices.push({ timestamp, open, high, low, close, volume });
    currentPrice = close;
  }

  return prices;
}
