import { NextRequest, NextResponse } from "next/server";
import { getPoolStats24h, getPoolSnapshots, getPool } from "@/lib/indexer/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    // Get pool info
    const pool = await getPool(address);
    if (!pool) {
      return NextResponse.json({ error: "Pool not found" }, { status: 404 });
    }

    // Get 24h stats
    const stats24h = await getPoolStats24h(address);

    // Get 7-day snapshots for charts
    const snapshots = await getPoolSnapshots(address, 24 * 7);

    // Calculate TVL (would normally use token prices)
    // For now, return placeholder
    const tvlUsd = 0; // TODO: Calculate from vault balances and prices

    // Calculate APR
    const aprAnnualized = stats24h.fees24h > 0 && tvlUsd > 0
      ? (stats24h.fees24h / tvlUsd) * 365 * 100
      : 0;

    return NextResponse.json({
      pool: {
        address: pool.address,
        tokenMintA: pool.token_mint_a,
        tokenMintB: pool.token_mint_b,
        feeRate: pool.fee_rate,
        tickSpacing: pool.tick_spacing,
        tickCurrent: pool.tick_current,
        liquidity: pool.liquidity,
        isPaused: pool.is_paused,
      },
      stats: {
        tvlUsd,
        volume24h: stats24h.volume24h,
        fees24h: stats24h.fees24h,
        txCount24h: stats24h.txCount24h,
        apr: aprAnnualized,
      },
      snapshots: snapshots.map((s) => ({
        time: s.snapshot_time,
        tvl: s.tvl_usd,
        volume: s.volume_usd,
        fees: s.fees_usd,
      })),
    });
  } catch (err) {
    console.error("[API] Pool stats error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
