# SuniSwap Indexer Setup

This document explains how to set up the indexer for real-time blockchain data.

## Architecture

```
Solana Blockchain
      ↓
Helius Webhooks (real-time tx notifications)
      ↓
/api/webhooks/helius (parse & store)
      ↓
Supabase PostgreSQL (indexed data)
      ↓
/api/stats, /api/pools/[address]/stats (query)
      ↓
Frontend hooks (display)
```

## 1. Supabase Setup

### Create Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and API keys

### Run Schema Migration
1. Go to SQL Editor in Supabase Dashboard
2. Copy contents of `schema.sql` and execute
3. This creates tables: `pools`, `positions`, `swaps`, `liquidity_events`, `pool_snapshots`, `token_prices`

### Configure Environment
```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 2. Helius Webhook Setup

### Create Webhook
1. Go to [helius.dev](https://helius.dev) and create an account
2. Create a new webhook with these settings:
   - **Network**: Devnet (or Mainnet for production)
   - **Webhook URL**: `https://your-domain.com/api/webhooks/helius`
   - **Transaction Type**: Any
   - **Account Addresses**: Add the SuniSwap Program ID

### Configure Environment
```bash
# .env.local
HELIUS_API_KEY=your-helius-api-key
HELIUS_WEBHOOK_SECRET=your-webhook-secret  # Optional but recommended
```

### Test Webhook
```bash
curl -X GET https://your-domain.com/api/webhooks/helius
# Should return: {"status":"ok","programId":"...","timestamp":"..."}
```

## 3. Database Tables

### pools
Stores all liquidity pools created on SuniSwap.

| Column | Type | Description |
|--------|------|-------------|
| address | text | Pool account public key (PK) |
| token_mint_a | text | First token mint address |
| token_mint_b | text | Second token mint address |
| fee_rate | integer | Fee rate in bps (e.g., 3000 = 0.3%) |
| sqrt_price_x64 | text | Current sqrt price (Q64.64) |
| liquidity | text | Current liquidity |
| tvl_usd | numeric | Total value locked in USD |

### swaps
Records all swap transactions.

| Column | Type | Description |
|--------|------|-------------|
| signature | text | Transaction signature (PK) |
| pool_address | text | Pool where swap occurred |
| user_address | text | User who swapped |
| amount_in | text | Input token amount |
| amount_out | text | Output token amount |
| fee_amount | text | Fee collected |
| block_time | timestamp | When the swap occurred |

### positions
Tracks all liquidity positions.

| Column | Type | Description |
|--------|------|-------------|
| address | text | Position account public key (PK) |
| pool_address | text | Associated pool |
| owner | text | Position owner |
| tick_lower | integer | Lower tick bound |
| tick_upper | integer | Upper tick bound |
| liquidity | text | Position liquidity |
| is_open | boolean | Whether position is active |

### liquidity_events
Records add/remove liquidity and fee collection events.

### pool_snapshots
Hourly snapshots of pool metrics for historical charts.

### token_prices
Cached token prices in USD (updated by external service).

## 4. API Endpoints

### GET /api/stats
Global protocol statistics.
```json
{
  "totalPools": 5,
  "volume24h": 125000,
  "txCount24h": 450,
  "activePositions": 89,
  "uniqueUsers": 234,
  "tvlTotal": 500000
}
```

### GET /api/pools/[address]/stats
Statistics for a specific pool.
```json
{
  "volume24h": 25000,
  "fees24h": 75,
  "txCount24h": 120,
  "timestamp": "2024-01-15T12:00:00Z"
}
```

### GET /api/users/[address]/transactions
User's transaction history.
```json
{
  "transactions": [
    {
      "signature": "...",
      "type": "swap",
      "pool_address": "...",
      "amount_in": "1000000",
      "amount_out": "985000",
      "block_time": "2024-01-15T12:00:00Z"
    }
  ]
}
```

### POST /api/webhooks/helius
Helius webhook endpoint (receives transaction notifications).

## 5. Fallback Behavior

If the indexer is not configured (no Supabase credentials):
- API endpoints return placeholder data with `message: "Indexer not configured"`
- Frontend falls back to on-chain data and estimates
- Pool TVL is always calculated from on-chain vault balances
- Volume/fees are estimated based on TVL

## 6. Monitoring

Check webhook health:
```bash
# Health check
curl https://your-domain.com/api/webhooks/helius

# View recent logs (Vercel)
vercel logs --follow
```

Database queries in Supabase:
```sql
-- Recent swaps
SELECT * FROM swaps ORDER BY block_time DESC LIMIT 10;

-- Daily volume
SELECT
  DATE(block_time) as date,
  SUM(amount_in::numeric) as volume
FROM swaps
GROUP BY DATE(block_time)
ORDER BY date DESC;

-- Active pools
SELECT * FROM pools WHERE is_paused = false;
```
