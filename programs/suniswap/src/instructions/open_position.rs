use anchor_lang::prelude::*;
use crate::state::{Pool, Position};
use crate::constants::seeds;
use crate::errors::SuniswapError;
use crate::math::tick_math::is_valid_tick;

/// Open a new liquidity position
/// Creates a position account without adding liquidity (liquidity added separately)
#[derive(Accounts)]
#[instruction(tick_lower: i32, tick_upper: i32)]
pub struct OpenPosition<'info> {
    /// The pool to open a position in (zero-copy)
    pub pool: AccountLoader<'info, Pool>,

    /// The position account to create (zero-copy)
    #[account(
        init,
        payer = payer,
        space = Position::LEN,
        seeds = [
            seeds::POSITION_SEED,
            pool.key().as_ref(),
            owner.key().as_ref(),
            &tick_lower.to_le_bytes(),
            &tick_upper.to_le_bytes()
        ],
        bump
    )]
    pub position: AccountLoader<'info, Position>,

    /// The position owner
    pub owner: Signer<'info>,

    /// The payer for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Open position handler
pub fn handler(
    ctx: Context<OpenPosition>,
    tick_lower: i32,
    tick_upper: i32,
) -> Result<()> {
    let pool = ctx.accounts.pool.load()?;
    let owner = &ctx.accounts.owner;
    let pool_key = ctx.accounts.pool.key();

    // Check pool is not paused
    require!(pool.is_paused == 0, SuniswapError::PoolPaused);

    // Validate tick range
    require!(
        tick_lower < tick_upper,
        SuniswapError::InvalidTickRange
    );

    // Validate ticks are aligned to tick spacing
    require!(
        is_valid_tick(tick_lower, pool.tick_spacing),
        SuniswapError::InvalidTickLower
    );
    require!(
        is_valid_tick(tick_upper, pool.tick_spacing),
        SuniswapError::InvalidTickUpper
    );

    // Drop the pool borrow before loading position
    drop(pool);

    // Initialize position using zero-copy
    let mut position = ctx.accounts.position.load_init()?;
    position.pool = pool_key.to_bytes();
    position.owner = owner.key().to_bytes();
    position.tick_lower = tick_lower;
    position.tick_upper = tick_upper;
    position.liquidity = 0;
    position.fee_growth_inside_a_last_x128 = 0;
    position.fee_growth_inside_b_last_x128 = 0;
    position.tokens_owed_a = 0;
    position.tokens_owed_b = 0;
    position.bump = ctx.bumps.position;
    position.position_mint = [0u8; 32];

    msg!("Position opened");
    msg!("Pool: {}", pool_key);
    msg!("Owner: {}", owner.key());
    msg!("Tick range: [{}, {}]", tick_lower, tick_upper);

    Ok(())
}
