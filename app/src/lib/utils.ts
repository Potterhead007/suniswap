import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatNumber(
  value: number,
  options?: {
    decimals?: number;
    compact?: boolean;
    prefix?: string;
    suffix?: string;
  }
): string {
  const { decimals = 2, compact = false, prefix = "", suffix = "" } = options ?? {};

  if (compact && Math.abs(value) >= 1e9) {
    return `${prefix}${(value / 1e9).toFixed(decimals)}B${suffix}`;
  }
  if (compact && Math.abs(value) >= 1e6) {
    return `${prefix}${(value / 1e6).toFixed(decimals)}M${suffix}`;
  }
  if (compact && Math.abs(value) >= 1e3) {
    return `${prefix}${(value / 1e3).toFixed(decimals)}K${suffix}`;
  }

  return `${prefix}${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;
}

export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function debounce<T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}
