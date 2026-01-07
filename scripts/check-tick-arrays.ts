import { PublicKey, Connection, clusterApiUrl } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("D3mEetFkLuB1sia8Bvvv2nmt9k6RsJPAGR2PE6tj7EFq");
const poolPda = new PublicKey("HAfjs24UwhXwEXt47rmooYf83nntun2VVUUfFzYgU3QS");

function i32ToLeBytes(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32LE(value, 0);
  return buf;
}

async function main() {
  const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
  const tickSpacing = 200;

  for (const start of [-1600, 0, 1600]) {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("tick_array"), poolPda.toBuffer(), i32ToLeBytes(start)],
      PROGRAM_ID
    );
    const info = await connection.getAccountInfo(pda);
    console.log("Tick array", start, ":", info ? "EXISTS" : "NOT FOUND", "-", pda.toBase58());
  }
}

main().catch(console.error);
