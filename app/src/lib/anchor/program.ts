"use client";

import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import { PROGRAM_ID } from "../constants";
import idl from "./idl.json";

// Export IDL type for TypeScript
export type SuniswapIDL = typeof idl;

export function getProgram(connection: Connection, wallet?: AnchorWallet): Program {
  const provider = wallet
    ? new AnchorProvider(connection, wallet, { commitment: "confirmed" })
    : new AnchorProvider(
        connection,
        {
          publicKey: PublicKey.default,
          signTransaction: async (tx) => tx,
          signAllTransactions: async (txs) => txs,
        } as AnchorWallet,
        { commitment: "confirmed" }
      );

  return new Program(idl as Idl, provider);
}

export function getProgramId(): PublicKey {
  return PROGRAM_ID;
}
