"use client";

import { FC, useState, useCallback, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ArrowDownUp, Settings, Loader2, AlertTriangle, Info } from "lucide-react";
import { TokenInput } from "./TokenInput";
import { TokenSelectModal } from "./TokenSelectModal";
import { SwapSettings } from "./SwapSettings";
import { useSwapStore, TokenInfo } from "@/lib/stores/swapStore";
import { useSwap } from "@/lib/hooks/useSwap";
import { usePool } from "@/lib/hooks/usePool";
import { useTokenBalance, formatBalance } from "@/lib/hooks/useTokenBalance";
import { parseTokenAmount } from "@/lib/utils/math";
import { cn, formatPercent } from "@/lib/utils";

export const SwapCard: FC = () => {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { swap, isSwapping: swapLoading } = useSwap();

  const {
    tokenA,
    tokenB,
    amountA,
    amountB,
    slippageBps,
    isSwapping,
    priceImpact,
    minimumReceived,
    fee,
    setTokenA,
    setTokenB,
    setAmountA,
    setAmountB,
    switchTokens,
    setQuoteData,
    setIsSwapping,
  } = useSwapStore();

  const [selectingToken, setSelectingToken] = useState<"A" | "B" | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch pool data for the selected pair
  const { data: pool } = usePool(
    tokenA?.mint,
    tokenB?.mint,
    3000 // Default to 0.3% fee tier
  );

  // Fetch token balances
  const { data: balanceA } = useTokenBalance(tokenA?.mint);
  const { data: balanceB } = useTokenBalance(tokenB?.mint);

  // Calculate quote when input changes
  useEffect(() => {
    if (tokenA && tokenB && amountA && parseFloat(amountA) > 0 && pool) {
      const timer = setTimeout(() => {
        // Calculate output based on pool state
        const feeRate = pool.feeRate / 1_000_000;
        const amountAfterFee = parseFloat(amountA) * (1 - feeRate);

        // Simplified quote - in production you'd simulate the actual swap
        const estimatedOutput = amountAfterFee.toFixed(6);
        setAmountB(estimatedOutput);

        setQuoteData({
          priceImpact: 0.003, // Would calculate from liquidity
          minimumReceived: (parseFloat(estimatedOutput) * (1 - slippageBps / 10000)).toFixed(6),
          fee: (parseFloat(amountA) * feeRate).toFixed(6),
        });
      }, 300);
      return () => clearTimeout(timer);
    } else if (tokenA && tokenB && amountA && parseFloat(amountA) > 0) {
      // No pool found - simulate anyway for demo
      const timer = setTimeout(() => {
        const estimatedOutput = (parseFloat(amountA) * 0.997).toFixed(6);
        setAmountB(estimatedOutput);
        setQuoteData({
          priceImpact: 0.003,
          minimumReceived: (parseFloat(estimatedOutput) * (1 - slippageBps / 10000)).toFixed(6),
          fee: (parseFloat(amountA) * 0.003).toFixed(6),
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [tokenA, tokenB, amountA, slippageBps, pool, setAmountB, setQuoteData]);

  const handleTokenSelect = useCallback(
    (token: TokenInfo) => {
      if (selectingToken === "A") {
        if (tokenB && token.mint.equals(tokenB.mint)) {
          switchTokens();
        } else {
          setTokenA(token);
        }
      } else if (selectingToken === "B") {
        if (tokenA && token.mint.equals(tokenA.mint)) {
          switchTokens();
        } else {
          setTokenB(token);
        }
      }
      setSelectingToken(null);
    },
    [selectingToken, tokenA, tokenB, setTokenA, setTokenB, switchTokens]
  );

  const handleSwap = async () => {
    if (!connected || !publicKey || !tokenA || !tokenB || !amountA) return;
    if (!pool) {
      setError("No pool found for this pair");
      return;
    }

    setError(null);
    setIsSwapping(true);

    try {
      const amountIn = parseTokenAmount(amountA, tokenA.decimals);
      const minOut = parseTokenAmount(
        (parseFloat(amountB) * (1 - slippageBps / 10000)).toString(),
        tokenB.decimals
      );

      const signature = await swap({
        pool,
        amountIn,
        minimumAmountOut: minOut,
        aToB: true, // Assuming A to B
      });

      console.log("Swap successful:", signature);

      // Reset after successful swap
      setAmountA("");
      setAmountB("");
    } catch (err) {
      console.error("Swap failed:", err);
      setError(err instanceof Error ? err.message : "Swap failed");
    } finally {
      setIsSwapping(false);
    }
  };

  const getButtonState = () => {
    if (!connected) {
      return { text: "Connect Wallet", disabled: false, onClick: () => setVisible(true) };
    }
    if (!tokenA || !tokenB) {
      return { text: "Select tokens", disabled: true, onClick: () => {} };
    }
    if (!amountA || parseFloat(amountA) === 0) {
      return { text: "Enter amount", disabled: true, onClick: () => {} };
    }
    if (balanceA && parseFloat(amountA) > parseFloat(formatBalance(balanceA.balance, balanceA.decimals))) {
      return { text: "Insufficient balance", disabled: true, onClick: () => {} };
    }
    if (isSwapping || swapLoading) {
      return { text: "Swapping...", disabled: true, onClick: () => {} };
    }
    return { text: "Swap", disabled: false, onClick: handleSwap };
  };

  const buttonState = getButtonState();
  const balanceAFormatted = balanceA ? formatBalance(balanceA.balance, balanceA.decimals) : undefined;
  const balanceBFormatted = balanceB ? formatBalance(balanceB.balance, balanceB.decimals) : undefined;

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="card p-1">
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 className="text-lg font-semibold">Swap</h2>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
          >
            <Settings className={cn("h-5 w-5", showSettings && "text-primary")} />
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="px-4 pb-4">
            <SwapSettings />
          </div>
        )}

        {/* Swap Form */}
        <div className="p-4 pt-2 space-y-2">
          {/* Token A Input */}
          <TokenInput
            label="You pay"
            token={tokenA}
            amount={amountA}
            onAmountChange={setAmountA}
            onSelectToken={() => setSelectingToken("A")}
            balance={balanceAFormatted}
            disabled={isSwapping || swapLoading}
          />

          {/* Switch Button */}
          <div className="flex justify-center -my-1 z-10 relative">
            <button
              onClick={switchTokens}
              disabled={isSwapping || swapLoading}
              className="p-2 rounded-xl border bg-card hover:bg-accent transition-colors"
            >
              <ArrowDownUp className="h-5 w-5" />
            </button>
          </div>

          {/* Token B Input */}
          <TokenInput
            label="You receive"
            token={tokenB}
            amount={amountB}
            onAmountChange={setAmountB}
            onSelectToken={() => setSelectingToken("B")}
            balance={balanceBFormatted}
            disabled={isSwapping || swapLoading}
            readOnly
            showMax={false}
          />

          {/* Quote Details */}
          {tokenA && tokenB && amountA && parseFloat(amountA) > 0 && amountB && (
            <div className="rounded-xl border bg-muted/30 p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  Rate
                  <Info className="h-3 w-3" />
                </span>
                <span>
                  1 {tokenA.symbol} = {(parseFloat(amountB) / parseFloat(amountA)).toFixed(4)}{" "}
                  {tokenB.symbol}
                </span>
              </div>

              {priceImpact !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Price Impact</span>
                  <span
                    className={cn(
                      priceImpact > 0.05 && "text-destructive",
                      priceImpact > 0.01 && priceImpact <= 0.05 && "text-warning"
                    )}
                  >
                    {formatPercent(priceImpact)}
                  </span>
                </div>
              )}

              {minimumReceived && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Minimum received</span>
                  <span>
                    {minimumReceived} {tokenB.symbol}
                  </span>
                </div>
              )}

              {fee && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Network Fee</span>
                  <span>~$0.01</span>
                </div>
              )}

              {!pool && (
                <div className="text-warning text-xs">
                  Pool not found - showing estimated quote
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Swap Button */}
          <button
            onClick={buttonState.onClick}
            disabled={buttonState.disabled}
            className={cn(
              "w-full py-4 rounded-xl font-semibold text-lg transition-all",
              buttonState.disabled
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {isSwapping || swapLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Swapping...
              </span>
            ) : (
              buttonState.text
            )}
          </button>

          {/* High Price Impact Warning */}
          {priceImpact !== null && priceImpact > 0.05 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>Price impact is very high. You may receive significantly less tokens.</span>
            </div>
          )}
        </div>
      </div>

      {/* Token Select Modal */}
      <TokenSelectModal
        isOpen={selectingToken !== null}
        onClose={() => setSelectingToken(null)}
        onSelect={handleTokenSelect}
        excludeToken={selectingToken === "A" ? tokenB?.mint : tokenA?.mint}
      />
    </div>
  );
};
