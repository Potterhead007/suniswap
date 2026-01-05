"use client";

import { FC, useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useNetwork } from "@/components/providers";
import { NETWORKS, NetworkName } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const NetworkBadge: FC = () => {
  const { network, setNetwork } = useNetwork();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const networkColors: Record<NetworkName, string> = {
    mainnet: "bg-success",
    devnet: "bg-warning",
    localnet: "bg-blue-500",
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card hover:bg-accent transition-colors text-sm"
      >
        <span className={cn("h-2 w-2 rounded-full animate-pulse", networkColors[network])} />
        <span className="capitalize">{network}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", dropdownOpen && "rotate-180")} />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-44 rounded-xl border bg-card shadow-lg animate-fade-in z-50">
          <div className="p-2">
            {(Object.keys(NETWORKS) as NetworkName[]).map((net) => (
              <button
                key={net}
                onClick={() => {
                  setNetwork(net);
                  setDropdownOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors",
                  network === net ? "bg-primary/10 text-primary" : "hover:bg-accent"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", networkColors[net])} />
                <span className="capitalize">{NETWORKS[net].name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
