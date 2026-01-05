"use client";

import { useCallback, useState } from "react";
import { SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProgram } from "./useProgram";
import {
  getFeeTierPda,
  getPositionPda,
  getTickArrayPda,
  getTickArrayStartIndex,
} from "../anchor/pdas";
import { PoolAccount } from "./usePool";
import { PositionAccount } from "./usePositions";
import BN from "bn.js";

export interface OpenPositionParams {
  pool: PoolAccount;
  tickLower: number;
  tickUpper: number;
}

export interface AddLiquidityParams {
  pool: PoolAccount;
  position: PositionAccount;
  liquidityAmount: BN;
  amountAMax: BN;
  amountBMax: BN;
}

export interface RemoveLiquidityParams {
  pool: PoolAccount;
  position: PositionAccount;
  liquidityAmount: BN;
  amountAMin: BN;
  amountBMin: BN;
}

export interface CollectFeesParams {
  pool: PoolAccount;
  position: PositionAccount;
  amountARequested: BN;
  amountBRequested: BN;
}

export function useLiquidity() {
  const { program, connection, wallet } = useProgram();
  const { publicKey, sendTransaction } = useWallet();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const openPosition = useCallback(
    async (params: OpenPositionParams): Promise<string> => {
      if (!program || !publicKey || !wallet) {
        throw new Error("Wallet not connected");
      }

      const { pool, tickLower, tickUpper } = params;

      setIsLoading(true);

      try {
        // Get position PDA
        const [positionPda] = getPositionPda(
          pool.address,
          publicKey,
          tickLower,
          tickUpper
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await (program.methods as any)
          .openPosition(tickLower, tickUpper)
          .accounts({
            pool: pool.address,
            position: positionPda,
            owner: publicKey,
            payer: publicKey,
            systemProgram: SystemProgram.programId,
          })
          .transaction();

        const signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(signature, "confirmed");

        queryClient.invalidateQueries({ queryKey: ["userPositions"] });

        return signature;
      } finally {
        setIsLoading(false);
      }
    },
    [program, publicKey, wallet, connection, sendTransaction, queryClient]
  );

  const increaseLiquidity = useCallback(
    async (params: AddLiquidityParams): Promise<string> => {
      if (!program || !publicKey || !wallet) {
        throw new Error("Wallet not connected");
      }

      const { pool, position, liquidityAmount, amountAMax, amountBMax } = params;

      setIsLoading(true);

      try {
        // Get tick arrays
        const tickArrayLowerStart = getTickArrayStartIndex(
          position.tickLower,
          pool.tickSpacing
        );
        const tickArrayUpperStart = getTickArrayStartIndex(
          position.tickUpper,
          pool.tickSpacing
        );

        const [tickArrayLower] = getTickArrayPda(pool.address, tickArrayLowerStart);
        const [tickArrayUpper] = getTickArrayPda(pool.address, tickArrayUpperStart);

        // Get user token accounts
        const userTokenA = await getAssociatedTokenAddress(pool.tokenMintA, publicKey);
        const userTokenB = await getAssociatedTokenAddress(pool.tokenMintB, publicKey);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await (program.methods as any)
          .increaseLiquidity(
            new BN(liquidityAmount.toString()),
            new BN(amountAMax.toString()),
            new BN(amountBMax.toString())
          )
          .accounts({
            pool: pool.address,
            position: position.address,
            tickArrayLower,
            tickArrayUpper,
            tokenMintA: pool.tokenMintA,
            tokenMintB: pool.tokenMintB,
            tokenVaultA: pool.tokenVaultA,
            tokenVaultB: pool.tokenVaultB,
            userTokenA,
            userTokenB,
            owner: publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .transaction();

        const signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(signature, "confirmed");

        queryClient.invalidateQueries({ queryKey: ["userPositions"] });
        queryClient.invalidateQueries({ queryKey: ["position"] });
        queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });

        return signature;
      } finally {
        setIsLoading(false);
      }
    },
    [program, publicKey, wallet, connection, sendTransaction, queryClient]
  );

  const decreaseLiquidity = useCallback(
    async (params: RemoveLiquidityParams): Promise<string> => {
      if (!program || !publicKey || !wallet) {
        throw new Error("Wallet not connected");
      }

      const { pool, position, liquidityAmount, amountAMin, amountBMin } = params;

      setIsLoading(true);

      try {
        // Get tick arrays
        const tickArrayLowerStart = getTickArrayStartIndex(
          position.tickLower,
          pool.tickSpacing
        );
        const tickArrayUpperStart = getTickArrayStartIndex(
          position.tickUpper,
          pool.tickSpacing
        );

        const [tickArrayLower] = getTickArrayPda(pool.address, tickArrayLowerStart);
        const [tickArrayUpper] = getTickArrayPda(pool.address, tickArrayUpperStart);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await (program.methods as any)
          .decreaseLiquidity(
            new BN(liquidityAmount.toString()),
            new BN(amountAMin.toString()),
            new BN(amountBMin.toString())
          )
          .accounts({
            pool: pool.address,
            position: position.address,
            tickArrayLower,
            tickArrayUpper,
            owner: publicKey,
          })
          .transaction();

        const signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(signature, "confirmed");

        queryClient.invalidateQueries({ queryKey: ["userPositions"] });
        queryClient.invalidateQueries({ queryKey: ["position"] });

        return signature;
      } finally {
        setIsLoading(false);
      }
    },
    [program, publicKey, wallet, connection, sendTransaction, queryClient]
  );

  const collectFees = useCallback(
    async (params: CollectFeesParams): Promise<string> => {
      if (!program || !publicKey || !wallet) {
        throw new Error("Wallet not connected");
      }

      const { pool, position, amountARequested, amountBRequested } = params;

      setIsLoading(true);

      try {
        // Get tick arrays
        const tickArrayLowerStart = getTickArrayStartIndex(
          position.tickLower,
          pool.tickSpacing
        );
        const tickArrayUpperStart = getTickArrayStartIndex(
          position.tickUpper,
          pool.tickSpacing
        );

        const [tickArrayLower] = getTickArrayPda(pool.address, tickArrayLowerStart);
        const [tickArrayUpper] = getTickArrayPda(pool.address, tickArrayUpperStart);
        const [feeTierPda] = getFeeTierPda(pool.feeRate);

        // Get user token accounts
        const userTokenA = await getAssociatedTokenAddress(pool.tokenMintA, publicKey);
        const userTokenB = await getAssociatedTokenAddress(pool.tokenMintB, publicKey);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await (program.methods as any)
          .collectFees(
            new BN(amountARequested.toString()),
            new BN(amountBRequested.toString())
          )
          .accounts({
            pool: pool.address,
            feeTier: feeTierPda,
            position: position.address,
            tickArrayLower,
            tickArrayUpper,
            tokenMintA: pool.tokenMintA,
            tokenMintB: pool.tokenMintB,
            tokenVaultA: pool.tokenVaultA,
            tokenVaultB: pool.tokenVaultB,
            userTokenA,
            userTokenB,
            owner: publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .transaction();

        const signature = await sendTransaction(tx, connection);
        await connection.confirmTransaction(signature, "confirmed");

        queryClient.invalidateQueries({ queryKey: ["userPositions"] });
        queryClient.invalidateQueries({ queryKey: ["position"] });
        queryClient.invalidateQueries({ queryKey: ["tokenBalance"] });

        return signature;
      } finally {
        setIsLoading(false);
      }
    },
    [program, publicKey, wallet, connection, sendTransaction, queryClient]
  );

  return {
    openPosition,
    increaseLiquidity,
    decreaseLiquidity,
    collectFees,
    isLoading,
  };
}
