use anchor_lang::prelude::*;

/// Liquidity position - represents an LP's concentrated liquidity in a pool
/// PDA: ["position", pool, owner, lower_tick.to_le_bytes(), upper_tick.to_le_bytes()]
/// Using zero-copy for efficient memory access
/// Fields ordered by alignment requirements to avoid padding
#[account(zero_copy)]
#[repr(C)]
#[derive(Debug)]
pub struct Position {
    // === 16-byte aligned fields (u128) ===

    /// Amount of liquidity in this position
    pub liquidity: u128,                          // 16 bytes, offset 0

    /// Fee growth inside the position's range at last update (token A)
    pub fee_growth_inside_a_last_x128: u128,      // 16 bytes, offset 16

    /// Fee growth inside the position's range at last update (token B)
    pub fee_growth_inside_b_last_x128: u128,      // 16 bytes, offset 32

    // === 8-byte aligned fields (u64) ===

    /// Uncollected fees owed to the position (token A)
    pub tokens_owed_a: u64,                       // 8 bytes, offset 48

    /// Uncollected fees owed to the position (token B)
    pub tokens_owed_b: u64,                       // 8 bytes, offset 56

    // === 4-byte aligned fields (i32) ===

    /// Lower tick of the position range
    pub tick_lower: i32,                          // 4 bytes, offset 64

    /// Upper tick of the position range
    pub tick_upper: i32,                          // 4 bytes, offset 68

    // === 1-byte fields ===

    /// Bump seed for PDA derivation
    pub bump: u8,                                 // 1 byte, offset 72

    /// Padding for 8-byte alignment before [u8; 32] arrays
    pub _padding: [u8; 7],                        // 7 bytes, offset 73

    // === Pubkey-sized fields (32 bytes) ===

    /// The pool this position belongs to
    pub pool: [u8; 32],                           // 32 bytes, offset 80

    /// Position owner
    pub owner: [u8; 32],                          // 32 bytes, offset 112

    /// Position NFT mint (optional, for NFT-based positions)
    pub position_mint: [u8; 32],                  // 32 bytes, offset 144

    /// Reserved for future use
    pub _reserved: [u8; 32],                      // 32 bytes, offset 176
}
// Total: 208 bytes (divisible by 16)

impl Default for Position {
    fn default() -> Self {
        Self {
            liquidity: 0,
            fee_growth_inside_a_last_x128: 0,
            fee_growth_inside_b_last_x128: 0,
            tokens_owed_a: 0,
            tokens_owed_b: 0,
            tick_lower: 0,
            tick_upper: 0,
            bump: 0,
            _padding: [0u8; 7],
            pool: [0u8; 32],
            owner: [0u8; 32],
            position_mint: [0u8; 32],
            _reserved: [0u8; 32],
        }
    }
}

impl Position {
    pub const LEN: usize = 8 + std::mem::size_of::<Position>();

    /// Get pool as Pubkey
    pub fn pool_pubkey(&self) -> Pubkey {
        Pubkey::new_from_array(self.pool)
    }

    /// Get owner as Pubkey
    pub fn owner_pubkey(&self) -> Pubkey {
        Pubkey::new_from_array(self.owner)
    }

    /// Get position_mint as Pubkey
    pub fn position_mint_pubkey(&self) -> Pubkey {
        Pubkey::new_from_array(self.position_mint)
    }

    /// Check if position is empty (no liquidity and no owed tokens)
    pub fn is_empty(&self) -> bool {
        self.liquidity == 0 && self.tokens_owed_a == 0 && self.tokens_owed_b == 0
    }

    /// Check if position has liquidity
    pub fn has_liquidity(&self) -> bool {
        self.liquidity > 0
    }

    /// Update owed tokens after fee calculation
    ///
    /// Fee calculation: tokens = liquidity * fee_growth_delta / 2^128
    /// Using Q128.128 format for fee_growth values
    pub fn update_owed_tokens(
        &mut self,
        fee_growth_inside_a_x128: u128,
        fee_growth_inside_b_x128: u128,
    ) -> Result<()> {
        // Calculate new fees accumulated (using wrapping for proper overflow handling)
        let fee_growth_delta_a = fee_growth_inside_a_x128
            .wrapping_sub(self.fee_growth_inside_a_last_x128);
        let fee_growth_delta_b = fee_growth_inside_b_x128
            .wrapping_sub(self.fee_growth_inside_b_last_x128);

        // fees = liquidity * fee_growth_delta / 2^128
        // We use mul_div with Q128 (2^128) as the divisor
        // Since Q128 doesn't fit in u128, we compute in two steps:
        // First shift right by 64, then divide by 2^64 (Q64)
        //
        // tokens = (liquidity * fee_growth_delta) >> 128
        //        = ((liquidity * fee_growth_delta) >> 64) >> 64
        //        = mul_div(liquidity, fee_growth_delta, Q64) >> 64 (approximately)
        //
        // More precisely: mul_div(mul_div(liquidity, fee_growth_delta, Q64), 1, Q64)

        let tokens_a = if fee_growth_delta_a > 0 && self.liquidity > 0 {
            // First division by 2^64
            let intermediate = crate::math::full_math::mul_div(
                self.liquidity,
                fee_growth_delta_a,
                crate::constants::Q64,
            ).unwrap_or(0);
            // Second division by 2^64 to complete the 2^128 division
            (intermediate / crate::constants::Q64) as u64
        } else {
            0
        };

        let tokens_b = if fee_growth_delta_b > 0 && self.liquidity > 0 {
            let intermediate = crate::math::full_math::mul_div(
                self.liquidity,
                fee_growth_delta_b,
                crate::constants::Q64,
            ).unwrap_or(0);
            (intermediate / crate::constants::Q64) as u64
        } else {
            0
        };

        self.tokens_owed_a = self.tokens_owed_a
            .checked_add(tokens_a)
            .ok_or(crate::errors::SuniswapError::MathOverflow)?;
        self.tokens_owed_b = self.tokens_owed_b
            .checked_add(tokens_b)
            .ok_or(crate::errors::SuniswapError::MathOverflow)?;

        // Update last known fee growth
        self.fee_growth_inside_a_last_x128 = fee_growth_inside_a_x128;
        self.fee_growth_inside_b_last_x128 = fee_growth_inside_b_x128;

        Ok(())
    }
}

/// Position bundle - allows managing multiple positions in one account
#[account]
pub struct PositionBundle {
    /// Bundle owner
    pub owner: Pubkey,

    /// Bitmap of occupied position slots (256 positions max)
    pub position_bitmap: [u8; 32],

    /// Bump seed for PDA derivation
    pub bump: u8,

    /// Reserved for future use
    pub _reserved: [u8; 64],
}

impl PositionBundle {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 64;

    pub const MAX_POSITIONS: usize = 256;

    pub fn is_position_occupied(&self, index: u8) -> bool {
        let byte_index = (index / 8) as usize;
        let bit_index = index % 8;
        (self.position_bitmap[byte_index] >> bit_index) & 1 == 1
    }

    pub fn set_position_occupied(&mut self, index: u8) {
        let byte_index = (index / 8) as usize;
        let bit_index = index % 8;
        self.position_bitmap[byte_index] |= 1 << bit_index;
    }

    pub fn clear_position(&mut self, index: u8) {
        let byte_index = (index / 8) as usize;
        let bit_index = index % 8;
        self.position_bitmap[byte_index] &= !(1 << bit_index);
    }

    pub fn find_available_slot(&self) -> Option<u8> {
        for i in 0..Self::MAX_POSITIONS {
            if !self.is_position_occupied(i as u8) {
                return Some(i as u8);
            }
        }
        None
    }
}
