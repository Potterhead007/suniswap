use anchor_lang::prelude::*;

/// Pool state - the core AMM state for a token pair
/// PDA: ["pool", token_mint_a, token_mint_b, fee_rate.to_le_bytes()]
///
/// Using zero-copy for efficient memory access and reduced stack usage
/// All fields are carefully ordered to avoid implicit padding
#[account(zero_copy)]
#[repr(C)]
#[derive(Debug)]
pub struct Pool {
    // === 16-byte aligned fields first (u128) ===

    /// Current sqrt price as Q64.64 fixed point
    pub sqrt_price_x64: u128,                     // 16 bytes, offset 0

    /// Total liquidity currently in range
    pub liquidity: u128,                          // 16 bytes, offset 16

    /// Global fee growth for token A (Q64.128)
    pub fee_growth_global_a_x128: u128,           // 16 bytes, offset 32

    /// Global fee growth for token B (Q64.128)
    pub fee_growth_global_b_x128: u128,           // 16 bytes, offset 48

    // === 8-byte aligned fields (u64) ===

    /// Protocol fees accumulated for token A
    pub protocol_fees_a: u64,                     // 8 bytes, offset 64

    /// Protocol fees accumulated for token B
    pub protocol_fees_b: u64,                     // 8 bytes, offset 72

    // === 4-byte aligned fields (i32) ===

    /// Current tick index
    pub tick_current: i32,                        // 4 bytes, offset 80

    // === 2-byte aligned fields (u16) ===

    /// Tick spacing for this pool
    pub tick_spacing: u16,                        // 2 bytes, offset 84

    /// Current observation index
    pub observation_index: u16,                   // 2 bytes, offset 86

    /// Number of populated observations
    pub observation_cardinality: u16,             // 2 bytes, offset 88

    /// Next observation cardinality (for expansion)
    pub observation_cardinality_next: u16,        // 2 bytes, offset 90

    // === 1-byte fields ===

    /// Protocol fee rate (percentage of swap fees)
    pub protocol_fee_rate: u8,                    // 1 byte, offset 92

    /// Whether the pool is paused
    pub is_paused: u8,                            // 1 byte, offset 93

    /// Bump seed for PDA derivation
    pub bump: u8,                                 // 1 byte, offset 94

    /// Hook flags indicating which hooks are enabled
    pub hook_flags: u8,                           // 1 byte, offset 95

    // === Pubkey-sized fields (32 bytes, no alignment requirement) ===

    /// The config this pool belongs to
    pub config: [u8; 32],                         // 32 bytes, offset 96

    /// Token A mint (must be < token B mint lexicographically)
    pub token_mint_a: [u8; 32],                   // 32 bytes, offset 128

    /// Token B mint
    pub token_mint_b: [u8; 32],                   // 32 bytes, offset 160

    /// Token A vault (PDA owned by pool)
    pub token_vault_a: [u8; 32],                  // 32 bytes, offset 192

    /// Token B vault (PDA owned by pool)
    pub token_vault_b: [u8; 32],                  // 32 bytes, offset 224

    /// Fee tier for this pool
    pub fee_tier: [u8; 32],                       // 32 bytes, offset 256

    /// Hook program address (zero if no hooks)
    pub hook_program: [u8; 32],                   // 32 bytes, offset 288

    /// Oracle account for TWAP (optional)
    pub oracle: [u8; 32],                         // 32 bytes, offset 320

    /// Reserved for future use
    pub _reserved: [u8; 32],                      // 32 bytes, offset 352
}
// Total: 384 bytes (divisible by 16)

impl Pool {
    pub const LEN: usize = 8 + std::mem::size_of::<Pool>();

    /// Get config as Pubkey
    pub fn config_pubkey(&self) -> Pubkey {
        Pubkey::new_from_array(self.config)
    }

    /// Get token_mint_a as Pubkey
    pub fn token_mint_a_pubkey(&self) -> Pubkey {
        Pubkey::new_from_array(self.token_mint_a)
    }

    /// Get token_mint_b as Pubkey
    pub fn token_mint_b_pubkey(&self) -> Pubkey {
        Pubkey::new_from_array(self.token_mint_b)
    }

    /// Get token_vault_a as Pubkey
    pub fn token_vault_a_pubkey(&self) -> Pubkey {
        Pubkey::new_from_array(self.token_vault_a)
    }

    /// Get token_vault_b as Pubkey
    pub fn token_vault_b_pubkey(&self) -> Pubkey {
        Pubkey::new_from_array(self.token_vault_b)
    }

    /// Get fee_tier as Pubkey
    pub fn fee_tier_pubkey(&self) -> Pubkey {
        Pubkey::new_from_array(self.fee_tier)
    }

    /// Get hook_program as Pubkey
    pub fn hook_program_pubkey(&self) -> Pubkey {
        Pubkey::new_from_array(self.hook_program)
    }

    /// Get oracle as Pubkey
    pub fn oracle_pubkey(&self) -> Pubkey {
        Pubkey::new_from_array(self.oracle)
    }

    /// Check if pool is paused
    pub fn is_pool_paused(&self) -> bool {
        self.is_paused != 0
    }

    /// Check if a specific hook is enabled
    pub fn is_hook_enabled(&self, flag: u8) -> bool {
        self.hook_program != [0u8; 32] && (self.hook_flags & flag) != 0
    }

    /// Check if pool has any hooks
    pub fn has_hooks(&self) -> bool {
        self.hook_program != [0u8; 32] && self.hook_flags != 0
    }

    /// Update liquidity, handling the signed delta
    pub fn update_liquidity(&mut self, delta: i128) -> Result<()> {
        if delta >= 0 {
            self.liquidity = self.liquidity
                .checked_add(delta as u128)
                .ok_or(crate::errors::SuniswapError::LiquidityNetOverflow)?;
        } else {
            self.liquidity = self.liquidity
                .checked_sub((-delta) as u128)
                .ok_or(crate::errors::SuniswapError::LiquidityNetOverflow)?;
        }
        Ok(())
    }
}
