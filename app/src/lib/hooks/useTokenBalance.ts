"use client";

import { useQuery } from "@tanstack/react-query";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount, TokenAccountNotFoundError } from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "./useProgram";
import BN from "bn.js";

// Native SOL mint (wrapped SOL)
const NATIVE_SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

export function useTokenBalance(mint?: PublicKey) {
  const { publicKey } = useWallet();
  const { connection } = useProgram();

  return useQuery({
    queryKey: ["tokenBalance", publicKey?.toBase58(), mint?.toBase58()],
    queryFn: async (): Promise<{ balance: BN; decimals: number } | null> => {
      if (!publicKey || !mint) return null;

      try {
        // Check if it's native SOL
        if (mint.equals(NATIVE_SOL_MINT)) {
          const balance = await connection.getBalance(publicKey);
          return {
            balance: new BN(balance),
            decimals: 9,
          };
        }

        // Get associated token account
        const ata = await getAssociatedTokenAddress(mint, publicKey);

        try {
          const account = await getAccount(connection, ata);
          const mintInfo = await connection.getParsedAccountInfo(mint);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals ?? 6;

          return {
            balance: new BN(account.amount.toString()),
            decimals,
          };
        } catch (e) {
          if (e instanceof TokenAccountNotFoundError) {
            // Account doesn't exist, balance is 0
            const mintInfo = await connection.getParsedAccountInfo(mint);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const decimals = (mintInfo.value?.data as any)?.parsed?.info?.decimals ?? 6;
            return { balance: new BN(0), decimals };
          }
          throw e;
        }
      } catch (e) {
        console.error("Failed to fetch token balance:", e);
        return null;
      }
    },
    enabled: !!publicKey && !!mint,
    staleTime: 5000,
    refetchInterval: 10000,
  });
}

export function useSolBalance() {
  const { publicKey } = useWallet();
  const { connection } = useProgram();

  return useQuery({
    queryKey: ["solBalance", publicKey?.toBase58()],
    queryFn: async (): Promise<number> => {
      if (!publicKey) return 0;
      const balance = await connection.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL;
    },
    enabled: !!publicKey,
    staleTime: 5000,
    refetchInterval: 10000,
  });
}

export function formatBalance(balance: BN, decimals: number): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const whole = balance.div(divisor);
  const remainder = balance.mod(divisor);

  const remainderStr = remainder.toString().padStart(decimals, "0");
  const significantDecimals = Math.min(decimals, 6);

  return `${whole.toString()}.${remainderStr.slice(0, significantDecimals)}`;
}
