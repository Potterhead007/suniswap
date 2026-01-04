//! Bit Math
//!
//! Utilities for bit manipulation and searching.

/// Find the most significant bit (position of highest set bit)
/// Returns 0 for input 0
pub fn most_significant_bit(x: u128) -> u8 {
    if x == 0 {
        return 0;
    }

    let mut n = x;
    let mut r = 0u8;

    if n >= 1u128 << 64 {
        n >>= 64;
        r += 64;
    }
    if n >= 1u128 << 32 {
        n >>= 32;
        r += 32;
    }
    if n >= 1u128 << 16 {
        n >>= 16;
        r += 16;
    }
    if n >= 1u128 << 8 {
        n >>= 8;
        r += 8;
    }
    if n >= 1u128 << 4 {
        n >>= 4;
        r += 4;
    }
    if n >= 1u128 << 2 {
        n >>= 2;
        r += 2;
    }
    if n >= 1u128 << 1 {
        r += 1;
    }

    r
}

/// Find the least significant bit (position of lowest set bit)
/// Returns 0 for input 0
pub fn least_significant_bit(x: u128) -> u8 {
    if x == 0 {
        return 0;
    }

    let mut n = x;
    let mut r = 127u8;

    if n & ((1u128 << 64) - 1) > 0 {
        r -= 64;
    } else {
        n >>= 64;
    }
    if n & ((1u128 << 32) - 1) > 0 {
        r -= 32;
    } else {
        n >>= 32;
    }
    if n & ((1u128 << 16) - 1) > 0 {
        r -= 16;
    } else {
        n >>= 16;
    }
    if n & ((1u128 << 8) - 1) > 0 {
        r -= 8;
    } else {
        n >>= 8;
    }
    if n & ((1u128 << 4) - 1) > 0 {
        r -= 4;
    } else {
        n >>= 4;
    }
    if n & ((1u128 << 2) - 1) > 0 {
        r -= 2;
    } else {
        n >>= 2;
    }
    if n & 1 > 0 {
        r -= 1;
    }

    r
}

/// Count the number of set bits in a u128
pub fn pop_count(x: u128) -> u8 {
    let mut n = x;
    let mut count = 0u8;

    while n > 0 {
        count += (n & 1) as u8;
        n >>= 1;
    }

    count
}

/// Count the number of set bits in a byte
pub fn pop_count_u8(x: u8) -> u8 {
    let mut n = x;
    let mut count = 0u8;

    while n > 0 {
        count += n & 1;
        n >>= 1;
    }

    count
}

/// Find position of next set bit at or after position
/// Returns None if no bit is set at or after position
pub fn next_bit_position(bitmap: u128, position: u8) -> Option<u8> {
    if position >= 128 {
        return None;
    }

    // Create mask for bits at or after position
    let mask = u128::MAX << position;
    let masked = bitmap & mask;

    if masked == 0 {
        None
    } else {
        Some(least_significant_bit(masked))
    }
}

/// Find position of previous set bit at or before position
/// Returns None if no bit is set at or before position
pub fn prev_bit_position(bitmap: u128, position: u8) -> Option<u8> {
    if position >= 128 {
        return prev_bit_position(bitmap, 127);
    }

    // Create mask for bits at or before position
    let mask = (1u128 << (position + 1)) - 1;
    let masked = bitmap & mask;

    if masked == 0 {
        None
    } else {
        Some(most_significant_bit(masked))
    }
}

/// Check if a specific bit is set
#[inline]
pub fn is_bit_set(bitmap: u128, position: u8) -> bool {
    if position >= 128 {
        return false;
    }
    (bitmap >> position) & 1 == 1
}

/// Set a specific bit
#[inline]
pub fn set_bit(bitmap: u128, position: u8) -> u128 {
    if position >= 128 {
        return bitmap;
    }
    bitmap | (1u128 << position)
}

/// Clear a specific bit
#[inline]
pub fn clear_bit(bitmap: u128, position: u8) -> u128 {
    if position >= 128 {
        return bitmap;
    }
    bitmap & !(1u128 << position)
}

/// Toggle a specific bit
#[inline]
pub fn toggle_bit(bitmap: u128, position: u8) -> u128 {
    if position >= 128 {
        return bitmap;
    }
    bitmap ^ (1u128 << position)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_msb() {
        assert_eq!(most_significant_bit(0), 0);
        assert_eq!(most_significant_bit(1), 0);
        assert_eq!(most_significant_bit(2), 1);
        assert_eq!(most_significant_bit(255), 7);
        assert_eq!(most_significant_bit(256), 8);
        assert_eq!(most_significant_bit(1u128 << 64), 64);
    }

    #[test]
    fn test_lsb() {
        assert_eq!(least_significant_bit(0), 0);
        assert_eq!(least_significant_bit(1), 0);
        assert_eq!(least_significant_bit(2), 1);
        assert_eq!(least_significant_bit(4), 2);
        assert_eq!(least_significant_bit(8), 3);
    }

    #[test]
    fn test_bit_operations() {
        let bitmap = 0b1010u128;
        assert!(is_bit_set(bitmap, 1));
        assert!(is_bit_set(bitmap, 3));
        assert!(!is_bit_set(bitmap, 0));
        assert!(!is_bit_set(bitmap, 2));

        let bitmap = set_bit(0, 5);
        assert_eq!(bitmap, 32);

        let bitmap = clear_bit(0b111u128, 1);
        assert_eq!(bitmap, 0b101);
    }

    #[test]
    fn test_next_prev_bit() {
        let bitmap = 0b10100u128; // bits 2 and 4 set

        assert_eq!(next_bit_position(bitmap, 0), Some(2));
        assert_eq!(next_bit_position(bitmap, 2), Some(2));
        assert_eq!(next_bit_position(bitmap, 3), Some(4));
        assert_eq!(next_bit_position(bitmap, 5), None);

        assert_eq!(prev_bit_position(bitmap, 5), Some(4));
        assert_eq!(prev_bit_position(bitmap, 4), Some(4));
        assert_eq!(prev_bit_position(bitmap, 3), Some(2));
        assert_eq!(prev_bit_position(bitmap, 1), None);
    }
}
