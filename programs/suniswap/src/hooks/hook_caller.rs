//! Hook Caller
//!
//! Handles invoking hooks via CPI.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program::invoke;
use crate::errors::SuniswapError;
use super::*;

/// Instruction discriminators for hook calls
/// These must match the hook program's implementation
pub mod hook_discriminators {
    /// before_initialize instruction
    pub const BEFORE_INITIALIZE: [u8; 8] = [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    /// after_initialize instruction
    pub const AFTER_INITIALIZE: [u8; 8] = [0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    /// before_swap instruction
    pub const BEFORE_SWAP: [u8; 8] = [0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    /// after_swap instruction
    pub const AFTER_SWAP: [u8; 8] = [0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    /// before_add_liquidity instruction
    pub const BEFORE_ADD_LIQUIDITY: [u8; 8] = [0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    /// after_add_liquidity instruction
    pub const AFTER_ADD_LIQUIDITY: [u8; 8] = [0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    /// before_remove_liquidity instruction
    pub const BEFORE_REMOVE_LIQUIDITY: [u8; 8] = [0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    /// after_remove_liquidity instruction
    pub const AFTER_REMOVE_LIQUIDITY: [u8; 8] = [0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
}

/// Call before_swap hook
pub fn call_before_swap<'info>(
    hook_config: &HookConfig,
    hook_program: &AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    params: BeforeSwapParams,
) -> Result<Option<HookReturnData>> {
    if !hook_config.has_before_swap() {
        return Ok(None);
    }

    // Validate hook program matches config
    if hook_program.key() != hook_config.hook_program {
        return Err(SuniswapError::InvalidHookAddress.into());
    }

    // Build instruction data
    let mut data = hook_discriminators::BEFORE_SWAP.to_vec();
    data.extend_from_slice(&params.try_to_vec()?);

    // Build accounts list
    let accounts: Vec<AccountMeta> = remaining_accounts
        .iter()
        .map(|a| {
            if a.is_writable {
                AccountMeta::new(*a.key, a.is_signer)
            } else {
                AccountMeta::new_readonly(*a.key, a.is_signer)
            }
        })
        .collect();

    // Create and invoke instruction
    let ix = Instruction {
        program_id: hook_config.hook_program,
        accounts,
        data,
    };

    invoke(&ix, remaining_accounts)?;

    // TODO: Parse return data from hook
    // For now, assume hook succeeded if no error
    Ok(Some(HookReturnData {
        proceed: true,
        ..Default::default()
    }))
}

/// Call after_swap hook
pub fn call_after_swap<'info>(
    hook_config: &HookConfig,
    hook_program: &AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    params: AfterSwapParams,
) -> Result<Option<HookReturnData>> {
    if !hook_config.has_after_swap() {
        return Ok(None);
    }

    if hook_program.key() != hook_config.hook_program {
        return Err(SuniswapError::InvalidHookAddress.into());
    }

    let mut data = hook_discriminators::AFTER_SWAP.to_vec();
    data.extend_from_slice(&params.try_to_vec()?);

    let accounts: Vec<AccountMeta> = remaining_accounts
        .iter()
        .map(|a| {
            if a.is_writable {
                AccountMeta::new(*a.key, a.is_signer)
            } else {
                AccountMeta::new_readonly(*a.key, a.is_signer)
            }
        })
        .collect();

    let ix = Instruction {
        program_id: hook_config.hook_program,
        accounts,
        data,
    };

    invoke(&ix, remaining_accounts)?;

    Ok(Some(HookReturnData {
        proceed: true,
        ..Default::default()
    }))
}

/// Call before_add_liquidity hook
pub fn call_before_add_liquidity<'info>(
    hook_config: &HookConfig,
    hook_program: &AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    params: BeforeAddLiquidityParams,
) -> Result<Option<HookReturnData>> {
    if !hook_config.has_before_add_liquidity() {
        return Ok(None);
    }

    if hook_program.key() != hook_config.hook_program {
        return Err(SuniswapError::InvalidHookAddress.into());
    }

    let mut data = hook_discriminators::BEFORE_ADD_LIQUIDITY.to_vec();
    data.extend_from_slice(&params.try_to_vec()?);

    let accounts: Vec<AccountMeta> = remaining_accounts
        .iter()
        .map(|a| {
            if a.is_writable {
                AccountMeta::new(*a.key, a.is_signer)
            } else {
                AccountMeta::new_readonly(*a.key, a.is_signer)
            }
        })
        .collect();

    let ix = Instruction {
        program_id: hook_config.hook_program,
        accounts,
        data,
    };

    invoke(&ix, remaining_accounts)?;

    Ok(Some(HookReturnData {
        proceed: true,
        ..Default::default()
    }))
}

/// Call after_add_liquidity hook
pub fn call_after_add_liquidity<'info>(
    hook_config: &HookConfig,
    hook_program: &AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    params: AfterAddLiquidityParams,
) -> Result<Option<HookReturnData>> {
    if !hook_config.has_after_add_liquidity() {
        return Ok(None);
    }

    if hook_program.key() != hook_config.hook_program {
        return Err(SuniswapError::InvalidHookAddress.into());
    }

    let mut data = hook_discriminators::AFTER_ADD_LIQUIDITY.to_vec();
    data.extend_from_slice(&params.try_to_vec()?);

    let accounts: Vec<AccountMeta> = remaining_accounts
        .iter()
        .map(|a| {
            if a.is_writable {
                AccountMeta::new(*a.key, a.is_signer)
            } else {
                AccountMeta::new_readonly(*a.key, a.is_signer)
            }
        })
        .collect();

    let ix = Instruction {
        program_id: hook_config.hook_program,
        accounts,
        data,
    };

    invoke(&ix, remaining_accounts)?;

    Ok(Some(HookReturnData {
        proceed: true,
        ..Default::default()
    }))
}

/// Call before_remove_liquidity hook
pub fn call_before_remove_liquidity<'info>(
    hook_config: &HookConfig,
    hook_program: &AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    params: BeforeRemoveLiquidityParams,
) -> Result<Option<HookReturnData>> {
    if !hook_config.has_before_remove_liquidity() {
        return Ok(None);
    }

    if hook_program.key() != hook_config.hook_program {
        return Err(SuniswapError::InvalidHookAddress.into());
    }

    let mut data = hook_discriminators::BEFORE_REMOVE_LIQUIDITY.to_vec();
    data.extend_from_slice(&params.try_to_vec()?);

    let accounts: Vec<AccountMeta> = remaining_accounts
        .iter()
        .map(|a| {
            if a.is_writable {
                AccountMeta::new(*a.key, a.is_signer)
            } else {
                AccountMeta::new_readonly(*a.key, a.is_signer)
            }
        })
        .collect();

    let ix = Instruction {
        program_id: hook_config.hook_program,
        accounts,
        data,
    };

    invoke(&ix, remaining_accounts)?;

    Ok(Some(HookReturnData {
        proceed: true,
        ..Default::default()
    }))
}

/// Call after_remove_liquidity hook
pub fn call_after_remove_liquidity<'info>(
    hook_config: &HookConfig,
    hook_program: &AccountInfo<'info>,
    remaining_accounts: &[AccountInfo<'info>],
    params: AfterRemoveLiquidityParams,
) -> Result<Option<HookReturnData>> {
    if !hook_config.has_after_remove_liquidity() {
        return Ok(None);
    }

    if hook_program.key() != hook_config.hook_program {
        return Err(SuniswapError::InvalidHookAddress.into());
    }

    let mut data = hook_discriminators::AFTER_REMOVE_LIQUIDITY.to_vec();
    data.extend_from_slice(&params.try_to_vec()?);

    let accounts: Vec<AccountMeta> = remaining_accounts
        .iter()
        .map(|a| {
            if a.is_writable {
                AccountMeta::new(*a.key, a.is_signer)
            } else {
                AccountMeta::new_readonly(*a.key, a.is_signer)
            }
        })
        .collect();

    let ix = Instruction {
        program_id: hook_config.hook_program,
        accounts,
        data,
    };

    invoke(&ix, remaining_accounts)?;

    Ok(Some(HookReturnData {
        proceed: true,
        ..Default::default()
    }))
}
