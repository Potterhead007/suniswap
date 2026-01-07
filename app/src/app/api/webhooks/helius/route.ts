import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/indexer/supabase";
import { PROGRAM_ID } from "@/lib/constants";

// Helius webhook event types
interface HeliusTransaction {
  signature: string;
  slot: number;
  timestamp: number;
  type: string;
  fee: number;
  feePayer: string;
  instructions: HeliusInstruction[];
  events: HeliusEvent;
  accountData: AccountData[];
  nativeTransfers: NativeTransfer[];
  tokenTransfers: TokenTransfer[];
}

interface HeliusInstruction {
  programId: string;
  data: string;
  accounts: string[];
  innerInstructions: HeliusInstruction[];
}

interface HeliusEvent {
  nft?: unknown;
  swap?: SwapEvent;
  compressed?: unknown;
}

interface SwapEvent {
  nativeInput?: { account: string; amount: string };
  nativeOutput?: { account: string; amount: string };
  tokenInputs?: { userAccount: string; tokenAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }[];
  tokenOutputs?: { userAccount: string; tokenAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }[];
  tokenFees?: { userAccount: string; tokenAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }[];
  nativeFees?: { account: string; amount: string }[];
  innerSwaps?: unknown[];
}

interface AccountData {
  account: string;
  nativeBalanceChange: number;
  tokenBalanceChanges: TokenBalanceChange[];
}

interface TokenBalanceChange {
  userAccount: string;
  tokenAccount: string;
  mint: string;
  rawTokenAmount: { tokenAmount: string; decimals: number };
}

interface NativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
}

interface TokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  fromTokenAccount: string;
  toTokenAccount: string;
  tokenAmount: number;
  mint: string;
}

// Instruction discriminators (first 8 bytes of instruction data)
const INSTRUCTION_DISCRIMINATORS: Record<string, string> = {
  // These are the Anchor discriminators - first 8 bytes of sha256("global:instruction_name")
  initialize_pool: "afaf6d1f0d989bed",
  swap: "f8c69e91e17587c8",
  increase_liquidity: "2e9cf3760dcdfbb2",
  decrease_liquidity: "a026d06f685b2c01",
  collect_fees: "a498cf631eba13b6",
  open_position: "87802f4d0f21f74e",
  close_position: "7b865100314462",
};

// Verify webhook signature from Helius
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Helius uses HMAC-SHA256
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return signature === expectedSignature;
}

// Parse SuniSwap instruction type from data
function parseInstructionType(data: string): string | null {
  // Anchor instructions start with 8-byte discriminator
  const discriminator = data.slice(0, 16); // First 8 bytes = 16 hex chars

  for (const [name, disc] of Object.entries(INSTRUCTION_DISCRIMINATORS)) {
    if (discriminator === disc) {
      return name;
    }
  }
  return null;
}

// Process a SuniSwap transaction
async function processSuniswapTransaction(tx: HeliusTransaction) {
  const programInstructions = tx.instructions.filter(
    (ix) => ix.programId === PROGRAM_ID.toBase58()
  );

  if (programInstructions.length === 0) return;

  for (const ix of programInstructions) {
    const instructionType = parseInstructionType(ix.data);
    if (!instructionType) continue;

    console.log(
      `[Webhook] Processing ${instructionType} tx: ${tx.signature.slice(0, 8)}...`
    );

    try {
      switch (instructionType) {
        case "initialize_pool":
          await handleInitializePool(tx, ix);
          break;
        case "swap":
          await handleSwap(tx, ix);
          break;
        case "increase_liquidity":
          await handleIncreaseLiquidity(tx, ix);
          break;
        case "decrease_liquidity":
          await handleDecreaseLiquidity(tx, ix);
          break;
        case "collect_fees":
          await handleCollectFees(tx, ix);
          break;
        case "open_position":
          await handleOpenPosition(tx, ix);
          break;
        case "close_position":
          await handleClosePosition(tx, ix);
          break;
      }
    } catch (err) {
      console.error(`[Webhook] Error processing ${instructionType}:`, err);
    }
  }
}

// Handler: Initialize Pool
async function handleInitializePool(
  tx: HeliusTransaction,
  ix: HeliusInstruction
) {
  // Account layout for initialize_pool:
  // 0: config, 1: fee_tier, 2: pool, 3: token_mint_a, 4: token_mint_b,
  // 5: token_vault_a, 6: token_vault_b, 7: payer, 8: token_program, 9: system_program
  const accounts = ix.accounts;

  const poolData = {
    address: accounts[2],
    token_mint_a: accounts[3],
    token_mint_b: accounts[4],
    token_vault_a: accounts[5],
    token_vault_b: accounts[6],
    fee_rate: 3000, // TODO: Parse from fee_tier account
    tick_spacing: 60, // TODO: Parse from fee_tier account
    sqrt_price_x64: "0", // TODO: Parse from instruction data
    tick_current: 0,
    liquidity: "0",
    created_slot: tx.slot,
    created_tx: tx.signature,
  };

  await supabaseAdmin.from("pools").upsert(poolData as never, { onConflict: "address" });

  console.log(`[Webhook] Pool created: ${poolData.address.slice(0, 8)}...`);
}

// Handler: Swap
async function handleSwap(tx: HeliusTransaction, ix: HeliusInstruction) {
  // Account layout for swap:
  // 0: pool, 1: token_vault_a, 2: token_vault_b, 3: user_token_a, 4: user_token_b,
  // 5: tick_array_0, 6: tick_array_1, 7: tick_array_2, 8: oracle, 9: user, 10: token_program
  const accounts = ix.accounts;
  const poolAddress = accounts[0];
  const userAddress = tx.feePayer;

  // Get token transfers for amounts
  const tokenTransfers = tx.tokenTransfers;
  let amountIn = "0";
  let amountOut = "0";
  let tokenIn = "";
  let tokenOut = "";

  for (const transfer of tokenTransfers) {
    if (transfer.fromUserAccount === userAddress) {
      amountIn = transfer.tokenAmount.toString();
      tokenIn = transfer.mint;
    }
    if (transfer.toUserAccount === userAddress) {
      amountOut = transfer.tokenAmount.toString();
      tokenOut = transfer.mint;
    }
  }

  // Calculate fee (from pool's fee rate)
  const feeAmount = (
    parseFloat(amountIn) *
    0.003
  ).toString(); // Approximate 0.3%

  const swapData = {
    signature: tx.signature,
    pool_address: poolAddress,
    user_address: userAddress,
    token_in: tokenIn,
    token_out: tokenOut,
    amount_in: amountIn,
    amount_out: amountOut,
    sqrt_price_after: "0", // TODO: Parse from event
    tick_after: 0, // TODO: Parse from event
    fee_amount: feeAmount,
    slot: tx.slot,
    block_time: new Date(tx.timestamp * 1000).toISOString(),
  };

  await supabaseAdmin
    .from("swaps")
    .upsert(swapData as never, { onConflict: "signature" });

  console.log(
    `[Webhook] Swap indexed: ${amountIn} -> ${amountOut} in pool ${poolAddress.slice(0, 8)}...`
  );
}

// Handler: Increase Liquidity
async function handleIncreaseLiquidity(
  tx: HeliusTransaction,
  ix: HeliusInstruction
) {
  const accounts = ix.accounts;
  const poolAddress = accounts[0];
  const positionAddress = accounts[3];

  // Get token amounts from transfers
  let amountA = "0";
  let amountB = "0";

  for (const transfer of tx.tokenTransfers) {
    if (transfer.toTokenAccount === accounts[1]) {
      // vault A
      amountA = transfer.tokenAmount.toString();
    }
    if (transfer.toTokenAccount === accounts[2]) {
      // vault B
      amountB = transfer.tokenAmount.toString();
    }
  }

  const eventData = {
    signature: tx.signature,
    pool_address: poolAddress,
    position_address: positionAddress,
    user_address: tx.feePayer,
    event_type: "add",
    amount_a: amountA,
    amount_b: amountB,
    slot: tx.slot,
    block_time: new Date(tx.timestamp * 1000).toISOString(),
  };

  await supabaseAdmin
    .from("liquidity_events")
    .upsert(eventData as never, { onConflict: "signature" });

  console.log(
    `[Webhook] Liquidity added to position ${positionAddress.slice(0, 8)}...`
  );
}

// Handler: Decrease Liquidity
async function handleDecreaseLiquidity(
  tx: HeliusTransaction,
  ix: HeliusInstruction
) {
  const accounts = ix.accounts;
  const poolAddress = accounts[0];
  const positionAddress = accounts[3];

  let amountA = "0";
  let amountB = "0";

  for (const transfer of tx.tokenTransfers) {
    if (transfer.fromTokenAccount === accounts[1]) {
      amountA = transfer.tokenAmount.toString();
    }
    if (transfer.fromTokenAccount === accounts[2]) {
      amountB = transfer.tokenAmount.toString();
    }
  }

  const eventData = {
    signature: tx.signature,
    pool_address: poolAddress,
    position_address: positionAddress,
    user_address: tx.feePayer,
    event_type: "remove",
    amount_a: amountA,
    amount_b: amountB,
    slot: tx.slot,
    block_time: new Date(tx.timestamp * 1000).toISOString(),
  };

  await supabaseAdmin
    .from("liquidity_events")
    .upsert(eventData as never, { onConflict: "signature" });

  console.log(
    `[Webhook] Liquidity removed from position ${positionAddress.slice(0, 8)}...`
  );
}

// Handler: Collect Fees
async function handleCollectFees(tx: HeliusTransaction, ix: HeliusInstruction) {
  const accounts = ix.accounts;
  const poolAddress = accounts[0];
  const positionAddress = accounts[2];

  let amountA = "0";
  let amountB = "0";

  for (const transfer of tx.tokenTransfers) {
    if (transfer.toUserAccount === tx.feePayer) {
      // Fees go to user
      if (!amountA || amountA === "0") {
        amountA = transfer.tokenAmount.toString();
      } else {
        amountB = transfer.tokenAmount.toString();
      }
    }
  }

  const eventData = {
    signature: tx.signature,
    pool_address: poolAddress,
    position_address: positionAddress,
    user_address: tx.feePayer,
    event_type: "collect_fees",
    amount_a: amountA,
    amount_b: amountB,
    slot: tx.slot,
    block_time: new Date(tx.timestamp * 1000).toISOString(),
  };

  await supabaseAdmin
    .from("liquidity_events")
    .upsert(eventData as never, { onConflict: "signature" });

  console.log(
    `[Webhook] Fees collected from position ${positionAddress.slice(0, 8)}...`
  );
}

// Handler: Open Position
async function handleOpenPosition(
  tx: HeliusTransaction,
  ix: HeliusInstruction
) {
  const accounts = ix.accounts;
  const poolAddress = accounts[0];
  const positionAddress = accounts[3];
  const owner = accounts[4];

  // TODO: Parse tick_lower and tick_upper from instruction data
  const positionData = {
    address: positionAddress,
    pool_address: poolAddress,
    owner: owner,
    tick_lower: -120, // Placeholder
    tick_upper: 120, // Placeholder
    liquidity: "0",
    is_open: true,
    created_slot: tx.slot,
    created_tx: tx.signature,
  };

  await supabaseAdmin
    .from("positions")
    .upsert(positionData as never, { onConflict: "address" });

  console.log(`[Webhook] Position opened: ${positionAddress.slice(0, 8)}...`);
}

// Handler: Close Position
async function handleClosePosition(
  tx: HeliusTransaction,
  ix: HeliusInstruction
) {
  const accounts = ix.accounts;
  const positionAddress = accounts[1];

  await supabaseAdmin
    .from("positions")
    .update({ is_open: false } as never)
    .eq("address", positionAddress);

  console.log(`[Webhook] Position closed: ${positionAddress.slice(0, 8)}...`);
}

// Main webhook handler
export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();

    // Verify webhook signature (optional but recommended)
    const signature = request.headers.get("x-helius-signature");
    const webhookSecret = process.env.HELIUS_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        console.error("[Webhook] Invalid signature");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // Parse transactions
    const transactions: HeliusTransaction[] = JSON.parse(rawBody);

    console.log(`[Webhook] Received ${transactions.length} transaction(s)`);

    // Process each transaction
    for (const tx of transactions) {
      await processSuniswapTransaction(tx);
    }

    return NextResponse.json({ success: true, processed: transactions.length });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: "ok",
    programId: PROGRAM_ID.toBase58(),
    timestamp: new Date().toISOString(),
  });
}
