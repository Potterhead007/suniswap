//! Utility functions for SuniSwap

/// Validate token ordering (token A must be < token B lexicographically)
pub fn validate_token_order(token_a: &[u8; 32], token_b: &[u8; 32]) -> bool {
    token_a < token_b
}

/// Calculate the price from sqrt price
/// price = sqrt_price^2 / 2^128
pub fn sqrt_price_to_price(sqrt_price_x64: u128) -> f64 {
    let sqrt_price = sqrt_price_x64 as f64 / (1u128 << 64) as f64;
    sqrt_price * sqrt_price
}

/// Calculate sqrt price from price
/// sqrt_price = sqrt(price) * 2^64
pub fn price_to_sqrt_price(price: f64) -> u128 {
    let sqrt_price = price.sqrt();
    (sqrt_price * (1u128 << 64) as f64) as u128
}
