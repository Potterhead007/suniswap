"use client";

import { FC } from "react";
import Link from "next/link";
import { TrendingUp, Droplets, ExternalLink } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/utils";

export interface PoolData {
  address: string;
  tokenA: {
    symbol: string;
    name: string;
    logo?: string;
  };
  tokenB: {
    symbol: string;
    name: string;
    logo?: string;
  };
  feeRate: number; // In basis points (e.g., 3000 = 0.30%)
  tvl: number;
  volume24h: number;
  apr: number;
  price: number;
}

interface PoolCardProps {
  pool: PoolData;
}

export const PoolCard: FC<PoolCardProps> = ({ pool }) => {
  const feeLabel = `${(pool.feeRate / 10000).toFixed(2)}%`;

  return (
    <Link href={`/pools/${pool.address}`} className="block">
      <div className="card p-4 hover:border-primary/50 transition-colors">
        {/* Pool Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Token pair icons */}
            <div className="flex -space-x-2">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/50 to-purple-500/50 flex items-center justify-center border-2 border-card z-10">
                <span className="text-xs font-bold">{pool.tokenA.symbol[0]}</span>
              </div>
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500/50 to-cyan-500/50 flex items-center justify-center border-2 border-card">
                <span className="text-xs font-bold">{pool.tokenB.symbol[0]}</span>
              </div>
            </div>
            <div>
              <div className="font-semibold">
                {pool.tokenA.symbol} / {pool.tokenB.symbol}
              </div>
              <div className="text-sm text-muted-foreground">{feeLabel} fee</div>
            </div>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Pool Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
              <Droplets className="h-3 w-3" />
              TVL
            </div>
            <div className="font-medium">
              {formatNumber(pool.tvl, { prefix: "$", compact: true })}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">24h Volume</div>
            <div className="font-medium">
              {formatNumber(pool.volume24h, { prefix: "$", compact: true })}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              APR
            </div>
            <div className="font-medium text-success">{formatPercent(pool.apr / 100)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Price</div>
            <div className="font-medium">{formatNumber(pool.price, { decimals: 4 })}</div>
          </div>
        </div>
      </div>
    </Link>
  );
};
