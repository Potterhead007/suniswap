import { PublicKey } from "@solana/web3.js";

// Program ID
export const PROGRAM_ID = new PublicKey("859DmKSfDQxnHY7dbYdFNwUE7QWhnb1WiBbXwbq1ktky");

// Fee tiers (fee rate in hundredths of a bip)
export const FEE_TIERS = [
  { feeRate: 100, tickSpacing: 1, label: "0.01%", description: "Best for stable pairs" },
  { feeRate: 500, tickSpacing: 10, label: "0.05%", description: "Best for stable-ish pairs" },
  { feeRate: 3000, tickSpacing: 60, label: "0.30%", description: "Best for most pairs" },
  { feeRate: 10000, tickSpacing: 200, label: "1.00%", description: "Best for exotic pairs" },
] as const;

// Tick bounds
export const MIN_TICK = -443635;
export const MAX_TICK = 443635;

// Tick array size
export const TICK_ARRAY_SIZE = 8;

// Math constants
export const Q64 = BigInt(2) ** BigInt(64);
export const Q128 = BigInt(2) ** BigInt(128);

// Min and max sqrt prices (in Q64.64 format)
export const MIN_SQRT_PRICE = BigInt("4295128739"); // sqrt(1.0001^MIN_TICK) * 2^64
export const MAX_SQRT_PRICE = BigInt("79226673515401279992447579055"); // sqrt(1.0001^MAX_TICK) * 2^64

// Network configuration
export const NETWORKS = {
  mainnet: {
    name: "Mainnet Beta",
    endpoint: "https://api.mainnet-beta.solana.com",
    wsEndpoint: "wss://api.mainnet-beta.solana.com",
  },
  devnet: {
    name: "Devnet",
    endpoint: "https://api.devnet.solana.com",
    wsEndpoint: "wss://api.devnet.solana.com",
  },
  localnet: {
    name: "Localnet",
    endpoint: "http://localhost:8899",
    wsEndpoint: "ws://localhost:8900",
  },
} as const;

export type NetworkName = keyof typeof NETWORKS;

// Default slippage tolerance (in basis points)
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

// Transaction priority levels (in microlamports per compute unit)
export const PRIORITY_FEES = {
  low: 1000,
  medium: 10000,
  high: 100000,
  turbo: 1000000,
} as const;

// Common token metadata (for display purposes)
export const TOKEN_METADATA: Record<string, { symbol: string; name: string; decimals: number; logo?: string }> = {
  So11111111111111111111111111111111111111112: {
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
    logo: "/tokens/sol.svg",
  },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logo: "/tokens/usdc.svg",
  },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logo: "/tokens/usdt.svg",
  },
};
