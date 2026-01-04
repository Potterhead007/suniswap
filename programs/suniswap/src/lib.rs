//! SuniSwap - Concentrated Liquidity AMM with V4-style Hooks on Solana
//!
//! A cutting-edge implementation of Uniswap V3's concentrated liquidity mechanism
//! with added V4-style hooks for extensibility.
//!
//! ## Architecture
//!
//! - **Core CLMM**: Concentrated liquidity with tick-based price ranges
//! - **Hooks System**: External programs can inject logic at key execution points
//! - **Multi-Fee Tiers**: Support for 0.01%, 0.05%, 0.30%, and 1.00% fee tiers
//! - **Position NFTs**: LP positions represented as NFT-like accounts
//! - **TWAP Oracle**: Built-in time-weighted average price oracle
//!
//! ## Security
//!
//! - All arithmetic uses checked operations
//! - Q64.64 fixed-point math for precision
//! - Comprehensive account validation via Anchor
//! - Following SlowMist Solana security best practices

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod hooks;
pub mod instructions;
pub mod math;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("859DmKSfDQxnHY7dbYdFNwUE7QWhnb1WiBbXwbq1ktky");

#[program]
pub mod suniswap {
    use super::*;

    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN INSTRUCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Initialize the global SuniSwap configuration
    /// This should be called once when deploying the protocol
    ///
    /// # Arguments
    /// * `default_protocol_fee_rate` - Default protocol fee as percentage (0-25)
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        default_protocol_fee_rate: u8,
    ) -> Result<()> {
        instructions::initialize_config::handler(ctx, default_protocol_fee_rate)
    }

    /// Initialize a new fee tier
    /// Only protocol authority can call this
    ///
    /// # Arguments
    /// * `fee_rate` - Fee rate in hundredths of a bip (3000 = 0.3%)
    /// * `tick_spacing` - Tick spacing for this fee tier
    pub fn initialize_fee_tier(
        ctx: Context<InitializeFeeTier>,
        fee_rate: u32,
        tick_spacing: u16,
    ) -> Result<()> {
        instructions::initialize_fee_tier::handler(ctx, fee_rate, tick_spacing)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // POOL INSTRUCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Initialize a new liquidity pool
    ///
    /// # Arguments
    /// * `initial_sqrt_price_x64` - Initial sqrt(price) in Q64.64 format
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        initial_sqrt_price_x64: u128,
    ) -> Result<()> {
        instructions::initialize_pool::handler(ctx, initial_sqrt_price_x64)
    }

    /// Initialize a tick array for a pool
    ///
    /// # Arguments
    /// * `start_tick_index` - Starting tick index (must be aligned to tick spacing)
    pub fn initialize_tick_array(
        ctx: Context<InitializeTickArray>,
        start_tick_index: i32,
    ) -> Result<()> {
        instructions::initialize_tick_array::handler(ctx, start_tick_index)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // POSITION INSTRUCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Open a new liquidity position
    ///
    /// # Arguments
    /// * `tick_lower` - Lower tick bound of position
    /// * `tick_upper` - Upper tick bound of position
    pub fn open_position(
        ctx: Context<OpenPosition>,
        tick_lower: i32,
        tick_upper: i32,
    ) -> Result<()> {
        instructions::open_position::handler(ctx, tick_lower, tick_upper)
    }

    /// Close an empty position and reclaim rent
    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        instructions::close_position::handler(ctx)
    }

    /// Add liquidity to an existing position
    ///
    /// # Arguments
    /// * `liquidity_delta` - Amount of liquidity to add
    /// * `amount_a_max` - Maximum amount of token A to deposit
    /// * `amount_b_max` - Maximum amount of token B to deposit
    pub fn increase_liquidity(
        ctx: Context<IncreaseLiquidity>,
        liquidity_delta: u128,
        amount_a_max: u64,
        amount_b_max: u64,
    ) -> Result<()> {
        instructions::increase_liquidity::handler(ctx, liquidity_delta, amount_a_max, amount_b_max)
    }

    /// Remove liquidity from an existing position
    ///
    /// # Arguments
    /// * `liquidity_delta` - Amount of liquidity to remove
    /// * `amount_a_min` - Minimum amount of token A to receive
    /// * `amount_b_min` - Minimum amount of token B to receive
    pub fn decrease_liquidity(
        ctx: Context<DecreaseLiquidity>,
        liquidity_delta: u128,
        amount_a_min: u64,
        amount_b_min: u64,
    ) -> Result<()> {
        instructions::decrease_liquidity::handler(ctx, liquidity_delta, amount_a_min, amount_b_min)
    }

    /// Collect accumulated fees from a position
    ///
    /// # Arguments
    /// * `amount_a_requested` - Maximum amount of token A fees to collect
    /// * `amount_b_requested` - Maximum amount of token B fees to collect
    pub fn collect_fees(
        ctx: Context<CollectFees>,
        amount_a_requested: u64,
        amount_b_requested: u64,
    ) -> Result<()> {
        instructions::collect_fees::handler(ctx, amount_a_requested, amount_b_requested)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SWAP INSTRUCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Execute a swap on a pool
    ///
    /// # Arguments
    /// * `params` - Swap parameters including amount, direction, and slippage limits
    pub fn swap(ctx: Context<Swap>, params: SwapParams) -> Result<()> {
        instructions::swap::handler(ctx, params)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PROTOCOL ADMIN INSTRUCTIONS
    // ═══════════════════════════════════════════════════════════════════════════

    /// Collect accumulated protocol fees from a pool
    /// Only callable by fee authority
    ///
    /// # Arguments
    /// * `amount_a_requested` - Maximum amount of token A to collect
    /// * `amount_b_requested` - Maximum amount of token B to collect
    pub fn collect_protocol_fees(
        ctx: Context<CollectProtocolFees>,
        amount_a_requested: u64,
        amount_b_requested: u64,
    ) -> Result<()> {
        instructions::collect_protocol_fees::handler(ctx, amount_a_requested, amount_b_requested)
    }
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn test_id() {
        // Verify program ID matches
        assert_eq!(
            ID.to_string(),
            "859DmKSfDQxnHY7dbYdFNwUE7QWhnb1WiBbXwbq1ktky"
        );
    }
}
