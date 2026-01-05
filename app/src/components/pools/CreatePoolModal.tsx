"use client";

import { FC, useState } from "react";
import { X, ChevronDown, Info, Coins, AlertTriangle } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { FEE_TIERS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface CreatePoolModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreatePoolModal: FC<CreatePoolModalProps> = ({ isOpen, onClose }) => {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();

  const [tokenA, setTokenA] = useState<string>("");
  const [tokenB, setTokenB] = useState<string>("");
  const [selectedFeeRate, setSelectedFeeRate] = useState(3000);
  const [initialPrice, setInitialPrice] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const selectedFeeTier = FEE_TIERS.find((f) => f.feeRate === selectedFeeRate);

  const handleCreate = async () => {
    if (!connected) {
      setVisible(true);
      return;
    }

    setIsCreating(true);
    try {
      // In a real implementation, you would build and send the create pool transaction
      await new Promise((resolve) => setTimeout(resolve, 2000));
      onClose();
    } catch (error) {
      console.error("Create pool failed:", error);
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
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Token A</label>
                <button className="w-full flex items-center gap-2 p-3 rounded-xl border bg-background hover:bg-accent transition-colors">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary/50 to-purple-500/50 flex items-center justify-center">
                    <Coins className="h-3 w-3" />
                  </div>
                  <span>{tokenA || "Select"}</span>
                  <ChevronDown className="h-4 w-4 ml-auto" />
                </button>
              </div>

              {/* Token B */}
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Token B</label>
                <button className="w-full flex items-center gap-2 p-3 rounded-xl border bg-background hover:bg-accent transition-colors">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500/50 to-cyan-500/50 flex items-center justify-center">
                    <Coins className="h-3 w-3" />
                  </div>
                  <span>{tokenB || "Select"}</span>
                  <ChevronDown className="h-4 w-4 ml-auto" />
                </button>
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

          {/* Create Button */}
          <button
            onClick={handleCreate}
            disabled={!isValid || isCreating}
            className={cn(
              "w-full py-4 rounded-xl font-semibold text-lg transition-all",
              !isValid || isCreating
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {!connected
              ? "Connect Wallet"
              : isCreating
              ? "Creating..."
              : "Create Pool"}
          </button>
        </div>
      </div>
    </div>
  );
};
