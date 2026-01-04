//! Hooks System
//!
//! V4-style hooks allow external programs to inject custom logic
//! at specific points in the protocol's execution flow.

use anchor_lang::prelude::*;
use crate::constants::hook_flags;

pub mod hook_caller;

pub use hook_caller::*;

/// Hook configuration for a pool
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct HookConfig {
    /// The hook program address
    pub hook_program: Pubkey,

    /// Flags indicating which hooks are enabled
    pub flags: u8,
}

impl HookConfig {
    /// Check if before_initialize hook is enabled
    pub fn has_before_initialize(&self) -> bool {
        self.flags & hook_flags::BEFORE_INITIALIZE != 0
    }

    /// Check if after_initialize hook is enabled
    pub fn has_after_initialize(&self) -> bool {
        self.flags & hook_flags::AFTER_INITIALIZE != 0
    }

    /// Check if before_swap hook is enabled
    pub fn has_before_swap(&self) -> bool {
        self.flags & hook_flags::BEFORE_SWAP != 0
    }

    /// Check if after_swap hook is enabled
    pub fn has_after_swap(&self) -> bool {
        self.flags & hook_flags::AFTER_SWAP != 0
    }

    /// Check if before_add_liquidity hook is enabled
    pub fn has_before_add_liquidity(&self) -> bool {
        self.flags & hook_flags::BEFORE_ADD_LIQUIDITY != 0
    }

    /// Check if after_add_liquidity hook is enabled
    pub fn has_after_add_liquidity(&self) -> bool {
        self.flags & hook_flags::AFTER_ADD_LIQUIDITY != 0
    }

    /// Check if before_remove_liquidity hook is enabled
    pub fn has_before_remove_liquidity(&self) -> bool {
        self.flags & hook_flags::BEFORE_REMOVE_LIQUIDITY != 0
    }

    /// Check if after_remove_liquidity hook is enabled
    pub fn has_after_remove_liquidity(&self) -> bool {
        self.flags & hook_flags::AFTER_REMOVE_LIQUIDITY != 0
    }

    /// Check if any hooks are enabled
    pub fn has_any_hooks(&self) -> bool {
        self.flags != 0 && self.hook_program != Pubkey::default()
    }

    /// Validate hook address matches expected pattern
    /// Following Uniswap V4: hook address must have specific bits set
    /// to indicate which hooks it implements
    pub fn validate_hook_address(&self) -> bool {
        if self.hook_program == Pubkey::default() {
            return self.flags == 0;
        }

        // The first byte of the hook program address should match the flags
        // This ensures the hook program was specifically deployed for these callbacks
        let address_bytes = self.hook_program.to_bytes();
        let address_flags = address_bytes[0];

        // Check that all enabled flags in self.flags are also set in address_flags
        (self.flags & address_flags) == self.flags
    }
}

/// Parameters passed to before_swap hook
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct BeforeSwapParams {
    pub pool: Pubkey,
    pub sender: Pubkey,
    pub zero_for_one: bool,
    pub amount_specified: i64,
    pub sqrt_price_limit_x64: u128,
}

/// Parameters passed to after_swap hook
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct AfterSwapParams {
    pub pool: Pubkey,
    pub sender: Pubkey,
    pub zero_for_one: bool,
    pub amount_in: u64,
    pub amount_out: u64,
    pub sqrt_price_after_x64: u128,
    pub liquidity_after: u128,
    pub tick_after: i32,
}

/// Parameters passed to before_add_liquidity hook
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct BeforeAddLiquidityParams {
    pub pool: Pubkey,
    pub sender: Pubkey,
    pub tick_lower: i32,
    pub tick_upper: i32,
    pub liquidity_delta: u128,
}

/// Parameters passed to after_add_liquidity hook
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct AfterAddLiquidityParams {
    pub pool: Pubkey,
    pub sender: Pubkey,
    pub tick_lower: i32,
    pub tick_upper: i32,
    pub liquidity_delta: u128,
    pub amount_a: u64,
    pub amount_b: u64,
}

/// Parameters passed to before_remove_liquidity hook
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct BeforeRemoveLiquidityParams {
    pub pool: Pubkey,
    pub sender: Pubkey,
    pub tick_lower: i32,
    pub tick_upper: i32,
    pub liquidity_delta: u128,
}

/// Parameters passed to after_remove_liquidity hook
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct AfterRemoveLiquidityParams {
    pub pool: Pubkey,
    pub sender: Pubkey,
    pub tick_lower: i32,
    pub tick_upper: i32,
    pub liquidity_delta: u128,
    pub amount_a: u64,
    pub amount_b: u64,
}

/// Return value from hooks that can modify behavior
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct HookReturnData {
    /// Whether to proceed with the operation
    pub proceed: bool,

    /// Optional modified amount (for dynamic fee hooks)
    pub modified_amount: Option<u64>,

    /// Optional additional fee (for protocol/referral hooks)
    pub additional_fee: Option<u64>,

    /// Custom data returned by hook
    pub custom_data: [u8; 32],
}
