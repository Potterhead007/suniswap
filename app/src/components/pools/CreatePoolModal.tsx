"use client";

import { FC, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { X, ChevronDown, Info, Coins, AlertTriangle, Loader2, CheckCircle } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { FEE_TIERS } from "@/lib/constants";
import { useCreatePool } from "@/lib/hooks";
import { cn } from "@/lib/utils";

// Token options for selection
const TOKEN_OPTIONS = [
  { symbol: "SOL", mint: "So11111111111111111111111111111111111111112" },
  { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
];

interface CreatePoolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreatePoolModal: FC<CreatePoolModalProps> = ({ isOpen, onClose }) => {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const { createPool, isCreating: hookCreating } = useCreatePool();

  const [tokenA, setTokenA] = useState<string>("");
  const [tokenB, setTokenB] = useState<string>("");
  const [selectedFeeRate, setSelectedFeeRate] = useState(3000);
  const [initialPrice, setInitialPrice] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showTokenSelectA, setShowTokenSelectA] = useState(false);
  const [showTokenSelectB, setShowTokenSelectB] = useState(false);

  if (!isOpen) return null;

  const selectedFeeTier = FEE_TIERS.find((f) => f.feeRate === selectedFeeRate);

  const handleCreate = async () => {
    if (!connected) {
      setVisible(true);
      return;
    }

    // Get token mints
    const tokenAOption = TOKEN_OPTIONS.find((t) => t.symbol === tokenA);
    const tokenBOption = TOKEN_OPTIONS.find((t) => t.symbol === tokenB);

    if (!tokenAOption || !tokenBOption) {
      setError("Please select both tokens");
      return;
    }

    const price = parseFloat(initialPrice);
    if (isNaN(price) || price <= 0) {
      setError("Please enter a valid initial price");
      return;
    }

    setError(null);
    setSuccess(null);
    setIsCreating(true);

    try {
      const signature = await createPool({
        tokenMintA: new PublicKey(tokenAOption.mint),
        tokenMintB: new PublicKey(tokenBOption.mint),
        feeRate: selectedFeeRate,
        initialPrice: price,
      });

      setSuccess(`Pool created! Tx: ${signature.slice(0, 8)}...`);

      // Close modal after 2 seconds
      setTimeout(() => {
        onClose();
        setSuccess(null);
      }, 2000);
    } catch (err) {
      console.error("Create pool failed:", err);
      setError(err instanceof Error ? err.message : "Failed to create pool");
    } finally {
      setIsCreating(false);
    }
  };

  const isValid = tokenA && tokenB && tokenA !== tokenB && initialPrice;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 rounded-xl border bg-card shadow-lg animate-fade-in max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-card z-10">
          <h3 className="text-lg font-semibold">Create New Pool</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Token Selection */}
          <div className="space-y-4">
            <h4 className="font-medium">Select Token Pair</h4>

            <div className="grid grid-cols-2 gap-4">
              {/* Token A */}
              <div className="relative">
                <label className="text-sm text-muted-foreground mb-1 block">Token A</label>
                <button
                  onClick={() => setShowTokenSelectA(!showTokenSelectA)}
                  className="w-full flex items-center gap-2 p-3 rounded-xl border bg-background hover:bg-accent transition-colors"
                >
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary/50 to-purple-500/50 flex items-center justify-center">
                    <Coins className="h-3 w-3" />
                  </div>
                  <span>{tokenA || "Select"}</span>
                  <ChevronDown className="h-4 w-4 ml-auto" />
                </button>
                {showTokenSelectA && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-xl shadow-lg z-20">
                    {TOKEN_OPTIONS.filter((t) => t.symbol !== tokenB).map((token) => (
                      <button
                        key={token.symbol}
                        onClick={() => {
                          setTokenA(token.symbol);
                          setShowTokenSelectA(false);
                        }}
                        className="w-full p-3 text-left hover:bg-accent transition-colors first:rounded-t-xl last:rounded-b-xl"
                      >
                        {token.symbol}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Token B */}
              <div className="relative">
                <label className="text-sm text-muted-foreground mb-1 block">Token B</label>
                <button
                  onClick={() => setShowTokenSelectB(!showTokenSelectB)}
                  className="w-full flex items-center gap-2 p-3 rounded-xl border bg-background hover:bg-accent transition-colors"
                >
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500/50 to-cyan-500/50 flex items-center justify-center">
                    <Coins className="h-3 w-3" />
                  </div>
                  <span>{tokenB || "Select"}</span>
                  <ChevronDown className="h-4 w-4 ml-auto" />
                </button>
                {showTokenSelectB && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border rounded-xl shadow-lg z-20">
                    {TOKEN_OPTIONS.filter((t) => t.symbol !== tokenA).map((token) => (
                      <button
                        key={token.symbol}
                        onClick={() => {
                          setTokenB(token.symbol);
                          setShowTokenSelectB(false);
                        }}
                        className="w-full p-3 text-left hover:bg-accent transition-colors first:rounded-t-xl last:rounded-b-xl"
                      >
                        {token.symbol}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Demo: Quick select */}
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="text-muted-foreground">Quick select:</span>
              <button
                onClick={() => {
                  setTokenA("SOL");
                  setTokenB("USDC");
                }}
                className="text-primary hover:underline"
              >
                SOL/USDC
              </button>
              <button
                onClick={() => {
                  setTokenA("USDC");
                  setTokenB("USDT");
                }}
                className="text-primary hover:underline"
              >
                USDC/USDT
              </button>
            </div>
          </div>

          {/* Fee Tier Selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-1">
              <h4 className="font-medium">Fee Tier</h4>
              <button className="p-1 rounded hover:bg-accent">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {FEE_TIERS.map((tier) => (
                <button
                  key={tier.feeRate}
                  onClick={() => setSelectedFeeRate(tier.feeRate)}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-colors",
                    selectedFeeRate === tier.feeRate
                      ? "border-primary bg-primary/10"
                      : "hover:bg-accent"
                  )}
                >
                  <div className="font-medium">{tier.label}</div>
                  <div className="text-xs text-muted-foreground">{tier.description}</div>
                </button>
              ))}
            </div>

            <div className="text-xs text-muted-foreground">
              Tick spacing: {selectedFeeTier?.tickSpacing}
            </div>
          </div>

          {/* Initial Price */}
          <div className="space-y-3">
            <div className="flex items-center gap-1">
              <h4 className="font-medium">Initial Price</h4>
              <button className="p-1 rounded hover:bg-accent">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="0.00"
                value={initialPrice}
                onChange={(e) => setInitialPrice(e.target.value)}
                className="w-full p-3 rounded-xl border bg-background text-lg outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                {tokenB || "Token B"} per {tokenA || "Token A"}
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              <span>Initial price determines the starting tick for the pool</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-success/10 text-success text-sm">
              <CheckCircle className="h-4 w-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Create Button */}
          <button
            onClick={handleCreate}
            disabled={!isValid || isCreating || hookCreating}
            className={cn(
              "w-full py-4 rounded-xl font-semibold text-lg transition-all",
              !isValid || isCreating || hookCreating
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {!connected ? (
              "Connect Wallet"
            ) : isCreating || hookCreating ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Creating Pool...
              </span>
            ) : (
              "Create Pool"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
