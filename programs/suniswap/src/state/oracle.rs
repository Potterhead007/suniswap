use anchor_lang::prelude::*;

/// Oracle observation - stores TWAP data points
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Debug, Copy)]
pub struct Observation {
    /// Block timestamp of the observation
    pub block_timestamp: u32,

    /// Cumulative tick value (tick * time elapsed)
    pub tick_cumulative: i64,

    /// Cumulative seconds per liquidity (time / liquidity)
    pub seconds_per_liquidity_cumulative_x64: u128,

    /// Whether this observation has been initialized
    pub initialized: bool,
}

impl Observation {
    pub const LEN: usize =
        4 +     // block_timestamp
        8 +     // tick_cumulative
        16 +    // seconds_per_liquidity_cumulative_x64
        1;      // initialized
}

/// Oracle account - stores multiple observations for TWAP calculations
/// PDA: ["oracle", pool]
#[account]
pub struct Oracle {
    /// The pool this oracle belongs to
    pub pool: Pubkey,

    /// Current observation index
    pub observation_index: u16,

    /// Number of populated observations
    pub observation_cardinality: u16,

    /// Target cardinality (for expansion)
    pub observation_cardinality_next: u16,

    /// Bump seed for PDA derivation
    pub bump: u8,

    /// Array of observations (reduced for Solana stack limits)
    /// For production, use zero-copy accounts to support larger arrays (256+ standard)
    pub observations: [Observation; 32],
}

impl Oracle {
    pub const BASE_LEN: usize = 8 +   // discriminator
        32 +                           // pool
        2 +                            // observation_index
        2 +                            // observation_cardinality
        2 +                            // observation_cardinality_next
        1;                             // bump

    /// Calculate account size for a given cardinality
    pub fn size(cardinality: u16) -> usize {
        Self::BASE_LEN + (Observation::LEN * cardinality as usize)
    }

    /// Initialize the oracle with first observation
    pub fn initialize(&mut self, timestamp: u32) {
        self.observations[0] = Observation {
            block_timestamp: timestamp,
            tick_cumulative: 0,
            seconds_per_liquidity_cumulative_x64: 0,
            initialized: true,
        };
        self.observation_cardinality = 1;
        self.observation_cardinality_next = 1;
    }

    /// Write a new observation
    pub fn write(
        &mut self,
        timestamp: u32,
        tick: i32,
        liquidity: u128,
    ) -> (u16, u16) {
        let last = &self.observations[self.observation_index as usize];

        // Early return if same timestamp
        if timestamp == last.block_timestamp {
            return (self.observation_index, self.observation_cardinality);
        }

        let time_delta = timestamp.wrapping_sub(last.block_timestamp);

        // Calculate new cumulative values
        let tick_cumulative = last.tick_cumulative
            .wrapping_add((tick as i64).wrapping_mul(time_delta as i64));

        let seconds_per_liquidity_cumulative_x64 = if liquidity > 0 {
            last.seconds_per_liquidity_cumulative_x64
                .wrapping_add(
                    ((time_delta as u128) << 64) / liquidity
                )
        } else {
            last.seconds_per_liquidity_cumulative_x64
        };

        // Determine new index (wrap around)
        let new_index = (self.observation_index + 1) % self.observation_cardinality_next;

        // Write observation
        self.observations[new_index as usize] = Observation {
            block_timestamp: timestamp,
            tick_cumulative,
            seconds_per_liquidity_cumulative_x64,
            initialized: true,
        };

        // Update cardinality if expanding
        let new_cardinality = if new_index + 1 > self.observation_cardinality {
            new_index + 1
        } else {
            self.observation_cardinality
        };

        self.observation_index = new_index;
        self.observation_cardinality = new_cardinality;

        (new_index, new_cardinality)
    }

    /// Expand oracle cardinality (allocate more observation slots)
    pub fn grow(&mut self, cardinality_next: u16) {
        if cardinality_next > self.observation_cardinality_next {
            self.observation_cardinality_next = cardinality_next;
        }
    }

    /// Get observation at a specific timestamp using binary search
    pub fn observe_single(
        &self,
        target_timestamp: u32,
        tick: i32,
        liquidity: u128,
        current_timestamp: u32,
    ) -> Result<(i64, u128)> {
        let observation = self.get_observation_at_or_before(
            target_timestamp,
            tick,
            liquidity,
            current_timestamp,
        )?;
        Ok((observation.tick_cumulative, observation.seconds_per_liquidity_cumulative_x64))
    }

    /// Binary search for observation at or before target timestamp
    fn get_observation_at_or_before(
        &self,
        target: u32,
        tick: i32,
        liquidity: u128,
        _current_timestamp: u32,
    ) -> Result<Observation> {
        let last = &self.observations[self.observation_index as usize];

        // If target is at or after most recent, extrapolate
        if target >= last.block_timestamp {
            if target == last.block_timestamp {
                return Ok(*last);
            }
            return Ok(self.transform(last, target, tick, liquidity));
        }

        // Binary search through observations
        let oldest_index = (self.observation_index + 1) % self.observation_cardinality;
        let oldest = &self.observations[oldest_index as usize];

        if target < oldest.block_timestamp {
            return Err(crate::errors::SuniswapError::OracleObservationStale.into());
        }

        // Perform binary search
        let (before_or_at, _at_or_after) = self.binary_search(target, oldest_index)?;
        Ok(before_or_at)
    }

    /// Transform an observation to a target timestamp
    fn transform(
        &self,
        observation: &Observation,
        target_timestamp: u32,
        tick: i32,
        liquidity: u128,
    ) -> Observation {
        let time_delta = target_timestamp.wrapping_sub(observation.block_timestamp);

        let tick_cumulative = observation.tick_cumulative
            .wrapping_add((tick as i64).wrapping_mul(time_delta as i64));

        let seconds_per_liquidity_cumulative_x64 = if liquidity > 0 {
            observation.seconds_per_liquidity_cumulative_x64
                .wrapping_add(((time_delta as u128) << 64) / liquidity)
        } else {
            observation.seconds_per_liquidity_cumulative_x64
        };

        Observation {
            block_timestamp: target_timestamp,
            tick_cumulative,
            seconds_per_liquidity_cumulative_x64,
            initialized: true,
        }
    }

    /// Binary search for surrounding observations
    fn binary_search(
        &self,
        target: u32,
        oldest_index: u16,
    ) -> Result<(Observation, Observation)> {
        let mut left = oldest_index;
        let mut right = if self.observation_index >= oldest_index {
            self.observation_index
        } else {
            self.observation_index + self.observation_cardinality
        };

        while left < right {
            let mid = (left + right + 1) / 2;
            let mid_index = mid % self.observation_cardinality;
            let observation = &self.observations[mid_index as usize];

            if observation.block_timestamp <= target {
                left = mid;
            } else {
                right = mid - 1;
            }
        }

        let left_index = left % self.observation_cardinality;
        let right_index = (left + 1) % self.observation_cardinality;

        Ok((
            self.observations[left_index as usize],
            self.observations[right_index as usize],
        ))
    }
}
