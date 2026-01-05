"use client";

import { TransactionHistory } from "@/components/transactions";

export default function HistoryPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Transaction History</h1>
        <p className="text-muted-foreground">Your recent SuniSwap transactions</p>
      </div>

      <TransactionHistory limit={50} />
    </div>
  );
}
