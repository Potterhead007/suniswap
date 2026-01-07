import { NextRequest, NextResponse } from "next/server";
import { getUserTransactions } from "@/lib/indexer/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    // Get limit from query params
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");

    const transactions = await getUserTransactions(address, Math.min(limit, 100));

    return NextResponse.json({
      transactions: transactions.map((tx) => ({
        signature: tx.signature,
        type: tx.type,
        blockTime: tx.block_time,
        poolAddress: tx.pool_address,
        // Include amounts based on type
        ...("amount_in" in tx && { amountIn: tx.amount_in }),
        ...("amount_out" in tx && { amountOut: tx.amount_out }),
        ...("amount_a" in tx && { amountA: tx.amount_a }),
        ...("amount_b" in tx && { amountB: tx.amount_b }),
      })),
      count: transactions.length,
    });
  } catch (err) {
    console.error("[API] User transactions error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
