"use client";

import { FC } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  ExternalLink,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  CheckCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { useUserTransactionHistory, TransactionRecord } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface TransactionHistoryProps {
  limit?: number;
}

const getTransactionIcon = (type: string) => {
  switch (type) {
    case "Swap":
      return <RefreshCw className="h-4 w-4" />;
    case "Add Liquidity":
      return <ArrowDownRight className="h-4 w-4 text-success" />;
    case "Remove Liquidity":
      return <ArrowUpRight className="h-4 w-4 text-destructive" />;
    case "Collect Fees":
      return <ArrowUpRight className="h-4 w-4 text-primary" />;
    default:
      return <RefreshCw className="h-4 w-4" />;
  }
};

const getTransactionColor = (type: string) => {
  switch (type) {
    case "Swap":
      return "text-foreground";
    case "Add Liquidity":
      return "text-success";
    case "Remove Liquidity":
      return "text-destructive";
    case "Collect Fees":
      return "text-primary";
    default:
      return "text-muted-foreground";
  }
};

export const TransactionHistory: FC<TransactionHistoryProps> = ({ limit = 20 }) => {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { data: transactions, isLoading, error } = useUserTransactionHistory(limit);

  if (!connected) {
    return (
      <div className="card p-8 text-center">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Wallet className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-semibold mb-2">Connect Wallet</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Connect your wallet to view transaction history
        </p>
        <button onClick={() => setVisible(true)} className="btn-primary">
          Connect Wallet
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="card p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-muted-foreground">Loading transactions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-8 text-center">
        <p className="text-destructive mb-2">Failed to load transactions</p>
        <p className="text-muted-foreground text-sm">{error.message}</p>
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-muted-foreground">No transactions found</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Transaction History</h3>
      </div>

      <div className="divide-y">
        {transactions.map((tx) => (
          <TransactionRow key={tx.signature} transaction={tx} />
        ))}
      </div>
    </div>
  );
};

const TransactionRow: FC<{ transaction: TransactionRecord }> = ({ transaction }) => {
  const explorerUrl = `https://solscan.io/tx/${transaction.signature}`;

  return (
    <div className="p-4 hover:bg-muted/30 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "h-8 w-8 rounded-full flex items-center justify-center",
              transaction.status === "success" ? "bg-success/10" : "bg-destructive/10"
            )}
          >
            {getTransactionIcon(transaction.type)}
          </div>
          <div>
            <div className={cn("font-medium", getTransactionColor(transaction.type))}>
              {transaction.type}
            </div>
            <div className="text-xs text-muted-foreground">
              {transaction.timestamp
                ? format(new Date(transaction.timestamp), "MMM d, yyyy HH:mm")
                : "Pending..."}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="flex items-center gap-1">
              {transaction.status === "success" ? (
                <CheckCircle className="h-3 w-3 text-success" />
              ) : (
                <XCircle className="h-3 w-3 text-destructive" />
              )}
              <span
                className={cn(
                  "text-xs",
                  transaction.status === "success" ? "text-success" : "text-destructive"
                )}
              >
                {transaction.status === "success" ? "Success" : "Failed"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Fee: {transaction.fee.toFixed(6)} SOL
            </div>
          </div>

          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>
        </div>
      </div>
    </div>
  );
};
