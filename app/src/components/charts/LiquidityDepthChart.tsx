"use client";

import { FC, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { formatNumber } from "@/lib/utils";

interface LiquidityDepthChartProps {
  currentPrice: number;
  tickSpacing: number;
  liquidityData?: Array<{ tick: number; liquidity: number }>;
  height?: number;
  tokenA: string;
  tokenB: string;
}

// Generate mock liquidity distribution around current price
function generateMockLiquidityData(
  currentPrice: number,
  tickSpacing: number,
  numPoints: number = 100
): Array<{ price: number; liquidityAsk: number; liquidityBid: number }> {
  const data: Array<{ price: number; liquidityAsk: number; liquidityBid: number }> = [];
  const priceRange = currentPrice * 0.5; // 50% range each direction

  for (let i = 0; i < numPoints; i++) {
    const price = currentPrice - priceRange + (i / numPoints) * priceRange * 2;

    // Simulate concentrated liquidity - more liquidity near current price
    const distanceFromCurrent = Math.abs(price - currentPrice) / currentPrice;
    const baseLiquidity = Math.exp(-distanceFromCurrent * 5) * 1000000;

    // Add some randomness
    const randomFactor = 0.5 + Math.random();

    if (price < currentPrice) {
      // Bid side (below current price)
      data.push({
        price,
        liquidityBid: baseLiquidity * randomFactor,
        liquidityAsk: 0,
      });
    } else {
      // Ask side (above current price)
      data.push({
        price,
        liquidityAsk: baseLiquidity * randomFactor,
        liquidityBid: 0,
      });
    }
  }

  return data;
}

export const LiquidityDepthChart: FC<LiquidityDepthChartProps> = ({
  currentPrice,
  tickSpacing,
  height = 200,
  tokenA,
  tokenB,
}) => {
  const data = useMemo(() => {
    return generateMockLiquidityData(currentPrice, tickSpacing);
  }, [currentPrice, tickSpacing]);

  const formatPrice = (price: number) => {
    return formatNumber(price, { decimals: 2 });
  };

  const formatLiquidity = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(0);
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">
          Liquidity Depth
        </h3>
        <div className="text-xs text-muted-foreground">
          {tokenA}/{tokenB}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="bidGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="askGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
          <XAxis
            dataKey="price"
            tickFormatter={formatPrice}
            tick={{ fill: "#888", fontSize: 10 }}
            axisLine={{ stroke: "#333" }}
            tickLine={{ stroke: "#333" }}
          />
          <YAxis
            tickFormatter={formatLiquidity}
            tick={{ fill: "#888", fontSize: 10 }}
            axisLine={{ stroke: "#333" }}
            tickLine={{ stroke: "#333" }}
            width={50}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a1a",
              border: "1px solid #333",
              borderRadius: "8px",
              fontSize: 12,
            }}
            formatter={(value, name) => [
              formatLiquidity(value as number),
              name === "liquidityBid" ? "Bid Liquidity" : "Ask Liquidity",
            ]}
            labelFormatter={(label) => `Price: ${formatPrice(label as number)}`}
          />
          <ReferenceLine
            x={currentPrice}
            stroke="#fff"
            strokeDasharray="3 3"
            label={{
              value: "Current",
              position: "top",
              fill: "#888",
              fontSize: 10,
            }}
          />
          <Area
            type="monotone"
            dataKey="liquidityBid"
            stroke="#22c55e"
            fill="url(#bidGradient)"
            stackId="1"
          />
          <Area
            type="monotone"
            dataKey="liquidityAsk"
            stroke="#ef4444"
            fill="url(#askGradient)"
            stackId="1"
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex justify-center gap-6 mt-2 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-success" />
          <span className="text-muted-foreground">Bid (Buy {tokenA})</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-destructive" />
          <span className="text-muted-foreground">Ask (Sell {tokenA})</span>
        </div>
      </div>
    </div>
  );
};
