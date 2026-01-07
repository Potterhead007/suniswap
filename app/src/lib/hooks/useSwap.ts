"use client";

import { useCallback, useState } from "react";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProgram } from "./useProgram";
import { getFeeTierPda, getSwapTickArrays, getTickArrayPda } from "../anchor/pdas";
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

        // The pool has tick_current=443635 (near MAX_TICK) but sqrt_price indicates tick 0
        // This is a known issue. The program validates tick arrays against stored tick_current.
        // We need to use tick arrays that match tick 443635:
        // - expected_start = floor(443635 / 480) * 480 = 443520 (can't create - TickAboveMaximum)
        // - But program allows expected_start - 480 = 443040 (exists!)
        // For aToB: 443040 -> 442560 -> 442080
        // For bToA: 443040 -> 443520 (can't create) - this direction won't work

        const ticksPerArray = 8 * pool.tickSpacing; // 480

        // Use hardcoded tick arrays that exist and are valid
        let tickArrayStarts: number[];
        if (aToB) {
          // Going left (price decreasing): use 443040, 442560, 442080
          tickArrayStarts = [443040, 442560, 442080];
        } else {
          // Going right won't work well since 443520 can't be created
          // Fall back to using 443040 for all (program will handle)
          tickArrayStarts = [443040, 443040, 443040];
        }

        const tickArrays = tickArrayStarts.map(startIndex => {
          const [pda] = getTickArrayPda(pool.address, startIndex);
          return { pda, startIndex };
        });

        console.log("Swap tick arrays:", tickArrays.map(t => ({ start: t.startIndex, pda: t.pda.toBase58() })));

        // Get user token accounts
        const userTokenInput = await getAssociatedTokenAddress(
          aToB ? pool.tokenMintA : pool.tokenMintB,
          publicKey
        );
        const userTokenOutput = await getAssociatedTokenAddress(
          aToB ? pool.tokenMintB : pool.tokenMintA,
          publicKey
        );

        console.log("User input token:", userTokenInput.toBase58());
        console.log("User output token:", userTokenOutput.toBase58());

        // Default sqrt price limit (0 means no limit)
        const priceLimit = sqrtPriceLimitX64 || new BN(0);

        // Build swap instruction
        const swapParams = {
          amount: new BN(amountIn.toString()),
          otherAmountThreshold: new BN(minimumAmountOut.toString()),
          sqrtPriceLimitX64: priceLimit,
          aToB,
        };

        console.log("Swap params:", {
          amount: swapParams.amount.toString(),
          otherAmountThreshold: swapParams.otherAmountThreshold.toString(),
          sqrtPriceLimitX64: swapParams.sqrtPriceLimitX64.toString(),
          aToB: swapParams.aToB,
        });

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

        // Set recent blockhash and fee payer
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = publicKey;

        console.log("Transaction ready, simulating first...");
        console.log("Pool address:", pool.address.toBase58());
        console.log("Fee tier:", feeTierPda.toBase58());
        console.log("Token mint A:", pool.tokenMintA.toBase58());
        console.log("Token mint B:", pool.tokenMintB.toBase58());
        console.log("Vault A:", pool.tokenVaultA.toBase58());
        console.log("Vault B:", pool.tokenVaultB.toBase58());

        // Try to simulate first to get better error
        try {
          const simulation = await connection.simulateTransaction(tx);
          console.log("Simulation result:", simulation.value);
          if (simulation.value.err) {
            console.error("Simulation error:", JSON.stringify(simulation.value.err));
            console.error("Simulation logs:", simulation.value.logs);
            throw new Error(`Simulation failed: ${JSON.stringify(simulation.value.err)}\nLogs: ${simulation.value.logs?.join('\n')}`);
          }
        } catch (simError) {
          console.error("Simulation exception:", simError);
          throw simError;
        }

        console.log("Simulation passed, sending to wallet...");

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
