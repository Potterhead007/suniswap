use anchor_lang::prelude::*;
use crate::state::{Pool, Position};
use crate::errors::SuniswapError;

/// Close an empty position and reclaim rent
/// Note: For zero-copy accounts, we need to handle closing differently
#[derive(Accounts)]
pub struct ClosePosition<'info> {
    /// The pool (zero-copy, read-only for validation)
    pub pool: AccountLoader<'info, Pool>,

    /// The position to close (zero-copy)
    /// We validate constraints in the handler since we can't use constraints with AccountLoader fields
    #[account(mut)]
    pub position: AccountLoader<'info, Position>,

    /// Position owner
    pub owner: Signer<'info>,

    /// Account to receive rent lamports
    /// CHECK: Any account can receive the rent
    #[account(mut)]
    pub receiver: UncheckedAccount<'info>,
}

/// Close position handler
pub fn handler(ctx: Context<ClosePosition>) -> Result<()> {
    let pool_key = ctx.accounts.pool.key();

    // Validate position
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
        position.liquidity == 0,
        SuniswapError::PositionHasLiquidity
    );
    require!(
        position.tokens_owed_a == 0,
        SuniswapError::PositionHasOwedTokens
    );
    require!(
        position.tokens_owed_b == 0,
        SuniswapError::PositionHasOwedTokens
    );
    drop(position);

    // Close the account and transfer rent to receiver
    let position_account_info = ctx.accounts.position.to_account_info();
    let receiver_account_info = ctx.accounts.receiver.to_account_info();

    // Transfer lamports
    let dest_starting_lamports = receiver_account_info.lamports();
    **receiver_account_info.lamports.borrow_mut() = dest_starting_lamports
        .checked_add(position_account_info.lamports())
        .unwrap();
    **position_account_info.lamports.borrow_mut() = 0;

    // Zero out the data
    position_account_info.assign(&anchor_lang::solana_program::system_program::ID);
    position_account_info.resize(0)?;

    msg!("Position closed");
    msg!("Pool: {}", pool_key);
    msg!("Position owner: {}", ctx.accounts.owner.key());
    msg!("Rent returned to: {}", ctx.accounts.receiver.key());

    Ok(())
}
