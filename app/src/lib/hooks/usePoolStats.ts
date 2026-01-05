"use client";

import { useQuery } from "@tanstack/react-query";
import { useProgram } from "./useProgram";
import { PoolAccount } from "./usePool";
import { useTokenPrices } from "./usePrices";
import { calculatePoolTVL, getPoolStats, PoolStats } from "../services/indexerService";
import { TOKEN_METADATA } from "../constants";

export function usePoolTVL(pool?: PoolAccount) {
  const { connection } = useProgram();
  const { data: prices } = useTokenPrices();

  return useQuery({
    queryKey: ["poolTVL", pool?.address.toBase58()],
    queryFn: async (): Promise<number> => {
      if (!pool || !prices) return 0;

      const mintA = pool.tokenMintA.toBase58();
      const mintB = pool.tokenMintB.toBase58();

      const priceA = prices[mintA]?.price ?? 0;
      const priceB = prices[mintB]?.price ?? 0;

      const decimalsA = TOKEN_METADATA[mintA]?.decimals ?? 9;
      const decimalsB = TOKEN_METADATA[mintB]?.decimals ?? 6;

      return calculatePoolTVL(
        connection,
        pool.tokenVaultA,
        pool.tokenVaultB,
        priceA,
        priceB,
        decimalsA,
        decimalsB
      );
    },
    enabled: !!pool && !!prices,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

export function usePoolStats(pool?: PoolAccount) {
  const { connection } = useProgram();
  const { data: prices } = useTokenPrices();

  return useQuery({
    queryKey: ["poolStats", pool?.address.toBase58()],
    queryFn: async (): Promise<PoolStats> => {
      if (!pool || !prices) {
        return {
          tvlUSD: 0,
          volume24h: 0,
          volume7d: 0,
          fees24h: 0,
          fees7d: 0,
          apr: 0,
          txCount24h: 0,
        };
      }

      const mintA = pool.tokenMintA.toBase58();
      const mintB = pool.tokenMintB.toBase58();

      const priceA = prices[mintA]?.price ?? 0;
      const priceB = prices[mintB]?.price ?? 0;

      return getPoolStats(
        connection,
        pool.address,
        pool.tokenVaultA,
        pool.tokenVaultB,
        priceA,
        priceB
      );
    },
    enabled: !!pool && !!prices,
    staleTime: 60000,
    refetchInterval: 120000,
  });
}

// Get stats for all pools
export function useAllPoolStats(pools?: PoolAccount[]) {
  const { connection } = useProgram();
  const { data: prices } = useTokenPrices();

  return useQuery({
    queryKey: ["allPoolStats", pools?.length],
    queryFn: async (): Promise<Map<string, PoolStats>> => {
      if (!pools || !prices) return new Map();

      const statsMap = new Map<string, PoolStats>();

      await Promise.all(
        pools.map(async (pool) => {
          const mintA = pool.tokenMintA.toBase58();
          const mintB = pool.tokenMintB.toBase58();

          const priceA = prices[mintA]?.price ?? 0;
          const priceB = prices[mintB]?.price ?? 0;

          const stats = await getPoolStats(
            connection,
            pool.address,
            pool.tokenVaultA,
            pool.tokenVaultB,
            priceA,
            priceB
          );

          statsMap.set(pool.address.toBase58(), stats);
        })
      );

      return statsMap;
    },
    enabled: !!pools && pools.length > 0 && !!prices,
    staleTime: 60000,
    refetchInterval: 120000,
  });
}
