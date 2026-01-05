"use client";

import { FC, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format, subDays } from "date-fns";
import { formatNumber } from "@/lib/utils";

interface VolumeChartProps {
  days?: number;
  height?: number;
  avgDailyVolume?: number;
}

// Generate mock volume data
function generateMockVolumeData(
  days: number,
  avgDailyVolume: number
): Array<{ date: string; volume: number; timestamp: number }> {
  const data: Array<{ date: string; volume: number; timestamp: number }> = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(now, i);
    const randomFactor = 0.3 + Math.random() * 1.4; // 30% to 170% of average
    const volume = avgDailyVolume * randomFactor;

    data.push({
      date: format(date, "MMM d"),
      volume,
      timestamp: date.getTime(),
    });
  }

  return data;
}

export const VolumeChart: FC<VolumeChartProps> = ({
  days = 14,
  height = 150,
  avgDailyVolume = 100000,
}) => {
  const data = useMemo(() => {
    return generateMockVolumeData(days, avgDailyVolume);
  }, [days, avgDailyVolume]);

  const totalVolume = useMemo(() => {
    return data.reduce((acc, d) => acc + d.volume, 0);
  }, [data]);

  const formatVolume = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">
            Trading Volume
          </h3>
          <div className="text-xl font-bold">
            {formatNumber(totalVolume, { prefix: "$", compact: true })}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">{days}D</div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.3} vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#888", fontSize: 10 }}
            axisLine={{ stroke: "#333" }}
            tickLine={{ stroke: "#333" }}
          />
          <YAxis
            tickFormatter={formatVolume}
            tick={{ fill: "#888", fontSize: 10 }}
            axisLine={{ stroke: "#333" }}
            tickLine={{ stroke: "#333" }}
            width={60}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a1a",
              border: "1px solid #333",
              borderRadius: "8px",
              fontSize: 12,
            }}
            formatter={(value) => [formatVolume(value as number), "Volume"]}
          />
          <Bar
            dataKey="volume"
            fill="#8b5cf6"
            radius={[4, 4, 0, 0]}
            opacity={0.8}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
