//! Liquidity Math
//!
//! Functions for computing liquidity deltas and token amounts.

use crate::errors::SuniswapError;
use crate::math::full_math::{mul_div, mul_div_round_up, Q64};
use anchor_lang::prelude::*;

/// Add a signed liquidity delta to existing liquidity
/// Safely handles overflow/underflow
pub fn add_liquidity_delta(x: u128, y: i128) -> Result<u128> {
    if y < 0 {
        let abs_y = (-y) as u128;
        x.checked_sub(abs_y)
            .ok_or(SuniswapError::LiquidityNetOverflow.into())
    } else {
        x.checked_add(y as u128)
            .ok_or(SuniswapError::LiquidityNetOverflow.into())
    }
}

/// Calculate the amount of token A needed for a given liquidity amount
/// within a price range [sqrt_price_lower, sqrt_price_upper]
///
/// When price is above range: amount = 0 (position is 100% token B)
/// When price is below range: amount = liquidity * (1/sqrt_price_lower - 1/sqrt_price_upper)
/// When price is in range: amount = liquidity * (1/sqrt_price_current - 1/sqrt_price_upper)
///
/// amount_a = liquidity * (sqrt_price_b - sqrt_price_a) / (sqrt_price_a * sqrt_price_b)
pub fn get_amount_a_delta(
    sqrt_price_a_x64: u128,
    sqrt_price_b_x64: u128,
    liquidity: u128,
    round_up: bool,
) -> Result<u64> {
    // Ensure a < b
    let (sqrt_price_lower, sqrt_price_upper) = if sqrt_price_a_x64 < sqrt_price_b_x64 {
        (sqrt_price_a_x64, sqrt_price_b_x64)
    } else {
        (sqrt_price_b_x64, sqrt_price_a_x64)
    };

    // Formula: amount_a = L * Q64 * (sp_upper - sp_lower) / (sp_upper * sp_lower)
    //
    // Since sp_upper * sp_lower overflows u128 (~2^64 * 2^64 = 2^128), we split into two steps:
    // step1 = L * (sp_upper - sp_lower) / sp_upper
    // step2 = step1 * Q64 / sp_lower
    //
    // This gives: L * (sp_upper - sp_lower) * Q64 / (sp_upper * sp_lower)
    let diff = sqrt_price_upper - sqrt_price_lower;

    let intermediate = if round_up {
        mul_div_round_up(liquidity, diff, sqrt_price_upper)?
    } else {
        mul_div(liquidity, diff, sqrt_price_upper)?
    };

    let result = if round_up {
        mul_div_round_up(intermediate, Q64, sqrt_price_lower)?
    } else {
        mul_div(intermediate, Q64, sqrt_price_lower)?
    };

    if result > u64::MAX as u128 {
        return Err(SuniswapError::CastOverflow.into());
    }

    Ok(result as u64)
}

/// Calculate the amount of token B needed for a given liquidity amount
/// within a price range [sqrt_price_lower, sqrt_price_upper]
///
/// When price is below range: amount = 0 (position is 100% token A)
/// When price is above range: amount = liquidity * (sqrt_price_upper - sqrt_price_lower)
/// When price is in range: amount = liquidity * (sqrt_price_current - sqrt_price_lower)
///
/// amount_b = liquidity * (sqrt_price_b - sqrt_price_a)
pub fn get_amount_b_delta(
    sqrt_price_a_x64: u128,
    sqrt_price_b_x64: u128,
    liquidity: u128,
    round_up: bool,
) -> Result<u64> {
    // Ensure a < b
    let (sqrt_price_lower, sqrt_price_upper) = if sqrt_price_a_x64 < sqrt_price_b_x64 {
        (sqrt_price_a_x64, sqrt_price_b_x64)
    } else {
        (sqrt_price_b_x64, sqrt_price_a_x64)
    };

    let diff = sqrt_price_upper - sqrt_price_lower;

    let result = if round_up {
        mul_div_round_up(liquidity, diff, Q64)?
    } else {
        mul_div(liquidity, diff, Q64)?
    };

    if result > u64::MAX as u128 {
        return Err(SuniswapError::CastOverflow.into());
    }

    Ok(result as u64)
}

/// Calculate the liquidity amount for a given amount of token A
/// Inverse of get_amount_a_delta
pub fn get_liquidity_for_amount_a(
    sqrt_price_a_x64: u128,
    sqrt_price_b_x64: u128,
    amount_a: u64,
) -> Result<u128> {
    let (sqrt_price_lower, sqrt_price_upper) = if sqrt_price_a_x64 < sqrt_price_b_x64 {
        (sqrt_price_a_x64, sqrt_price_b_x64)
    } else {
        (sqrt_price_b_x64, sqrt_price_a_x64)
    };

    // Formula: L = amount_a * sp_upper * sp_lower / (Q64 * (sp_upper - sp_lower))
    //
    // Since sp_upper * sp_lower overflows u128, we split into two steps:
    // step1 = amount_a * sp_upper / (sp_upper - sp_lower)
    // step2 = step1 * sp_lower / Q64
    let diff = sqrt_price_upper - sqrt_price_lower;
    let intermediate = mul_div(amount_a as u128, sqrt_price_upper, diff)?;
    mul_div(intermediate, sqrt_price_lower, Q64)
}

/// Calculate the liquidity amount for a given amount of token B
/// Inverse of get_amount_b_delta
pub fn get_liquidity_for_amount_b(
    sqrt_price_a_x64: u128,
    sqrt_price_b_x64: u128,
    amount_b: u64,
) -> Result<u128> {
    let (sqrt_price_lower, sqrt_price_upper) = if sqrt_price_a_x64 < sqrt_price_b_x64 {
        (sqrt_price_a_x64, sqrt_price_b_x64)
    } else {
        (sqrt_price_b_x64, sqrt_price_a_x64)
    };

    mul_div(
        amount_b as u128,
        Q64,
        sqrt_price_upper - sqrt_price_lower,
    )
}

/// Calculate the maximum liquidity that can be added with the given amounts
/// for a position in the range [sqrt_price_lower, sqrt_price_upper]
/// at the current sqrt_price
pub fn get_liquidity_for_amounts(
    sqrt_price_current_x64: u128,
    sqrt_price_lower_x64: u128,
    sqrt_price_upper_x64: u128,
    amount_a: u64,
    amount_b: u64,
) -> Result<u128> {
    if sqrt_price_current_x64 <= sqrt_price_lower_x64 {
        // Current price is below range, only token A is needed
        get_liquidity_for_amount_a(sqrt_price_lower_x64, sqrt_price_upper_x64, amount_a)
    } else if sqrt_price_current_x64 < sqrt_price_upper_x64 {
        // Current price is in range, need both tokens
        let liquidity_a = get_liquidity_for_amount_a(
            sqrt_price_current_x64,
            sqrt_price_upper_x64,
            amount_a,
        )?;
        let liquidity_b = get_liquidity_for_amount_b(
            sqrt_price_lower_x64,
            sqrt_price_current_x64,
            amount_b,
        )?;
        // Return the minimum - determines how much can actually be deposited
        Ok(liquidity_a.min(liquidity_b))
    } else {
        // Current price is above range, only token B is needed
        get_liquidity_for_amount_b(sqrt_price_lower_x64, sqrt_price_upper_x64, amount_b)
    }
}

/// Calculate the token amounts for a given liquidity
/// at the current sqrt_price for a position in range [lower, upper]
pub fn get_amounts_for_liquidity(
    sqrt_price_current_x64: u128,
    sqrt_price_lower_x64: u128,
    sqrt_price_upper_x64: u128,
    liquidity: u128,
    round_up: bool,
) -> Result<(u64, u64)> {
    let amount_a = if sqrt_price_current_x64 <= sqrt_price_lower_x64 {
        // Below range: full amount of token A
        get_amount_a_delta(sqrt_price_lower_x64, sqrt_price_upper_x64, liquidity, round_up)?
    } else if sqrt_price_current_x64 < sqrt_price_upper_x64 {
        // In range: partial amount of token A
        get_amount_a_delta(sqrt_price_current_x64, sqrt_price_upper_x64, liquidity, round_up)?
    } else {
        // Above range: no token A
        0
    };

    let amount_b = if sqrt_price_current_x64 <= sqrt_price_lower_x64 {
        // Below range: no token B
        0
    } else if sqrt_price_current_x64 < sqrt_price_upper_x64 {
        // In range: partial amount of token B
        get_amount_b_delta(sqrt_price_lower_x64, sqrt_price_current_x64, liquidity, round_up)?
    } else {
        // Above range: full amount of token B
        get_amount_b_delta(sqrt_price_lower_x64, sqrt_price_upper_x64, liquidity, round_up)?
    };

    Ok((amount_a, amount_b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_liquidity_delta_positive() {
        assert_eq!(add_liquidity_delta(100, 50).unwrap(), 150);
    }

    #[test]
    fn test_add_liquidity_delta_negative() {
        assert_eq!(add_liquidity_delta(100, -50).unwrap(), 50);
    }

    #[test]
    fn test_add_liquidity_delta_underflow() {
        assert!(add_liquidity_delta(50, -100).is_err());
    }
}
