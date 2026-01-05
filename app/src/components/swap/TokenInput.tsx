"use client";

import { FC, useState } from "react";
import { ChevronDown, Coins } from "lucide-react";
import { TokenInfo } from "@/lib/stores/swapStore";
import { cn, formatNumber } from "@/lib/utils";

interface TokenInputProps {
  label: string;
  token: TokenInfo | null;
  amount: string;
  onAmountChange: (amount: string) => void;
  onSelectToken: () => void;
  balance?: string;
  disabled?: boolean;
  readOnly?: boolean;
  showMax?: boolean;
}

export const TokenInput: FC<TokenInputProps> = ({
  label,
  token,
  amount,
  onAmountChange,
  onSelectToken,
  balance,
  disabled = false,
  readOnly = false,
  showMax = true,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow valid number input
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      onAmountChange(value);
    }
  };

  const handleMax = () => {
    if (balance) {
      onAmountChange(balance);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-colors",
        isFocused && "border-primary",
        disabled && "opacity-50"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {balance && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Balance: {formatNumber(parseFloat(balance), { decimals: 4 })}</span>
            {showMax && !readOnly && (
              <button
                onClick={handleMax}
                className="text-primary hover:underline font-medium"
                disabled={disabled}
              >
                MAX
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          readOnly={readOnly}
          className={cn(
            "flex-1 bg-transparent text-2xl font-medium outline-none placeholder:text-muted-foreground/50",
            readOnly && "cursor-default"
          )}
        />

        <button
          onClick={onSelectToken}
          disabled={disabled}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 font-medium transition-colors",
            token
              ? "bg-secondary hover:bg-secondary/80"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {token ? (
            <>
              <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary/50 to-purple-500/50 flex items-center justify-center">
                {token.logo ? (
                  <img src={token.logo} alt={token.symbol} className="h-5 w-5 rounded-full" />
                ) : (
                  <Coins className="h-3 w-3" />
                )}
              </div>
              <span>{token.symbol}</span>
            </>
          ) : (
            <span>Select</span>
          )}
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {amount && token && (
        <div className="mt-2 text-sm text-muted-foreground">
          {/* You could add USD value here */}
        </div>
      )}
    </div>
  );
};
