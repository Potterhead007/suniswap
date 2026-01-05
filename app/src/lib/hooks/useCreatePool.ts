"use client";

import { useCallback, useState } from "react";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProgram } from "./useProgram";
import {
  getPoolPda,
  getFeeTierPda,
  getConfigPda,
  orderTokenMints,
} from "../anchor/pdas";
import { priceToSqrtPriceX64 } from "../utils/math";
import { FEE_TIERS } from "../constants";

export interface CreatePoolParams {
  tokenMintA: PublicKey;
  tokenMintB: PublicKey;
  feeRate: number;
  initialPrice: number; // Price of token A in terms of token B
}

export function useCreatePool() {
  const { program, connection, wallet } = useProgram();
  const { publicKey, sendTransaction } = useWallet();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);

  const createPool = useCallback(
    async (params: CreatePoolParams): Promise<string> => {
      if (!program || !publicKey || !wallet) {
        throw new Error("Wallet not connected");
      }

      const { tokenMintA, tokenMintB, feeRate, initialPrice } = params;

      // Order tokens consistently
      const [orderedMintA, orderedMintB] = orderTokenMints(tokenMintA, tokenMintB);
      const isReversed = !orderedMintA.equals(tokenMintA);

      // Adjust price if tokens were reversed
      const adjustedPrice = isReversed ? 1 / initialPrice : initialPrice;

      // Get fee tier
      const feeTier = FEE_TIERS.find((ft) => ft.feeRate === feeRate);
      if (!feeTier) {
        throw new Error("Invalid fee rate");
      }

      setIsCreating(true);

      try {
        // Derive PDAs
        const [configPda] = getConfigPda();
        const [feeTierPda] = getFeeTierPda(feeRate);
        const [poolPda] = getPoolPda(orderedMintA, orderedMintB, feeRate);

        // Create token vault accounts
        const tokenVaultA = Keypair.generate();
        const tokenVaultB = Keypair.generate();

        // Calculate initial sqrt price
        const sqrtPriceX64 = priceToSqrtPriceX64(adjustedPrice, 9, 6); // Default decimals

        // Build initialize pool instruction
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await (program.methods as any)
          .initializePool(sqrtPriceX64)
          .accounts({
            config: configPda,
            feeTier: feeTierPda,
            pool: poolPda,
            tokenMintA: orderedMintA,
            tokenMintB: orderedMintB,
            tokenVaultA: tokenVaultA.publicKey,
            tokenVaultB: tokenVaultB.publicKey,
            payer: publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([tokenVaultA, tokenVaultB])
          .transaction();

        // Send transaction
        const signature = await sendTransaction(tx, connection, {
          signers: [tokenVaultA, tokenVaultB],
        });

        // Wait for confirmation
        await connection.confirmTransaction(signature, "confirmed");

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ["allPools"] });
        queryClient.invalidateQueries({ queryKey: ["pool"] });

        return signature;
      } finally {
        setIsCreating(false);
      }
    },
    [program, publicKey, wallet, connection, sendTransaction, queryClient]
  );

  return {
    createPool,
    isCreating,
  };
}
