import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Connection, clusterApiUrl, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";

const PROGRAM_ID = new PublicKey("D3mEetFkLuB1sia8Bvvv2nmt9k6RsJPAGR2PE6tj7EFq");

function i32ToLeBytes(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(value, 0);
  return buf;
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
  const tickSpacing = poolInfo.tickSpacing;

  // Get pool state
  const poolAccount = await (program.account as any).pool.fetch(poolPda);
  console.log("=== Pool State ===");
  console.log("sqrt_price_x64:", poolAccount.sqrtPriceX64.toString());
  console.log("tick_current:", poolAccount.tickCurrent);
  console.log("liquidity:", poolAccount.liquidity.toString());

  // Check tick arrays and their ticks
  const ticksPerArray = 8;

  for (const startTick of [-1600, 0]) {
    const [tickArrayPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tick_array"), poolPda.toBuffer(), i32ToLeBytes(startTick)],
      PROGRAM_ID
    );

    try {
      const tickArray = await (program.account as any).tickArray.fetch(tickArrayPda);
      console.log(`\n=== Tick Array at ${startTick} ===`);
      console.log("start_tick_index:", tickArray.startTickIndex);

      // Iterate through ticks in the array
      for (let i = 0; i < ticksPerArray; i++) {
        const tick = tickArray.ticks[i];
        const tickIndex = startTick + i * tickSpacing;
        if (tick.initialized || tick.liquidityGross.toString() !== "0") {
          console.log(`  Tick ${tickIndex}:`);
          console.log(`    initialized: ${tick.initialized}`);
          console.log(`    liquidity_gross: ${tick.liquidityGross.toString()}`);
          console.log(`    liquidity_net: ${tick.liquidityNet.toString()}`);
        }
      }
    } catch (e: any) {
      console.log(`Tick array at ${startTick} not found or error:`, e.message);
    }
  }
}

main().catch(console.error);
