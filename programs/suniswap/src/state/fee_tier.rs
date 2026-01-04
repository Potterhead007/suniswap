use anchor_lang::prelude::*;

/// Fee tier configuration
/// PDA: ["fee_tier", fee_rate.to_le_bytes()]
#[account]
#[derive(Debug)]
pub struct FeeTier {
    /// The config this fee tier belongs to
    pub config: Pubkey,

    /// Fee rate in hundredths of a basis point (100 = 0.01%)
    pub fee_rate: u32,

    /// Tick spacing for this fee tier
    /// Lower fee = tighter spacing for stable pairs
    pub tick_spacing: u16,

    /// Bump seed for PDA derivation
    pub bump: u8,

    /// Reserved for future use
    pub _reserved: [u8; 32],
}

impl FeeTier {
    pub const LEN: usize = 8 +  // discriminator
        32 +                     // config
        4 +                      // fee_rate
        2 +                      // tick_spacing
        1 +                      // bump
        32;                      // reserved

    /// Calculate fee amount from input amount
    pub fn calculate_fee(&self, amount: u64) -> Option<u64> {
        // fee = amount * fee_rate / 1_000_000
        let fee = (amount as u128)
            .checked_mul(self.fee_rate as u128)?
            .checked_div(1_000_000)?;
        Some(fee as u64)
    }
}
