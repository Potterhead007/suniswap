// SuniSwap Protocol Constants
// Following Uniswap V3 conventions with Solana-specific optimizations

/// Number of ticks per tick array (reduced for Solana 4KB stack limit)
/// For production, use zero-copy accounts to support larger arrays (88 standard)
pub const TICK_ARRAY_SIZE: usize = 8;

/// Minimum tick index (p(i) = 1.0001^i, this gives price ~= 0)
pub const MIN_TICK: i32 = -443636;

/// Maximum tick index (this gives price ~= infinity for practical purposes)
pub const MAX_TICK: i32 = 443636;

/// Minimum sqrt price (Q64.64 format)
pub const MIN_SQRT_PRICE_X64: u128 = 4295048016;

/// Maximum sqrt price (Q64.64 format)
pub const MAX_SQRT_PRICE_X64: u128 = 79226673515401279992447579055;

/// Q64 multiplier (2^64)
pub const Q64: u128 = 1 << 64;

/// Q128 multiplier (2^128) for fee growth calculations
pub const Q128: u128 = 1 << 64 << 64; // Can't do 1 << 128 directly

/// Protocol fee denominator (1/4 = 25% max protocol fee share)
pub const PROTOCOL_FEE_DENOMINATOR: u8 = 4;

/// Basis point denominator (10000 = 100%)
pub const FEE_RATE_DENOMINATOR: u32 = 1_000_000;

/// Maximum tick spacing
pub const MAX_TICK_SPACING: u16 = 16384;

/// Standard fee tiers (matching Uniswap V3)
pub mod fee_tiers {
    /// 0.01% fee (tick spacing 1) - for stable pairs
    pub const FEE_TIER_100: u32 = 100; // 0.01%
    pub const TICK_SPACING_100: u16 = 1;

    /// 0.05% fee (tick spacing 10) - for stable pairs
    pub const FEE_TIER_500: u32 = 500; // 0.05%
    pub const TICK_SPACING_500: u16 = 10;

    /// 0.30% fee (tick spacing 60) - for most pairs
    pub const FEE_TIER_3000: u32 = 3000; // 0.30%
    pub const TICK_SPACING_3000: u16 = 60;

    /// 1.00% fee (tick spacing 200) - for exotic pairs
    pub const FEE_TIER_10000: u32 = 10000; // 1.00%
    pub const TICK_SPACING_10000: u16 = 200;
}

/// Hook flags - each bit enables a specific hook callback
pub mod hook_flags {
    pub const BEFORE_INITIALIZE: u8 = 0b00000001;
    pub const AFTER_INITIALIZE: u8 = 0b00000010;
    pub const BEFORE_SWAP: u8 = 0b00000100;
    pub const AFTER_SWAP: u8 = 0b00001000;
    pub const BEFORE_ADD_LIQUIDITY: u8 = 0b00010000;
    pub const AFTER_ADD_LIQUIDITY: u8 = 0b00100000;
    pub const BEFORE_REMOVE_LIQUIDITY: u8 = 0b01000000;
    pub const AFTER_REMOVE_LIQUIDITY: u8 = 0b10000000;
}

/// Account seeds for PDA derivation
pub mod seeds {
    pub const CONFIG_SEED: &[u8] = b"config";
    pub const FEE_TIER_SEED: &[u8] = b"fee_tier";
    pub const POOL_SEED: &[u8] = b"pool";
    pub const TICK_ARRAY_SEED: &[u8] = b"tick_array";
    pub const POSITION_SEED: &[u8] = b"position";
    pub const ORACLE_SEED: &[u8] = b"oracle";
    pub const POOL_VAULT_SEED: &[u8] = b"pool_vault";
}

/// Oracle constants
pub mod oracle {
    /// Maximum number of observations in the oracle
    pub const OBSERVATION_CARDINALITY_MAX: u16 = 65535;
    /// Initial observation cardinality
    pub const OBSERVATION_CARDINALITY_INIT: u16 = 1;
}
