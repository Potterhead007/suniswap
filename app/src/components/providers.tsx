"use client";

import { FC, ReactNode, useMemo, useCallback, useState, useEffect } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { WalletError } from "@solana/wallet-adapter-base";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NETWORKS, NetworkName } from "@/lib/constants";

// Import wallet adapter CSS
import "@solana/wallet-adapter-react-ui/styles.css";

interface ProvidersProps {
  children: ReactNode;
}

// Create query client outside component to avoid recreation
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 1000, // 10 seconds
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

export const Providers: FC<ProvidersProps> = ({ children }) => {
  const [network, setNetwork] = useState<NetworkName>("devnet");
  const [mounted, setMounted] = useState(false);

  // Hydration fix
  useEffect(() => {
    setMounted(true);
  }, []);

  const endpoint = useMemo(() => NETWORKS[network].endpoint, [network]);

  // Empty array = auto-detect wallets using Wallet Standard
  // Modern wallets (Phantom, Solflare, etc.) register themselves automatically
  const wallets = useMemo(() => [], []);

  const onError = useCallback((error: WalletError) => {
    console.error("Wallet error:", error);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} onError={onError} autoConnect>
          <WalletModalProvider>
            <NetworkContext.Provider value={{ network, setNetwork }}>
              {children}
            </NetworkContext.Provider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
};

// Network context for switching networks
import { createContext, useContext } from "react";

interface NetworkContextValue {
  network: NetworkName;
  setNetwork: (network: NetworkName) => void;
}

const NetworkContext = createContext<NetworkContextValue>({
  network: "devnet",
  setNetwork: () => {},
});

export const useNetwork = () => useContext(NetworkContext);
