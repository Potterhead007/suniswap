import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Connection, clusterApiUrl, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";

const PROGRAM_ID = new PublicKey("D3mEetFkLuB1sia8Bvvv2nmt9k6RsJPAGR2PE6tj7EFq");

// Simulate the liquidity math to find where overflow occurs
function simulateLiquidityMath() {
  const q64 = BigInt(1) << BigInt(64);

  // sqrt prices from fixed tick math (these are the values we computed)
  const sp_lower = BigInt("18263205034381099369"); // tick -200
  const sp_current = q64; // tick 0: exactly 2^64
  const sp_upper = BigInt("18632127618364105993"); // tick 200

  const liquidity = BigInt(1000000);

  console.log("\nSimulating liquidity math:");
  console.log("sp_lower:", sp_lower.toString());
  console.log("sp_current:", sp_current.toString());
  console.log("sp_upper:", sp_upper.toString());
  console.log("liquidity:", liquidity.toString());

  // amount_a = get_amount_a_delta(sp_current, sp_upper, liquidity, round_up)
  // numerator = liquidity * (sp_upper - sp_current)
  const diff_a = sp_upper - sp_current;
  console.log("\nAmount A calculation:");
  console.log("sp_upper - sp_current:", diff_a.toString());

  const numerator_a = liquidity * diff_a;
  console.log("liquidity * diff:", numerator_a.toString());

  // denominator = sp_upper * sp_current / Q64
  const sp_product = sp_upper * sp_current;
  console.log("sp_upper * sp_current:", sp_product.toString());
  const max_u128 = (BigInt(1) << BigInt(128)) - BigInt(1);
  console.log("Max u128:", max_u128.toString());

  if (sp_product > max_u128) {
    console.log(">>> OVERFLOW: sp_upper * sp_current doesn't fit in u128!");
  }

  const denominator_a = sp_product / q64;
  console.log("denominator (sp_product / Q64):", denominator_a.toString());

  // result = numerator * Q64 / denominator
  const result_a_num = numerator_a * q64;
  console.log("numerator * Q64:", result_a_num.toString());

  const result_a = result_a_num / denominator_a;
  console.log("result_a:", result_a.toString());

  // amount_b = get_amount_b_delta(sp_lower, sp_current, liquidity, round_up)
  const diff_b = sp_current - sp_lower;
  console.log("\nAmount B calculation:");
  console.log("sp_current - sp_lower:", diff_b.toString());

  // result = mul_div(liquidity, diff, Q64)
  const result_b = (liquidity * diff_b) / q64;
  console.log("result_b:", result_b.toString());
}

async function main() {
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

  const poolAccount = await (program.account as any).pool.fetch(poolPda);

  console.log("Pool:", poolPda.toBase58());
  console.log("sqrt_price_x64:", poolAccount.sqrtPriceX64.toString());
  console.log("tick_current:", poolAccount.tickCurrent);
  console.log("liquidity:", poolAccount.liquidity.toString());
  console.log("tick_spacing:", poolAccount.tickSpacing);

  // Check if sqrt_price is sane (should be close to 2^64 for tick 0)
  const sqrtPrice = BigInt(poolAccount.sqrtPriceX64.toString());
  const q64 = BigInt(1) << BigInt(64);
  const ratio = Number(sqrtPrice) / Number(q64);
  console.log("sqrt_price / Q64 =", ratio, "(should be ~1.0 for tick 0)");

  simulateLiquidityMath();
}

main().catch(console.error);
