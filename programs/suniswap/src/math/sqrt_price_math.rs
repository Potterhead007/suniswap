//! Sqrt Price Math
//!
//! Functions for computing the next sqrt price given token deltas.

use crate::errors::SuniswapError;
use crate::math::full_math::{mul_div, mul_div_round_up, Q64};
use anchor_lang::prelude::*;

/// Get the next sqrt price after swapping a specified amount of token A
/// When swapping A for B (selling A):
///   new_sqrt_price = L * sqrt_price / (L + amount * sqrt_price)
///
/// When swapping B for A (buying A):
///   new_sqrt_price = L * sqrt_price / (L - amount * sqrt_price)
pub fn get_next_sqrt_price_from_amount_a_rounding_up(
    sqrt_price_x64: u128,
    liquidity: u128,
    amount: u64,
    add: bool,
) -> Result<u128> {
    if amount == 0 {
        return Ok(sqrt_price_x64);
    }

    // C-04 FIX: Use checked_shl to prevent overflow when liquidity > 2^64
    let numerator = liquidity
        .checked_shl(64)
        .ok_or(SuniswapError::MathOverflow)?;
    let product = (amount as u128)
        .checked_mul(sqrt_price_x64)
        .ok_or(SuniswapError::MathOverflow)?;

    if add {
        // Selling token A (price goes down)
        let denominator = numerator
            .checked_add(product)
            .ok_or(SuniswapError::MathOverflow)?;

        mul_div_round_up(numerator, sqrt_price_x64, denominator)
    } else {
        // Buying token A (price goes up)
        if product >= numerator {
            return Err(SuniswapError::InsufficientLiquidity.into());
        }
        let denominator = numerator - product;
        mul_div_round_up(numerator, sqrt_price_x64, denominator)
    }
}

/// Get the next sqrt price after swapping a specified amount of token B
/// When swapping B for A (selling B):
///   new_sqrt_price = sqrt_price + amount / L
///
/// When swapping A for B (buying B):
///   new_sqrt_price = sqrt_price - amount / L
pub fn get_next_sqrt_price_from_amount_b_rounding_down(
    sqrt_price_x64: u128,
    liquidity: u128,
    amount: u64,
    add: bool,
) -> Result<u128> {
    if amount == 0 {
        return Ok(sqrt_price_x64);
    }

    // quotient = amount * 2^64 / liquidity
    let quotient = mul_div(amount as u128, Q64, liquidity)?;

    if add {
        // Selling token B (price goes up)
        sqrt_price_x64.checked_add(quotient)
            .ok_or(SuniswapError::SqrtPriceAboveMaximum.into())
    } else {
        // Buying token B (price goes down)
        if quotient > sqrt_price_x64 {
            return Err(SuniswapError::SqrtPriceBelowMinimum.into());
        }
        Ok(sqrt_price_x64 - quotient)
    }
}

/// Get the next sqrt price from input amount
/// Determines direction and calls appropriate function
pub fn get_next_sqrt_price_from_input(
    sqrt_price_x64: u128,
    liquidity: u128,
    amount_in: u64,
    zero_for_one: bool,
) -> Result<u128> {
    if zero_for_one {
        // Swapping token A for token B
        // Adding token A, sqrt price decreases
        get_next_sqrt_price_from_amount_a_rounding_up(sqrt_price_x64, liquidity, amount_in, true)
    } else {
        // Swapping token B for token A
        // Adding token B, sqrt price increases
        get_next_sqrt_price_from_amount_b_rounding_down(sqrt_price_x64, liquidity, amount_in, true)
    }
}

/// Get the next sqrt price from output amount
pub fn get_next_sqrt_price_from_output(
    sqrt_price_x64: u128,
    liquidity: u128,
    amount_out: u64,
    zero_for_one: bool,
) -> Result<u128> {
    if zero_for_one {
        // Swapping token A for token B
        // Removing token B, sqrt price decreases
        get_next_sqrt_price_from_amount_b_rounding_down(sqrt_price_x64, liquidity, amount_out, false)
    } else {
        // Swapping token B for token A
        // Removing token A, sqrt price increases
        get_next_sqrt_price_from_amount_a_rounding_up(sqrt_price_x64, liquidity, amount_out, false)
    }
}

/// Get the amount of token A received/required for a price move
/// amount_a = liquidity * (sqrt_price_b - sqrt_price_a) / (sqrt_price_a * sqrt_price_b)
pub fn get_amount_a_delta_signed(
    sqrt_price_a_x64: u128,
    sqrt_price_b_x64: u128,
    liquidity: i128,
) -> Result<i64> {
    // C-03 FIX: Use safe conversions to prevent overflow
    let amount_u64 = if liquidity < 0 {
        // Removing liquidity - round down
        crate::math::liquidity_math::get_amount_a_delta(
            sqrt_price_a_x64,
            sqrt_price_b_x64,
            (-liquidity) as u128,
            false,
        )?
    } else {
        // Adding liquidity - round up
        crate::math::liquidity_math::get_amount_a_delta(
            sqrt_price_a_x64,
            sqrt_price_b_x64,
            liquidity as u128,
            true,
        )?
    };

    // Safe conversion from u64 to i64
    let amount = i64::try_from(amount_u64)
        .map_err(|_| SuniswapError::CastOverflow)?;

    if liquidity < 0 {
        Ok(amount.checked_neg().ok_or(SuniswapError::MathOverflow)?)
    } else {
        Ok(amount)
    }
}

/// Get the amount of token B received/required for a price move
/// amount_b = liquidity * (sqrt_price_b - sqrt_price_a)
pub fn get_amount_b_delta_signed(
    sqrt_price_a_x64: u128,
    sqrt_price_b_x64: u128,
    liquidity: i128,
) -> Result<i64> {
    // C-03 FIX: Use safe conversions to prevent overflow
    let amount_u64 = if liquidity < 0 {
        // Removing liquidity - round down
        crate::math::liquidity_math::get_amount_b_delta(
            sqrt_price_a_x64,
            sqrt_price_b_x64,
            (-liquidity) as u128,
            false,
        )?
    } else {
        // Adding liquidity - round up
        crate::math::liquidity_math::get_amount_b_delta(
            sqrt_price_a_x64,
            sqrt_price_b_x64,
            liquidity as u128,
            true,
        )?
    };

    // Safe conversion from u64 to i64
    let amount = i64::try_from(amount_u64)
        .map_err(|_| SuniswapError::CastOverflow)?;

    if liquidity < 0 {
        Ok(amount.checked_neg().ok_or(SuniswapError::MathOverflow)?)
    } else {
        Ok(amount)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_next_sqrt_price_zero_amount() {
        let sqrt_price = 1u128 << 64;
        let liquidity = 1000000u128;

        assert_eq!(
            get_next_sqrt_price_from_amount_a_rounding_up(sqrt_price, liquidity, 0, true).unwrap(),
            sqrt_price
        );
    }
}
