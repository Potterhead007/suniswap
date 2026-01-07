-- SuniSwap Indexer Schema
-- Run this on your Supabase/PostgreSQL instance

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Pools table
CREATE TABLE IF NOT EXISTS pools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  address VARCHAR(44) UNIQUE NOT NULL,
  token_mint_a VARCHAR(44) NOT NULL,
  token_mint_b VARCHAR(44) NOT NULL,
  token_vault_a VARCHAR(44) NOT NULL,
  token_vault_b VARCHAR(44) NOT NULL,
  fee_rate INTEGER NOT NULL,
  tick_spacing INTEGER NOT NULL,
  sqrt_price_x64 VARCHAR(40) NOT NULL,
  tick_current INTEGER NOT NULL,
  liquidity VARCHAR(40) NOT NULL DEFAULT '0',
  fee_growth_global_a VARCHAR(40) NOT NULL DEFAULT '0',
  fee_growth_global_b VARCHAR(40) NOT NULL DEFAULT '0',
  protocol_fees_a VARCHAR(40) NOT NULL DEFAULT '0',
  protocol_fees_b VARCHAR(40) NOT NULL DEFAULT '0',
  is_paused BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_slot BIGINT,
  created_tx VARCHAR(88)
);

-- Positions table
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  address VARCHAR(44) UNIQUE NOT NULL,
  pool_address VARCHAR(44) NOT NULL REFERENCES pools(address),
  owner VARCHAR(44) NOT NULL,
  tick_lower INTEGER NOT NULL,
  tick_upper INTEGER NOT NULL,
  liquidity VARCHAR(40) NOT NULL DEFAULT '0',
  fee_growth_inside_a VARCHAR(40) NOT NULL DEFAULT '0',
  fee_growth_inside_b VARCHAR(40) NOT NULL DEFAULT '0',
  tokens_owed_a VARCHAR(40) NOT NULL DEFAULT '0',
  tokens_owed_b VARCHAR(40) NOT NULL DEFAULT '0',
  is_open BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_slot BIGINT,
  created_tx VARCHAR(88)
);

-- Swaps table
CREATE TABLE IF NOT EXISTS swaps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signature VARCHAR(88) UNIQUE NOT NULL,
  pool_address VARCHAR(44) NOT NULL REFERENCES pools(address),
  user_address VARCHAR(44) NOT NULL,
  token_in VARCHAR(44) NOT NULL,
  token_out VARCHAR(44) NOT NULL,
  amount_in VARCHAR(40) NOT NULL,
  amount_out VARCHAR(40) NOT NULL,
  sqrt_price_after VARCHAR(40) NOT NULL,
  tick_after INTEGER NOT NULL,
  fee_amount VARCHAR(40) NOT NULL,
  slot BIGINT NOT NULL,
  block_time TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Liquidity events table
CREATE TABLE IF NOT EXISTS liquidity_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  signature VARCHAR(88) UNIQUE NOT NULL,
  pool_address VARCHAR(44) NOT NULL REFERENCES pools(address),
  position_address VARCHAR(44) NOT NULL,
  user_address VARCHAR(44) NOT NULL,
  event_type VARCHAR(20) NOT NULL, -- 'add', 'remove', 'collect_fees'
  tick_lower INTEGER,
  tick_upper INTEGER,
  liquidity_delta VARCHAR(40),
  amount_a VARCHAR(40),
  amount_b VARCHAR(40),
  slot BIGINT NOT NULL,
  block_time TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Pool snapshots for TVL/Volume tracking (hourly)
CREATE TABLE IF NOT EXISTS pool_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_address VARCHAR(44) NOT NULL REFERENCES pools(address),
  snapshot_time TIMESTAMP WITH TIME ZONE NOT NULL,
  sqrt_price_x64 VARCHAR(40) NOT NULL,
  tick_current INTEGER NOT NULL,
  liquidity VARCHAR(40) NOT NULL,
  tvl_usd DECIMAL(24, 6),
  volume_usd DECIMAL(24, 6) DEFAULT 0,
  fees_usd DECIMAL(24, 6) DEFAULT 0,
  tx_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(pool_address, snapshot_time)
);

-- Token prices cache
CREATE TABLE IF NOT EXISTS token_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mint_address VARCHAR(44) UNIQUE NOT NULL,
  symbol VARCHAR(20),
  price_usd DECIMAL(24, 12) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_pools_tokens ON pools(token_mint_a, token_mint_b);
CREATE INDEX IF NOT EXISTS idx_positions_pool ON positions(pool_address);
CREATE INDEX IF NOT EXISTS idx_positions_owner ON positions(owner);
CREATE INDEX IF NOT EXISTS idx_swaps_pool ON swaps(pool_address);
CREATE INDEX IF NOT EXISTS idx_swaps_user ON swaps(user_address);
CREATE INDEX IF NOT EXISTS idx_swaps_time ON swaps(block_time DESC);
CREATE INDEX IF NOT EXISTS idx_liquidity_events_pool ON liquidity_events(pool_address);
CREATE INDEX IF NOT EXISTS idx_liquidity_events_user ON liquidity_events(user_address);
CREATE INDEX IF NOT EXISTS idx_liquidity_events_time ON liquidity_events(block_time DESC);
CREATE INDEX IF NOT EXISTS idx_pool_snapshots_pool_time ON pool_snapshots(pool_address, snapshot_time DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to pools
DROP TRIGGER IF EXISTS pools_updated_at ON pools;
CREATE TRIGGER pools_updated_at
  BEFORE UPDATE ON pools
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Apply to positions
DROP TRIGGER IF EXISTS positions_updated_at ON positions;
CREATE TRIGGER positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Pool stats view (24h metrics)
CREATE OR REPLACE VIEW pool_stats_24h AS
SELECT
  p.address,
  p.token_mint_a,
  p.token_mint_b,
  p.fee_rate,
  p.tick_current,
  p.liquidity,
  COALESCE(SUM(s.amount_in::DECIMAL), 0) as volume_24h,
  COALESCE(SUM(s.fee_amount::DECIMAL), 0) as fees_24h,
  COUNT(s.id) as tx_count_24h
FROM pools p
LEFT JOIN swaps s ON s.pool_address = p.address
  AND s.block_time > NOW() - INTERVAL '24 hours'
GROUP BY p.address, p.token_mint_a, p.token_mint_b, p.fee_rate, p.tick_current, p.liquidity;

-- User position summary
CREATE OR REPLACE VIEW user_position_summary AS
SELECT
  owner,
  COUNT(*) as total_positions,
  COUNT(*) FILTER (WHERE is_open) as open_positions,
  SUM(CASE WHEN is_open THEN liquidity::DECIMAL ELSE 0 END) as total_liquidity
FROM positions
GROUP BY owner;

-- ============================================================================
-- ROW LEVEL SECURITY (Optional - for Supabase)
-- ============================================================================

-- Enable RLS
ALTER TABLE pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_prices ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read access" ON pools FOR SELECT USING (true);
CREATE POLICY "Public read access" ON positions FOR SELECT USING (true);
CREATE POLICY "Public read access" ON swaps FOR SELECT USING (true);
CREATE POLICY "Public read access" ON liquidity_events FOR SELECT USING (true);
CREATE POLICY "Public read access" ON pool_snapshots FOR SELECT USING (true);
CREATE POLICY "Public read access" ON token_prices FOR SELECT USING (true);

-- Service role write access (for webhook handlers)
CREATE POLICY "Service role write" ON pools FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role write" ON positions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role write" ON swaps FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role write" ON liquidity_events FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role write" ON pool_snapshots FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role write" ON token_prices FOR ALL USING (auth.role() = 'service_role');
