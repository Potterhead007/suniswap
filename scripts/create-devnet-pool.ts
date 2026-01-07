/**
 * Create Test Pool on Devnet
 *
 * This script creates test tokens and initializes a pool on devnet.
 * Usage: npx ts-node scripts/create-devnet-pool.ts
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
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

// Program constants
const PROGRAM_ID = new PublicKey("D3mEetFkLuB1sia8Bvvv2nmt9k6RsJPAGR2PE6tj7EFq");
const FEE_RATE = 3000; // 0.3%
const TICK_SPACING = 60;
const TICK_ARRAY_SIZE = 8;

// Initial sqrt price for price = 1.0 (tick 0)
// sqrt_price_x64 = sqrt(1.0001^0) * 2^64 = 1 * 2^64
const INITIAL_SQRT_PRICE = new BN("18446744073709551616"); // 2^64

// Helper to convert signed i32 to little-endian bytes
function i32ToLeBytes(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(value, 0);
  return buf;
}

// Helper to convert u32 to little-endian bytes
function u32ToLeBytes(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

async function main() {
  console.log("=".repeat(60));
  console.log("SuniSwap Devnet Pool Creation");
  console.log("=".repeat(60));

  // Load wallet
  const walletPath = `${os.homedir()}/.config/solana/id.json`;
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  // Connect to devnet
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load program
  const idl = JSON.parse(
    fs.readFileSync("./target/idl/suniswap.json", "utf-8")
  );
  const program = new Program(idl, provider) as Program<Suniswap>;

  console.log(`\nNetwork: devnet`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`Payer: ${wallet.publicKey.toBase58()}`);

  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);

  if (balance < 0.5 * 1e9) {
    console.error("\n[ERROR] Insufficient balance. Need at least 0.5 SOL.");
    process.exit(1);
  }

  // Derive config PDA
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID
  );

  // Derive fee tier PDA
  const [feeTierPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_tier"), u32ToLeBytes(FEE_RATE)],
    PROGRAM_ID
  );

  // Step 1: Create test tokens
  console.log("\n[1/6] Creating test tokens...");

  let mintA: PublicKey;
  let mintB: PublicKey;

  try {
    // Create SUNI token
    const suniMint = await createMint(
      connection,
      walletKeypair,
      wallet.publicKey,
      null,
      9 // 9 decimals
    );
    console.log(`  SUNI Token: ${suniMint.toBase58()}`);

    // Create sUSDC token
    const usdcMint = await createMint(
      connection,
      walletKeypair,
      wallet.publicKey,
      null,
      6 // 6 decimals like real USDC
    );
    console.log(`  sUSDC Token: ${usdcMint.toBase58()}`);

    // Order mints lexicographically (required by protocol)
    if (suniMint.toBuffer().compare(usdcMint.toBuffer()) < 0) {
      mintA = suniMint;
      mintB = usdcMint;
    } else {
      mintA = usdcMint;
      mintB = suniMint;
    }
    console.log(`  Mint A (lexicographically first): ${mintA.toBase58()}`);
    console.log(`  Mint B (lexicographically second): ${mintB.toBase58()}`);

  } catch (error: any) {
    console.error(`  Error creating tokens: ${error.message}`);
    process.exit(1);
  }

  // Step 2: Create user token accounts
  console.log("\n[2/6] Creating token accounts...");

  let userTokenA: PublicKey;
  let userTokenB: PublicKey;

  try {
    userTokenA = await createAccount(
      connection,
      walletKeypair,
      mintA,
      wallet.publicKey
    );
    console.log(`  User Token A account: ${userTokenA.toBase58()}`);

    userTokenB = await createAccount(
      connection,
      walletKeypair,
      mintB,
      wallet.publicKey
    );
    console.log(`  User Token B account: ${userTokenB.toBase58()}`);

  } catch (error: any) {
    console.error(`  Error creating accounts: ${error.message}`);
    process.exit(1);
  }

  // Step 3: Mint initial tokens to user
  console.log("\n[3/6] Minting initial tokens...");

  try {
    // Mint 10,000 of each token
    const mintAmountA = 10_000_000_000_000; // 10k with 9 decimals
    const mintAmountB = 10_000_000_000; // 10k with 6 decimals

    await mintTo(
      connection,
      walletKeypair,
      mintA,
      userTokenA,
      walletKeypair,
      mintAmountA
    );
    console.log(`  Minted 10,000 Token A to user`);

    await mintTo(
      connection,
      walletKeypair,
      mintB,
      userTokenB,
      walletKeypair,
      mintAmountB
    );
    console.log(`  Minted 10,000 Token B to user`);

  } catch (error: any) {
    console.error(`  Error minting: ${error.message}`);
    process.exit(1);
  }

  // Step 4: Initialize pool
  console.log("\n[4/6] Creating pool...");

  const [poolPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      mintA.toBuffer(),
      mintB.toBuffer(),
      u32ToLeBytes(FEE_RATE),
    ],
    PROGRAM_ID
  );

  const [vaultA] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault"), poolPda.toBuffer(), mintA.toBuffer()],
    PROGRAM_ID
  );

  const [vaultB] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault"), poolPda.toBuffer(), mintB.toBuffer()],
    PROGRAM_ID
  );

  console.log(`  Pool PDA: ${poolPda.toBase58()}`);
  console.log(`  Vault A: ${vaultA.toBase58()}`);
  console.log(`  Vault B: ${vaultB.toBase58()}`);

  try {
    const tx = await program.methods
      .initializePool(INITIAL_SQRT_PRICE)
      .accountsStrict({
        config: configPda,
        feeTier: feeTierPda,
        pool: poolPda,
        tokenMintA: mintA,
        tokenMintB: mintB,
        tokenVaultA: vaultA,
        tokenVaultB: vaultB,
        payer: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`  Pool created! TX: ${tx}`);

  } catch (error: any) {
    if (error.message?.includes("already in use")) {
      console.log(`  Pool already exists`);
    } else {
      console.error(`  Error: ${error.message}`);
      process.exit(1);
    }
  }

  // Step 5: Initialize tick arrays
  console.log("\n[5/6] Initializing tick arrays...");

  const getTickArrayPda = (startIndex: number) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("tick_array"),
        poolPda.toBuffer(),
        i32ToLeBytes(startIndex),
      ],
      PROGRAM_ID
    );
    return pda;
  };

  // Initialize tick arrays around tick 0
  const ticksPerArray = TICK_ARRAY_SIZE * TICK_SPACING;
  const arrayStarts = [
    0,                      // Contains tick 0
    -ticksPerArray,         // Below tick 0
    ticksPerArray,          // Above tick 0
  ];

  for (const startIndex of arrayStarts) {
    const tickArrayPda = getTickArrayPda(startIndex);
    try {
      const tx = await program.methods
        .initializeTickArray(startIndex)
        .accountsStrict({
          pool: poolPda,
          tickArray: tickArrayPda,
          payer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`  Tick array [${startIndex}]: ${tx.slice(0, 8)}...`);
    } catch (error: any) {
      if (error.message?.includes("already in use")) {
        console.log(`  Tick array [${startIndex}]: already exists`);
      } else {
        console.log(`  Tick array [${startIndex}] error: ${error.message?.slice(0, 50)}`);
      }
    }
  }

  // Step 6: Add initial liquidity
  console.log("\n[6/6] Adding initial liquidity...");

  // Position around tick 0: -120 to +120
  const TICK_LOWER = -120;
  const TICK_UPPER = 120;

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

  // Open position
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
    console.log(`  Position opened: ${tx.slice(0, 8)}...`);
  } catch (error: any) {
    if (error.message?.includes("already in use")) {
      console.log(`  Position already exists`);
    } else {
      console.log(`  Position error: ${error.message?.slice(0, 80)}`);
    }
  }

  // Add liquidity
  const tickArrayLowerPda = getTickArrayPda(Math.floor(TICK_LOWER / ticksPerArray) * ticksPerArray);
  const tickArrayUpperPda = getTickArrayPda(Math.floor(TICK_UPPER / ticksPerArray) * ticksPerArray);

  try {
    // For price = 1.0 at tick 0, calculate appropriate liquidity
    // With different decimals (9 vs 6), we need balanced amounts
    const liquidityDelta = new BN("1000000000"); // 1e9 liquidity units
    const amountAMax = new BN("1000000000000"); // Max 1000 tokens A (9 decimals)
    const amountBMax = new BN("1000000000"); // Max 1000 tokens B (6 decimals)

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

    console.log(`  Liquidity added: ${tx.slice(0, 8)}...`);

    // Fetch final state
    const poolAccount = await program.account.pool.fetch(poolPda);
    const positionAccount = await program.account.position.fetch(positionPda);

    console.log(`\n  Pool State:`);
    console.log(`    Current tick: ${poolAccount.tickCurrent}`);
    console.log(`    Total liquidity: ${poolAccount.liquidity.toString()}`);

    console.log(`\n  Position State:`);
    console.log(`    Tick range: [${positionAccount.tickLower}, ${positionAccount.tickUpper}]`);
    console.log(`    Liquidity: ${positionAccount.liquidity.toString()}`);

  } catch (error: any) {
    console.log(`  Liquidity error: ${error.message?.slice(0, 200)}`);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Pool Creation Complete!");
  console.log("=".repeat(60));
  console.log(`\nPool Address: ${poolPda.toBase58()}`);
  console.log(`Token A: ${mintA.toBase58()}`);
  console.log(`Token B: ${mintB.toBase58()}`);
  console.log(`Fee Tier: 0.3%`);
  console.log(`\nView on Solscan:`);
  console.log(`  https://solscan.io/account/${poolPda.toBase58()}?cluster=devnet`);

  // Save pool info for frontend
  const poolInfo = {
    poolAddress: poolPda.toBase58(),
    tokenA: mintA.toBase58(),
    tokenB: mintB.toBase58(),
    feeRate: FEE_RATE,
    tickSpacing: TICK_SPACING,
    network: "devnet",
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync("./devnet-pool.json", JSON.stringify(poolInfo, null, 2));
  console.log(`\nPool info saved to devnet-pool.json`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
