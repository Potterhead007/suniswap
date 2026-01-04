use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenAccount, TokenInterface, Mint, TransferChecked, transfer_checked};
use crate::state::{Pool, TickArray, FeeTier};
use crate::constants::seeds;
use crate::errors::SuniswapError;
use crate::math::swap_math::compute_swap_step;
use crate::math::tick_math::{get_tick_at_sqrt_price, get_sqrt_price_at_tick};
use crate::math::liquidity_math::add_liquidity_delta;

/// Execute a swap on a pool
#[derive(Accounts)]
pub struct Swap<'info> {
    /// The pool to swap on (zero-copy)
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

    /// User's input token account
    #[account(mut)]
    pub user_token_input: InterfaceAccount<'info, TokenAccount>,

    /// User's output token account
    #[account(mut)]
    pub user_token_output: InterfaceAccount<'info, TokenAccount>,

    /// Current tick array (zero-copy)
    #[account(mut)]
    pub tick_array_0: AccountLoader<'info, TickArray>,

    /// Adjacent tick array (zero-copy)
    #[account(mut)]
    pub tick_array_1: AccountLoader<'info, TickArray>,

    /// Second adjacent tick array (zero-copy)
    #[account(mut)]
    pub tick_array_2: AccountLoader<'info, TickArray>,

    /// The user performing the swap
    pub user: Signer<'info>,

    /// Token program
    pub token_program: Interface<'info, TokenInterface>,
}

/// Swap parameters
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SwapParams {
    pub amount: i64,
    pub other_amount_threshold: u64,
    pub sqrt_price_limit_x64: u128,
    pub a_to_b: bool,
}

/// Internal swap state to track progress through tick arrays
struct SwapState {
    amount_remaining: i64,
    amount_calculated: u64,
    sqrt_price_x64: u128,
    tick: i32,
    liquidity: u128,
    fee_growth_global_x128: u128,
    protocol_fee: u64,
}

/// Swap handler with proper tick crossing (C-01, C-02 FIX)
pub fn handler(ctx: Context<Swap>, params: SwapParams) -> Result<()> {
    require!(params.amount != 0, SuniswapError::ZeroSwapAmount);

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

    let zero_for_one = params.a_to_b;
    let exact_input = params.amount > 0;
    let tick_spacing = pool.tick_spacing;

    // Validate sqrt_price_limit
    let sqrt_price_limit_x64 = if params.sqrt_price_limit_x64 == 0 {
        if zero_for_one {
            crate::constants::MIN_SQRT_PRICE_X64 + 1
        } else {
            crate::constants::MAX_SQRT_PRICE_X64 - 1
        }
    } else {
        params.sqrt_price_limit_x64
    };

    // Validate price limit direction
    if zero_for_one {
        require!(
            sqrt_price_limit_x64 < pool.sqrt_price_x64,
            SuniswapError::InvalidPriceLimit
        );
        require!(
            sqrt_price_limit_x64 >= crate::constants::MIN_SQRT_PRICE_X64,
            SuniswapError::InvalidPriceLimit
        );
    } else {
        require!(
            sqrt_price_limit_x64 > pool.sqrt_price_x64,
            SuniswapError::InvalidPriceLimit
        );
        require!(
            sqrt_price_limit_x64 <= crate::constants::MAX_SQRT_PRICE_X64,
            SuniswapError::InvalidPriceLimit
        );
    }

    // Initialize swap state (C-02 FIX: liquidity is now mutable)
    let mut state = SwapState {
        amount_remaining: params.amount,
        amount_calculated: 0,
        sqrt_price_x64: pool.sqrt_price_x64,
        tick: pool.tick_current,
        liquidity: pool.liquidity,
        fee_growth_global_x128: if zero_for_one {
            pool.fee_growth_global_a_x128
        } else {
            pool.fee_growth_global_b_x128
        },
        protocol_fee: 0,
    };

    let protocol_fee_rate = pool.protocol_fee_rate;
    let pool_bump = pool.bump;
    let token_mint_a_bytes = pool.token_mint_a;
    let token_mint_b_bytes = pool.token_mint_b;
    let fee_growth_global_a = pool.fee_growth_global_a_x128;
    let fee_growth_global_b = pool.fee_growth_global_b_x128;

    drop(pool);

    // Validate tick arrays belong to this pool and are properly sequenced for swap direction
    let ticks_per_array = (crate::constants::TICK_ARRAY_SIZE as i32) * (tick_spacing as i32);
    let expected_start_0 = crate::state::TickArray::get_start_tick_index(state.tick, tick_spacing);

    let (start_0, start_1, start_2) = {
        let tick_array_0 = ctx.accounts.tick_array_0.load()?;
        let tick_array_1 = ctx.accounts.tick_array_1.load()?;
        let tick_array_2 = ctx.accounts.tick_array_2.load()?;

        // Validate all arrays belong to this pool
        require!(
            tick_array_0.pool == pool_key.to_bytes(),
            SuniswapError::InvalidTickArray
        );
        require!(
            tick_array_1.pool == pool_key.to_bytes(),
            SuniswapError::InvalidTickArray
        );
        require!(
            tick_array_2.pool == pool_key.to_bytes(),
            SuniswapError::InvalidTickArray
        );

        // Validate tick_array_0 contains or is adjacent to current tick
        require!(
            tick_array_0.start_tick_index == expected_start_0 ||
            tick_array_0.start_tick_index == expected_start_0 - ticks_per_array ||
            tick_array_0.start_tick_index == expected_start_0 + ticks_per_array,
            SuniswapError::InvalidTickArray
        );

        (tick_array_0.start_tick_index, tick_array_1.start_tick_index, tick_array_2.start_tick_index)
    };

    // Validate tick arrays are properly sequenced for swap direction
    // For zero_for_one (price decreasing): arrays should be in descending order
    // For !zero_for_one (price increasing): arrays should be in ascending order
    if zero_for_one {
        // Going left: start_0 >= start_1 >= start_2
        require!(
            start_0 >= start_1 && start_1 >= start_2,
            SuniswapError::InvalidTickArray
        );
    } else {
        // Going right: start_0 <= start_1 <= start_2
        require!(
            start_0 <= start_1 && start_1 <= start_2,
            SuniswapError::InvalidTickArray
        );
    }

    // Main swap loop with tick crossing (C-01, C-02 FIX)
    let mut iterations = 0;
    const MAX_ITERATIONS: u32 = 20;

    while state.amount_remaining != 0
        && state.sqrt_price_x64 != sqrt_price_limit_x64
        && iterations < MAX_ITERATIONS
    {
        iterations += 1;

        // Find the next initialized tick in the swap direction
        let (next_tick, next_tick_initialized) = find_next_initialized_tick(
            &ctx.accounts.tick_array_0,
            &ctx.accounts.tick_array_1,
            &ctx.accounts.tick_array_2,
            state.tick,
            tick_spacing,
            zero_for_one,
        )?;

        // Clamp to price limit
        let sqrt_price_next_tick = get_sqrt_price_at_tick(next_tick)?;
        let sqrt_price_target = if zero_for_one {
            sqrt_price_next_tick.max(sqrt_price_limit_x64)
        } else {
            sqrt_price_next_tick.min(sqrt_price_limit_x64)
        };

        // Compute swap step
        let step = compute_swap_step(
            state.sqrt_price_x64,
            sqrt_price_target,
            state.liquidity,
            state.amount_remaining,
            fee_tier.fee_rate,
        )?;

        // Update state with step results
        state.sqrt_price_x64 = step.sqrt_price_next_x64;

        // Safe conversion of swap step amounts to i64
        let amount_in_i64 = i64::try_from(step.amount_in)
            .map_err(|_| SuniswapError::CastOverflow)?;
        let fee_amount_i64 = i64::try_from(step.fee_amount)
            .map_err(|_| SuniswapError::CastOverflow)?;
        let amount_out_i64 = i64::try_from(step.amount_out)
            .map_err(|_| SuniswapError::CastOverflow)?;

        if exact_input {
            state.amount_remaining = state.amount_remaining
                .checked_sub(amount_in_i64)
                .ok_or(SuniswapError::MathOverflow)?
                .checked_sub(fee_amount_i64)
                .ok_or(SuniswapError::MathOverflow)?;
            state.amount_calculated = state.amount_calculated
                .checked_add(step.amount_out)
                .ok_or(SuniswapError::MathOverflow)?;
        } else {
            state.amount_remaining = state.amount_remaining
                .checked_add(amount_out_i64)
                .ok_or(SuniswapError::MathOverflow)?;
            state.amount_calculated = state.amount_calculated
                .checked_add(step.amount_in)
                .ok_or(SuniswapError::MathOverflow)?
                .checked_add(step.fee_amount)
                .ok_or(SuniswapError::MathOverflow)?;
        }

        // Update fee growth
        if state.liquidity > 0 {
            let fee_growth_delta = crate::math::swap_math::calculate_fee_growth(
                step.fee_amount,
                state.liquidity,
            )?;
            state.fee_growth_global_x128 = state.fee_growth_global_x128.wrapping_add(fee_growth_delta);

            if protocol_fee_rate > 0 {
                let protocol_fee_amount = crate::math::swap_math::calculate_protocol_fee(
                    step.fee_amount,
                    protocol_fee_rate,
                )?;
                state.protocol_fee = state.protocol_fee
                    .checked_add(protocol_fee_amount)
                    .ok_or(SuniswapError::MathOverflow)?;
            }
        }

        // C-01 FIX: Handle tick crossing when we reach the target tick
        if state.sqrt_price_x64 == sqrt_price_next_tick && next_tick_initialized {
            // Cross the tick - update liquidity
            let liquidity_net = cross_tick(
                &ctx.accounts.tick_array_0,
                &ctx.accounts.tick_array_1,
                &ctx.accounts.tick_array_2,
                next_tick,
                tick_spacing,
                fee_growth_global_a,
                fee_growth_global_b,
                state.fee_growth_global_x128,
                zero_for_one,
            )?;

            // C-02 FIX: Update liquidity based on direction
            // When moving left (zero_for_one), we're exiting positions, so subtract liquidity_net
            // When moving right (!zero_for_one), we're entering positions, so add liquidity_net
            state.liquidity = if zero_for_one {
                add_liquidity_delta(state.liquidity, -liquidity_net)?
            } else {
                add_liquidity_delta(state.liquidity, liquidity_net)?
            };
        }

        // Update tick based on new price
        state.tick = if zero_for_one {
            if state.sqrt_price_x64 == sqrt_price_next_tick {
                next_tick - 1
            } else {
                get_tick_at_sqrt_price(state.sqrt_price_x64)?
            }
        } else {
            if state.sqrt_price_x64 == sqrt_price_next_tick {
                next_tick
            } else {
                get_tick_at_sqrt_price(state.sqrt_price_x64)?
            }
        };
    }

    // Calculate final amounts with safe conversions
    let (amount_in, amount_out) = if exact_input {
        // For exact input: amount_in = initial_amount - remaining
        // params.amount is positive, state.amount_remaining should be >= 0
        let consumed = params.amount
            .checked_sub(state.amount_remaining)
            .ok_or(SuniswapError::MathOverflow)?;
        let amount_in = u64::try_from(consumed)
            .map_err(|_| SuniswapError::CastOverflow)?;
        (amount_in, state.amount_calculated)
    } else {
        // For exact output: params.amount is negative, remaining approaches 0
        // amount_out = |params.amount| - |remaining|
        let initial_output = (-params.amount)
            .checked_add(state.amount_remaining)
            .ok_or(SuniswapError::MathOverflow)?;
        let amount_out = u64::try_from(initial_output)
            .map_err(|_| SuniswapError::CastOverflow)?;
        (state.amount_calculated, amount_out)
    };

    // Check slippage
    if exact_input {
        require!(
            amount_out >= params.other_amount_threshold,
            SuniswapError::OutputBelowMinimum
        );
    } else {
        require!(
            amount_in <= params.other_amount_threshold,
            SuniswapError::InputExceedsMaximum
        );
    }

    // Update pool state
    {
        let mut pool = ctx.accounts.pool.load_mut()?;
        pool.sqrt_price_x64 = state.sqrt_price_x64;
        pool.tick_current = state.tick;
        pool.liquidity = state.liquidity;  // C-02 FIX: Now properly updated

        if zero_for_one {
            pool.fee_growth_global_a_x128 = state.fee_growth_global_x128;
            pool.protocol_fees_a = pool.protocol_fees_a
                .checked_add(state.protocol_fee)
                .ok_or(SuniswapError::MathOverflow)?;
        } else {
            pool.fee_growth_global_b_x128 = state.fee_growth_global_x128;
            pool.protocol_fees_b = pool.protocol_fees_b
                .checked_add(state.protocol_fee)
                .ok_or(SuniswapError::MathOverflow)?;
        }
    }

    // Execute token transfers
    let (input_mint, output_mint, input_decimals, output_decimals) = if zero_for_one {
        (
            &ctx.accounts.token_mint_a,
            &ctx.accounts.token_mint_b,
            ctx.accounts.token_mint_a.decimals,
            ctx.accounts.token_mint_b.decimals,
        )
    } else {
        (
            &ctx.accounts.token_mint_b,
            &ctx.accounts.token_mint_a,
            ctx.accounts.token_mint_b.decimals,
            ctx.accounts.token_mint_a.decimals,
        )
    };

    let (input_vault, output_vault) = if zero_for_one {
        (&ctx.accounts.token_vault_a, &ctx.accounts.token_vault_b)
    } else {
        (&ctx.accounts.token_vault_b, &ctx.accounts.token_vault_a)
    };

    // Transfer input tokens
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_token_input.to_account_info(),
                mint: input_mint.to_account_info(),
                to: input_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        amount_in,
        input_decimals,
    )?;

    // Transfer output tokens
    let pool_seeds: &[&[u8]] = &[
        seeds::POOL_SEED,
        &token_mint_a_bytes,
        &token_mint_b_bytes,
        &fee_tier.fee_rate.to_le_bytes(),
        &[pool_bump],
    ];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: output_vault.to_account_info(),
                mint: output_mint.to_account_info(),
                to: ctx.accounts.user_token_output.to_account_info(),
                authority: ctx.accounts.pool.to_account_info(),
            },
            &[pool_seeds],
        ),
        amount_out,
        output_decimals,
    )?;

    msg!("Swap: {} -> {}", if zero_for_one { "A" } else { "B" }, if zero_for_one { "B" } else { "A" });
    msg!("In: {}, Out: {}, Ticks crossed: {}", amount_in, amount_out, iterations);

    Ok(())
}

/// Find the next initialized tick in the given direction
/// Returns (next_tick, is_initialized)
fn find_next_initialized_tick<'a>(
    tick_array_0: &AccountLoader<'a, TickArray>,
    tick_array_1: &AccountLoader<'a, TickArray>,
    tick_array_2: &AccountLoader<'a, TickArray>,
    current_tick: i32,
    tick_spacing: u16,
    zero_for_one: bool,
) -> Result<(i32, bool)> {
    // Try tick_array_0 first
    {
        let array = tick_array_0.load()?;
        if array.is_tick_in_array(current_tick, tick_spacing) {
            let (next_tick, initialized) = array.next_initialized_tick(
                current_tick,
                tick_spacing,
                zero_for_one,
            )?;
            if initialized {
                return Ok((next_tick, true));
            }
            return Ok((next_tick, false));
        }
    }

    // Try tick_array_1
    {
        let array = tick_array_1.load()?;
        if array.is_tick_in_array(current_tick, tick_spacing) {
            let (next_tick, initialized) = array.next_initialized_tick(
                current_tick,
                tick_spacing,
                zero_for_one,
            )?;
            if initialized {
                return Ok((next_tick, true));
            }
            return Ok((next_tick, false));
        }
    }

    // Try tick_array_2
    {
        let array = tick_array_2.load()?;
        if array.is_tick_in_array(current_tick, tick_spacing) {
            let (next_tick, initialized) = array.next_initialized_tick(
                current_tick,
                tick_spacing,
                zero_for_one,
            )?;
            if initialized {
                return Ok((next_tick, true));
            }
            return Ok((next_tick, false));
        }
    }

    // If tick not in any array, use the first array's boundary
    let array = tick_array_0.load()?;
    let boundary = if zero_for_one {
        array.start_tick_index
    } else {
        array.start_tick_index + (crate::constants::TICK_ARRAY_SIZE as i32 - 1) * (tick_spacing as i32)
    };

    Ok((boundary, false))
}

/// Cross a tick and return the liquidity_net to apply
fn cross_tick<'a>(
    tick_array_0: &AccountLoader<'a, TickArray>,
    tick_array_1: &AccountLoader<'a, TickArray>,
    tick_array_2: &AccountLoader<'a, TickArray>,
    tick_index: i32,
    tick_spacing: u16,
    fee_growth_global_a: u128,
    fee_growth_global_b: u128,
    current_fee_growth: u128,
    zero_for_one: bool,
) -> Result<i128> {
    // Compute fee values for crossing
    let (fee_a, fee_b) = if zero_for_one {
        (current_fee_growth, fee_growth_global_b)
    } else {
        (fee_growth_global_a, current_fee_growth)
    };

    // Try tick_array_0
    {
        let mut array = tick_array_0.load_mut()?;
        if array.is_tick_in_array(tick_index, tick_spacing) {
            let tick = array.get_tick_mut(tick_index, tick_spacing)?;
            tick.cross(fee_a, fee_b);
            return Ok(tick.liquidity_net);
        }
    }

    // Try tick_array_1
    {
        let mut array = tick_array_1.load_mut()?;
        if array.is_tick_in_array(tick_index, tick_spacing) {
            let tick = array.get_tick_mut(tick_index, tick_spacing)?;
            tick.cross(fee_a, fee_b);
            return Ok(tick.liquidity_net);
        }
    }

    // Try tick_array_2
    {
        let mut array = tick_array_2.load_mut()?;
        if array.is_tick_in_array(tick_index, tick_spacing) {
            let tick = array.get_tick_mut(tick_index, tick_spacing)?;
            tick.cross(fee_a, fee_b);
            return Ok(tick.liquidity_net);
        }
    }

    // Tick not found in any array - this shouldn't happen if arrays are validated
    Err(SuniswapError::TickArrayNotFound.into())
}
