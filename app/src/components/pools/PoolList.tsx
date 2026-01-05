"use client";

import { FC, useState, useMemo } from "react";
import { Search, Filter, ArrowUpDown, Plus, Loader2 } from "lucide-react";
import { PoolCard, PoolData } from "./PoolCard";
import { useAllPools, useAllPoolStats, PoolAccount } from "@/lib/hooks";
import { TOKEN_METADATA } from "@/lib/constants";
import { sqrtPriceX64ToPrice } from "@/lib/utils/math";
import { PoolStats } from "@/lib/services/indexerService";
import { cn } from "@/lib/utils";

// Helper to get token info from mint
function getTokenInfo(mintAddress: string): { symbol: string; name: string; logo?: string } {
  const metadata = TOKEN_METADATA[mintAddress];
  if (metadata) {
    return { symbol: metadata.symbol, name: metadata.name, logo: metadata.logo };
  }
  // Fallback for unknown tokens
  return {
    symbol: mintAddress.slice(0, 4).toUpperCase(),
    name: `Token ${mintAddress.slice(0, 8)}...`,
  };
}

// Convert PoolAccount to PoolData for display
function poolAccountToPoolData(
  pool: PoolAccount,
  stats?: PoolStats
): PoolData {
  const tokenAInfo = getTokenInfo(pool.tokenMintA.toBase58());
  const tokenBInfo = getTokenInfo(pool.tokenMintB.toBase58());

  // Calculate price from sqrt_price_x64
  const decimalsA = TOKEN_METADATA[pool.tokenMintA.toBase58()]?.decimals ?? 6;
  const decimalsB = TOKEN_METADATA[pool.tokenMintB.toBase58()]?.decimals ?? 6;
  const price = sqrtPriceX64ToPrice(pool.sqrtPriceX64, decimalsA, decimalsB).toNumber();

  return {
    address: pool.address.toBase58(),
    tokenA: tokenAInfo,
    tokenB: tokenBInfo,
    feeRate: pool.feeRate,
    tvl: stats?.tvlUSD ?? 0,
    volume24h: stats?.volume24h ?? 0,
    apr: stats?.apr ?? 0,
    price,
  };
}

type SortField = "tvl" | "volume24h" | "apr";
type SortDirection = "asc" | "desc";

interface PoolListProps {
  onCreatePool?: () => void;
}

export const PoolList: FC<PoolListProps> = ({ onCreatePool }) => {
  const { data: poolAccounts, isLoading, error } = useAllPools();
  const { data: poolStats } = useAllPoolStats(poolAccounts);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("tvl");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedFeeRate, setSelectedFeeRate] = useState<number | null>(null);

  // Convert pool accounts to display format with stats
  const allPools = useMemo(() => {
    if (!poolAccounts) return [];
    return poolAccounts.map((pool) => {
      const stats = poolStats?.get(pool.address.toBase58());
      return poolAccountToPoolData(pool, stats);
    });
  }, [poolAccounts, poolStats]);

  const filteredAndSortedPools = useMemo(() => {
    let pools = [...allPools];

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      pools = pools.filter(
        (pool) =>
          pool.tokenA.symbol.toLowerCase().includes(query) ||
          pool.tokenB.symbol.toLowerCase().includes(query) ||
          pool.tokenA.name.toLowerCase().includes(query) ||
          pool.tokenB.name.toLowerCase().includes(query)
      );
    }

    // Filter by fee rate
    if (selectedFeeRate !== null) {
      pools = pools.filter((pool) => pool.feeRate === selectedFeeRate);
    }

    // Sort
    pools.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      const multiplier = sortDirection === "desc" ? -1 : 1;
      return (aValue - bValue) * multiplier;
    });

    return pools;
  }, [allPools, searchQuery, sortField, sortDirection, selectedFeeRate]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const feeRates = [
    { value: 100, label: "0.01%" },
    { value: 500, label: "0.05%" },
    { value: 3000, label: "0.30%" },
    { value: 10000, label: "1.00%" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pools</h1>
          <p className="text-muted-foreground">Provide liquidity and earn fees</p>
        </div>
        {onCreatePool && (
          <button onClick={onCreatePool} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Pool
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search pools by token"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-card text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Fee Rate Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <div className="flex gap-1">
            <button
              onClick={() => setSelectedFeeRate(null)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm transition-colors",
                selectedFeeRate === null ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/80"
              )}
            >
              All
            </button>
            {feeRates.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setSelectedFeeRate(value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm transition-colors",
                  selectedFeeRate === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary hover:bg-secondary/80"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sort Options */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Sort by:</span>
        {[
          { field: "tvl" as SortField, label: "TVL" },
          { field: "volume24h" as SortField, label: "Volume" },
          { field: "apr" as SortField, label: "APR" },
        ].map(({ field, label }) => (
          <button
            key={field}
            onClick={() => handleSort(field)}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors",
              sortField === field ? "bg-primary/10 text-primary" : "hover:bg-accent"
            )}
          >
            {label}
            {sortField === field && (
              <ArrowUpDown
                className={cn("h-3 w-3", sortDirection === "asc" && "rotate-180")}
              />
            )}
          </button>
        ))}
      </div>

      {/* Pool Grid */}
      {isLoading ? (
        <div className="card p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading pools from blockchain...</p>
        </div>
      ) : error ? (
        <div className="card p-12 text-center">
          <p className="text-destructive mb-2">Failed to load pools</p>
          <p className="text-muted-foreground text-sm">{error.message}</p>
        </div>
      ) : filteredAndSortedPools.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-muted-foreground">
            {allPools.length === 0 ? "No pools exist yet. Be the first to create one!" : "No pools found matching your filters"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedPools.map((pool) => (
            <PoolCard key={pool.address} pool={pool} />
          ))}
        </div>
      )}
    </div>
  );
};
