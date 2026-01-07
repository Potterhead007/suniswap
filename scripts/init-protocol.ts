import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Suniswap } from "../target/types/suniswap";
import { PublicKey, SystemProgram, Keypair, Connection, clusterApiUrl } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";

// Fee tiers to initialize
const FEE_TIERS = [
  { feeRate: 100, tickSpacing: 1 },     // 0.01%
  { feeRate: 500, tickSpacing: 10 },    // 0.05%
  { feeRate: 3000, tickSpacing: 60 },   // 0.30%
  { feeRate: 10000, tickSpacing: 200 }, // 1.00%
];

async function main() {
  console.log("=".repeat(60));
  console.log("SuniSwap Protocol Initialization");
  console.log("=".repeat(60));

  // Load wallet from default Solana CLI location
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

  // Load IDL manually
  const idl = JSON.parse(
    fs.readFileSync("./target/idl/suniswap.json", "utf-8")
  );
  const programId = new PublicKey("D3mEetFkLuB1sia8Bvvv2nmt9k6RsJPAGR2PE6tj7EFq");
  const program = new Program(idl, provider) as Program<Suniswap>;

  console.log(`\nNetwork: ${connection.rpcEndpoint}`);
  console.log(`Program ID: ${programId.toBase58()}`);
  console.log(`Payer: ${wallet.publicKey.toBase58()}`);

  const balance = await connection.getBalance(wallet.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);

  // Derive config PDA
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  );
  console.log(`\nConfig PDA: ${configPda.toBase58()}`);

  // Check if config already exists
  let configExists = false;
  try {
    const existingConfig = await program.account.suniswapConfig.fetch(configPda);
    console.log("\n[SKIP] Config already initialized");
    console.log(`  Protocol Authority: ${existingConfig.protocolAuthority.toBase58()}`);
    console.log(`  Fee Authority: ${existingConfig.feeAuthority.toBase58()}`);
    console.log(`  Protocol Fee Rate: ${existingConfig.defaultProtocolFeeRate}%`);
    console.log(`  Fee Tier Count: ${existingConfig.feeTierCount}`);
    configExists = true;
  } catch (err) {
    // Config doesn't exist, initialize it
    console.log("\n[1/5] Initializing Config...");

    try {
      const tx = await program.methods
        .initializeConfig(10) // 10% protocol fee
        .accountsStrict({
          config: configPda,
          protocolAuthority: wallet.publicKey,
          feeAuthority: wallet.publicKey,
          payer: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`  Transaction: ${tx}`);
      console.log(`  Config initialized successfully!`);
    } catch (initErr: any) {
      console.log(`  Error: ${initErr.message}`);
      throw initErr;
    }
  }

  // Initialize fee tiers
  console.log("\n[2/5] Initializing Fee Tiers...");

  for (const tier of FEE_TIERS) {
    const feeRateBytes = Buffer.alloc(4);
    feeRateBytes.writeUInt32LE(tier.feeRate);

    const [feeTierPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee_tier"), feeRateBytes],
      programId
    );

    try {
      await program.account.feeTier.fetch(feeTierPda);
      console.log(`  [SKIP] Fee tier ${tier.feeRate / 100}% already exists`);
    } catch {
      try {
        const tx = await program.methods
          .initializeFeeTier(tier.feeRate, tier.tickSpacing)
          .accountsStrict({
            config: configPda,
            feeTier: feeTierPda,
            authority: wallet.publicKey,
            payer: wallet.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log(`  [OK] Fee tier ${tier.feeRate / 100}% (tick spacing: ${tier.tickSpacing}) - ${tx.slice(0, 8)}...`);
      } catch (err: any) {
        console.log(`  [ERROR] Fee tier ${tier.feeRate / 100}%: ${err.message}`);
      }
    }
  }

  // Verify final state
  console.log("\n[3/5] Verifying Protocol State...");

  try {
    const config = await program.account.suniswapConfig.fetch(configPda);
    console.log(`  Protocol Authority: ${config.protocolAuthority.toBase58()}`);
    console.log(`  Fee Authority: ${config.feeAuthority.toBase58()}`);
    console.log(`  Protocol Fee Rate: ${config.defaultProtocolFeeRate}%`);
    console.log(`  Fee Tier Count: ${config.feeTierCount}`);
    console.log(`  Pool Creation Paused: ${config.poolCreationPaused}`);
  } catch (err: any) {
    console.log(`  Error fetching config: ${err.message}`);
  }

  console.log("\n[4/5] Listing Fee Tiers...");

  for (const tier of FEE_TIERS) {
    const feeRateBytes = Buffer.alloc(4);
    feeRateBytes.writeUInt32LE(tier.feeRate);

    const [feeTierPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("fee_tier"), feeRateBytes],
      programId
    );

    try {
      const feeTier = await program.account.feeTier.fetch(feeTierPda);
      console.log(`  ${tier.feeRate / 100}%: tick_spacing=${feeTier.tickSpacing}, PDA=${feeTierPda.toBase58().slice(0, 8)}...`);
    } catch {
      console.log(`  ${tier.feeRate / 100}%: NOT FOUND`);
    }
  }

  console.log("\n[5/5] Protocol Initialization Complete!");
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
