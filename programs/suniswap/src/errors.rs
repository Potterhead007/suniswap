use anchor_lang::prelude::*;

/// SuniSwap Error Codes
/// Following security best practices: specific errors for each failure mode
#[error_code]
pub enum SuniswapError {
    // ═══════════════════════════════════════════════════════════════════════
    // MATH ERRORS (6000-6099)
    // ═══════════════════════════════════════════════════════════════════════

    /// Arithmetic overflow in checked operation
    #[msg("Math overflow")]
    MathOverflow, // 6000

    /// Arithmetic underflow in checked operation
    #[msg("Math underflow")]
    MathUnderflow, // 6001

    /// Division by zero attempted
    #[msg("Division by zero")]
    DivisionByZero, // 6002

    /// Result doesn't fit in expected type
    #[msg("Cast overflow")]
    CastOverflow, // 6003

    /// Square root calculation failed
    #[msg("Sqrt calculation error")]
    SqrtError, // 6004

    /// Multiplication overflow in Q64.64 math
    #[msg("Multiplication overflow in fixed-point math")]
    MulDivOverflow, // 6005

    // ═══════════════════════════════════════════════════════════════════════
    // TICK ERRORS (6100-6149)
    // ═══════════════════════════════════════════════════════════════════════

    /// Tick is below minimum allowed
    #[msg("Tick below minimum")]
    TickBelowMinimum, // 6006

    /// Tick is above maximum allowed
    #[msg("Tick above maximum")]
    TickAboveMaximum, // 6007

    /// Tick is not aligned to tick spacing
    #[msg("Tick not aligned to spacing")]
    TickNotAligned, // 6008

    /// Lower tick must be less than upper tick
    #[msg("Lower tick must be less than upper tick")]
    InvalidTickRange, // 6009

    /// Tick array not found for the given tick
    #[msg("Tick array not found")]
    TickArrayNotFound, // 6010

    /// Tick array start index invalid
    #[msg("Invalid tick array start index")]
    InvalidTickArrayStartIndex, // 6011

    // ═══════════════════════════════════════════════════════════════════════
    // PRICE/LIQUIDITY ERRORS (6150-6199)
    // ═══════════════════════════════════════════════════════════════════════

    /// Sqrt price is below minimum
    #[msg("Sqrt price below minimum")]
    SqrtPriceBelowMinimum, // 6012

    /// Sqrt price is above maximum
    #[msg("Sqrt price above maximum")]
    SqrtPriceAboveMaximum, // 6013

    /// Insufficient liquidity for swap
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity, // 6014

    /// Liquidity amount is zero
    #[msg("Zero liquidity")]
    ZeroLiquidity, // 6015

    /// Liquidity net overflow
    #[msg("Liquidity net overflow")]
    LiquidityNetOverflow, // 6016

    // ═══════════════════════════════════════════════════════════════════════
    // SWAP ERRORS (6200-6249)
    // ═══════════════════════════════════════════════════════════════════════

    /// Swap amount is zero
    #[msg("Zero swap amount")]
    ZeroSwapAmount, // 6017

    /// Slippage tolerance exceeded
    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded, // 6018

    /// Price limit reached
    #[msg("Price limit reached")]
    PriceLimitReached, // 6019

    /// Invalid sqrt price limit direction
    #[msg("Invalid sqrt price limit")]
    InvalidSqrtPriceLimit, // 6020

    /// Swap output would be zero
    #[msg("Zero output amount")]
    ZeroOutputAmount, // 6021

    // ═══════════════════════════════════════════════════════════════════════
    // POSITION ERRORS (6250-6299)
    // ═══════════════════════════════════════════════════════════════════════

    /// Position not found
    #[msg("Position not found")]
    PositionNotFound, // 6022

    /// Position already exists
    #[msg("Position already exists")]
    PositionAlreadyExists, // 6023

    /// Position has no liquidity to remove
    #[msg("Position empty")]
    PositionEmpty, // 6024

    /// Not the position owner
    #[msg("Not position owner")]
    NotPositionOwner, // 6025

    /// Position has uncollected fees
    #[msg("Uncollected fees remain")]
    UncollectedFeesRemain, // 6026

    // ═══════════════════════════════════════════════════════════════════════
    // POOL ERRORS (6300-6349)
    // ═══════════════════════════════════════════════════════════════════════

    /// Pool already initialized
    #[msg("Pool already initialized")]
    PoolAlreadyInitialized, // 6027

    /// Pool not initialized
    #[msg("Pool not initialized")]
    PoolNotInitialized, // 6028

    /// Invalid token order (token_a must be < token_b)
    #[msg("Invalid token order")]
    InvalidTokenOrder, // 6029

    /// Pool is paused
    #[msg("Pool is paused")]
    PoolPaused, // 6030

    /// Token mint mismatch
    #[msg("Token mint mismatch")]
    TokenMintMismatch, // 6031

    // ═══════════════════════════════════════════════════════════════════════
    // FEE ERRORS (6350-6399)
    // ═══════════════════════════════════════════════════════════════════════

    /// Fee rate exceeds maximum
    #[msg("Fee rate too high")]
    FeeRateTooHigh, // 6032

    /// Invalid fee tier
    #[msg("Invalid fee tier")]
    InvalidFeeTier, // 6033

    /// Protocol fee exceeds maximum
    #[msg("Protocol fee too high")]
    ProtocolFeeTooHigh, // 6034

    // ═══════════════════════════════════════════════════════════════════════
    // HOOK ERRORS (6400-6449)
    // ═══════════════════════════════════════════════════════════════════════

    /// Hook program returned error
    #[msg("Hook execution failed")]
    HookExecutionFailed, // 6035

    /// Invalid hook configuration
    #[msg("Invalid hook config")]
    InvalidHookConfig, // 6036

    /// Hook not authorized
    #[msg("Hook not authorized")]
    HookNotAuthorized, // 6037

    /// Hook address validation failed
    #[msg("Invalid hook address")]
    InvalidHookAddress, // 6038

    // ═══════════════════════════════════════════════════════════════════════
    // ACCESS CONTROL ERRORS (6450-6499)
    // ═══════════════════════════════════════════════════════════════════════

    /// Not the fee authority
    #[msg("Not fee authority")]
    NotFeeAuthority, // 6039

    /// Not the protocol authority
    #[msg("Not protocol authority")]
    NotProtocolAuthority, // 6040

    /// Not the pool authority
    #[msg("Not pool authority")]
    NotPoolAuthority, // 6041

    /// Unauthorized action
    #[msg("Unauthorized")]
    Unauthorized, // 6042

    // ═══════════════════════════════════════════════════════════════════════
    // ORACLE ERRORS (6500-6549)
    // ═══════════════════════════════════════════════════════════════════════

    /// Oracle not initialized
    #[msg("Oracle not initialized")]
    OracleNotInitialized, // 6043

    /// Oracle observation too old
    #[msg("Oracle observation stale")]
    OracleObservationStale, // 6044

    /// Oracle cardinality exceeded
    #[msg("Oracle cardinality exceeded")]
    OracleCardinalityExceeded, // 6045

    // ═══════════════════════════════════════════════════════════════════════
    // GENERAL ERRORS (6550-6599)
    // ═══════════════════════════════════════════════════════════════════════

    /// Account already initialized
    #[msg("Account already initialized")]
    AccountAlreadyInitialized, // 6046

    /// Invalid account data
    #[msg("Invalid account data")]
    InvalidAccountData, // 6047

    /// Account not rent exempt
    #[msg("Account not rent exempt")]
    NotRentExempt, // 6048

    /// Invalid program id
    #[msg("Invalid program id")]
    InvalidProgramId, // 6049

    /// Invalid bump seed
    #[msg("Invalid bump")]
    InvalidBump, // 6050

    // ═══════════════════════════════════════════════════════════════════════
    // ADDITIONAL ERRORS (6600+)
    // ═══════════════════════════════════════════════════════════════════════

    /// Invalid tick array start index
    #[msg("Invalid tick array start")]
    InvalidTickArrayStart, // 6051

    /// Invalid lower tick
    #[msg("Invalid lower tick")]
    InvalidTickLower, // 6052

    /// Invalid upper tick
    #[msg("Invalid upper tick")]
    InvalidTickUpper, // 6053

    /// Invalid position
    #[msg("Invalid position")]
    InvalidPosition, // 6054

    /// Invalid position owner
    #[msg("Invalid position owner")]
    InvalidPositionOwner, // 6055

    /// Invalid tick array
    #[msg("Invalid tick array")]
    InvalidTickArray, // 6056

    /// Invalid token mint
    #[msg("Invalid token mint")]
    InvalidTokenMint, // 6057

    /// Invalid vault
    #[msg("Invalid vault")]
    InvalidVault, // 6058

    /// Amount A exceeds maximum
    #[msg("Amount A exceeds maximum")]
    AmountAExceedsMax, // 6059

    /// Amount B exceeds maximum
    #[msg("Amount B exceeds maximum")]
    AmountBExceedsMax, // 6060

    /// Amount A below minimum
    #[msg("Amount A below minimum")]
    AmountABelowMin, // 6061

    /// Amount B below minimum
    #[msg("Amount B below minimum")]
    AmountBBelowMin, // 6062

    /// Liquidity overflow
    #[msg("Liquidity overflow")]
    LiquidityOverflow, // 6063

    /// Position has liquidity
    #[msg("Position has liquidity")]
    PositionHasLiquidity, // 6064

    /// Position has owed tokens
    #[msg("Position has owed tokens")]
    PositionHasOwedTokens, // 6065

    /// Invalid config
    #[msg("Invalid config")]
    InvalidConfig, // 6066

    /// Invalid fee authority
    #[msg("Invalid fee authority")]
    InvalidFeeAuthority, // 6067

    /// Invalid price limit
    #[msg("Invalid price limit")]
    InvalidPriceLimit, // 6068

    /// Output below minimum
    #[msg("Output below minimum")]
    OutputBelowMinimum, // 6069

    /// Input exceeds maximum
    #[msg("Input exceeds maximum")]
    InputExceedsMaximum, // 6070
}
