"use client";

import { Connection, PublicKey, ParsedTransactionWithMeta } from "@solana/web3.js";
import { PROGRAM_ID } from "../constants";
import BN from "bn.js";

// Event types from our program
export type SwapEvent = {
  type: "swap";
  signature: string;
  timestamp: number;
  pool: string;
  user: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: BN;
  amountOut: BN;
  fee: BN;
};

export type LiquidityEvent = {
  type: "increaseLiquidity" | "decreaseLiquidity";
  signature: string;
  timestamp: number;
  pool: string;
  user: string;
  position: string;
  liquidity: BN;
  amountA: BN;
  amountB: BN;
};

export type PoolEvent = {
  type: "initializePool";
  signature: string;
  timestamp: number;
  pool: string;
  tokenMintA: string;
  tokenMintB: string;
  feeRate: number;
  initialPrice: BN;
};

export type ProgramEvent = SwapEvent | LiquidityEvent | PoolEvent;

// Pool statistics
export interface PoolStats {
  tvlUSD: number;
  volume24h: number;
  volume7d: number;
  fees24h: number;
  fees7d: number;
  apr: number;
  txCount24h: number;
}

// Fetch recent transactions for the program
export async function fetchProgramTransactions(
  connection: Connection,
  limit: number = 100
): Promise<ParsedTransactionWithMeta[]> {
  try {
    const signatures = await connection.getSignaturesForAddress(
      PROGRAM_ID,
      { limit }
    );

    const transactions = await Promise.all(
      signatures.map(async (sig) => {
        try {
          return await connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });
        } catch {
          return null;
        }
      })
    );

    return transactions.filter((tx): tx is ParsedTransactionWithMeta => tx !== null);
  } catch (error) {
    console.error("Failed to fetch program transactions:", error);
    return [];
  }
}

// Fetch transactions for a specific user
export async function fetchUserTransactions(
  connection: Connection,
  userPubkey: PublicKey,
  limit: number = 50
): Promise<ParsedTransactionWithMeta[]> {
  try {
    const signatures = await connection.getSignaturesForAddress(
      userPubkey,
      { limit }
    );

    // Filter to only include transactions that involve our program
    const transactions = await Promise.all(
      signatures.map(async (sig) => {
        try {
          const tx = await connection.getParsedTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (!tx) return null;

          // Check if transaction involves our program
          const involvesSuniswap = tx.transaction.message.accountKeys.some(
            (key) => key.pubkey.equals(PROGRAM_ID)
          );

          return involvesSuniswap ? tx : null;
        } catch {
          return null;
        }
      })
    );

    return transactions.filter((tx): tx is ParsedTransactionWithMeta => tx !== null);
  } catch (error) {
    console.error("Failed to fetch user transactions:", error);
    return [];
  }
}

// Parse transaction to extract event type
export function parseTransactionType(
  tx: ParsedTransactionWithMeta
): string {
  const logs = tx.meta?.logMessages || [];

  for (const log of logs) {
    if (log.includes("Instruction: Swap")) return "Swap";
    if (log.includes("Instruction: IncreaseLiquidity")) return "Add Liquidity";
    if (log.includes("Instruction: DecreaseLiquidity")) return "Remove Liquidity";
    if (log.includes("Instruction: CollectFees")) return "Collect Fees";
    if (log.includes("Instruction: InitializePool")) return "Create Pool";
    if (log.includes("Instruction: OpenPosition")) return "Open Position";
  }

  return "Unknown";
}

// Calculate pool TVL from vault balances
export async function calculatePoolTVL(
  connection: Connection,
  tokenVaultA: PublicKey,
  tokenVaultB: PublicKey,
  priceA: number,
  priceB: number,
  decimalsA: number = 9,
  decimalsB: number = 6
): Promise<number> {
  try {
    const [balanceA, balanceB] = await Promise.all([
      connection.getTokenAccountBalance(tokenVaultA),
      connection.getTokenAccountBalance(tokenVaultB),
    ]);

    const amountA = Number(balanceA.value.amount) / Math.pow(10, decimalsA);
    const amountB = Number(balanceB.value.amount) / Math.pow(10, decimalsB);

    return amountA * priceA + amountB * priceB;
  } catch (error) {
    console.error("Failed to calculate TVL:", error);
    return 0;
  }
}

// Estimate APR based on fees and TVL
export function estimateAPR(
  fees24h: number,
  tvl: number
): number {
  if (tvl === 0) return 0;
  const dailyReturn = fees24h / tvl;
  return dailyReturn * 365 * 100; // Annualized percentage
}

// Fetch indexed stats from API
async function fetchIndexedStats(poolAddress: string): Promise<{
  volume24h: number;
  fees24h: number;
  txCount24h: number;
} | null> {
  try {
    const response = await fetch(`/api/pools/${poolAddress}/stats`);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.message === "Indexer not configured") return null;

    return {
      volume24h: data.volume24h || 0,
      fees24h: data.fees24h || 0,
      txCount24h: data.txCount24h || 0,
    };
  } catch {
    return null;
  }
}

// Aggregate pool statistics
export async function getPoolStats(
  connection: Connection,
  poolAddress: PublicKey,
  tokenVaultA: PublicKey,
  tokenVaultB: PublicKey,
  priceA: number,
  priceB: number
): Promise<PoolStats> {
  // Calculate TVL from on-chain data
  const tvlUSD = await calculatePoolTVL(
    connection,
    tokenVaultA,
    tokenVaultB,
    priceA,
    priceB
  );

  // Try to fetch real stats from indexer
  const indexedStats = await fetchIndexedStats(poolAddress.toBase58());

  let volume24h: number;
  let fees24h: number;
  let txCount24h: number;

  if (indexedStats) {
    // Use real indexed data
    volume24h = indexedStats.volume24h;
    fees24h = indexedStats.fees24h;
    txCount24h = indexedStats.txCount24h;
  } else {
    // Fallback to estimates
    volume24h = tvlUSD * 0.1;
    fees24h = volume24h * 0.003;
    txCount24h = 0;
  }

  const volume7d = volume24h * 6;
  const fees7d = fees24h * 6;
  const apr = estimateAPR(fees24h, tvlUSD);

  return {
    tvlUSD,
    volume24h,
    volume7d,
    fees24h,
    fees7d,
    apr,
    txCount24h,
  };
}

// Fetch global protocol stats
export async function getGlobalStats(): Promise<{
  totalPools: number;
  volume24h: number;
  txCount24h: number;
  activePositions: number;
  uniqueUsers: number;
  tvlTotal: number;
} | null> {
  try {
    const response = await fetch("/api/stats");
    if (!response.ok) return null;

    const data = await response.json();
    if (data.message === "Indexer not configured") return null;

    return {
      totalPools: data.totalPools || 0,
      volume24h: data.volume24h || 0,
      txCount24h: data.txCount24h || 0,
      activePositions: data.activePositions || 0,
      uniqueUsers: data.uniqueUsers || 0,
      tvlTotal: data.tvlTotal || 0,
    };
  } catch {
    return null;
  }
}

// Fetch user transactions from indexer
export async function getIndexedUserTransactions(
  userAddress: string,
  limit: number = 50
): Promise<Array<{
  signature: string;
  type: string;
  pool_address: string;
  amount_in?: string;
  amount_out?: string;
  block_time: string;
}> | null> {
  try {
    const response = await fetch(`/api/users/${userAddress}/transactions?limit=${limit}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.message === "Indexer not configured") return null;

    return data.transactions || [];
  } catch {
    return null;
  }
}
