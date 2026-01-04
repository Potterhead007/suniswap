use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use crate::state::{SuniswapConfig, FeeTier, Pool};
use crate::constants::seeds;
use crate::errors::SuniswapError;
use crate::math::tick_math::get_tick_at_sqrt_price;

/// Initialize a new liquidity pool
#[derive(Accounts)]
pub struct InitializePool<'info> {
    /// The global config
    #[account(
        seeds = [seeds::CONFIG_SEED],
        bump = config.bump,
        constraint = !config.pool_creation_paused @ SuniswapError::PoolPaused,
    )]
    pub config: Account<'info, SuniswapConfig>,

    /// The fee tier for this pool
    #[account(
        seeds = [seeds::FEE_TIER_SEED, &fee_tier.fee_rate.to_le_bytes()],
        bump = fee_tier.bump,
        constraint = fee_tier.config == config.key() @ SuniswapError::InvalidFeeTier,
    )]
    pub fee_tier: Account<'info, FeeTier>,

    /// The pool account to initialize (zero-copy)
    #[account(
        init,
        payer = payer,
        space = Pool::LEN,
        seeds = [
            seeds::POOL_SEED,
            token_mint_a.key().as_ref(),
            token_mint_b.key().as_ref(),
            &fee_tier.fee_rate.to_le_bytes()
        ],
        bump
    )]
    pub pool: AccountLoader<'info, Pool>,

    /// Token A mint (must be < Token B mint lexicographically)
    pub token_mint_a: InterfaceAccount<'info, Mint>,

    /// Token B mint
    pub token_mint_b: InterfaceAccount<'info, Mint>,

    /// Token A vault for the pool
    #[account(
        init,
        payer = payer,
        seeds = [seeds::POOL_VAULT_SEED, pool.key().as_ref(), token_mint_a.key().as_ref()],
        bump,
        token::mint = token_mint_a,
        token::authority = pool,
        token::token_program = token_program,
    )]
    pub token_vault_a: InterfaceAccount<'info, TokenAccount>,

    /// Token B vault for the pool
    #[account(
        init,
        payer = payer,
        seeds = [seeds::POOL_VAULT_SEED, pool.key().as_ref(), token_mint_b.key().as_ref()],
        bump,
        token::mint = token_mint_b,
        token::authority = pool,
        token::token_program = token_program,
    )]
    pub token_vault_b: InterfaceAccount<'info, TokenAccount>,

    /// The payer for account creation
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Token program
    pub token_program: Interface<'info, TokenInterface>,

    /// System program
    pub system_program: Program<'info, System>,
}

/// Initialize pool handler
pub fn handler(
    ctx: Context<InitializePool>,
    initial_sqrt_price_x64: u128,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let fee_tier = &ctx.accounts.fee_tier;

    // Validate token ordering
    require!(
        ctx.accounts.token_mint_a.key() < ctx.accounts.token_mint_b.key(),
        SuniswapError::InvalidTokenOrder
    );

    // Validate sqrt price
    require!(
        initial_sqrt_price_x64 >= crate::constants::MIN_SQRT_PRICE_X64,
        SuniswapError::SqrtPriceBelowMinimum
    );
    require!(
        initial_sqrt_price_x64 <= crate::constants::MAX_SQRT_PRICE_X64,
        SuniswapError::SqrtPriceAboveMaximum
    );

    // Calculate initial tick from sqrt price
    let initial_tick = get_tick_at_sqrt_price(initial_sqrt_price_x64)?;

    // Initialize pool state using zero-copy
    let mut pool = ctx.accounts.pool.load_init()?;
    pool.config = config.key().to_bytes();
    pool.token_mint_a = ctx.accounts.token_mint_a.key().to_bytes();
    pool.token_mint_b = ctx.accounts.token_mint_b.key().to_bytes();
    pool.token_vault_a = ctx.accounts.token_vault_a.key().to_bytes();
    pool.token_vault_b = ctx.accounts.token_vault_b.key().to_bytes();
    pool.fee_tier = fee_tier.key().to_bytes();
    pool.sqrt_price_x64 = initial_sqrt_price_x64;
    pool.tick_current = initial_tick;
    pool.tick_spacing = fee_tier.tick_spacing;
    pool.liquidity = 0;
    pool.fee_growth_global_a_x128 = 0;
    pool.fee_growth_global_b_x128 = 0;
    pool.protocol_fees_a = 0;
    pool.protocol_fees_b = 0;
    pool.protocol_fee_rate = config.default_protocol_fee_rate;
    pool.is_paused = 0; // false
    pool.bump = ctx.bumps.pool;

    // Initialize hooks as disabled
    pool.hook_program = [0u8; 32];
    pool.hook_flags = 0;

    // Initialize oracle as disabled
    pool.oracle = [0u8; 32];
    pool.observation_index = 0;
    pool.observation_cardinality = 0;
    pool.observation_cardinality_next = 0;

    msg!("Pool initialized");
    msg!("Token A: {}", ctx.accounts.token_mint_a.key());
    msg!("Token B: {}", ctx.accounts.token_mint_b.key());
    msg!("Fee rate: {}", fee_tier.fee_rate);
    msg!("Initial sqrt price: {}", initial_sqrt_price_x64);
    msg!("Initial tick: {}", initial_tick);

    Ok(())
}
