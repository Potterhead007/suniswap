/**
 * Add Liquidity to Existing Devnet Pool
 *
 * This script handles the case where current tick may be at extreme values
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Suniswap } from "../target/types/suniswap";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  Connection,
  clusterApiUrl,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

const PROGRAM_ID = new PublicKey("D3mEetFkLuB1sia8Bvvv2nmt9k6RsJPAGR2PE6tj7EFq");
const TICK_ARRAY_SIZE = 8;
const TICK_SPACING = 60;
const MAX_TICK = 443636;
const MIN_TICK = -443636;

function i32ToLeBytes(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(value, 0);
  return buf;
}

async function main() {
  console.log("Adding liquidity to devnet pool...\n");

  const poolInfo = JSON.parse(fs.readFileSync("./devnet-pool.json", "utf-8"));
  console.log("Pool:", poolInfo.poolAddress);

  const walletPath = `${os.homedir()}/.config/solana/id.json`;
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("./target/idl/suniswap.json", "utf-8"));
  const program = new Program(idl, provider) as Program<Suniswap>;

  const poolPda = new PublicKey(poolInfo.poolAddress);
  const mintA = new PublicKey(poolInfo.tokenA);
  const mintB = new PublicKey(poolInfo.tokenB);

  // Fetch pool to get current tick
  const poolAccount = await program.account.pool.fetch(poolPda);
  const currentTick = poolAccount.tickCurrent;
  console.log("Current tick:", currentTick);
  console.log("Sqrt price:", poolAccount.sqrtPriceX64.toString());

  // Derive PDAs
  const [vaultA] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault"), poolPda.toBuffer(), mintA.toBuffer()],
    PROGRAM_ID
  );
  const [vaultB] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault"), poolPda.toBuffer(), mintB.toBuffer()],
    PROGRAM_ID
  );

  // Get user token accounts
  const tokenAccounts = await connection.getTokenAccountsByOwner(wallet.publicKey, {
    programId: TOKEN_PROGRAM_ID,
  });

  let userTokenA: PublicKey | null = null;
  let userTokenB: PublicKey | null = null;

  for (const { pubkey, account } of tokenAccounts.value) {
    const data = account.data;
    const mint = new PublicKey(data.slice(0, 32));
    if (mint.equals(mintA)) userTokenA = pubkey;
    if (mint.equals(mintB)) userTokenB = pubkey;
  }

  if (!userTokenA || !userTokenB) {
    console.error("Could not find user token accounts");
    process.exit(1);
  }

  console.log("User Token A:", userTokenA.toBase58());
  console.log("User Token B:", userTokenB.toBase58());

  const ticksPerArray = TICK_ARRAY_SIZE * TICK_SPACING;

  const getTickArrayPda = (startIndex: number) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tick_array"), poolPda.toBuffer(), i32ToLeBytes(startIndex)],
      PROGRAM_ID
    );
    return pda;
  };

  // Use position around tick 0 (where the actual price is)
  // The sqrt_price = 2^64 means price = 1.0, which is tick 0
  // But the stored tick_current seems wrong - let's work around it

  // Position around tick 0 (price = 1.0)
  const TICK_LOWER = -120;  // Aligned to tick spacing 60
  const TICK_UPPER = 120;

  console.log(`\nPosition range: [${TICK_LOWER}, ${TICK_UPPER}]`);

  // Calculate tick array starts
  const tickArrayLowerStart = Math.floor(TICK_LOWER / ticksPerArray) * ticksPerArray;
  const tickArrayUpperStart = Math.floor(TICK_UPPER / ticksPerArray) * ticksPerArray;

  console.log(`Lower tick array start: ${tickArrayLowerStart}`);
  console.log(`Upper tick array start: ${tickArrayUpperStart}`);

  const tickArrayLowerPda = getTickArrayPda(tickArrayLowerStart);
  const tickArrayUpperPda = getTickArrayPda(tickArrayUpperStart);

  // Ensure tick arrays exist
  for (const [start, label] of [[tickArrayLowerStart, "lower"], [tickArrayUpperStart, "upper"]] as const) {
    const pda = getTickArrayPda(start);
    const accountInfo = await connection.getAccountInfo(pda);
    if (!accountInfo) {
      console.log(`Initializing ${label} tick array at ${start}...`);
      try {
        const tx = await program.methods
          .initializeTickArray(start)
          .accountsStrict({
            pool: poolPda,
            tickArray: pda,
            payer: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        console.log(`  TX: ${tx.slice(0, 8)}...`);
      } catch (e: any) {
        console.log(`  Error: ${e.message?.slice(0, 50)}`);
      }
    } else {
      console.log(`${label} tick array at ${start} already exists`);
    }
  }

  // Open position if needed
  const [positionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      poolPda.toBuffer(),
      wallet.publicKey.toBuffer(),
      i32ToLeBytes(TICK_LOWER),
      i32ToLeBytes(TICK_UPPER),
    ],
    PROGRAM_ID
  );

  const positionInfo = await connection.getAccountInfo(positionPda);
  if (!positionInfo) {
    console.log("\nOpening position...");
    try {
      const tx = await program.methods
        .openPosition(TICK_LOWER, TICK_UPPER)
        .accountsStrict({
          pool: poolPda,
          position: positionPda,
          owner: wallet.publicKey,
          payer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`  TX: ${tx.slice(0, 8)}...`);
    } catch (e: any) {
      console.log(`  Error: ${e.message?.slice(0, 80)}`);
    }
  } else {
    console.log("\nPosition already exists");
  }

  // The current tick is outside position range, so we should only need token B
  // (when current tick > upper tick, position only holds token B)
  // But if sqrt_price indicates tick 0, then we need both tokens

  // Try with very generous maxes
  console.log("\nAdding liquidity...");

  const liquidityDelta = new BN("10000000"); // 10M liquidity
  const amountAMax = new BN("10000000000000"); // All token A available (10k with 9 decimals)
  const amountBMax = new BN("10000000000"); // All token B available (10k with 6 decimals)

  try {
    const tx = await program.methods
      .increaseLiquidity(liquidityDelta, amountAMax, amountBMax)
      .accountsStrict({
        pool: poolPda,
        position: positionPda,
        tickArrayLower: tickArrayLowerPda,
        tickArrayUpper: tickArrayUpperPda,
        tokenMintA: mintA,
        tokenMintB: mintB,
        tokenVaultA: vaultA,
        tokenVaultB: vaultB,
        userTokenA: userTokenA,
        userTokenB: userTokenB,
        owner: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("SUCCESS! TX:", tx);

    const poolAccountFinal = await program.account.pool.fetch(poolPda);
    const positionAccount = await program.account.position.fetch(positionPda);

    console.log("\nPool liquidity:", poolAccountFinal.liquidity.toString());
    console.log("Position liquidity:", positionAccount.liquidity.toString());

  } catch (error: any) {
    console.log("Error:", error.message);

    // If still failing, try reading raw account data
    console.log("\nDebug: Reading raw pool data...");
    const poolAccountInfo = await connection.getAccountInfo(poolPda);
    if (poolAccountInfo) {
      const data = poolAccountInfo.data;
      // Skip 8-byte discriminator
      const sqrtPrice = data.readBigUInt64LE(8);
      const sqrtPriceHigh = data.readBigUInt64LE(16);
      const tickOffset = 80 + 8; // After discriminator + fields
      const tickRaw = data.readInt32LE(tickOffset);
      console.log(`Raw tick at offset ${tickOffset}: ${tickRaw}`);
    }
  }
}

main().catch(console.error);
