"use client";

import { FC, useState, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Wallet, ChevronDown, Copy, ExternalLink, LogOut, Check } from "lucide-react";
import { shortenAddress, cn } from "@/lib/utils";

export const WalletButton: FC = () => {
  const { publicKey, disconnect, connecting, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopy = async () => {
    if (publicKey) {
      await navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setDropdownOpen(false);
  };

  const openExplorer = () => {
    if (publicKey) {
      window.open(`https://explorer.solana.com/address/${publicKey.toBase58()}?cluster=devnet`, "_blank");
    }
  };

  if (!connected || !publicKey) {
    return (
      <button
        onClick={() => setVisible(true)}
        disabled={connecting}
        className={cn(
          "btn-primary flex items-center gap-2",
          connecting && "opacity-50 cursor-wait"
        )}
      >
        <Wallet className="h-4 w-4" />
        {connecting ? "Connecting..." : "Connect Wallet"}
      </button>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-card hover:bg-accent transition-colors"
      >
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-primary to-purple-600" />
        <span className="font-mono text-sm">{shortenAddress(publicKey.toBase58())}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", dropdownOpen && "rotate-180")} />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-card shadow-lg animate-fade-in">
          <div className="p-3 border-b">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-purple-600" />
              <div>
                <div className="font-mono text-foreground">{shortenAddress(publicKey.toBase58())}</div>
                <div className="text-xs">Connected</div>
              </div>
            </div>
          </div>

          <div className="p-2">
            <button
              onClick={handleCopy}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
            >
              {copied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copied!" : "Copy Address"}
            </button>

            <button
              onClick={openExplorer}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              View on Explorer
            </button>

            <button
              onClick={handleDisconnect}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-accent text-destructive transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
