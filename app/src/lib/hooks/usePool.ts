"use client";

import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { useProgram } from "./useProgram";
import { getPoolPda } from "../anchor/pdas";
import { FEE_TIERS } from "../constants";
import { sqrtPriceX64ToPrice } from "../utils/math";
import BN from "bn.js";

export interface PoolAccount {
  address: PublicKey;
  sqrtPriceX64: BN;
  liquidity: BN;
  tickCurrent: number;
  tickSpacing: number;
  feeGrowthGlobalAX128: BN;
  feeGrowthGlobalBX128: BN;
  protocolFeesA: BN;
  protocolFeesB: BN;
  tokenMintA: PublicKey;
  tokenMintB: PublicKey;
  tokenVaultA: PublicKey;
  tokenVaultB: PublicKey;
  feeRate: number;
  isPaused: boolean;
}

export function usePool(
  tokenMintA?: PublicKey,
  tokenMintB?: PublicKey,
  feeRate?: number
) {
  const { readonlyProgram } = useProgram();

  return useQuery({
    queryKey: ["pool", tokenMintA?.toBase58(), tokenMintB?.toBase58(), feeRate],
    queryFn: async (): Promise<PoolAccount | null> => {
      if (!tokenMintA || !tokenMintB || feeRate === undefined) return null;

      const [poolPda] = getPoolPda(tokenMintA, tokenMintB, feeRate);

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const poolAccount = await (readonlyProgram.account as any).pool.fetch(poolPda);

        return {
          address: poolPda,
          sqrtPriceX64: new BN(poolAccount.sqrtPriceX64.toString()),
          liquidity: new BN(poolAccount.liquidity.toString()),
          tickCurrent: poolAccount.tickCurrent,
          tickSpacing: poolAccount.tickSpacing,
          feeGrowthGlobalAX128: new BN(poolAccount.feeGrowthGlobalAX128.toString()),
          feeGrowthGlobalBX128: new BN(poolAccount.feeGrowthGlobalBX128.toString()),
          protocolFeesA: new BN(poolAccount.protocolFeesA.toString()),
          protocolFeesB: new BN(poolAccount.protocolFeesB.toString()),
          tokenMintA: new PublicKey(poolAccount.tokenMintA),
          tokenMintB: new PublicKey(poolAccount.tokenMintB),
          tokenVaultA: new PublicKey(poolAccount.tokenVaultA),
          tokenVaultB: new PublicKey(poolAccount.tokenVaultB),
          feeRate,
          isPaused: poolAccount.isPaused !== 0,
        };
      } catch (e) {
        console.error("Failed to fetch pool:", e);
        return null;
      }
    },
    enabled: !!tokenMintA && !!tokenMintB && feeRate !== undefined,
    staleTime: 10000,
  });
}

export function useAllPools() {
  const { readonlyProgram } = useProgram();

  return useQuery({
    queryKey: ["allPools"],
    queryFn: async (): Promise<PoolAccount[]> => {
      try {
        // Fetch all pool accounts
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pools = await (readonlyProgram.account as any).pool.all();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return pools.map((pool: any) => {
          const account = pool.account;

          // Find fee rate from fee tier
          const feeTier = FEE_TIERS.find(
            (ft) => ft.tickSpacing === account.tickSpacing
          );

          return {
            address: pool.publicKey,
            sqrtPriceX64: new BN(account.sqrtPriceX64.toString()),
            liquidity: new BN(account.liquidity.toString()),
            tickCurrent: account.tickCurrent,
            tickSpacing: account.tickSpacing,
            feeGrowthGlobalAX128: new BN(account.feeGrowthGlobalAX128.toString()),
            feeGrowthGlobalBX128: new BN(account.feeGrowthGlobalBX128.toString()),
            protocolFeesA: new BN(account.protocolFeesA.toString()),
            protocolFeesB: new BN(account.protocolFeesB.toString()),
            tokenMintA: new PublicKey(account.tokenMintA),
            tokenMintB: new PublicKey(account.tokenMintB),
            tokenVaultA: new PublicKey(account.tokenVaultA),
            tokenVaultB: new PublicKey(account.tokenVaultB),
            feeRate: feeTier?.feeRate ?? 3000,
            isPaused: account.isPaused !== 0,
          };
        });
      } catch (e) {
        console.error("Failed to fetch pools:", e);
        return [];
      }
    },
    staleTime: 30000,
  });
}

export function usePoolPrice(pool?: PoolAccount, decimalsA = 9, decimalsB = 6) {
  if (!pool) return null;

  return sqrtPriceX64ToPrice(pool.sqrtPriceX64, decimalsA, decimalsB).toNumber();
}
