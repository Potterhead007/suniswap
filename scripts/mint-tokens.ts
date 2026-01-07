/**
 * Mint test tokens to a user wallet
 */

import { Connection, clusterApiUrl, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress, createMintToInstruction } from '@solana/spl-token';
import * as fs from 'fs';
import * as os from 'os';

const RECIPIENT = process.argv[2] || 'GvKe1u3rxH2bwDbkR9CnSHRsh2sBtqjypSnZocy12kpx';

async function main() {
  const recipient = new PublicKey(RECIPIENT);
  const mintA = new PublicKey('2eJCUAkzXv5gAxQaWUk1u7kK4oG7XZ3jB6RrL9xc1buQ'); // sUSDC (6 decimals)
  const mintB = new PublicKey('GdLm7VEXzHZyUQDL8r2TgvTMDSN44wjcrZbu4dme4mue'); // SUNI (9 decimals)

  const walletPath = os.homedir() + '/.config/solana/id.json';
  const payer = Keypair.fromSecretKey(Buffer.from(JSON.parse(fs.readFileSync(walletPath, 'utf-8'))));

  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

  console.log('Minting tokens to:', recipient.toBase58());

  // Get ATAs
  const ataA = await getAssociatedTokenAddress(mintA, recipient);
  const ataB = await getAssociatedTokenAddress(mintB, recipient);

  console.log('sUSDC ATA:', ataA.toBase58());
  console.log('SUNI ATA:', ataB.toBase58());

  const tx = new Transaction();

  // Create ATAs if needed
  const ataAInfo = await connection.getAccountInfo(ataA);
  if (!ataAInfo) {
    console.log('Creating sUSDC token account...');
    tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, ataA, recipient, mintA));
  }

  const ataBInfo = await connection.getAccountInfo(ataB);
  if (!ataBInfo) {
    console.log('Creating SUNI token account...');
    tx.add(createAssociatedTokenAccountInstruction(payer.publicKey, ataB, recipient, mintB));
  }

  // Mint tokens
  const amountA = 1000_000_000; // 1000 sUSDC (6 decimals)
  const amountB = 1000_000_000_000; // 1000 SUNI (9 decimals)

  tx.add(createMintToInstruction(mintA, ataA, payer.publicKey, amountA));
  tx.add(createMintToInstruction(mintB, ataB, payer.publicKey, amountB));

  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  console.log('\nSuccess! TX:', sig);
  console.log('\nMinted:');
  console.log('  1000 sUSDC');
  console.log('  1000 SUNI');
  console.log('\nYou can now swap on the UI!');
}

main().catch(console.error);
