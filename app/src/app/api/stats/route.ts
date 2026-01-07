import { NextResponse } from "next/server";
import { supabase, Swap } from "@/lib/indexer/supabase";

export async function GET() {
  try {
    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({
        totalPools: 0,
        volume24h: 0,
        txCount24h: 0,
        activePositions: 0,
        uniqueUsers: 0,
        tvlTotal: 0,
        timestamp: new Date().toISOString(),
        message: "Indexer not configured",
      });
    }

    // Get total pools count
    const { count: poolCount } = await supabase
      .from("pools")
      .select("*", { count: "exact", head: true });

    // Get 24h swap volume
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentSwaps } = await supabase
      .from("swaps")
      .select("amount_in")
      .gte("block_time", oneDayAgo);

    const swapData = (recentSwaps || []) as Pick<Swap, "amount_in">[];
    const volume24h = swapData.reduce(
      (sum, s) => sum + parseFloat(s.amount_in || "0"),
      0
    );

    // Get 24h tx count
    const { count: txCount24h } = await supabase
      .from("swaps")
      .select("*", { count: "exact", head: true })
      .gte("block_time", oneDayAgo);

    // Get total active positions
    const { count: activePositions } = await supabase
      .from("positions")
      .select("*", { count: "exact", head: true })
      .eq("is_open", true);

    // Get unique users (all-time)
    const { data: uniqueUsers } = await supabase
      .from("swaps")
      .select("user_address");

    const usersData = (uniqueUsers || []) as Pick<Swap, "user_address">[];
    const uniqueUserCount = new Set(usersData.map((u) => u.user_address)).size;

    return NextResponse.json({
      totalPools: poolCount || 0,
      volume24h,
      txCount24h: txCount24h || 0,
      activePositions: activePositions || 0,
      uniqueUsers: uniqueUserCount,
      tvlTotal: 0, // TODO: Calculate from all pool TVLs
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[API] Global stats error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
