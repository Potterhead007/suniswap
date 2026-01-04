use anchor_lang::prelude::*;
use crate::state::tick::Tick;
use crate::constants::TICK_ARRAY_SIZE;
use crate::errors::SuniswapError;

// Compile-time assertion: initialized_bitmap is u8 (8 bits), so TICK_ARRAY_SIZE must be <= 8
// If you need larger arrays, change initialized_bitmap to u16/u32/u64 accordingly
const _: () = assert!(TICK_ARRAY_SIZE <= 8, "TICK_ARRAY_SIZE exceeds bitmap capacity (8 bits)");

/// Tick Array - stores a contiguous range of tick data
/// PDA: ["tick_array", pool, start_tick_index.to_le_bytes()]
/// Using zero-copy for efficient memory access
/// Fields ordered to ensure proper alignment (Tick needs 16-byte alignment)
#[account(zero_copy)]
#[repr(C)]
#[derive(Debug)]
pub struct TickArray {
    /// The pool this tick array belongs to
    pub pool: [u8; 32],                           // 32 bytes, offset 0

    /// Starting tick index for this array
    /// Must be divisible by (TICK_ARRAY_SIZE * tick_spacing)
    pub start_tick_index: i32,                    // 4 bytes, offset 32

    /// Bitmap of initialized ticks (1 byte = 8 bits)
    pub initialized_bitmap: u8,                   // 1 byte, offset 36

    /// Bump seed for PDA derivation
    pub bump: u8,                                 // 1 byte, offset 37

    /// Padding to align ticks array to 16 bytes (40 -> 48)
    pub _padding: [u8; 10],                       // 10 bytes, offset 38

    /// Array of ticks (8 ticks per array, each 96 bytes)
    pub ticks: [Tick; TICK_ARRAY_SIZE],           // 768 bytes, offset 48
}
// Total: 816 bytes (divisible by 16)

impl TickArray {
    pub const LEN: usize = 8 + std::mem::size_of::<TickArray>();

    /// Get pool as Pubkey
    pub fn pool_pubkey(&self) -> Pubkey {
        Pubkey::new_from_array(self.pool)
    }

    /// Calculate the start index for a tick array containing a given tick
    pub fn get_start_tick_index(tick_index: i32, tick_spacing: u16) -> i32 {
        let ticks_per_array = (TICK_ARRAY_SIZE as i32) * (tick_spacing as i32);
        let mut start = tick_index / ticks_per_array * ticks_per_array;
        if tick_index < 0 && tick_index % ticks_per_array != 0 {
            start -= ticks_per_array;
        }
        start
    }

    /// Get the tick at a specific index
    pub fn get_tick(&self, tick_index: i32, tick_spacing: u16) -> Result<&Tick> {
        let offset = self.tick_offset(tick_index, tick_spacing)?;
        Ok(&self.ticks[offset])
    }

    /// Get mutable tick at a specific index
    pub fn get_tick_mut(&mut self, tick_index: i32, tick_spacing: u16) -> Result<&mut Tick> {
        let offset = self.tick_offset(tick_index, tick_spacing)?;
        Ok(&mut self.ticks[offset])
    }

    /// Calculate offset within the array for a given tick
    fn tick_offset(&self, tick_index: i32, tick_spacing: u16) -> Result<usize> {
        if !self.is_tick_in_array(tick_index, tick_spacing) {
            return Err(SuniswapError::TickArrayNotFound.into());
        }
        let offset = ((tick_index - self.start_tick_index) / tick_spacing as i32) as usize;
        Ok(offset)
    }

    /// Check if a tick index falls within this array
    pub fn is_tick_in_array(&self, tick_index: i32, tick_spacing: u16) -> bool {
        let ticks_per_array = (TICK_ARRAY_SIZE as i32) * (tick_spacing as i32);
        tick_index >= self.start_tick_index
            && tick_index < self.start_tick_index + ticks_per_array
    }

    /// Check if a specific tick is initialized
    pub fn is_tick_initialized(&self, tick_index: i32, tick_spacing: u16) -> Result<bool> {
        let offset = self.tick_offset(tick_index, tick_spacing)?;
        Ok((self.initialized_bitmap >> offset) & 1 == 1)
    }

    /// Set a tick as initialized
    pub fn set_tick_initialized(&mut self, tick_index: i32, tick_spacing: u16) -> Result<()> {
        let offset = self.tick_offset(tick_index, tick_spacing)?;
        self.initialized_bitmap |= 1 << offset;
        Ok(())
    }

    /// Clear a tick initialization flag
    pub fn clear_tick_initialized(&mut self, tick_index: i32, tick_spacing: u16) -> Result<()> {
        let offset = self.tick_offset(tick_index, tick_spacing)?;
        self.initialized_bitmap &= !(1 << offset);
        Ok(())
    }

    /// Find the next initialized tick within this array
    pub fn next_initialized_tick(
        &self,
        tick_index: i32,
        tick_spacing: u16,
        zero_for_one: bool,
    ) -> Result<(i32, bool)> {
        let offset = self.tick_offset(tick_index, tick_spacing)?;

        if zero_for_one {
            for i in (0..=offset).rev() {
                if (self.initialized_bitmap >> i) & 1 == 1 {
                    let found_tick = self.start_tick_index + (i as i32) * (tick_spacing as i32);
                    return Ok((found_tick, true));
                }
            }
        } else {
            for i in offset..TICK_ARRAY_SIZE {
                if (self.initialized_bitmap >> i) & 1 == 1 {
                    let found_tick = self.start_tick_index + (i as i32) * (tick_spacing as i32);
                    return Ok((found_tick, true));
                }
            }
        }

        let boundary_tick = if zero_for_one {
            self.start_tick_index
        } else {
            self.start_tick_index + (TICK_ARRAY_SIZE as i32 - 1) * (tick_spacing as i32)
        };
        Ok((boundary_tick, false))
    }

    /// Update tick and return whether the tick was flipped
    pub fn update_tick(
        &mut self,
        tick_index: i32,
        tick_spacing: u16,
        tick_current: i32,
        liquidity_delta: i128,
        fee_growth_global_a_x128: u128,
        fee_growth_global_b_x128: u128,
        upper: bool,
    ) -> Result<bool> {
        let tick = self.get_tick_mut(tick_index, tick_spacing)?;
        let flipped = tick.update(
            tick_current,
            tick_index,
            liquidity_delta,
            fee_growth_global_a_x128,
            fee_growth_global_b_x128,
            upper,
        )?;

        if flipped {
            if tick.is_initialized() {
                self.set_tick_initialized(tick_index, tick_spacing)?;
            } else {
                self.clear_tick_initialized(tick_index, tick_spacing)?;
            }
        }

        Ok(flipped)
    }
}
