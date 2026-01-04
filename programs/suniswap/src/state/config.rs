use anchor_lang::prelude::*;

/// Global protocol configuration
/// PDA: ["config"]
#[account]
#[derive(Debug)]
pub struct SuniswapConfig {
    /// Authority that can update protocol settings
    pub protocol_authority: Pubkey,

    /// Authority that receives protocol fees
    pub fee_authority: Pubkey,

    /// Default protocol fee rate (percentage of swap fees taken by protocol)
    /// Denominator is 100, so 25 = 25%
    pub default_protocol_fee_rate: u8,

    /// Whether new pool creation is paused
    pub pool_creation_paused: bool,

    /// Bump seed for PDA derivation
    pub bump: u8,

    /// Number of fee tiers created
    pub fee_tier_count: u16,

    /// Reserved for future use
    pub _reserved: [u8; 32],
}

impl SuniswapConfig {
    pub const LEN: usize = 8 +  // discriminator
        32 +                     // protocol_authority
        32 +                     // fee_authority
        1 +                      // default_protocol_fee_rate
        1 +                      // pool_creation_paused
        1 +                      // bump
        2 +                      // fee_tier_count
        32;                      // reserved

    pub fn is_protocol_authority(&self, signer: &Pubkey) -> bool {
        self.protocol_authority == *signer
    }

    pub fn is_fee_authority(&self, signer: &Pubkey) -> bool {
        self.fee_authority == *signer
    }
}
