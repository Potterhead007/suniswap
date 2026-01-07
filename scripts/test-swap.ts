import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, Connection, clusterApiUrl, ComputeBudgetProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

const PROGRAM_ID = new PublicKey("D3mEetFkLuB1sia8Bvvv2nmt9k6RsJPAGR2PE6tj7EFq");

function i32ToLeBytes(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(value, 0);
  return buf;
}

async function main() {
  console.log("Testing swap on SuniSwap...\n");

  const poolInfo = JSON.parse(fs.readFileSync("./devnet-pool-v3.json", "utf-8"));
  const walletPath = os.homedir() + "/.config/solana/id.json";
  const payer = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))));

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync("./target/idl/suniswap.json", "utf-8"));
  const program = new Program(idl, provider);

  const poolPda = new PublicKey(poolInfo.poolAddress);
  const mintA = new PublicKey(poolInfo.tokenA);
  const mintB = new PublicKey(poolInfo.tokenB);
  const tickSpacing = poolInfo.tickSpacing;

  console.log("Pool:", poolPda.toBase58());
  console.log("Token A:", mintA.toBase58());
  console.log("Token B:", mintB.toBase58());

  // Get pool state
  const poolAccount = await (program.account as any).pool.fetch(poolPda);
  console.log("\n=== Pool State Before ===");
  console.log("sqrt_price_x64:", poolAccount.sqrtPriceX64.toString());
  console.log("tick_current:", poolAccount.tickCurrent);
  console.log("liquidity:", poolAccount.liquidity.toString());

  // Get fee tier
  const [feeTierPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("fee_tier"), i32ToLeBytes(poolInfo.feeRate)],
    PROGRAM_ID
  );

  // Get vaults
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
    console.error("Missing token accounts");
    return;
  }

  // Get balances before swap
  const balanceABefore = await connection.getTokenAccountBalance(userTokenA);
  const balanceBBefore = await connection.getTokenAccountBalance(userTokenB);
  console.log("\n=== User Balances Before ===");
  console.log("Token A:", balanceABefore.value.uiAmountString);
  console.log("Token B:", balanceBBefore.value.uiAmountString);

  // Calculate tick arrays for swap
  // For a_to_b (zero_for_one), tick arrays must be in descending order: start_0 >= start_1 >= start_2
  // For b_to_a (!zero_for_one), tick arrays must be in ascending order
  const ticksPerArray = 8 * tickSpacing; // 1600
  const tickArrayStart0 = Math.floor(poolAccount.tickCurrent / ticksPerArray) * ticksPerArray;

  // For a_to_b swap, we're going left (price decreasing), so need arrays in descending order
  const a_to_b = true;
  const tickArrayStart1 = a_to_b ? tickArrayStart0 - ticksPerArray : tickArrayStart0 + ticksPerArray;
  const tickArrayStart2 = a_to_b ? tickArrayStart1 - ticksPerArray : tickArrayStart1 + ticksPerArray;

  console.log("\n=== Tick Arrays (for a_to_b=" + a_to_b + ") ===");
  console.log("tickArrayStart0:", tickArrayStart0);
  console.log("tickArrayStart1:", tickArrayStart1);
  console.log("tickArrayStart2:", tickArrayStart2);

  const [tickArrayPda0] = PublicKey.findProgramAddressSync(
    [Buffer.from("tick_array"), poolPda.toBuffer(), i32ToLeBytes(tickArrayStart0)],
    PROGRAM_ID
  );
  const [tickArrayPda1] = PublicKey.findProgramAddressSync(
    [Buffer.from("tick_array"), poolPda.toBuffer(), i32ToLeBytes(tickArrayStart1)],
    PROGRAM_ID
  );
  const [tickArrayPda2] = PublicKey.findProgramAddressSync(
    [Buffer.from("tick_array"), poolPda.toBuffer(), i32ToLeBytes(tickArrayStart2)],
    PROGRAM_ID
  );

  // Swap: token A -> token B (a_to_b = true)
  const swapAmount = new BN(100000); // 0.1 token A (6 decimals)
  const minAmountOut = new BN(0); // minimum output
  const sqrtPriceLimit = new BN(0); // no limit

  console.log("\n=== Executing Swap ===");
  console.log("Swapping", swapAmount.toString(), "token A for token B");

  try {
    const tx = await (program.methods as any)
      .swap({
        amount: swapAmount,
        otherAmountThreshold: minAmountOut,
        sqrtPriceLimitX64: sqrtPriceLimit,
        aToB: true,
      })
      .accountsStrict({
        pool: poolPda,
        feeTier: feeTierPda,
        tokenMintA: mintA,
        tokenMintB: mintB,
        tokenVaultA: vaultA,
        tokenVaultB: vaultB,
        userTokenInput: userTokenA,
        userTokenOutput: userTokenB,
        tickArray0: tickArrayPda0,
        tickArray1: tickArrayPda1,
        tickArray2: tickArrayPda2,
        user: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ])
      .rpc();

    console.log("\nSWAP SUCCESS! TX:", tx);

    // Get balances after swap
    await new Promise(r => setTimeout(r, 2000));
    const balanceAAfter = await connection.getTokenAccountBalance(userTokenA);
    const balanceBAfter = await connection.getTokenAccountBalance(userTokenB);
    console.log("\n=== User Balances After ===");
    console.log("Token A:", balanceAAfter.value.uiAmountString);
    console.log("Token B:", balanceBAfter.value.uiAmountString);

    const poolAfter = await (program.account as any).pool.fetch(poolPda);
    console.log("\n=== Pool State After ===");
    console.log("sqrt_price_x64:", poolAfter.sqrtPriceX64.toString());
    console.log("tick_current:", poolAfter.tickCurrent);

  } catch (e: any) {
    console.error("Swap Error:", e.message);
    if (e.logs) {
      console.log("\n=== Program Logs ===");
      e.logs.forEach((log: string) => console.log(log));
    }
  }
}

main().catch(console.error);
