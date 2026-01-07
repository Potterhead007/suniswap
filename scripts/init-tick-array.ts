import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, Connection, clusterApiUrl } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";

const PROGRAM_ID = new PublicKey("D3mEetFkLuB1sia8Bvvv2nmt9k6RsJPAGR2PE6tj7EFq");

function i32ToLeBytes(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(value, 0);
  return buf;
}

async function main() {
  const startTick = parseInt(process.argv[2] || "-3200");
  console.log("Initializing tick array at start tick:", startTick);

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

  const [tickArrayPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("tick_array"), poolPda.toBuffer(), i32ToLeBytes(startTick)],
    PROGRAM_ID
  );

  console.log("Pool:", poolPda.toBase58());
  console.log("Tick Array PDA:", tickArrayPda.toBase58());

  // Check if already exists
  const info = await connection.getAccountInfo(tickArrayPda);
  if (info) {
    console.log("Tick array already exists!");
    return;
  }

  try {
    const tx = await (program.methods as any)
      .initializeTickArray(startTick)
      .accountsStrict({
        pool: poolPda,
        tickArray: tickArrayPda,
        payer: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("SUCCESS! TX:", tx);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

main().catch(console.error);
