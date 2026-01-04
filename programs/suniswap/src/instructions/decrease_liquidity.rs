use anchor_lang::prelude::*;
use crate::state::{Pool, Position, TickArray, Tick};
use crate::errors::SuniswapError;
use crate::math::liquidity_math::{get_amounts_for_liquidity, add_liquidity_delta};

/// Decrease liquidity from an existing position
#[derive(Accounts)]
pub struct DecreaseLiquidity<'info> {
    /// The pool (zero-copy)
    #[account(mut)]
    pub pool: AccountLoader<'info, Pool>,

    /// The position to remove liquidity from (zero-copy)
    #[account(mut)]
    pub position: AccountLoader<'info, Position>,

    /// Tick array containing lower tick (zero-copy)
    #[account(mut)]
    pub tick_array_lower: AccountLoader<'info, TickArray>,

    /// Tick array containing upper tick (zero-copy)
    #[account(mut)]
    pub tick_array_upper: AccountLoader<'info, TickArray>,

    /// Position owner
    pub owner: Signer<'info>,
}

/// Decrease liquidity handler
pub fn handler(
    ctx: Context<DecreaseLiquidity>,
    liquidity_delta: u128,
    amount_a_min: u64,
    amount_b_min: u64,
) -> Result<()> {
    require!(liquidity_delta > 0, SuniswapError::ZeroLiquidity);

    // Load pool
    let pool = ctx.accounts.pool.load()?;
    let pool_key = ctx.accounts.pool.key();

    require!(pool.is_paused == 0, SuniswapError::PoolPaused);

    let sqrt_price_x64 = pool.sqrt_price_x64;
    let tick_current = pool.tick_current;
    let tick_spacing = pool.tick_spacing;
    let fee_growth_global_a = pool.fee_growth_global_a_x128;
    let fee_growth_global_b = pool.fee_growth_global_b_x128;

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
    require!(
        position.liquidity >= liquidity_delta,
        SuniswapError::InsufficientLiquidity
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
    drop(tick_array_lower);

    let tick_array_upper = ctx.accounts.tick_array_upper.load()?;
    require!(
        tick_array_upper.pool == pool_key.to_bytes(),
        SuniswapError::InvalidTickArray
    );
    drop(tick_array_upper);

    // Calculate token amounts
    let (amount_a, amount_b) = get_amounts_for_liquidity(
        sqrt_price_x64,
        crate::math::tick_math::get_sqrt_price_at_tick(tick_lower)?,
        crate::math::tick_math::get_sqrt_price_at_tick(tick_upper)?,
        liquidity_delta,
        false,
    )?;

    require!(amount_a >= amount_a_min, SuniswapError::AmountABelowMin);
    require!(amount_b >= amount_b_min, SuniswapError::AmountBBelowMin);

    // Update tick arrays and position
    {
        let mut tick_array_lower = ctx.accounts.tick_array_lower.load_mut()?;
        let mut tick_array_upper = ctx.accounts.tick_array_upper.load_mut()?;

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

        // Update position
        let mut position = ctx.accounts.position.load_mut()?;
        position.update_owed_tokens(fee_growth_inside_a, fee_growth_inside_b)?;
        position.tokens_owed_a = position.tokens_owed_a
            .checked_add(amount_a)
            .ok_or(SuniswapError::MathOverflow)?;
        position.tokens_owed_b = position.tokens_owed_b
            .checked_add(amount_b)
            .ok_or(SuniswapError::MathOverflow)?;
        position.liquidity = position.liquidity
            .checked_sub(liquidity_delta)
            .ok_or(SuniswapError::InsufficientLiquidity)?;
        drop(position);

        // Safe conversion: validate liquidity_delta fits in i128
        let liquidity_delta_signed = i128::try_from(liquidity_delta)
            .map_err(|_| SuniswapError::LiquidityOverflow)?;

        // Update ticks (negative delta for decrease)
        let _flipped_lower = tick_array_lower.update_tick(
            tick_lower,
            tick_spacing,
            tick_current,
            -liquidity_delta_signed,
            fee_growth_global_a,
            fee_growth_global_b,
            false,
        )?;

        let _flipped_upper = tick_array_upper.update_tick(
            tick_upper,
            tick_spacing,
            tick_current,
            -liquidity_delta_signed,
            fee_growth_global_a,
            fee_growth_global_b,
            true,
        )?;
    }

    // Update pool liquidity if in range
    if tick_current >= tick_lower && tick_current < tick_upper {
        let liquidity_delta_signed = i128::try_from(liquidity_delta)
            .map_err(|_| SuniswapError::LiquidityOverflow)?;
        let mut pool = ctx.accounts.pool.load_mut()?;
        pool.liquidity = add_liquidity_delta(pool.liquidity, -liquidity_delta_signed)?;
    }

    msg!("Liquidity decreased: {}", liquidity_delta);
    msg!("Amount A owed: {}, Amount B owed: {}", amount_a, amount_b);

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
