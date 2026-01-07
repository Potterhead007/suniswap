import { Connection, clusterApiUrl, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, createMintToInstruction } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

async function main() {
  const recipient = new PublicKey("GvKe1u3rxH2bwDbkR9CnSHRsh2sBtqjypSnZocy12kpx");
  const mintA = new PublicKey("2eJCUAkzXv5gAxQaWUk1u7kK4oG7XZ3jB6RrL9xc1buQ");
  const mintB = new PublicKey("GdLm7VEXzHZyUQDL8r2TgvTMDSN44wjcrZbu4dme4mue");

  const walletPath = os.homedir() + "/.config/solana/id.json";
  const payer = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))));

  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

  console.log("Minting tokens to:", recipient.toBase58());

  const ataA = await getAssociatedTokenAddress(mintA, recipient);
  const ataB = await getAssociatedTokenAddress(mintB, recipient);

  const tx = new Transaction();

  const ataAInfo = await connection.getAccountInfo(ataA);
  if (!ataAInfo) {
    console.log("Creating sUSDC token account...");
    tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, ataA, recipient, mintA));
  }

  const ataBInfo = await connection.getAccountInfo(ataB);
  if (!ataBInfo) {
    console.log("Creating SUNI token account...");
    tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, ataB, recipient, mintB));
  }

  tx.add(createMintToInstruction(mintA, ataA, payer.publicKey, 1000_000_000));
  tx.add(createMintToInstruction(mintB, ataB, payer.publicKey, 1000_000_000_000));

  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log("\nSuccess! TX:", sig);
  console.log("\nMinted to your wallet:");
  console.log("  1000 sUSDC");
  console.log("  1000 SUNI");
}

main().catch(console.error);
