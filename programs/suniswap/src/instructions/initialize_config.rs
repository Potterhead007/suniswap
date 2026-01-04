use anchor_lang::prelude::*;
use crate::state::SuniswapConfig;
use crate::constants::seeds;

/// Initialize the global SuniSwap configuration
/// This should be called once when deploying the protocol
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    /// The config account to initialize
    #[account(
        init,
        payer = payer,
        space = SuniswapConfig::LEN,
        seeds = [seeds::CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, SuniswapConfig>,

    /// The protocol authority (can update settings)
    /// CHECK: This is just stored as the authority
    pub protocol_authority: UncheckedAccount<'info>,

    /// The fee authority (receives protocol fees)
    /// CHECK: This is just stored as the fee recipient
    pub fee_authority: UncheckedAccount<'info>,

    /// The payer for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Initialize config handler
pub fn handler(
    ctx: Context<InitializeConfig>,
    default_protocol_fee_rate: u8,
) -> Result<()> {
    let config = &mut ctx.accounts.config;

    // Validate protocol fee rate (max 25%)
    require!(
        default_protocol_fee_rate <= 25,
        crate::errors::SuniswapError::ProtocolFeeTooHigh
    );

    config.protocol_authority = ctx.accounts.protocol_authority.key();
    config.fee_authority = ctx.accounts.fee_authority.key();
    config.default_protocol_fee_rate = default_protocol_fee_rate;
    config.pool_creation_paused = false;
    config.bump = ctx.bumps.config;
    config.fee_tier_count = 0;

    msg!("SuniSwap config initialized");
    msg!("Protocol authority: {}", config.protocol_authority);
    msg!("Fee authority: {}", config.fee_authority);
    msg!("Default protocol fee rate: {}%", default_protocol_fee_rate);

    Ok(())
}
