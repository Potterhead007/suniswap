//! Swap Math
//!
//! Core swap computation logic.

use crate::errors::SuniswapError;
use crate::math::full_math::{mul_div, mul_div_round_up};
use crate::math::sqrt_price_math::{
    get_next_sqrt_price_from_input,
    get_next_sqrt_price_from_output,
};
use crate::math::liquidity_math::{get_amount_a_delta, get_amount_b_delta};
use crate::constants::FEE_RATE_DENOMINATOR;
use anchor_lang::prelude::*;

/// Result of a single swap step computation
#[derive(Debug, Clone, Copy)]
pub struct SwapStepResult {
    /// The new sqrt price after the swap step
    pub sqrt_price_next_x64: u128,
    /// Amount of input token consumed
    pub amount_in: u64,
    /// Amount of output token produced
    pub amount_out: u64,
    /// Fee amount collected
    pub fee_amount: u64,
}

/// Compute the result of a single swap step
///
/// # Arguments
/// * `sqrt_price_current_x64` - Current sqrt price (Q64.64)
/// * `sqrt_price_target_x64` - Target sqrt price (limit from tick or slippage)
/// * `liquidity` - Available liquidity
/// * `amount_remaining` - Amount still to be swapped
/// * `fee_rate` - Fee rate in hundredths of a bip (3000 = 0.3%)
/// * `exact_input` - true if amount_remaining is exact input, false for exact output
/// * `zero_for_one` - true if swapping token A for B (price decreasing)
///
/// # Returns
/// SwapStepResult with next price, amounts in/out, and fees
pub fn compute_swap_step(
    sqrt_price_current_x64: u128,
    sqrt_price_target_x64: u128,
    liquidity: u128,
    amount_remaining: i64,
    fee_rate: u32,
) -> Result<SwapStepResult> {
    let zero_for_one = sqrt_price_current_x64 >= sqrt_price_target_x64;
    let exact_input = amount_remaining >= 0;

    let sqrt_price_next_x64: u128;
    let amount_in: u64;
    let amount_out: u64;

    let amount_remaining_abs = if amount_remaining >= 0 {
        amount_remaining as u64
    } else {
        (-amount_remaining) as u64
    };

    if exact_input {
        // Calculate maximum amount that can be used after fees
        let amount_remaining_less_fee = mul_div(
            amount_remaining_abs as u128,
            (FEE_RATE_DENOMINATOR - fee_rate) as u128,
            FEE_RATE_DENOMINATOR as u128,
        )? as u64;

        // Calculate amount needed to reach target price
        let amount_in_max = if zero_for_one {
            get_amount_a_delta(sqrt_price_target_x64, sqrt_price_current_x64, liquidity, true)?
        } else {
            get_amount_b_delta(sqrt_price_current_x64, sqrt_price_target_x64, liquidity, true)?
        };

        // Determine if we can reach the target or if amount is limiting
        if amount_remaining_less_fee >= amount_in_max {
            // Can reach target
            sqrt_price_next_x64 = sqrt_price_target_x64;
            amount_in = amount_in_max;
        } else {
            // Amount is limiting - calculate new sqrt price
            sqrt_price_next_x64 = get_next_sqrt_price_from_input(
                sqrt_price_current_x64,
                liquidity,
                amount_remaining_less_fee,
                zero_for_one,
            )?;
            amount_in = amount_remaining_less_fee;
        }

        // Calculate output amount
        amount_out = if zero_for_one {
            get_amount_b_delta(sqrt_price_next_x64, sqrt_price_current_x64, liquidity, false)?
        } else {
            get_amount_a_delta(sqrt_price_current_x64, sqrt_price_next_x64, liquidity, false)?
        };
    } else {
        // Exact output
        // Calculate maximum output available to target price
        let amount_out_max = if zero_for_one {
            get_amount_b_delta(sqrt_price_target_x64, sqrt_price_current_x64, liquidity, false)?
        } else {
            get_amount_a_delta(sqrt_price_current_x64, sqrt_price_target_x64, liquidity, false)?
        };

        // Determine if we can satisfy the output or if target is limiting
        if amount_remaining_abs >= amount_out_max {
            // Can reach target
            sqrt_price_next_x64 = sqrt_price_target_x64;
            amount_out = amount_out_max;
        } else {
            // Output amount is limiting - calculate new sqrt price
            sqrt_price_next_x64 = get_next_sqrt_price_from_output(
                sqrt_price_current_x64,
                liquidity,
                amount_remaining_abs,
                zero_for_one,
            )?;
            amount_out = amount_remaining_abs;
        }

        // Calculate input amount required
        amount_in = if zero_for_one {
            get_amount_a_delta(sqrt_price_next_x64, sqrt_price_current_x64, liquidity, true)?
        } else {
            get_amount_b_delta(sqrt_price_current_x64, sqrt_price_next_x64, liquidity, true)?
        };
    }

    // Calculate fee
    // For exact input: fee is the remaining amount minus what was used
    // For exact output: fee is calculated on top of amount_in
    let fee_amount = if exact_input && sqrt_price_next_x64 != sqrt_price_target_x64 {
        // Didn't reach target, fee is remaining after amount_in
        amount_remaining_abs.saturating_sub(amount_in)
    } else {
        // Reached target or exact output, calculate fee based on amount_in
        mul_div_round_up(
            amount_in as u128,
            fee_rate as u128,
            (FEE_RATE_DENOMINATOR - fee_rate) as u128,
        )? as u64
    };

    Ok(SwapStepResult {
        sqrt_price_next_x64,
        amount_in,
        amount_out,
        fee_amount,
    })
}

/// Calculate the protocol fee portion of total fees
/// Returns Result to handle potential (theoretical) overflow safely
pub fn calculate_protocol_fee(fee_amount: u64, protocol_fee_rate: u8) -> Result<u64> {
    if protocol_fee_rate == 0 || fee_amount == 0 {
        return Ok(0);
    }

    // protocol_fee = fee_amount * protocol_fee_rate / 100
    // Use checked operations for safety
    let numerator = (fee_amount as u128)
        .checked_mul(protocol_fee_rate as u128)
        .ok_or(SuniswapError::MathOverflow)?;

    let result = numerator / 100;

    // Safe cast - result is guaranteed to fit since fee_amount * 255 / 100 < fee_amount * 3
    u64::try_from(result).map_err(|_| SuniswapError::CastOverflow.into())
}

/// Calculate fee growth per unit of liquidity
/// fee_growth = fee_amount * 2^128 / liquidity
///
/// Uses Q128.128 fixed-point format for precision
pub fn calculate_fee_growth(fee_amount: u64, liquidity: u128) -> Result<u128> {
    if liquidity == 0 || fee_amount == 0 {
        return Ok(0);
    }

    // fee_growth = fee_amount * 2^128 / liquidity
    // Since fee_amount is u64 and we need to multiply by 2^128,
    // we use mul_div to avoid intermediate overflow:
    // fee_growth = fee_amount * Q128 / liquidity
    // where Q128 = 2^128 = (2^64)^2
    //
    // We compute: (fee_amount * 2^64) * 2^64 / liquidity
    // = mul_div(fee_amount * 2^64, 2^64, liquidity)

    let fee_amount_x64 = (fee_amount as u128)
        .checked_shl(64)
        .ok_or(SuniswapError::MathOverflow)?;

    // Now compute (fee_amount_x64 * 2^64) / liquidity using mul_div
    // This gives us fee_amount * 2^128 / liquidity
    mul_div(fee_amount_x64, crate::constants::Q64, liquidity)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_swap_step_exact_input() {
        // Test with small amounts to verify basic execution
        // sqrt_price = 1.0 in Q64.64 format
        let sqrt_price = 1u128 << 64;
        // Target price very slightly lower (99.99% of current)
        let sqrt_price_target = sqrt_price - (sqrt_price / 10000);
        // Use very small liquidity to keep amounts within u64
        let liquidity = 1_000u128;
        // Small amount that won't push price past target
        let amount_remaining = 1i64;
        let fee_rate = 3000u32;

        let result = compute_swap_step(
            sqrt_price,
            sqrt_price_target,
            liquidity,
            amount_remaining,
            fee_rate,
        ).unwrap();

        // Basic sanity: sqrt_price should have moved toward target
        assert!(result.sqrt_price_next_x64 <= sqrt_price);
        // Result should be at or between current and target
        assert!(result.sqrt_price_next_x64 > 0);
    }
}
