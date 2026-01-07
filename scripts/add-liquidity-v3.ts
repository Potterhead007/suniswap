import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, Connection, clusterApiUrl } from "@solana/web3.js";
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
  console.log("Adding liquidity to new pool...\n");

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
  console.log("Tick spacing:", tickSpacing);

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

  // Create position around tick 0 (must be aligned to tick spacing)
  const tickLower = -200;
  const tickUpper = 200;

  const [positionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      poolPda.toBuffer(),
      wallet.publicKey.toBuffer(),
      i32ToLeBytes(tickLower),
      i32ToLeBytes(tickUpper),
    ],
    PROGRAM_ID
  );

  // Open position
  const posInfo = await connection.getAccountInfo(positionPda);
  if (!posInfo) {
    console.log("Opening position [-200, 200]...");
    const tx = await (program.methods as any)
      .openPosition(tickLower, tickUpper)
      .accountsStrict({
        pool: poolPda,
        position: positionPda,
        owner: wallet.publicKey,
        payer: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("TX:", tx.slice(0, 20));
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log("Position exists");
  }

  // Add liquidity
  const ticksPerArray = 8 * tickSpacing;
  const tickArrayLowerStart = Math.floor(tickLower / ticksPerArray) * ticksPerArray;
  const tickArrayUpperStart = Math.floor(tickUpper / ticksPerArray) * ticksPerArray;

  console.log("Tick array lower start:", tickArrayLowerStart);
  console.log("Tick array upper start:", tickArrayUpperStart);

  const [tickArrayLowerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tick_array"), poolPda.toBuffer(), i32ToLeBytes(tickArrayLowerStart)],
    PROGRAM_ID
  );
  const [tickArrayUpperPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tick_array"), poolPda.toBuffer(), i32ToLeBytes(tickArrayUpperStart)],
    PROGRAM_ID
  );

  console.log("\nAdding liquidity...");
  const liquidityDelta = new BN("1000000"); // 1M liquidity
  const amountAMax = new BN("10000000000"); // 10K tokens A (6 decimals)
  const amountBMax = new BN("10000000000000"); // 10K tokens B (9 decimals)

  try {
    const tx = await (program.methods as any)
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

    const poolAccount = await (program.account as any).pool.fetch(poolPda);
    console.log("\n=== Pool State ===");
    console.log("Liquidity:", poolAccount.liquidity.toString());
    console.log("tick_current:", poolAccount.tickCurrent);

  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

main().catch(console.error);
