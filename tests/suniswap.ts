import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Suniswap } from "../target/types/suniswap";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";

describe("suniswap", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.suniswap as Program<Suniswap>;
  const payer = provider.wallet;

  // PDAs
  let configPda: PublicKey;

  before(async () => {
    // Derive config PDA
    [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );
  });

  describe("Config Initialization", () => {
    it("Initializes the config", async () => {
      const defaultProtocolFeeRate = 10; // 10%

      try {
        const tx = await program.methods
          .initializeConfig(defaultProtocolFeeRate)
          .accounts({
            config: configPda,
            protocolAuthority: payer.publicKey,
            feeAuthority: payer.publicKey,
            payer: payer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log("Initialize config tx:", tx);

        // Fetch and verify config account
        const configAccount = await program.account.suniswapConfig.fetch(configPda);
        assert.equal(
          configAccount.protocolAuthority.toString(),
          payer.publicKey.toString()
        );
        assert.equal(
          configAccount.feeAuthority.toString(),
          payer.publicKey.toString()
        );
        assert.equal(configAccount.defaultProtocolFeeRate, defaultProtocolFeeRate);

        console.log("Config initialized successfully!");
        console.log("  Protocol Authority:", configAccount.protocolAuthority.toString());
        console.log("  Fee Authority:", configAccount.feeAuthority.toString());
        console.log("  Default Protocol Fee Rate:", configAccount.defaultProtocolFeeRate);
      } catch (e: any) {
        // Config may already be initialized in previous test runs
        if (e.message?.includes("already in use")) {
          console.log("Config already initialized, skipping...");
        } else {
          throw e;
        }
      }
    });
  });

  describe("Fee Tier Initialization", () => {
    it("Initializes a 0.3% fee tier", async () => {
      const feeRate = 3000; // 0.3%
      const tickSpacing = 60;

      // Derive fee tier PDA
      const [feeTierPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("fee_tier"),
          new anchor.BN(feeRate).toArrayLike(Buffer, "le", 4),
        ],
        program.programId
      );

      try {
        const tx = await program.methods
          .initializeFeeTier(feeRate, tickSpacing)
          .accounts({
            config: configPda,
            feeTier: feeTierPda,
            authority: payer.publicKey,
            payer: payer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        console.log("Initialize fee tier tx:", tx);

        // Fetch and verify fee tier account
        const feeTierAccount = await program.account.feeTier.fetch(feeTierPda);
        assert.equal(feeTierAccount.feeRate, feeRate);
        assert.equal(feeTierAccount.tickSpacing, tickSpacing);

        console.log("Fee tier initialized successfully!");
        console.log("  Fee Rate:", feeTierAccount.feeRate, "(0.3%)");
        console.log("  Tick Spacing:", feeTierAccount.tickSpacing);
      } catch (e: any) {
        if (e.message?.includes("already in use")) {
          console.log("Fee tier already initialized, skipping...");
        } else {
          throw e;
        }
      }
    });
  });
});
