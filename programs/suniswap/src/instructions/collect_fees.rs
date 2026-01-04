use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenAccount, TokenInterface, Mint, TransferChecked, transfer_checked};
use crate::state::{Pool, Position, TickArray, Tick, FeeTier};
use crate::constants::seeds;
use crate::errors::SuniswapError;

/// Collect accumulated fees from a position
#[derive(Accounts)]
pub struct CollectFees<'info> {
    /// The pool (zero-copy)
    pub pool: AccountLoader<'info, Pool>,

    /// The fee tier for this pool
    pub fee_tier: Account<'info, FeeTier>,

    /// The position to collect fees from (zero-copy)
    #[account(mut)]
    pub position: AccountLoader<'info, Position>,

    /// Tick array containing lower tick (zero-copy)
    pub tick_array_lower: AccountLoader<'info, TickArray>,

    /// Tick array containing upper tick (zero-copy)
    pub tick_array_upper: AccountLoader<'info, TickArray>,

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

    /// User's token A account
    #[account(mut)]
    pub user_token_a: InterfaceAccount<'info, TokenAccount>,

    /// User's token B account
    #[account(mut)]
    pub user_token_b: InterfaceAccount<'info, TokenAccount>,

    /// Position owner
    pub owner: Signer<'info>,

    /// Token program
    pub token_program: Interface<'info, TokenInterface>,
}

/// Collect fees handler
pub fn handler(
    ctx: Context<CollectFees>,
    amount_a_requested: u64,
    amount_b_requested: u64,
) -> Result<()> {
    let fee_tier = &ctx.accounts.fee_tier;
    let pool_key = ctx.accounts.pool.key();

    // Load and validate pool
    let pool = ctx.accounts.pool.load()?;
    require!(pool.is_paused == 0, SuniswapError::PoolPaused);
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

    let tick_current = pool.tick_current;
    let tick_spacing = pool.tick_spacing;
    let fee_growth_global_a = pool.fee_growth_global_a_x128;
    let fee_growth_global_b = pool.fee_growth_global_b_x128;
    let pool_bump = pool.bump;
    let token_mint_a_bytes = pool.token_mint_a;
    let token_mint_b_bytes = pool.token_mint_b;
    drop(pool);

    // Load and validate position
    let position = ctx.accounts.position.load()?;
    require!(
        position.pool == pool_key.to_bytes(),
        SuniswapError::InvalidPosition
    );
    require!(
        position.owner == ctx.accounts.owner.key().to_bytes(),
        SuniswapError::InvalidPositionOwner
    );

    let tick_lower = position.tick_lower;
    let tick_upper = position.tick_upper;
    drop(position);

    // Validate tick arrays
    let tick_array_lower = ctx.accounts.tick_array_lower.load()?;
    require!(
        tick_array_lower.pool == pool_key.to_bytes(),
        SuniswapError::InvalidTickArray
    );

    let tick_array_upper = ctx.accounts.tick_array_upper.load()?;
    require!(
        tick_array_upper.pool == pool_key.to_bytes(),
        SuniswapError::InvalidTickArray
    );

    // Calculate fee growth inside
    let (fee_growth_inside_a, fee_growth_inside_b) = calculate_fee_growth_inside(
        &tick_array_lower,
        &tick_array_upper,
        tick_lower,
        tick_upper,
        tick_current,
        fee_growth_global_a,
        fee_growth_global_b,
        tick_spacing,
    )?;
    drop(tick_array_lower);
    drop(tick_array_upper);

    // Update position and calculate amounts
    let mut position = ctx.accounts.position.load_mut()?;
    position.update_owed_tokens(fee_growth_inside_a, fee_growth_inside_b)?;

    let amount_a = position.tokens_owed_a.min(amount_a_requested);
    let amount_b = position.tokens_owed_b.min(amount_b_requested);

    position.tokens_owed_a = position.tokens_owed_a
        .checked_sub(amount_a)
        .ok_or(SuniswapError::MathOverflow)?;
    position.tokens_owed_b = position.tokens_owed_b
        .checked_sub(amount_b)
        .ok_or(SuniswapError::MathOverflow)?;

    let remaining_a = position.tokens_owed_a;
    let remaining_b = position.tokens_owed_b;
    drop(position);

    // Transfer tokens from vaults to user
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
                    to: ctx.accounts.user_token_a.to_account_info(),
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
                    to: ctx.accounts.user_token_b.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                &[pool_seeds],
            ),
            amount_b,
            ctx.accounts.token_mint_b.decimals,
        )?;
    }

    msg!("Fees collected: A={}, B={}", amount_a, amount_b);
    msg!("Remaining owed: A={}, B={}", remaining_a, remaining_b);

    Ok(())
}

fn calculate_fee_growth_inside(
    tick_array_lower: &TickArray,
    tick_array_upper: &TickArray,
    tick_lower: i32,
    tick_upper: i32,
    tick_current: i32,
    fee_growth_global_a_x128: u128,
    fee_growth_global_b_x128: u128,
    tick_spacing: u16,
) -> Result<(u128, u128)> {
    let tick_lower_data = tick_array_lower.get_tick(tick_lower, tick_spacing)?;
    let tick_upper_data = tick_array_upper.get_tick(tick_upper, tick_spacing)?;

    let (fee_growth_inside_a, fee_growth_inside_b) = Tick::get_fee_growth_inside(
        tick_lower_data,
        tick_upper_data,
        tick_lower,
        tick_upper,
        tick_current,
        fee_growth_global_a_x128,
        fee_growth_global_b_x128,
    );

    Ok((fee_growth_inside_a, fee_growth_inside_b))
}
