"use client";

import { useQuery } from "@tanstack/react-query";
import { ParsedTransactionWithMeta } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "./useProgram";
import {
  fetchUserTransactions,
  fetchProgramTransactions,
  parseTransactionType,
} from "../services/indexerService";

export interface TransactionRecord {
  signature: string;
  type: string;
  timestamp: number | null;
  status: "success" | "failed";
  fee: number;
  slot: number;
}

function parseTransaction(tx: ParsedTransactionWithMeta): TransactionRecord {
  return {
    signature: tx.transaction.signatures[0],
    type: parseTransactionType(tx),
    timestamp: tx.blockTime ? tx.blockTime * 1000 : null,
    status: tx.meta?.err ? "failed" : "success",
    fee: (tx.meta?.fee ?? 0) / 1e9, // Convert lamports to SOL
    slot: tx.slot,
  };
}

// Fetch user's transaction history
export function useUserTransactionHistory(limit: number = 50) {
  const { publicKey } = useWallet();
  const { connection } = useProgram();

  return useQuery({
    queryKey: ["userTransactions", publicKey?.toBase58(), limit],
    queryFn: async (): Promise<TransactionRecord[]> => {
      if (!publicKey) return [];

      const transactions = await fetchUserTransactions(
        connection,
        publicKey,
        limit
      );

      return transactions.map(parseTransaction);
    },
    enabled: !!publicKey,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

// Fetch all program transactions (for global activity feed)
export function useProgramTransactions(limit: number = 100) {
  const { connection } = useProgram();

  return useQuery({
    queryKey: ["programTransactions", limit],
    queryFn: async (): Promise<TransactionRecord[]> => {
      const transactions = await fetchProgramTransactions(connection, limit);
      return transactions.map(parseTransaction);
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });
}
