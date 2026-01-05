"use client";

import { useQuery } from "@tanstack/react-query";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "./useProgram";
import { tickToPrice } from "../utils/math";
import BN from "bn.js";

export interface PositionAccount {
  address: PublicKey;
  pool: PublicKey;
  owner: PublicKey;
  tickLower: number;
  tickUpper: number;
  liquidity: BN;
  feeGrowthInsideALastX128: BN;
  feeGrowthInsideBLastX128: BN;
  tokensOwedA: BN;
  tokensOwedB: BN;
}

export function useUserPositions() {
  const { publicKey } = useWallet();
  const { readonlyProgram } = useProgram();

  return useQuery({
    queryKey: ["userPositions", publicKey?.toBase58()],
    queryFn: async (): Promise<PositionAccount[]> => {
      if (!publicKey) return [];

      try {
        // Fetch all position accounts filtered by owner
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const positions = await (readonlyProgram.account as any).position.all([
          {
            memcmp: {
              offset: 8 + 16 + 16 + 16 + 8 + 8 + 4 + 4 + 1 + 7 + 32, // offset to owner field
              bytes: publicKey.toBase58(),
            },
          },
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return positions.map((pos: any) => {
          const account = pos.account;
          return {
            address: pos.publicKey,
            pool: new PublicKey(account.pool),
            owner: new PublicKey(account.owner),
            tickLower: account.tickLower,
            tickUpper: account.tickUpper,
            liquidity: new BN(account.liquidity.toString()),
            feeGrowthInsideALastX128: new BN(account.feeGrowthInsideALastX128.toString()),
            feeGrowthInsideBLastX128: new BN(account.feeGrowthInsideBLastX128.toString()),
            tokensOwedA: new BN(account.tokensOwedA.toString()),
            tokensOwedB: new BN(account.tokensOwedB.toString()),
          };
        });
      } catch (e) {
        console.error("Failed to fetch positions:", e);
        return [];
      }
    },
    enabled: !!publicKey,
    staleTime: 10000,
  });
}

export function usePosition(positionAddress?: PublicKey) {
  const { readonlyProgram } = useProgram();

  return useQuery({
    queryKey: ["position", positionAddress?.toBase58()],
    queryFn: async (): Promise<PositionAccount | null> => {
      if (!positionAddress) return null;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const account = await (readonlyProgram.account as any).position.fetch(positionAddress);

        return {
          address: positionAddress,
          pool: new PublicKey(account.pool),
          owner: new PublicKey(account.owner),
          tickLower: account.tickLower,
          tickUpper: account.tickUpper,
          liquidity: new BN(account.liquidity.toString()),
          feeGrowthInsideALastX128: new BN(account.feeGrowthInsideALastX128.toString()),
          feeGrowthInsideBLastX128: new BN(account.feeGrowthInsideBLastX128.toString()),
          tokensOwedA: new BN(account.tokensOwedA.toString()),
          tokensOwedB: new BN(account.tokensOwedB.toString()),
        };
      } catch (e) {
        console.error("Failed to fetch position:", e);
        return null;
      }
    },
    enabled: !!positionAddress,
    staleTime: 10000,
  });
}

export function getPositionPriceRange(
  tickLower: number,
  tickUpper: number,
  decimalsA: number,
  decimalsB: number
) {
  return {
    priceLower: tickToPrice(tickLower, decimalsA, decimalsB).toNumber(),
    priceUpper: tickToPrice(tickUpper, decimalsA, decimalsB).toNumber(),
  };
}
