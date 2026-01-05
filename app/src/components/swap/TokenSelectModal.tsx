"use client";

import { FC, useState, useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import { X, Search, Coins } from "lucide-react";
import { TokenInfo } from "@/lib/stores/swapStore";
import { cn } from "@/lib/utils";

interface TokenSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: TokenInfo) => void;
  excludeToken?: PublicKey;
}

// Sample tokens for demonstration
const SAMPLE_TOKENS: TokenInfo[] = [
  {
    mint: new PublicKey("So11111111111111111111111111111111111111112"),
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
    logo: "/tokens/sol.svg",
  },
  {
    mint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logo: "/tokens/usdc.svg",
  },
  {
    mint: new PublicKey("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logo: "/tokens/usdt.svg",
  },
];

export const TokenSelectModal: FC<TokenSelectModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  excludeToken,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredTokens = useMemo(() => {
    return SAMPLE_TOKENS.filter((token) => {
      // Exclude already selected token
      if (excludeToken && token.mint.equals(excludeToken)) {
        return false;
      }
      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          token.symbol.toLowerCase().includes(query) ||
          token.name.toLowerCase().includes(query) ||
          token.mint.toBase58().toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [searchQuery, excludeToken]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 rounded-xl border bg-card shadow-lg animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Select a token</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or address"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border bg-background text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Popular tokens */}
        <div className="p-4 border-b">
          <p className="text-xs text-muted-foreground mb-2">Popular tokens</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_TOKENS.slice(0, 4).map((token) => (
              <button
                key={token.mint.toBase58()}
                onClick={() => onSelect(token)}
                disabled={excludeToken?.equals(token.mint)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                  excludeToken?.equals(token.mint)
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-accent"
                )}
              >
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-primary/50 to-purple-500/50 flex items-center justify-center">
                  <Coins className="h-3 w-3" />
                </div>
                {token.symbol}
              </button>
            ))}
          </div>
        </div>

        {/* Token List */}
        <div className="max-h-80 overflow-y-auto">
          {filteredTokens.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>No tokens found</p>
            </div>
          ) : (
            <div className="p-2">
              {filteredTokens.map((token) => (
                <button
                  key={token.mint.toBase58()}
                  onClick={() => onSelect(token)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors"
                >
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/50 to-purple-500/50 flex items-center justify-center">
                    {token.logo ? (
                      <img src={token.logo} alt={token.symbol} className="h-8 w-8 rounded-full" />
                    ) : (
                      <Coins className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium">{token.symbol}</div>
                    <div className="text-sm text-muted-foreground">{token.name}</div>
                  </div>
                  {token.balance && (
                    <div className="text-right">
                      <div className="font-medium">{token.balance}</div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
