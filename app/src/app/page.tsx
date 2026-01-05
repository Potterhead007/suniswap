import { SwapCard } from "@/components/swap";

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">
          <span className="gradient-text">Swap Tokens</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Trade tokens instantly with concentrated liquidity. Lower slippage, better rates, powered by Solana.
        </p>
      </div>

      {/* Swap Card */}
      <SwapCard />

      {/* Stats Section */}
      <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
        <StatCard label="Total Value Locked" value="$0" />
        <StatCard label="24h Volume" value="$0" />
        <StatCard label="Total Pools" value="0" />
        <StatCard label="Total Swaps" value="0" />
      </div>

      {/* Features Section */}
      <div className="mt-16 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-8">Why SuniSwap?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            title="Concentrated Liquidity"
            description="LPs can concentrate their capital within custom price ranges, maximizing capital efficiency."
          />
          <FeatureCard
            title="Lower Slippage"
            description="More efficient liquidity means better prices for traders, even for large orders."
          />
          <FeatureCard
            title="Built on Solana"
            description="Lightning-fast transactions and near-zero fees powered by Solana's high-performance blockchain."
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="card p-6">
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
