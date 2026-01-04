use anchor_lang::prelude::*;
use crate::state::{Pool, TickArray};
use crate::constants::seeds;
use crate::errors::SuniswapError;

/// Initialize a tick array for a pool
/// Tick arrays must be initialized before positions can reference ticks within them
#[derive(Accounts)]
#[instruction(start_tick_index: i32)]
pub struct InitializeTickArray<'info> {
    /// The pool this tick array belongs to (zero-copy)
    pub pool: AccountLoader<'info, Pool>,

    /// The tick array to initialize (zero-copy)
    #[account(
        init,
        payer = payer,
        space = TickArray::LEN,
        seeds = [
            seeds::TICK_ARRAY_SEED,
            pool.key().as_ref(),
            &start_tick_index.to_le_bytes()
        ],
        bump
    )]
    pub tick_array: AccountLoader<'info, TickArray>,

    /// The payer for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Initialize tick array handler
pub fn handler(
    ctx: Context<InitializeTickArray>,
    start_tick_index: i32,
) -> Result<()> {
    // Load pool to get tick spacing
    let pool = ctx.accounts.pool.load()?;

    // Check pool is not paused
    require!(pool.is_paused == 0, SuniswapError::PoolPaused);

    let tick_spacing = pool.tick_spacing;
    let pool_key = ctx.accounts.pool.key();

    // Drop the pool borrow before loading tick_array
    drop(pool);

    // Validate start_tick_index is aligned to tick array boundaries
    let ticks_per_array = (crate::constants::TICK_ARRAY_SIZE as i32) * (tick_spacing as i32);

    require!(
        start_tick_index % ticks_per_array == 0,
        SuniswapError::InvalidTickArrayStart
    );

    // Validate tick is within bounds
    require!(
        start_tick_index >= crate::constants::MIN_TICK,
        SuniswapError::TickBelowMinimum
    );
    require!(
        start_tick_index + ticks_per_array <= crate::constants::MAX_TICK + (tick_spacing as i32),
        SuniswapError::TickAboveMaximum
    );

    // Initialize tick array using zero-copy
    let mut tick_array = ctx.accounts.tick_array.load_init()?;
    tick_array.pool = pool_key.to_bytes();
    tick_array.start_tick_index = start_tick_index;
    tick_array.initialized_bitmap = 0;
    tick_array.bump = ctx.bumps.tick_array;

    // Ticks are automatically zero-initialized

    msg!("Tick array initialized");
    msg!("Pool: {}", pool_key);
    msg!("Start tick index: {}", start_tick_index);

    Ok(())
}
