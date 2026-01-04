//! Full precision math operations
//!
//! Implements 256-bit and 512-bit math operations required for
//! precise liquidity and fee calculations.

use crate::errors::SuniswapError;
use anchor_lang::prelude::*;

/// Q64 constant (2^64)
pub const Q64: u128 = 1u128 << 64;

/// Q128 constant - we compute this differently to avoid overflow
/// 2^128 = 340282366920938463463374607431768211456
pub const Q128: u128 = u128::MAX / 2 + 1;

/// Multiply two u128 numbers and divide by a third, with full precision
/// Handles cases where intermediate value would overflow u128
///
/// # Formula
/// result = (a * b) / denominator
///
/// # Arguments
/// * `a` - First multiplicand
/// * `b` - Second multiplicand
/// * `denominator` - Divisor
///
/// # Returns
/// * Result of (a * b) / denominator with proper rounding down
pub fn mul_div(a: u128, b: u128, denominator: u128) -> Result<u128> {
    if denominator == 0 {
        return Err(SuniswapError::DivisionByZero.into());
    }

    // Split into high and low 64-bit parts
    let a_hi = a >> 64;
    let a_lo = a & ((1u128 << 64) - 1);
    let b_hi = b >> 64;
    let b_lo = b & ((1u128 << 64) - 1);

    // Compute partial products
    let p0 = a_lo * b_lo;
    let p1 = a_lo * b_hi;
    let p2 = a_hi * b_lo;
    let p3 = a_hi * b_hi;

    // Sum the partial products
    let carry = (((p0 >> 64) + (p1 & ((1u128 << 64) - 1)) + (p2 & ((1u128 << 64) - 1))) >> 64) as u128;
    let mid = ((p0 >> 64) + p1 + p2) & ((1u128 << 64) - 1);

    let result_lo = (p0 & ((1u128 << 64) - 1)) | (mid << 64);
    let result_hi = p3 + (p1 >> 64) + (p2 >> 64) + carry;

    // If result_hi is 0, we can do simple division
    if result_hi == 0 {
        return result_lo.checked_div(denominator)
            .ok_or(SuniswapError::DivisionByZero.into());
    }

    // Full 256-bit division
    // This is a simplified version - for production, use a proper bigint library
    if result_hi >= denominator {
        return Err(SuniswapError::MulDivOverflow.into());
    }

    // Newton-Raphson division approximation for 256/128
    let mut quotient = div_256_by_128(result_hi, result_lo, denominator)?;

    // Verify and adjust
    let product = mul_128(quotient, denominator)?;
    if product.0 > result_hi || (product.0 == result_hi && product.1 > result_lo) {
        quotient = quotient.saturating_sub(1);
    }

    Ok(quotient)
}

/// Multiply two u128 numbers and divide by a third, rounding up
pub fn mul_div_round_up(a: u128, b: u128, denominator: u128) -> Result<u128> {
    let result = mul_div(a, b, denominator)?;

    // Check if there's a remainder by verifying (a * b) mod denominator != 0
    // We do this by checking if result * denominator < a * b
    let check = mul_128(result, denominator)?;
    let original = mul_128(a, b)?;

    if check.0 < original.0 || (check.0 == original.0 && check.1 < original.1) {
        result.checked_add(1)
            .ok_or(SuniswapError::MathOverflow.into())
    } else {
        Ok(result)
    }
}

/// Multiply two u128 values, returning a (high, low) u128 pair
fn mul_128(a: u128, b: u128) -> Result<(u128, u128)> {
    let a_hi = a >> 64;
    let a_lo = a & ((1u128 << 64) - 1);
    let b_hi = b >> 64;
    let b_lo = b & ((1u128 << 64) - 1);

    let p0 = a_lo * b_lo;
    let p1 = a_lo * b_hi;
    let p2 = a_hi * b_lo;
    let p3 = a_hi * b_hi;

    let mid = (p0 >> 64) + (p1 & ((1u128 << 64) - 1)) + (p2 & ((1u128 << 64) - 1));

    let lo = (p0 & ((1u128 << 64) - 1)) | ((mid & ((1u128 << 64) - 1)) << 64);
    let hi = p3 + (p1 >> 64) + (p2 >> 64) + (mid >> 64);

    Ok((hi, lo))
}

/// Divide a 256-bit number (hi, lo) by a 128-bit denominator
fn div_256_by_128(hi: u128, lo: u128, denominator: u128) -> Result<u128> {
    if hi >= denominator {
        return Err(SuniswapError::MulDivOverflow.into());
    }

    // Use long division algorithm
    let mut remainder = hi;
    let mut quotient = 0u128;

    for i in (0..128).rev() {
        remainder = (remainder << 1) | ((lo >> i) & 1);
        if remainder >= denominator {
            remainder -= denominator;
            quotient |= 1u128 << i;
        }
    }

    Ok(quotient)
}

/// Calculate (a * b) >> shift with full precision
pub fn mul_shr(a: u128, b: u128, shift: u8) -> Result<u128> {
    if shift == 0 {
        return a.checked_mul(b).ok_or(SuniswapError::MathOverflow.into());
    }

    let (hi, lo) = mul_128(a, b)?;

    if shift >= 128 {
        // shift is u8, so max is 255. Shift >= 128 means we take from hi
        // For shifts > 128, we'd be shifting hi further right
        let remaining_shift = shift - 128;
        if remaining_shift >= 128 {
            return Ok(0);
        }
        Ok(hi >> remaining_shift)
    } else {
        if hi >> shift > 0 {
            return Err(SuniswapError::MathOverflow.into());
        }
        Ok((hi << (128 - shift)) | (lo >> shift))
    }
}

/// Calculate (a << shift) / b with full precision
pub fn shl_div(a: u128, shift: u8, b: u128) -> Result<u128> {
    if b == 0 {
        return Err(SuniswapError::DivisionByZero.into());
    }

    if shift >= 128 {
        // Result would overflow
        return Err(SuniswapError::MathOverflow.into());
    }

    let shifted = (a as u128) << shift;
    shifted.checked_div(b).ok_or(SuniswapError::DivisionByZero.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mul_div_simple() {
        // 10 * 20 / 5 = 40
        assert_eq!(mul_div(10, 20, 5).unwrap(), 40);
    }

    #[test]
    fn test_mul_div_large() {
        // Test with larger numbers
        let a = 1_000_000_000_000u128;
        let b = 2_000_000_000_000u128;
        let d = 1_000_000u128;
        assert_eq!(mul_div(a, b, d).unwrap(), 2_000_000_000_000_000_000u128);
    }

    #[test]
    fn test_mul_div_zero_denominator() {
        assert!(mul_div(10, 20, 0).is_err());
    }
}
