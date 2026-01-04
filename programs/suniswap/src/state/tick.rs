use anchor_lang::prelude::*;
use bytemuck::{Pod, Zeroable};

/// Tick data - stored within tick arrays
/// Each tick represents a price point where liquidity can change
/// Using zero-copy compatible layout with proper alignment
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct Tick {
    /// Net liquidity change when crossing this tick (positive = liquidity added)
    /// When price moves up through tick: add liquidity_net
    /// When price moves down through tick: subtract liquidity_net
    pub liquidity_net: i128,         // 16 bytes, offset 0

    /// Total liquidity referencing this tick
    /// Used to track when tick can be uninitialized
    pub liquidity_gross: u128,       // 16 bytes, offset 16

    /// Fee growth on the other side of this tick (token A)
    /// Stored relative to current tick for efficient range calculations
    pub fee_growth_outside_a_x128: u128,  // 16 bytes, offset 32

    /// Fee growth on the other side of this tick (token B)
    pub fee_growth_outside_b_x128: u128,  // 16 bytes, offset 48

    /// Seconds per liquidity outside (Q32.32)
    pub seconds_per_liquidity_outside_x64: u128,  // 16 bytes, offset 64

    /// Cumulative tick value (for TWAP calculations)
    pub tick_cumulative_outside: i64,  // 8 bytes, offset 80

    /// Seconds spent on the other side of this tick
    pub seconds_outside: u32,          // 4 bytes, offset 88

    /// Whether this tick is initialized
    pub initialized: u8,               // 1 byte, offset 92

    /// Padding for 16-byte alignment
    pub _padding: [u8; 3],             // 3 bytes, offset 93
}
// Total: 96 bytes

// Ensure Tick is properly sized for zero-copy
const _: () = assert!(std::mem::size_of::<Tick>() == 96);

impl Tick {
    /// Size in bytes
    pub const LEN: usize = 96;

    /// Check if initialized
    pub fn is_initialized(&self) -> bool {
        self.initialized != 0
    }

    /// Update tick when liquidity is added/removed
    pub fn update(
        &mut self,
        tick_current: i32,
        tick_index: i32,
        liquidity_delta: i128,
        fee_growth_global_a_x128: u128,
        fee_growth_global_b_x128: u128,
        upper: bool,
    ) -> Result<bool> {
        let liquidity_gross_before = self.liquidity_gross;

        // Update liquidity gross
        let liquidity_gross_after = if liquidity_delta >= 0 {
            self.liquidity_gross
                .checked_add(liquidity_delta as u128)
                .ok_or(crate::errors::SuniswapError::LiquidityNetOverflow)?
        } else {
            self.liquidity_gross
                .checked_sub((-liquidity_delta) as u128)
                .ok_or(crate::errors::SuniswapError::LiquidityNetOverflow)?
        };

        let flipped = (liquidity_gross_after == 0) != (liquidity_gross_before == 0);

        if liquidity_gross_before == 0 {
            // Initialize tick
            self.initialized = 1;

            // By convention, we assume fees accumulated below current tick
            if tick_index <= tick_current {
                self.fee_growth_outside_a_x128 = fee_growth_global_a_x128;
                self.fee_growth_outside_b_x128 = fee_growth_global_b_x128;
            }
        }

        self.liquidity_gross = liquidity_gross_after;

        // Update liquidity net based on whether this is upper or lower tick
        // When price moves up: lower adds liquidity, upper removes
        self.liquidity_net = if upper {
            self.liquidity_net
                .checked_sub(liquidity_delta)
                .ok_or(crate::errors::SuniswapError::LiquidityNetOverflow)?
        } else {
            self.liquidity_net
                .checked_add(liquidity_delta)
                .ok_or(crate::errors::SuniswapError::LiquidityNetOverflow)?
        };

        Ok(flipped)
    }

    /// Cross a tick when price moves through it
    pub fn cross(
        &mut self,
        fee_growth_global_a_x128: u128,
        fee_growth_global_b_x128: u128,
    ) {
        // Flip fee growth outside
        self.fee_growth_outside_a_x128 = fee_growth_global_a_x128
            .wrapping_sub(self.fee_growth_outside_a_x128);
        self.fee_growth_outside_b_x128 = fee_growth_global_b_x128
            .wrapping_sub(self.fee_growth_outside_b_x128);
    }

    /// Clear tick when it's no longer needed
    pub fn clear(&mut self) {
        *self = Self::default();
    }

    /// Calculate fee growth inside a tick range
    pub fn get_fee_growth_inside(
        tick_lower: &Tick,
        tick_upper: &Tick,
        tick_lower_index: i32,
        tick_upper_index: i32,
        tick_current: i32,
        fee_growth_global_a_x128: u128,
        fee_growth_global_b_x128: u128,
    ) -> (u128, u128) {
        // Calculate fee growth below lower tick
        let (fee_growth_below_a, fee_growth_below_b) = if tick_current >= tick_lower_index {
            (tick_lower.fee_growth_outside_a_x128, tick_lower.fee_growth_outside_b_x128)
        } else {
            (
                fee_growth_global_a_x128.wrapping_sub(tick_lower.fee_growth_outside_a_x128),
                fee_growth_global_b_x128.wrapping_sub(tick_lower.fee_growth_outside_b_x128),
            )
        };

        // Calculate fee growth above upper tick
        let (fee_growth_above_a, fee_growth_above_b) = if tick_current < tick_upper_index {
            (tick_upper.fee_growth_outside_a_x128, tick_upper.fee_growth_outside_b_x128)
        } else {
            (
                fee_growth_global_a_x128.wrapping_sub(tick_upper.fee_growth_outside_a_x128),
                fee_growth_global_b_x128.wrapping_sub(tick_upper.fee_growth_outside_b_x128),
            )
        };

        // Fee growth inside = global - below - above
        (
            fee_growth_global_a_x128
                .wrapping_sub(fee_growth_below_a)
                .wrapping_sub(fee_growth_above_a),
            fee_growth_global_b_x128
                .wrapping_sub(fee_growth_below_b)
                .wrapping_sub(fee_growth_above_b),
        )
    }
}

