import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Suniswap } from "../target/types/suniswap";
import { PublicKey, SystemProgram } from "@solana/web3.js";

// Fee tiers to initialize
const FEE_TIERS = [
  { feeRate: 100, tickSpacing: 1 },     // 0.01%
  { feeRate: 500, tickSpacing: 10 },    // 0.05%
  { feeRate: 3000, tickSpacing: 60 },   // 0.30%
  { feeRate: 10000, tickSpacing: 200 }, // 1.00%
];

module.exports = async function (provider: anchor.AnchorProvider) {
  console.log("=".repeat(60));
  console.log("SuniSwap Protocol Initialization");
  console.log("=".repeat(60));

  anchor.setProvider(provider);

  const program = anchor.workspace.Suniswap as Program<Suniswap>;
  const payer = (provider.wallet as anchor.Wallet).payer;

  console.log(`\nNetwork: ${provider.connection.rpcEndpoint}`);
  console.log(`Program ID: ${program.programId.toBase58()}`);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);

  // Derive config PDA
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
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
  } catch {
    // Config doesn't exist, initialize it
    console.log("\n[1/5] Initializing Config...");

    const tx = await program.methods
      .initializeConfig(10) // 10% protocol fee
      .accounts({
        config: configPda,
        protocolAuthority: payer.publicKey,
        feeAuthority: payer.publicKey,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`  Transaction: ${tx}`);
    console.log(`  Config initialized successfully!`);
  }

  // Initialize fee tiers
  console.log("\n[2/5] Initializing Fee Tiers...");

  for (const tier of FEE_TIERS) {
    const [feeTierPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("fee_tier"),
        Buffer.from(new Uint8Array(new Uint32Array([tier.feeRate]).buffer)),
      ],
      program.programId
    );

    try {
      await program.account.feeTier.fetch(feeTierPda);
      console.log(`  [SKIP] Fee tier ${tier.feeRate / 100}% already exists`);
    } catch {
      try {
        const tx = await program.methods
          .initializeFeeTier(tier.feeRate, tier.tickSpacing)
          .accounts({
            config: configPda,
            feeTier: feeTierPda,
            authority: payer.publicKey,
            payer: payer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log(`  [OK] Fee tier ${tier.feeRate / 100}% (tick spacing: ${tier.tickSpacing}) - ${tx.slice(0, 8)}...`);
      } catch (err) {
        console.log(`  [ERROR] Fee tier ${tier.feeRate / 100}%: ${err}`);
      }
    }
  }

  // Verify final state
  console.log("\n[3/5] Verifying Protocol State...");

  const config = await program.account.suniswapConfig.fetch(configPda);
  console.log(`  Protocol Authority: ${config.protocolAuthority.toBase58()}`);
  console.log(`  Fee Authority: ${config.feeAuthority.toBase58()}`);
  console.log(`  Protocol Fee Rate: ${config.defaultProtocolFeeRate}%`);
  console.log(`  Fee Tier Count: ${config.feeTierCount}`);
  console.log(`  Pool Creation Paused: ${config.poolCreationPaused}`);

  console.log("\n[4/5] Listing Fee Tiers...");

  for (const tier of FEE_TIERS) {
    const [feeTierPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("fee_tier"),
        Buffer.from(new Uint8Array(new Uint32Array([tier.feeRate]).buffer)),
      ],
      program.programId
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
};
