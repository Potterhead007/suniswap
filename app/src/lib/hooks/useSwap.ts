"use client";

import { useCallback, useState } from "react";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProgram } from "./useProgram";
import { getFeeTierPda, getSwapTickArrays } from "../anchor/pdas";
import { PoolAccount } from "./usePool";
import BN from "bn.js";

export interface SwapParams {
  pool: PoolAccount;
  amountIn: BN;
  minimumAmountOut: BN;
  aToB: boolean;
  sqrtPriceLimitX64?: BN;
}

export function useSwap() {
  const { program, connection, wallet } = useProgram();
  const { publicKey, sendTransaction } = useWallet();
  const queryClient = useQueryClient();
  const [isSwapping, setIsSwapping] = useState(false);

  const swap = useCallback(
    async (params: SwapParams): Promise<string> => {
      if (!program || !publicKey || !wallet) {
        throw new Error("Wallet not connected");
      }

      const { pool, amountIn, minimumAmountOut, aToB, sqrtPriceLimitX64 } = params;

      setIsSwapping(true);

      try {
        // Get fee tier
        const [feeTierPda] = getFeeTierPda(pool.feeRate);

        // Get tick arrays for the swap
        const tickArrays = getSwapTickArrays(
          pool.address,
          pool.tickCurrent,
          pool.tickSpacing,
          aToB,
          3
        );

        // Get user token accounts
        const userTokenInput = await getAssociatedTokenAddress(
          aToB ? pool.tokenMintA : pool.tokenMintB,
          publicKey
        );
        const userTokenOutput = await getAssociatedTokenAddress(
          aToB ? pool.tokenMintB : pool.tokenMintA,
          publicKey
        );

        // Default sqrt price limit (0 means no limit)
        const priceLimit = sqrtPriceLimitX64 || new BN(0);

        // Build swap instruction
        const swapParams = {
          amount: new BN(amountIn.toString()),
          otherAmountThreshold: new BN(minimumAmountOut.toString()),
          sqrtPriceLimitX64: priceLimit,
          aToB,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await (program.methods as any)
          .swap(swapParams)
          .accounts({
            pool: pool.address,
            feeTier: feeTierPda,
            tokenMintA: pool.tokenMintA,
            tokenMintB: pool.tokenMintB,
            tokenVaultA: pool.tokenVaultA,
            tokenVaultB: pool.tokenVaultB,
            userTokenInput,
            userTokenOutput,
            tickArray0: tickArrays[0].pda,
            tickArray1: tickArrays[1].pda,
            tickArray2: tickArrays[2].pda,
            user: publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .transaction();

        // Send transaction
        const signature = await sendTransaction(tx, connection);

        // Wait for confirmation
        await connection.confirmTransaction(signature, "confirmed");

        // Invalidate relevant queries
        queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });
        queryClient.invalidateQueries({ queryKey: ["pool"] });

        return signature;
      } finally {
        setIsSwapping(false);
      }
    },
    [program, publicKey, wallet, connection, sendTransaction, queryClient]
  );

  return {
    swap,
    isSwapping,
  };
}

export function useSwapQuote(
  pool?: PoolAccount,
  amountIn?: BN,
  aToB?: boolean
) {
  // Simple quote calculation based on current pool price
  // In production, you'd want to simulate the swap more accurately
  if (!pool || !amountIn || aToB === undefined) {
    return null;
  }

  // Get fee rate (e.g., 3000 = 0.3%)
  const feeRate = pool.feeRate / 1_000_000;
  const amountAfterFee = amountIn.muln(1 - feeRate);

  // Simple constant product approximation
  // For more accurate quotes, you'd need to simulate tick crossings
  const estimatedOutput = amountAfterFee; // Simplified - assumes 1:1 for demo

  const priceImpact = 0.001; // Placeholder

  return {
    estimatedOutput,
    priceImpact,
    fee: amountIn.sub(amountAfterFee),
  };
}
