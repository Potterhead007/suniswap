"use client";

import { FC, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import { generateMockHistoricalPrices } from "@/lib/services/priceService";
import { formatNumber } from "@/lib/utils";

interface PriceChartProps {
  tokenA: string;
  tokenB: string;
  currentPrice: number;
  days?: number;
  height?: number;
}

export const PriceChart: FC<PriceChartProps> = ({
  tokenA,
  tokenB,
  currentPrice,
  days = 30,
  height = 300,
}) => {
  // Generate mock data (in production, this would come from an indexer)
  const data = useMemo(() => {
    return generateMockHistoricalPrices(currentPrice, days);
  }, [currentPrice, days]);

  const formatDate = (timestamp: number) => {
    return format(new Date(timestamp), "MMM d");
  };

  const formatPrice = (price: number) => {
    return formatNumber(price, { decimals: 4 });
  };

  // Calculate price change
  const priceChange = useMemo(() => {
    if (data.length < 2) return 0;
    const firstPrice = data[0].close;
    const lastPrice = data[data.length - 1].close;
    return ((lastPrice - firstPrice) / firstPrice) * 100;
  }, [data]);

  const isPositive = priceChange >= 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">
            {tokenA}/{tokenB}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">
              {formatNumber(currentPrice, { decimals: 4 })}
            </span>
            <span
              className={`text-sm font-medium ${
                isPositive ? "text-success" : "text-destructive"
              }`}
            >
              {isPositive ? "+" : ""}
              {priceChange.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {days}D
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor={isPositive ? "#22c55e" : "#ef4444"}
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor={isPositive ? "#22c55e" : "#ef4444"}
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatDate}
            tick={{ fill: "#888", fontSize: 12 }}
            axisLine={{ stroke: "#333" }}
            tickLine={{ stroke: "#333" }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={formatPrice}
            tick={{ fill: "#888", fontSize: 12 }}
            axisLine={{ stroke: "#333" }}
            tickLine={{ stroke: "#333" }}
            width={80}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a1a",
              border: "1px solid #333",
              borderRadius: "8px",
            }}
            labelFormatter={(label) => format(new Date(label), "MMM d, yyyy HH:mm")}
            formatter={(value) => [formatPrice(value as number), "Price"]}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke={isPositive ? "#22c55e" : "#ef4444"}
            strokeWidth={2}
            fill="url(#priceGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
