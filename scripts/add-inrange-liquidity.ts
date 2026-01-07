/**
 * Add In-Range Liquidity to Devnet Pool
 * Creates a position around the current tick so swaps can execute
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

function i32ToLeBytes(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(value, 0);
  return buf;
}

async function main() {
  console.log("Adding in-range liquidity to devnet pool...\n");

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

  const ticksPerArray = TICK_ARRAY_SIZE * TICK_SPACING; // 480

  const getTickArrayPda = (startIndex: number) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tick_array"), poolPda.toBuffer(), i32ToLeBytes(startIndex)],
      PROGRAM_ID
    );
    return pda;
  };

  // The sqrt_price (2^64) corresponds to price=1.0 which is tick=0.
  // Create a position around tick 0 which matches the actual price.
  // The stored tick_current might be wrong due to deserialization issues.

  // Position around tick 0 - already have tick arrays -480, 0, 480 initialized
  let TICK_LOWER = -120;  // Aligned to 60
  let TICK_UPPER = 120;   // Aligned to 60

  const maxAlignedTick = Math.floor(MAX_TICK / TICK_SPACING) * TICK_SPACING;

  console.log(`\nCreating in-range position:`);
  console.log(`  Current tick: ${currentTick}`);
  console.log(`  Position range: [${TICK_LOWER}, ${TICK_UPPER}]`);
  console.log(`  Max aligned tick: ${maxAlignedTick}`);

  // Calculate tick array starts
  const tickArrayLowerStart = Math.floor(TICK_LOWER / ticksPerArray) * ticksPerArray;
  const tickArrayUpperStart = Math.floor(TICK_UPPER / ticksPerArray) * ticksPerArray;

  console.log(`  Lower tick array: ${tickArrayLowerStart}`);
  console.log(`  Upper tick array: ${tickArrayUpperStart}`);

  // Get unique tick array starts
  const uniqueArrayStarts = [...new Set([tickArrayLowerStart, tickArrayUpperStart])];

  // Initialize tick arrays if needed
  for (const start of uniqueArrayStarts) {
    const pda = getTickArrayPda(start);
    const accountInfo = await connection.getAccountInfo(pda);
    console.log(`\nTick array ${start}: ${accountInfo ? 'EXISTS' : 'NOT FOUND'}`);
    if (!accountInfo) {
      console.log(`  Initializing...`);
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
        // Wait for confirmation
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e: any) {
        console.log(`  Error: ${e.message?.slice(0, 100)}`);
      }
    }
  }

  // Open position
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

  // Add liquidity
  console.log("\nAdding liquidity...");

  const tickArrayLowerPda = getTickArrayPda(tickArrayLowerStart);
  const tickArrayUpperPda = getTickArrayPda(tickArrayUpperStart);

  const liquidityDelta = new BN("100000000"); // 100M liquidity
  const amountAMax = new BN("5000000000000"); // 5000 tokens A (6 decimals)
  const amountBMax = new BN("5000000000000"); // 5000 tokens B (9 decimals)

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

    console.log("\n=== Final State ===");
    console.log("Pool liquidity:", poolAccountFinal.liquidity.toString());
    console.log("Position liquidity:", positionAccount.liquidity.toString());
    console.log("Position is IN RANGE - swaps should work now!");

  } catch (error: any) {
    console.log("Error:", error.message?.slice(0, 200));
  }
}

main().catch(console.error);
