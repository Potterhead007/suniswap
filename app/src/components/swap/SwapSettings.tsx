"use client";

import { FC, useState } from "react";
import { Info, AlertTriangle } from "lucide-react";
import { useSwapStore } from "@/lib/stores/swapStore";
import { cn } from "@/lib/utils";

const SLIPPAGE_PRESETS = [
  { value: 10, label: "0.1%" },
  { value: 50, label: "0.5%" },
  { value: 100, label: "1%" },
];

export const SwapSettings: FC = () => {
  const { slippageBps, deadline, setSlippageBps, setDeadline } = useSwapStore();
  const [customSlippage, setCustomSlippage] = useState("");
  const [customDeadline, setCustomDeadline] = useState("");

  const handleSlippagePreset = (value: number) => {
    setSlippageBps(value);
    setCustomSlippage("");
  };

  const handleCustomSlippage = (value: string) => {
    setCustomSlippage(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
      setSlippageBps(Math.round(parsed * 100));
    }
  };

  const handleCustomDeadline = (value: string) => {
    setCustomDeadline(value);
    const parsed = parseInt(value);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 180) {
      setDeadline(parsed);
    }
  };

  const isHighSlippage = slippageBps > 100;
  const isLowSlippage = slippageBps < 10;

  return (
    <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
      {/* Slippage Tolerance */}
      <div>
        <div className="flex items-center gap-1 mb-3">
          <span className="text-sm font-medium">Slippage Tolerance</span>
          <button className="p-1 rounded hover:bg-accent">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {SLIPPAGE_PRESETS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleSlippagePreset(value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                slippageBps === value && !customSlippage
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary hover:bg-secondary/80"
              )}
            >
              {label}
            </button>
          ))}
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Custom"
              value={customSlippage}
              onChange={(e) => handleCustomSlippage(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
        </div>

        {/* Slippage warnings */}
        {isHighSlippage && (
          <div className="flex items-center gap-2 mt-2 text-warning text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>Your transaction may be frontrun</span>
          </div>
        )}
        {isLowSlippage && (
          <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>Your transaction may fail</span>
          </div>
        )}
      </div>

      {/* Transaction Deadline */}
      <div>
        <div className="flex items-center gap-1 mb-3">
          <span className="text-sm font-medium">Transaction Deadline</span>
          <button className="p-1 rounded hover:bg-accent">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={deadline.toString()}
              value={customDeadline}
              onChange={(e) => handleCustomDeadline(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border bg-background text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              minutes
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
