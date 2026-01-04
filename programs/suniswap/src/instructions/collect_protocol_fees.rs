use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenAccount, TokenInterface, Mint, TransferChecked, transfer_checked};
use crate::state::{Pool, SuniswapConfig, FeeTier};
use crate::constants::seeds;
use crate::errors::SuniswapError;

/// Collect accumulated protocol fees from a pool
/// Only callable by fee authority
#[derive(Accounts)]
pub struct CollectProtocolFees<'info> {
    /// The global config
    #[account(
        seeds = [seeds::CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, SuniswapConfig>,

    /// The pool to collect fees from (zero-copy)
    #[account(mut)]
    pub pool: AccountLoader<'info, Pool>,

    /// The fee tier for this pool
    pub fee_tier: Account<'info, FeeTier>,

    /// Token A mint
    pub token_mint_a: InterfaceAccount<'info, Mint>,

    /// Token B mint
    pub token_mint_b: InterfaceAccount<'info, Mint>,

    /// Pool vault for token A
    #[account(mut)]
    pub token_vault_a: InterfaceAccount<'info, TokenAccount>,

    /// Pool vault for token B
    #[account(mut)]
    pub token_vault_b: InterfaceAccount<'info, TokenAccount>,

    /// Recipient token A account
    #[account(mut)]
    pub recipient_token_a: InterfaceAccount<'info, TokenAccount>,

    /// Recipient token B account
    #[account(mut)]
    pub recipient_token_b: InterfaceAccount<'info, TokenAccount>,

    /// Fee authority
    #[account(
        constraint = fee_authority.key() == config.fee_authority @ SuniswapError::InvalidFeeAuthority,
    )]
    pub fee_authority: Signer<'info>,

    /// Token program
    pub token_program: Interface<'info, TokenInterface>,
}

/// Collect protocol fees handler
pub fn handler(
    ctx: Context<CollectProtocolFees>,
    amount_a_requested: u64,
    amount_b_requested: u64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let fee_tier = &ctx.accounts.fee_tier;

    // Load and validate pool
    let pool = ctx.accounts.pool.load()?;
    require!(
        pool.config == config.key().to_bytes(),
        SuniswapError::InvalidConfig
    );
    require!(
        pool.fee_tier == fee_tier.key().to_bytes(),
        SuniswapError::InvalidFeeTier
    );
    require!(
        pool.token_mint_a == ctx.accounts.token_mint_a.key().to_bytes(),
        SuniswapError::InvalidTokenMint
    );
    require!(
        pool.token_mint_b == ctx.accounts.token_mint_b.key().to_bytes(),
        SuniswapError::InvalidTokenMint
    );
    require!(
        pool.token_vault_a == ctx.accounts.token_vault_a.key().to_bytes(),
        SuniswapError::InvalidVault
    );
    require!(
        pool.token_vault_b == ctx.accounts.token_vault_b.key().to_bytes(),
        SuniswapError::InvalidVault
    );

    // Calculate amounts and store values before dropping
    let amount_a = pool.protocol_fees_a.min(amount_a_requested);
    let amount_b = pool.protocol_fees_b.min(amount_b_requested);
    let pool_bump = pool.bump;
    let token_mint_a_bytes = pool.token_mint_a;
    let token_mint_b_bytes = pool.token_mint_b;
    drop(pool);

    // Update pool state
    {
        let mut pool = ctx.accounts.pool.load_mut()?;
        pool.protocol_fees_a = pool.protocol_fees_a
            .checked_sub(amount_a)
            .ok_or(SuniswapError::MathOverflow)?;
        pool.protocol_fees_b = pool.protocol_fees_b
            .checked_sub(amount_b)
            .ok_or(SuniswapError::MathOverflow)?;
    }

    // Transfer tokens
    let pool_seeds: &[&[u8]] = &[
        seeds::POOL_SEED,
        &token_mint_a_bytes,
        &token_mint_b_bytes,
        &fee_tier.fee_rate.to_le_bytes(),
        &[pool_bump],
    ];

    if amount_a > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.token_vault_a.to_account_info(),
                    mint: ctx.accounts.token_mint_a.to_account_info(),
                    to: ctx.accounts.recipient_token_a.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[pool_seeds],
            ),
            amount_a,
            ctx.accounts.token_mint_a.decimals,
        )?;
    }

    if amount_b > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.token_vault_b.to_account_info(),
                    mint: ctx.accounts.token_mint_b.to_account_info(),
                    to: ctx.accounts.recipient_token_b.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[pool_seeds],
            ),
            amount_b,
            ctx.accounts.token_mint_b.decimals,
        )?;
    }

    // Get remaining fees for logging
    let pool = ctx.accounts.pool.load()?;
    msg!("Protocol fees collected: A={}, B={}", amount_a, amount_b);
    msg!("Remaining: A={}, B={}", pool.protocol_fees_a, pool.protocol_fees_b);

    Ok(())
}
