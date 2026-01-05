"use client";

import { useMemo } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { PROGRAM_ID } from "../constants";
import idl from "../anchor/idl.json";

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const program = useMemo(() => {
    if (!wallet) return null;

    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });

    return new Program(idl as Idl, provider);
  }, [connection, wallet]);

  const readonlyProgram = useMemo(() => {
    // Create a mock wallet for readonly operations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockWallet: any = {
      publicKey: PROGRAM_ID,
      signTransaction: async <T,>(tx: T) => tx,
      signAllTransactions: async <T,>(txs: T[]) => txs,
    };

    const provider = new AnchorProvider(
      connection,
      mockWallet,
      { commitment: "confirmed" }
    );

    return new Program(idl as Idl, provider);
  }, [connection]);

  return {
    program,
    readonlyProgram,
    connection,
    wallet,
    programId: PROGRAM_ID,
  };
}
