"use client";

import { useQuery } from "@tanstack/react-query";
import { getGlobalStats } from "../services/indexerService";

export interface GlobalStats {
  totalPools: number;
  volume24h: number;
  txCount24h: number;
  activePositions: number;
  uniqueUsers: number;
  tvlTotal: number;
}

export function useGlobalStats() {
  return useQuery({
    queryKey: ["globalStats"],
    queryFn: async (): Promise<GlobalStats | null> => {
      return getGlobalStats();
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });
}
