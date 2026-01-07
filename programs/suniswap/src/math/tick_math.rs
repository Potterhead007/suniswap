//! Tick Math
//!
//! Converts between tick indices and sqrt prices.
//! Based on Uniswap V3's TickMath library.
//!
//! tick = log_{1.0001}(price) = log(price) / log(1.0001)
//! sqrt_price = sqrt(1.0001^tick) = 1.0001^(tick/2)

use crate::constants::{MIN_TICK, MAX_TICK, MIN_SQRT_PRICE_X64, MAX_SQRT_PRICE_X64};
use crate::errors::SuniswapError;
use anchor_lang::prelude::*;

/// Compute 2^192 / divisor using the formula:
/// 2^192 / d = 2^64 * (2^128 / d)
///
/// Since 2^128 doesn't fit in u128, we compute:
/// 2^128 / d = ((2^64 * 2^64) / d)
///           = (2^64 / d) * 2^64 + ((2^64 % d) * 2^64) / d
///           ≈ 2^64 / d * 2^64  (when d > 2^64)
///
/// For better accuracy, we use:
/// 2^192 / d = (q * d + r) / d where q = initial estimate
///
/// Returns the result as u128 (which fits for our use case where divisor < 2^128)
fn div_2_192_by_u128(divisor: u128) -> u128 {
    if divisor == 0 {
        return u128::MAX;
    }

    // Check if divisor's high 64 bits are zero - result would overflow u128
    let d_hi = divisor >> 64;
    if d_hi == 0 {
        return u128::MAX;
    }

    // For divisor close to 2^128, the result is close to 2^64
    //
    // We use: 2^192 / d = 2^64 * (2^128 / d)
    //
    // Since divisor ≈ 2^128, we have 2^128 / divisor ≈ 1
    // More precisely: 2^128 / divisor = 1 + (2^128 - divisor) / divisor
    //               = 1 + (2^128 - divisor) / divisor
    //
    // But 2^128 doesn't fit in u128. However:
    // 2^128 = (u128::MAX + 1), so 2^128 - divisor = u128::MAX + 1 - divisor
    //
    // For divisor < 2^128, this is: (u128::MAX - divisor) + 1
    // = u128::MAX - divisor + 1 (but this could overflow if divisor is small)
    //
    // Better approach: compute 2^192 / divisor directly using 256/128 division

    // Algorithm: schoolbook division
    // N = 2^192, D = divisor
    // N = Q * D + R where Q is quotient and R is remainder
    //
    // We compute Q = floor(N / D) using the following:
    // Since N = 2^192 and D is 128-bit, Q is at most 192 - 127 = 65 bits
    // (when D is at its minimum value for having high 64 bits set, i.e., D = 2^64)
    //
    // For our use case, D is close to 2^128, so Q is close to 2^64

    // Direct computation using u128 arithmetic and careful handling:
    //
    // Let D = d_hi * 2^64 + d_lo where d_hi and d_lo are the high and low 64-bit halves
    // We know d_hi > 0 (checked above)
    //
    // 2^192 / D ≈ 2^192 / (d_hi * 2^64) = 2^128 / d_hi
    //
    // This gives a first approximation. Let's compute:
    // q_est = 2^128 / d_hi = (u128::MAX / d_hi) + 1 (approximately)

    // Note: We could use approximation 2^128/d_hi for initial estimate,
    // but the bit-by-bit algorithm below is guaranteed correct

    // Now we need to refine this estimate
    // 2^192 / divisor = 2^64 * (2^128 / divisor)
    //
    // Our estimate is q_approx ≈ 2^128 / d_hi
    // The true value is 2^128 / divisor < 2^128 / d_hi (since divisor >= d_hi * 2^64)
    //
    // More precisely: 2^128 / divisor = (2^128 / d_hi) * (d_hi / divisor) * (divisor / divisor)
    // Hmm, this is getting complicated.
    //
    // Simpler approach: use Newton-Raphson or binary search

    // For speed, use the approximation and add correction
    // q_approx * d_hi ≈ 2^128, so q_approx * divisor ≈ 2^128 * (divisor / d_hi) = 2^128 * (1 + d_lo / (d_hi * 2^64))
    //
    // Actually, let me just use bit-by-bit computation for correctness

    // Bit-by-bit schoolbook division:
    // Process N = 2^192 bit by bit from MSB (bit 192) to LSB (bit 0)
    // Since we want quotient bits 0-127, we process 193 bits of N
    //
    // But N = 2^192 has only bit 192 set, so most bits are 0

    // The quotient Q = floor(2^192 / D) where D ≈ 2^128 is approximately 2^64
    // Q has at most 65 bits (since 2^192 / 2^127 = 2^65)

    // Use the recurrence: at step i, R_i = 2^(192-i) mod D
    // Q_i = 2^(192-i) / D = Q_{i-1} * 2 + (if R_{i-1} * 2 >= D then 1 else 0)

    // Starting from i=0: R_0 = 2^192 mod D, Q_0 = floor(2^192 / D)
    // We build this up iteratively

    let mut quotient: u128 = 0;
    let mut remainder_hi: u128 = 0; // high 128 bits of 256-bit remainder
    let mut remainder_lo: u128 = 0; // low 128 bits of 256-bit remainder

    // Standard restoring division algorithm:
    // We're computing floor(2^192 / divisor)
    // N = 2^192 has only bit 192 set
    // We process bits from MSB to LSB
    //
    // The quotient has at most 65 bits since divisor > 2^127

    for bit_pos in (0u32..193).rev() {
        // Shift remainder left by 1
        let carry = remainder_hi >> 127;
        remainder_hi = (remainder_hi << 1) | (remainder_lo >> 127);
        remainder_lo = remainder_lo << 1;

        // Add the numerator bit at this position
        // N = 2^192, so only bit 192 is set
        if bit_pos == 192 {
            remainder_lo |= 1;
        }

        // Shift quotient left by 1 (to make room for new bit)
        // But we only start recording once bit_pos < 128
        if bit_pos < 128 {
            quotient <<= 1;
        }

        // Check if remainder >= divisor
        // remainder is (remainder_hi * 2^128 + remainder_lo)
        // divisor is 128-bit, so remainder >= divisor iff:
        // - carry > 0 (remainder overflowed 256 bits), OR
        // - remainder_hi > 0, OR
        // - remainder_hi == 0 AND remainder_lo >= divisor
        let can_subtract = if carry > 0 {
            true
        } else if remainder_hi > 0 {
            true
        } else {
            remainder_lo >= divisor
        };

        if can_subtract {
            // Subtract divisor from remainder
            if remainder_lo >= divisor {
                remainder_lo -= divisor;
            } else {
                remainder_hi -= 1;
                remainder_lo = remainder_lo.wrapping_sub(divisor);
            }

            // Set quotient bit (only if bit_pos < 128)
            if bit_pos < 128 {
                quotient |= 1;
            }
        }
    }

    quotient
}

/// Get sqrt price at a given tick
/// sqrt_price_x64 = sqrt(1.0001^tick) * 2^64
///
/// Uses binary representation of tick to compute efficiently:
/// 1.0001^tick = product of 1.0001^(2^i) for each bit i set in tick
pub fn get_sqrt_price_at_tick(tick: i32) -> Result<u128> {
    if tick < MIN_TICK || tick > MAX_TICK {
        if tick < MIN_TICK {
            return Err(SuniswapError::TickBelowMinimum.into());
        }
        return Err(SuniswapError::TickAboveMaximum.into());
    }

    let abs_tick = tick.unsigned_abs();

    // We compute ratio = 1.0001^|tick| in Q128.128 format
    // Then take sqrt to get Q64.64 format
    // These magic numbers are precomputed: 1.0001^(2^i) in Q128.128

    let mut ratio: u128 = if abs_tick & 0x1 != 0 {
        0xfffcb933bd6fad37aa2d162d1a594001 // 1.0001^1
    } else {
        // 1.0 in Q128.128 = 2^128, but u128 max is 2^128-1
        // Use max value as approximation
        u128::MAX
    };

    if abs_tick & 0x2 != 0 {
        ratio = mul_shift(ratio, 0xfff97272373d413259a46990580e213a)?; // 1.0001^2
    }
    if abs_tick & 0x4 != 0 {
        ratio = mul_shift(ratio, 0xfff2e50f5f656932ef12357cf3c7fdcc)?; // 1.0001^4
    }
    if abs_tick & 0x8 != 0 {
        ratio = mul_shift(ratio, 0xffe5caca7e10e4e61c3624eaa0941cd0)?; // 1.0001^8
    }
    if abs_tick & 0x10 != 0 {
        ratio = mul_shift(ratio, 0xffcb9843d60f6159c9db58835c926644)?; // 1.0001^16
    }
    if abs_tick & 0x20 != 0 {
        ratio = mul_shift(ratio, 0xff973b41fa98c081472e6896dfb254c0)?; // 1.0001^32
    }
    if abs_tick & 0x40 != 0 {
        ratio = mul_shift(ratio, 0xff2ea16466c96a3843ec78b326b52861)?; // 1.0001^64
    }
    if abs_tick & 0x80 != 0 {
        ratio = mul_shift(ratio, 0xfe5dee046a99a2a811c461f1969c3053)?; // 1.0001^128
    }
    if abs_tick & 0x100 != 0 {
        ratio = mul_shift(ratio, 0xfcbe86c7900a88aedcffc83b479aa3a4)?; // 1.0001^256
    }
    if abs_tick & 0x200 != 0 {
        ratio = mul_shift(ratio, 0xf987a7253ac413176f2b074cf7815e54)?; // 1.0001^512
    }
    if abs_tick & 0x400 != 0 {
        ratio = mul_shift(ratio, 0xf3392b0822b70005940c7a398e4b70f3)?; // 1.0001^1024
    }
    if abs_tick & 0x800 != 0 {
        ratio = mul_shift(ratio, 0xe7159475a2c29b7443b29c7fa6e889d9)?; // 1.0001^2048
    }
    if abs_tick & 0x1000 != 0 {
        ratio = mul_shift(ratio, 0xd097f3bdfd2022b8845ad8f792aa5825)?; // 1.0001^4096
    }
    if abs_tick & 0x2000 != 0 {
        ratio = mul_shift(ratio, 0xa9f746462d870fdf8a65dc1f90e061e5)?; // 1.0001^8192
    }
    if abs_tick & 0x4000 != 0 {
        ratio = mul_shift(ratio, 0x70d869a156d2a1b890bb3df62baf32f7)?; // 1.0001^16384
    }
    if abs_tick & 0x8000 != 0 {
        ratio = mul_shift(ratio, 0x31be135f97d08fd981231505542fcfa6)?; // 1.0001^32768
    }
    if abs_tick & 0x10000 != 0 {
        ratio = mul_shift(ratio, 0x9aa508b5b7a84e1c677de54f3e99bc9)?; // 1.0001^65536
    }
    if abs_tick & 0x20000 != 0 {
        ratio = mul_shift(ratio, 0x5d6af8dedb81196699c329225ee604)?; // 1.0001^131072
    }
    if abs_tick & 0x40000 != 0 {
        ratio = mul_shift(ratio, 0x2216e584f5fa1ea926041bedfe98)?; // 1.0001^262144
    }

    // If tick is positive, invert the ratio
    // The magic numbers compute 1/1.0001^|tick|, so for positive ticks we need to invert
    // to get 1.0001^tick. For negative ticks, we want 1.0001^-|tick| = 1/1.0001^|tick|
    // which is what the magic numbers give us directly.
    //
    // For positive ticks, we need to compute 2^192 / ratio to get the sqrt_price in Q64.64.
    // The ratio is in Q128.128, so: (2^256 / ratio) >> 64 = 2^192 / ratio
    if tick > 0 {
        let result = div_2_192_by_u128(ratio);
        // Add rounding adjustment (saturating to prevent overflow at bounds)
        return Ok(result.saturating_add(1));
    }

    // For negative or zero tick: convert from Q128.128 to Q64.64
    // We need to shift right by 64 bits
    Ok((ratio >> 64) + if ratio % (1u128 << 64) > 0 { 1 } else { 0 })
}

/// Get tick at a given sqrt price
/// tick = floor(log_{1.0001}(sqrt_price^2)) = floor(2 * log_{1.0001}(sqrt_price))
pub fn get_tick_at_sqrt_price(sqrt_price_x64: u128) -> Result<i32> {
    if sqrt_price_x64 < MIN_SQRT_PRICE_X64 {
        return Err(SuniswapError::SqrtPriceBelowMinimum.into());
    }
    if sqrt_price_x64 > MAX_SQRT_PRICE_X64 {
        return Err(SuniswapError::SqrtPriceAboveMaximum.into());
    }

    // Use a simplified approach: binary search for the tick
    // that gives a sqrt price closest to the target
    let mut low = MIN_TICK;
    let mut high = MAX_TICK;

    while low < high {
        let mid = low + (high - low) / 2;
        let mid_price = get_sqrt_price_at_tick(mid)?;

        if mid_price <= sqrt_price_x64 {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    // low is now the smallest tick with sqrt_price > target
    // We want the largest tick with sqrt_price <= target
    let tick = low - 1;

    // Verify the result
    let computed_price = get_sqrt_price_at_tick(tick)?;
    if computed_price > sqrt_price_x64 {
        Ok(tick - 1)
    } else {
        Ok(tick)
    }
}

/// Helper to multiply two u128 and shift right by 128
fn mul_shift(a: u128, b: u128) -> Result<u128> {
    let a_hi = a >> 64;
    let a_lo = a & ((1u128 << 64) - 1);
    let b_hi = b >> 64;
    let b_lo = b & ((1u128 << 64) - 1);

    // Full 256-bit multiplication result
    let p0 = a_lo * b_lo;
    let p1 = a_lo * b_hi;
    let p2 = a_hi * b_lo;
    let p3 = a_hi * b_hi;

    // We want bits [128:256) of the full result
    // result_lo = p0[64:128) + p1[0:64) + p2[0:64)
    // result_hi = p3 + p1[64:128) + p2[64:128) + carry

    let mid = (p0 >> 64)
        .wrapping_add(p1 & ((1u128 << 64) - 1))
        .wrapping_add(p2 & ((1u128 << 64) - 1));
    let carry = mid >> 64;

    let result = p3
        .wrapping_add(p1 >> 64)
        .wrapping_add(p2 >> 64)
        .wrapping_add(carry);

    Ok(result)
}

/// Find the most significant bit position (0-indexed from right)
#[allow(dead_code)]
fn most_significant_bit(x: u128) -> u8 {
    let mut n = x;
    let mut r = 0u8;

    // Note: u128 max is 2^128-1, so we check if >= 2^64 instead
    if n >= 0x10000000000000000 {
        n >>= 64;
        r += 64;
    }
    if n >= 0x100000000 {
        n >>= 32;
        r += 32;
    }
    if n >= 0x10000 {
        n >>= 16;
        r += 16;
    }
    if n >= 0x100 {
        n >>= 8;
        r += 8;
    }
    if n >= 0x10 {
        n >>= 4;
        r += 4;
    }
    if n >= 0x4 {
        n >>= 2;
        r += 2;
    }
    if n >= 0x2 {
        r += 1;
    }

    r
}

/// Check if a tick is valid for the given tick spacing
pub fn is_valid_tick(tick: i32, tick_spacing: u16) -> bool {
    tick >= MIN_TICK && tick <= MAX_TICK && tick % (tick_spacing as i32) == 0
}

/// Get the next valid tick index
pub fn get_next_valid_tick(tick: i32, tick_spacing: u16, less_than_or_equal: bool) -> i32 {
    let spacing = tick_spacing as i32;
    if less_than_or_equal {
        let compressed = if tick < 0 && tick % spacing != 0 {
            (tick / spacing) - 1
        } else {
            tick / spacing
        };
        compressed * spacing
    } else {
        let compressed = if tick < 0 && tick % spacing != 0 {
            tick / spacing
        } else {
            (tick / spacing) + 1
        };
        compressed * spacing
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sqrt_price_at_tick_zero() {
        // At tick 0, price = 1, sqrt_price = 1 * 2^64
        let sqrt_price = get_sqrt_price_at_tick(0).unwrap();
        assert!(sqrt_price > (1u128 << 64) - 1000);
        assert!(sqrt_price < (1u128 << 64) + 1000);
    }

    #[test]
    fn test_tick_bounds() {
        // Should succeed at bounds
        assert!(get_sqrt_price_at_tick(MIN_TICK).is_ok());
        assert!(get_sqrt_price_at_tick(MAX_TICK).is_ok());

        // Should fail outside bounds
        assert!(get_sqrt_price_at_tick(MIN_TICK - 1).is_err());
        assert!(get_sqrt_price_at_tick(MAX_TICK + 1).is_err());
    }

    #[test]
    fn test_tick_spacing_validation() {
        assert!(is_valid_tick(60, 60));
        assert!(is_valid_tick(-60, 60));
        assert!(!is_valid_tick(61, 60));
    }

    #[test]
    fn test_sqrt_prices_at_various_ticks() {
        let q64: u128 = 1 << 64;

        // Tick 0: sqrt_price should be ~2^64 (price = 1.0)
        let sp_0 = get_sqrt_price_at_tick(0).unwrap();
        assert!((sp_0 as f64 / q64 as f64 - 1.0).abs() < 0.001);

        // Tick -200: sqrt_price should be < 2^64
        let sp_neg200 = get_sqrt_price_at_tick(-200).unwrap();
        assert!(sp_neg200 < q64, "Tick -200 should have sqrt_price < Q64");

        // Tick 200: sqrt_price should be > 2^64
        let sp_200 = get_sqrt_price_at_tick(200).unwrap();
        assert!(sp_200 > q64, "Tick 200 should have sqrt_price > Q64");

        // Check monotonicity: higher tick = higher price
        assert!(sp_neg200 < sp_0);
        assert!(sp_0 < sp_200);

        // Verify reasonable magnitudes
        // tick = log_1.0001(price^2) => price = 1.0001^(tick/2)
        // At tick 200: price = 1.0001^100 ≈ 1.01005
        // sqrt_price = sqrt(1.01005) ≈ 1.005
        let ratio_200 = sp_200 as f64 / q64 as f64;
        assert!((ratio_200 - 1.01).abs() < 0.01);

        // At tick -200: price = 1.0001^-100 ≈ 0.99005
        // sqrt_price = sqrt(0.99005) ≈ 0.995
        let ratio_neg200 = sp_neg200 as f64 / q64 as f64;
        assert!((ratio_neg200 - 0.99).abs() < 0.01);
    }
}
