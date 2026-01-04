use anchor_lang::prelude::*;
use crate::state::{SuniswapConfig, FeeTier};
use crate::constants::{seeds, FEE_RATE_DENOMINATOR, MAX_TICK_SPACING};
use crate::errors::SuniswapError;

/// Initialize a new fee tier
#[derive(Accounts)]
#[instruction(fee_rate: u32, tick_spacing: u16)]
pub struct InitializeFeeTier<'info> {
    /// The global config
    #[account(
        mut,
        seeds = [seeds::CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, SuniswapConfig>,

    /// The fee tier account to initialize
    #[account(
        init,
        payer = payer,
        space = FeeTier::LEN,
        seeds = [seeds::FEE_TIER_SEED, &fee_rate.to_le_bytes()],
        bump
    )]
    pub fee_tier: Account<'info, FeeTier>,

    /// Authority that can create fee tiers (protocol authority)
    pub authority: Signer<'info>,

    /// The payer for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Initialize fee tier handler
pub fn handler(
    ctx: Context<InitializeFeeTier>,
    fee_rate: u32,
    tick_spacing: u16,
) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let fee_tier = &mut ctx.accounts.fee_tier;

    // Validate authority
    require!(
        config.is_protocol_authority(&ctx.accounts.authority.key()),
        SuniswapError::NotProtocolAuthority
    );

    // Validate fee rate (max 10% = 100000)
    require!(
        fee_rate <= FEE_RATE_DENOMINATOR / 10,
        SuniswapError::FeeRateTooHigh
    );

    // Validate tick spacing
    require!(
        tick_spacing > 0 && tick_spacing <= MAX_TICK_SPACING,
        SuniswapError::InvalidFeeTier
    );

    fee_tier.config = config.key();
    fee_tier.fee_rate = fee_rate;
    fee_tier.tick_spacing = tick_spacing;
    fee_tier.bump = ctx.bumps.fee_tier;

    // Increment fee tier count
    config.fee_tier_count = config.fee_tier_count
        .checked_add(1)
        .ok_or(SuniswapError::MathOverflow)?;

    msg!("Fee tier initialized");
    msg!("Fee rate: {} ({}%)", fee_rate, fee_rate as f64 / 10000.0);
    msg!("Tick spacing: {}", tick_spacing);

    Ok(())
}
