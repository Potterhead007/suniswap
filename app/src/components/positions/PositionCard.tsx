"use client";

import { FC } from "react";
import { DollarSign, Droplets, ArrowRight } from "lucide-react";
import { formatNumber, cn } from "@/lib/utils";

export interface PositionData {
  address: string;
  pool: {
    tokenA: { symbol: string };
    tokenB: { symbol: string };
    feeRate: number;
  };
  tickLower: number;
  tickUpper: number;
  priceLower: number;
  priceUpper: number;
  currentPrice: number;
  liquidity: number;
  tokensOwedA: number;
  tokensOwedB: number;
  valueUsd: number;
  feesUsd: number;
}

interface PositionCardProps {
  position: PositionData;
  onManage?: () => void;
}

export const PositionCard: FC<PositionCardProps> = ({ position, onManage }) => {
  const { pool, priceLower, priceUpper, currentPrice, valueUsd, feesUsd } = position;

  // Check if position is in range
  const isInRange = currentPrice >= priceLower && currentPrice <= priceUpper;

  // Calculate position width (percentage of the price range)
  const rangeWidth = priceUpper - priceLower;
  const currentPositionPct = ((currentPrice - priceLower) / rangeWidth) * 100;

  const feeLabel = `${(pool.feeRate / 10000).toFixed(2)}%`;

  return (
    <div className="card overflow-hidden">
      {/* Status Bar */}
      <div
        className={cn(
          "h-1",
          isInRange ? "bg-success" : "bg-muted"
        )}
      />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/50 to-purple-500/50 flex items-center justify-center border-2 border-card z-10">
                <span className="text-xs font-bold">{pool.tokenA.symbol[0]}</span>
              </div>
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500/50 to-cyan-500/50 flex items-center justify-center border-2 border-card">
                <span className="text-xs font-bold">{pool.tokenB.symbol[0]}</span>
              </div>
            </div>
            <div>
              <div className="font-semibold">
                {pool.tokenA.symbol} / {pool.tokenB.symbol}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{feeLabel}</span>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-xs font-medium",
                    isInRange
                      ? "bg-success/10 text-success"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {isInRange ? "In Range" : "Out of Range"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Price Range Visualization */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Min</span>
            <span>Max</span>
          </div>
          <div className="relative h-2 bg-muted rounded-full overflow-hidden">
            {/* Range bar */}
            <div className="absolute inset-0 bg-primary/30 rounded-full" />
            {/* Current price indicator */}
            {isInRange && (
              <div
                className="absolute top-0 bottom-0 w-1 bg-foreground rounded-full"
                style={{ left: `${Math.max(0, Math.min(100, currentPositionPct))}%` }}
              />
            )}
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span>{formatNumber(priceLower, { decimals: 4 })}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span>{formatNumber(priceUpper, { decimals: 4 })}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <DollarSign className="h-3 w-3" />
              Position Value
            </div>
            <div className="font-semibold">{formatNumber(valueUsd, { prefix: "$" })}</div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Droplets className="h-3 w-3" />
              Unclaimed Fees
            </div>
            <div className="font-semibold text-success">{formatNumber(feesUsd, { prefix: "$" })}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onManage}
            className="flex-1 btn-primary py-2 text-sm"
          >
            Manage
          </button>
          {feesUsd > 0 && (
            <button className="flex-1 btn-secondary py-2 text-sm">
              Collect Fees
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
