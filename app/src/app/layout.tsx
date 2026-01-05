import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/layout";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "SuniSwap | Concentrated Liquidity DEX on Solana",
  description: "Trade, provide liquidity, and earn fees on SuniSwap - a next-generation concentrated liquidity AMM built on Solana with V4-style hooks.",
  keywords: ["Solana", "DEX", "DeFi", "AMM", "Concentrated Liquidity", "Swap", "Crypto"],
  authors: [{ name: "SuniSwap" }],
  openGraph: {
    title: "SuniSwap | Concentrated Liquidity DEX on Solana",
    description: "Trade, provide liquidity, and earn fees on SuniSwap",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SuniSwap | Concentrated Liquidity DEX on Solana",
    description: "Trade, provide liquidity, and earn fees on SuniSwap",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}>
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <footer className="border-t py-6 text-center text-sm text-muted-foreground">
              <div className="container mx-auto px-4">
                <p>Built with Anchor on Solana. Trade responsibly.</p>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
