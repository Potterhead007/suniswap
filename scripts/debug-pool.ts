/**
 * Debug Devnet Pool State
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Suniswap } from "../target/types/suniswap";
import { PublicKey, Keypair, Connection, clusterApiUrl } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAccount } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

const PROGRAM_ID = new PublicKey("D3mEetFkLuB1sia8Bvvv2nmt9k6RsJPAGR2PE6tj7EFq");
const TICK_ARRAY_SIZE = 8;
const TICK_SPACING = 60;

function i32ToLeBytes(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(value, 0);
  return buf;
}

async function main() {
  console.log("=".repeat(60));
  console.log("Debugging Devnet Pool State");
  console.log("=".repeat(60));

  const poolInfo = JSON.parse(fs.readFileSync("./devnet-pool.json", "utf-8"));

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

  // Fetch pool state
  console.log("\n1. Pool State:");
  const poolAccount = await program.account.pool.fetch(poolPda);
  console.log(`   Address: ${poolPda.toBase58()}`);
  console.log(`   Current tick: ${poolAccount.tickCurrent}`);
  console.log(`   Tick spacing: ${poolAccount.tickSpacing}`);
  console.log(`   Liquidity: ${poolAccount.liquidity.toString()}`);
  console.log(`   Sqrt price: ${poolAccount.sqrtPriceX64.toString()}`);

  // Fetch user balances
  console.log("\n2. User Token Balances:");
  const tokenAccounts = await connection.getTokenAccountsByOwner(wallet.publicKey, {
    programId: TOKEN_PROGRAM_ID,
  });

  for (const { pubkey, account } of tokenAccounts.value) {
    const data = account.data;
    const mint = new PublicKey(data.slice(0, 32));
    if (mint.equals(mintA) || mint.equals(mintB)) {
      const tokenAccount = await getAccount(connection, pubkey);
      const label = mint.equals(mintA) ? "Token A" : "Token B";
      console.log(`   ${label}: ${tokenAccount.amount.toString()} (account: ${pubkey.toBase58().slice(0, 8)}...)`);
    }
  }

  // Check tick arrays
  console.log("\n3. Tick Arrays:");
  const ticksPerArray = TICK_ARRAY_SIZE * TICK_SPACING;
  console.log(`   Ticks per array: ${ticksPerArray}`);

  const tickArrayStarts = [-960, -480, 0, 480];
  for (const start of tickArrayStarts) {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tick_array"), poolPda.toBuffer(), i32ToLeBytes(start)],
      PROGRAM_ID
    );

    try {
      const accountInfo = await connection.getAccountInfo(pda);
      if (accountInfo) {
        console.log(`   [${start}]: EXISTS (${pda.toBase58().slice(0, 12)}...)`);
      } else {
        console.log(`   [${start}]: NOT INITIALIZED`);
      }
    } catch {
      console.log(`   [${start}]: ERROR`);
    }
  }

  // Position calculations
  console.log("\n4. Position Calculations:");
  const TICK_LOWER = -120;
  const TICK_UPPER = 120;

  const tickArrayLowerStart = Math.floor(TICK_LOWER / ticksPerArray) * ticksPerArray;
  const tickArrayUpperStart = Math.floor(TICK_UPPER / ticksPerArray) * ticksPerArray;

  console.log(`   Position range: [${TICK_LOWER}, ${TICK_UPPER}]`);
  console.log(`   Lower tick array start: ${tickArrayLowerStart}`);
  console.log(`   Upper tick array start: ${tickArrayUpperStart}`);

  // Check if position exists
  console.log("\n5. Position State:");
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

  try {
    const positionAccount = await program.account.position.fetch(positionPda);
    console.log(`   Address: ${positionPda.toBase58()}`);
    console.log(`   Tick range: [${positionAccount.tickLower}, ${positionAccount.tickUpper}]`);
    console.log(`   Liquidity: ${positionAccount.liquidity.toString()}`);
    console.log(`   Tokens owed A: ${positionAccount.tokensOwedA.toString()}`);
    console.log(`   Tokens owed B: ${positionAccount.tokensOwedB.toString()}`);
  } catch (e: any) {
    console.log(`   Position not found or error: ${e.message?.slice(0, 50)}`);
  }

  // Calculate required amounts for liquidity
  console.log("\n6. Liquidity Math:");
  console.log("   For centered position at price=1.0 with tick spacing 60:");
  console.log("   - Both tokens needed in roughly equal amounts (adjusted for decimals)");
  console.log("   - Token A has 6 decimals, Token B has 9 decimals");
  console.log("   - Recommended: try smaller liquidity with larger max amounts");

  // Check vault balances
  console.log("\n7. Vault Balances:");
  const [vaultA] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault"), poolPda.toBuffer(), mintA.toBuffer()],
    PROGRAM_ID
  );
  const [vaultB] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault"), poolPda.toBuffer(), mintB.toBuffer()],
    PROGRAM_ID
  );

  try {
    const vaultAAccount = await getAccount(connection, vaultA);
    const vaultBAccount = await getAccount(connection, vaultB);
    console.log(`   Vault A: ${vaultAAccount.amount.toString()}`);
    console.log(`   Vault B: ${vaultBAccount.amount.toString()}`);
  } catch (e: any) {
    console.log(`   Vault error: ${e.message?.slice(0, 50)}`);
  }
}

main().catch(console.error);
