import { create } from "zustand";
import { PublicKey } from "@solana/web3.js";

export interface TokenInfo {
  mint: PublicKey;
  symbol: string;
  name: string;
  decimals: number;
  logo?: string;
  balance?: string;
}

interface SwapState {
  // Input tokens
  tokenA: TokenInfo | null;
  tokenB: TokenInfo | null;
  amountA: string;
  amountB: string;

  // Swap direction
  aToB: boolean;

  // Settings
  slippageBps: number;
  deadline: number; // minutes

  // Loading states
  isQuoting: boolean;
  isSwapping: boolean;

  // Quote data
  priceImpact: number | null;
  minimumReceived: string | null;
  fee: string | null;

  // Actions
  setTokenA: (token: TokenInfo | null) => void;
  setTokenB: (token: TokenInfo | null) => void;
  setAmountA: (amount: string) => void;
  setAmountB: (amount: string) => void;
  switchTokens: () => void;
  setSlippageBps: (bps: number) => void;
  setDeadline: (minutes: number) => void;
  setQuoteData: (data: { priceImpact: number; minimumReceived: string; fee: string }) => void;
  setIsQuoting: (isQuoting: boolean) => void;
  setIsSwapping: (isSwapping: boolean) => void;
  reset: () => void;
}

const initialState = {
  tokenA: null,
  tokenB: null,
  amountA: "",
  amountB: "",
  aToB: true,
  slippageBps: 50, // 0.5%
  deadline: 30, // 30 minutes
  isQuoting: false,
  isSwapping: false,
  priceImpact: null,
  minimumReceived: null,
  fee: null,
};

export const useSwapStore = create<SwapState>((set) => ({
  ...initialState,

  setTokenA: (token) => set({ tokenA: token }),
  setTokenB: (token) => set({ tokenB: token }),

  setAmountA: (amount) =>
    set({
      amountA: amount,
      aToB: true,
      // Reset quote when input changes
      priceImpact: null,
      minimumReceived: null,
      fee: null,
    }),

  setAmountB: (amount) =>
    set({
      amountB: amount,
      aToB: false,
      priceImpact: null,
      minimumReceived: null,
      fee: null,
    }),

  switchTokens: () =>
    set((state) => ({
      tokenA: state.tokenB,
      tokenB: state.tokenA,
      amountA: state.amountB,
      amountB: state.amountA,
      aToB: !state.aToB,
      priceImpact: null,
      minimumReceived: null,
      fee: null,
    })),

  setSlippageBps: (bps) => set({ slippageBps: bps }),
  setDeadline: (minutes) => set({ deadline: minutes }),

  setQuoteData: (data) =>
    set({
      priceImpact: data.priceImpact,
      minimumReceived: data.minimumReceived,
      fee: data.fee,
    }),

  setIsQuoting: (isQuoting) => set({ isQuoting }),
  setIsSwapping: (isSwapping) => set({ isSwapping }),

  reset: () => set(initialState),
}));
