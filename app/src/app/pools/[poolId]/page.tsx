"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Droplets, TrendingUp, BarChart3, Copy } from "lucide-react";
import { usePoolByAddress, usePoolStats } from "@/lib/hooks";
import { PriceChart, LiquidityDepthChart, VolumeChart } from "@/components/charts";
import { TOKEN_METADATA, FEE_TIERS } from "@/lib/constants";
import { sqrtPriceX64ToPrice } from "@/lib/utils/math";
import { formatNumber, formatPercent } from "@/lib/utils";

interface PoolDetailPageProps {
  params: Promise<{ poolId: string }>;
}

export default function PoolDetailPage({ params }: PoolDetailPageProps) {
  const { poolId } = use(params);
  const { data: pool, isLoading, error } = usePoolByAddress(poolId);
  const { data: stats } = usePoolStats(pool ?? undefined);

  const copyAddress = () => {
    navigator.clipboard.writeText(poolId);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-2 mb-8">
          <Link href="/pools" className="p-2 hover:bg-accent rounded-lg transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 card p-6 h-[400px] animate-pulse bg-muted" />
          <div className="card p-6 h-[400px] animate-pulse bg-muted" />
        </div>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Link href="/pools" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="h-4 w-4" />
          Back to Pools
        </Link>
        <div className="card p-12 text-center">
          <p className="text-destructive mb-2">Pool not found</p>
          <p className="text-muted-foreground text-sm">{error?.message || "This pool does not exist"}</p>
        </div>
      </div>
    );
  }

  // Get token metadata
  const tokenAMint = pool.tokenMintA.toBase58();
  const tokenBMint = pool.tokenMintB.toBase58();
  const tokenAMeta = TOKEN_METADATA[tokenAMint] || { symbol: tokenAMint.slice(0, 4), name: "Unknown", decimals: 9 };
  const tokenBMeta = TOKEN_METADATA[tokenBMint] || { symbol: tokenBMint.slice(0, 4), name: "Unknown", decimals: 6 };

  // Calculate current price
  const price = sqrtPriceX64ToPrice(pool.sqrtPriceX64, tokenAMeta.decimals, tokenBMeta.decimals).toNumber();

  // Get fee tier info
  const feeTier = FEE_TIERS.find((ft) => ft.feeRate === pool.feeRate);
  const feeLabel = feeTier?.label || `${(pool.feeRate / 10000).toFixed(2)}%`;

  // Solscan link
  const explorerUrl = `https://solscan.io/account/${poolId}`;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link href="/pools" className="p-2 hover:bg-accent rounded-lg transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            {/* Token pair icons */}
            <div className="flex -space-x-2">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/50 to-purple-500/50 flex items-center justify-center border-2 border-card z-10">
                <span className="text-sm font-bold">{tokenAMeta.symbol[0]}</span>
              </div>
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500/50 to-cyan-500/50 flex items-center justify-center border-2 border-card">
                <span className="text-sm font-bold">{tokenBMeta.symbol[0]}</span>
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                {tokenAMeta.symbol} / {tokenBMeta.symbol}
              </h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-muted">{feeLabel}</span>
                <button
                  onClick={copyAddress}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  {poolId.slice(0, 4)}...{poolId.slice(-4)}
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-accent transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          View on Explorer
        </a>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card p-4">
          <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
            <Droplets className="h-4 w-4" />
            Total Value Locked
          </div>
          <div className="text-xl font-bold">
            {formatNumber(stats?.tvlUSD || 0, { prefix: "$", compact: true })}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
            <BarChart3 className="h-4 w-4" />
            24h Volume
          </div>
          <div className="text-xl font-bold">
            {formatNumber(stats?.volume24h || 0, { prefix: "$", compact: true })}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
            <TrendingUp className="h-4 w-4" />
            APR
          </div>
          <div className="text-xl font-bold text-success">
            {formatPercent((stats?.apr || 0) / 100)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-muted-foreground mb-1">Current Price</div>
          <div className="text-xl font-bold">
            {formatNumber(price, { decimals: 4 })} {tokenBMeta.symbol}
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Price Chart */}
        <div className="lg:col-span-2 card p-6">
          <PriceChart
            tokenA={tokenAMeta.symbol}
            tokenB={tokenBMeta.symbol}
            currentPrice={price}
            days={30}
            height={350}
          />
        </div>

        {/* Liquidity Depth */}
        <div className="card p-6">
          <LiquidityDepthChart
            currentPrice={price}
            tickSpacing={feeTier?.tickSpacing || 60}
            tokenA={tokenAMeta.symbol}
            tokenB={tokenBMeta.symbol}
            height={350}
          />
        </div>
      </div>

      {/* Volume Chart */}
      <div className="card p-6 mt-6">
        <VolumeChart
          days={14}
          height={200}
          avgDailyVolume={stats?.volume24h || 100000}
        />
      </div>

      {/* Pool Info */}
      <div className="grid gap-6 md:grid-cols-2 mt-6">
        <div className="card p-6">
          <h3 className="font-semibold mb-4">Pool Information</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Token A</span>
              <span className="font-mono">{tokenAMeta.symbol} ({tokenAMint.slice(0, 8)}...)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Token B</span>
              <span className="font-mono">{tokenBMeta.symbol} ({tokenBMint.slice(0, 8)}...)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fee Rate</span>
              <span>{feeLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tick Spacing</span>
              <span>{feeTier?.tickSpacing || pool.tickSpacing}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current Tick</span>
              <span>{pool.tickCurrentIndex}</span>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold mb-4">Fees Collected (All Time)</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">24h Fees</span>
              <span className="text-success">
                {formatNumber(stats?.fees24h || 0, { prefix: "$", compact: true })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">7d Fees</span>
              <span className="text-success">
                {formatNumber(stats?.fees7d || 0, { prefix: "$", compact: true })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Transactions (24h)</span>
              <span>{stats?.txCount24h || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
