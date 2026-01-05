"use client";

import { FC, useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Wallet, Plus, Filter, Loader2 } from "lucide-react";
import { PositionCard, PositionData } from "./PositionCard";
import { useUserPositions, useAllPools, PositionAccount, PoolAccount } from "@/lib/hooks";
import { TOKEN_METADATA } from "@/lib/constants";
import { sqrtPriceX64ToPrice, tickToPrice } from "@/lib/utils/math";
import { cn } from "@/lib/utils";

// Helper to get token symbol from mint
function getTokenSymbol(mintAddress: string): string {
  const metadata = TOKEN_METADATA[mintAddress];
  return metadata?.symbol ?? mintAddress.slice(0, 4).toUpperCase();
}

// Convert PositionAccount to PositionData for display
function positionAccountToPositionData(
  position: PositionAccount,
  pool: PoolAccount | undefined
): PositionData | null {
  if (!pool) return null;

  const tokenAMint = pool.tokenMintA.toBase58();
  const tokenBMint = pool.tokenMintB.toBase58();
  const decimalsA = TOKEN_METADATA[tokenAMint]?.decimals ?? 6;
  const decimalsB = TOKEN_METADATA[tokenBMint]?.decimals ?? 6;

  const priceLower = tickToPrice(position.tickLower, decimalsA, decimalsB).toNumber();
  const priceUpper = tickToPrice(position.tickUpper, decimalsA, decimalsB).toNumber();
  const currentPrice = sqrtPriceX64ToPrice(pool.sqrtPriceX64, decimalsA, decimalsB).toNumber();

  // Convert tokens owed to human-readable amounts
  const tokensOwedA = position.tokensOwedA.toNumber() / Math.pow(10, decimalsA);
  const tokensOwedB = position.tokensOwedB.toNumber() / Math.pow(10, decimalsB);

  // Estimate USD values (would need price oracle for accurate values)
  const feesUsd = tokensOwedA * currentPrice + tokensOwedB;
  const valueUsd = position.liquidity.toNumber() / 1e6; // Simplified estimate

  return {
    address: position.address.toBase58(),
    pool: {
      tokenA: { symbol: getTokenSymbol(tokenAMint) },
      tokenB: { symbol: getTokenSymbol(tokenBMint) },
      feeRate: pool.feeRate,
    },
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    priceLower,
    priceUpper,
    currentPrice,
    liquidity: position.liquidity.toNumber(),
    tokensOwedA,
    tokensOwedB,
    valueUsd,
    feesUsd,
  };
}

type FilterType = "all" | "in-range" | "out-of-range";

interface PositionListProps {
  onAddLiquidity?: () => void;
}

export const PositionList: FC<PositionListProps> = ({ onAddLiquidity }) => {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [filter, setFilter] = useState<FilterType>("all");

  // Fetch user positions and all pools
  const { data: positionAccounts, isLoading: positionsLoading, error: positionsError } = useUserPositions();
  const { data: poolAccounts, isLoading: poolsLoading } = useAllPools();

  const isLoading = positionsLoading || poolsLoading;

  // Create a map of pool addresses for quick lookup
  const poolMap = useMemo(() => {
    if (!poolAccounts) return new Map<string, PoolAccount>();
    return new Map(poolAccounts.map((pool) => [pool.address.toBase58(), pool]));
  }, [poolAccounts]);

  // Convert position accounts to display format
  const allPositions = useMemo(() => {
    if (!positionAccounts) return [];
    return positionAccounts
      .map((pos) => positionAccountToPositionData(pos, poolMap.get(pos.pool.toBase58())))
      .filter((pos): pos is PositionData => pos !== null);
  }, [positionAccounts, poolMap]);

  const filteredPositions = useMemo(() => {
    return allPositions.filter((pos) => {
      if (filter === "all") return true;
      const isInRange = pos.currentPrice >= pos.priceLower && pos.currentPrice <= pos.priceUpper;
      if (filter === "in-range") return isInRange;
      if (filter === "out-of-range") return !isInRange;
      return true;
    });
  }, [allPositions, filter]);

  const totalValue = allPositions.reduce((acc, pos) => acc + pos.valueUsd, 0);
  const totalFees = allPositions.reduce((acc, pos) => acc + pos.feesUsd, 0);
  const inRangeCount = allPositions.filter(
    (pos) => pos.currentPrice >= pos.priceLower && pos.currentPrice <= pos.priceUpper
  ).length;

  if (!connected) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-lg mx-auto card p-12 text-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Wallet className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
          <p className="text-muted-foreground mb-6">
            Connect your wallet to view and manage your liquidity positions
          </p>
          <button onClick={() => setVisible(true)} className="btn-primary">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Your Positions</h1>
          <p className="text-muted-foreground">Manage your liquidity positions</p>
        </div>
        {onAddLiquidity && (
          <button onClick={onAddLiquidity} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            New Position
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-sm text-muted-foreground mb-1">Total Positions</div>
          <div className="text-2xl font-bold">{allPositions.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-muted-foreground mb-1">In Range</div>
          <div className="text-2xl font-bold text-success">
            {inRangeCount} / {allPositions.length}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-muted-foreground mb-1">Total Value</div>
          <div className="text-2xl font-bold">
            ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-muted-foreground mb-1">Unclaimed Fees</div>
          <div className="text-2xl font-bold text-success">
            ${totalFees.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {(["all", "in-range", "out-of-range"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm transition-colors capitalize",
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"
            )}
          >
            {f.replace("-", " ")}
          </button>
        ))}
      </div>

      {/* Position Grid */}
      {isLoading ? (
        <div className="card p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading your positions...</p>
        </div>
      ) : positionsError ? (
        <div className="card p-12 text-center">
          <p className="text-destructive mb-2">Failed to load positions</p>
          <p className="text-muted-foreground text-sm">{positionsError.message}</p>
        </div>
      ) : filteredPositions.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-muted-foreground mb-4">
            {allPositions.length === 0
              ? "You don't have any liquidity positions yet"
              : "No positions match your filter"}
          </p>
          {onAddLiquidity && allPositions.length === 0 && (
            <button onClick={onAddLiquidity} className="btn-primary">
              Create Position
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPositions.map((position) => (
            <PositionCard
              key={position.address}
              position={position}
              onManage={() => console.log("Manage position:", position.address)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
