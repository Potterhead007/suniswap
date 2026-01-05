"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchTokenPrices,
  fetchSOLPrice,
  TOKEN_MINTS,
  PriceData,
} from "../services/priceService";

// Fetch prices for common tokens
export function useTokenPrices() {
  return useQuery({
    queryKey: ["tokenPrices"],
    queryFn: async (): Promise<PriceData> => {
      const mints = Object.values(TOKEN_MINTS);
      return fetchTokenPrices(mints);
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  });
}

// Fetch SOL price
export function useSOLPrice() {
  return useQuery({
    queryKey: ["solPrice"],
    queryFn: fetchSOLPrice,
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

// Get price for a specific token
export function useTokenPrice(mint?: string) {
  const { data: prices } = useTokenPrices();

  if (!mint || !prices) return null;
  return prices[mint]?.price ?? null;
}

// Calculate USD value for a token amount
export function useUSDValue(mint?: string, amount?: number) {
  const price = useTokenPrice(mint);

  if (price === null || amount === undefined) return null;
  return amount * price;
}
