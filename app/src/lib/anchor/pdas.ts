import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "../constants";

/**
 * Convert a signed i32 to little-endian bytes
 * This is critical for PDA derivation with tick indices
 */
export function i32ToLeBytes(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(value, 0);
  return buf;
}

/**
 * Convert a u32 to little-endian bytes
 */
export function u32ToLeBytes(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

/**
 * Get the config PDA
 */
export function getConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
}

/**
 * Get the fee tier PDA
 */
export function getFeeTierPda(feeRate: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fee_tier"), u32ToLeBytes(feeRate)],
    PROGRAM_ID
  );
}

/**
 * Get the pool PDA
 */
export function getPoolPda(
  tokenMintA: PublicKey,
  tokenMintB: PublicKey,
  feeRate: number
): [PublicKey, number] {
  // Ensure tokens are in correct order (A < B lexicographically)
  const [mintA, mintB] = orderTokenMints(tokenMintA, tokenMintB);

  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), mintA.toBuffer(), mintB.toBuffer(), u32ToLeBytes(feeRate)],
    PROGRAM_ID
  );
}

/**
 * Get the pool vault PDA
 */
export function getPoolVaultPda(pool: PublicKey, tokenMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault"), pool.toBuffer(), tokenMint.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Get the tick array PDA
 */
export function getTickArrayPda(pool: PublicKey, startTickIndex: number): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("tick_array"), pool.toBuffer(), i32ToLeBytes(startTickIndex)],
    PROGRAM_ID
  );
}

/**
 * Get the position PDA
 */
export function getPositionPda(
  pool: PublicKey,
  owner: PublicKey,
  tickLower: number,
  tickUpper: number
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      pool.toBuffer(),
      owner.toBuffer(),
      i32ToLeBytes(tickLower),
      i32ToLeBytes(tickUpper),
    ],
    PROGRAM_ID
  );
}

/**
 * Order token mints lexicographically (A < B)
 */
export function orderTokenMints(mintA: PublicKey, mintB: PublicKey): [PublicKey, PublicKey] {
  const comparison = mintA.toBuffer().compare(mintB.toBuffer());
  if (comparison < 0) {
    return [mintA, mintB];
  } else if (comparison > 0) {
    return [mintB, mintA];
  }
  throw new Error("Token mints must be different");
}

/**
 * Get tick array start index for a given tick
 */
export function getTickArrayStartIndex(tick: number, tickSpacing: number): number {
  const ticksPerArray = 8 * tickSpacing; // TICK_ARRAY_SIZE * tickSpacing
  return Math.floor(tick / ticksPerArray) * ticksPerArray;
}

/**
 * Get all tick arrays needed for a swap from current tick to target
 */
export function getSwapTickArrays(
  pool: PublicKey,
  currentTick: number,
  tickSpacing: number,
  aToB: boolean,
  count: number = 3
): { pda: PublicKey; startIndex: number }[] {
  const arrays: { pda: PublicKey; startIndex: number }[] = [];
  const ticksPerArray = 8 * tickSpacing;

  let startIndex = getTickArrayStartIndex(currentTick, tickSpacing);

  for (let i = 0; i < count; i++) {
    const [pda] = getTickArrayPda(pool, startIndex);
    arrays.push({ pda, startIndex });

    // Move to next array in swap direction
    if (aToB) {
      startIndex -= ticksPerArray;
    } else {
      startIndex += ticksPerArray;
    }
  }

  return arrays;
}
