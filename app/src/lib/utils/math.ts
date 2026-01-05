import BN from "bn.js";
import Decimal from "decimal.js";
import { Q64, MIN_TICK, MAX_TICK } from "../constants";

// Configure Decimal.js for high precision
Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

const Q64_DECIMAL = new Decimal(Q64.toString());
const TICK_BASE = new Decimal("1.0001");

/**
 * Convert sqrt price (Q64.64) to human-readable price
 * price = (sqrtPrice / 2^64)^2 * 10^(decimalsA - decimalsB)
 */
export function sqrtPriceX64ToPrice(
  sqrtPriceX64: BN | bigint | string,
  decimalsA: number,
  decimalsB: number
): Decimal {
  const sqrtPrice = new Decimal(sqrtPriceX64.toString());
  const price = sqrtPrice.div(Q64_DECIMAL).pow(2);
  const decimalAdjustment = new Decimal(10).pow(decimalsA - decimalsB);
  return price.mul(decimalAdjustment);
}

/**
 * Convert human-readable price to sqrt price (Q64.64)
 * sqrtPrice = sqrt(price / 10^(decimalsA - decimalsB)) * 2^64
 */
export function priceToSqrtPriceX64(
  price: number | string | Decimal,
  decimalsA: number,
  decimalsB: number
): BN {
  const priceDecimal = new Decimal(price.toString());
  const decimalAdjustment = new Decimal(10).pow(decimalsA - decimalsB);
  const adjustedPrice = priceDecimal.div(decimalAdjustment);
  const sqrtPrice = adjustedPrice.sqrt().mul(Q64_DECIMAL);
  return new BN(sqrtPrice.floor().toFixed());
}

/**
 * Convert tick index to human-readable price
 * price = 1.0001^tick * 10^(decimalsA - decimalsB)
 */
export function tickToPrice(tick: number, decimalsA: number, decimalsB: number): Decimal {
  const price = TICK_BASE.pow(tick);
  const decimalAdjustment = new Decimal(10).pow(decimalsA - decimalsB);
  return price.mul(decimalAdjustment);
}

/**
 * Convert human-readable price to tick index
 * tick = log(price / 10^(decimalsA - decimalsB)) / log(1.0001)
 */
export function priceToTick(
  price: number | string | Decimal,
  decimalsA: number,
  decimalsB: number
): number {
  const priceDecimal = new Decimal(price.toString());
  const decimalAdjustment = new Decimal(10).pow(decimalsA - decimalsB);
  const adjustedPrice = priceDecimal.div(decimalAdjustment);
  const tick = adjustedPrice.ln().div(TICK_BASE.ln());
  return Math.floor(tick.toNumber());
}

/**
 * Round tick to nearest valid tick based on tick spacing
 */
export function roundTickToSpacing(tick: number, tickSpacing: number): number {
  return Math.round(tick / tickSpacing) * tickSpacing;
}

/**
 * Clamp tick to valid range
 */
export function clampTick(tick: number): number {
  return Math.max(MIN_TICK, Math.min(MAX_TICK, tick));
}

/**
 * Convert sqrt price (Q64.64) to tick index
 */
export function sqrtPriceX64ToTick(sqrtPriceX64: BN | bigint | string): number {
  const sqrtPrice = new Decimal(sqrtPriceX64.toString()).div(Q64_DECIMAL);
  const price = sqrtPrice.pow(2);
  const tick = price.ln().div(TICK_BASE.ln());
  return Math.floor(tick.toNumber());
}

/**
 * Convert tick index to sqrt price (Q64.64)
 */
export function tickToSqrtPriceX64(tick: number): BN {
  const price = TICK_BASE.pow(tick);
  const sqrtPrice = price.sqrt().mul(Q64_DECIMAL);
  return new BN(sqrtPrice.floor().toFixed());
}

/**
 * Calculate liquidity from token amounts
 */
export function getLiquidityFromAmounts(
  sqrtPriceX64: BN,
  sqrtPriceLowerX64: BN,
  sqrtPriceUpperX64: BN,
  amountA: BN,
  amountB: BN
): BN {
  const sqrtPrice = new Decimal(sqrtPriceX64.toString());
  const sqrtPriceLower = new Decimal(sqrtPriceLowerX64.toString());
  const sqrtPriceUpper = new Decimal(sqrtPriceUpperX64.toString());
  const amountADec = new Decimal(amountA.toString());
  const amountBDec = new Decimal(amountB.toString());

  let liquidity: Decimal;

  if (sqrtPrice.lte(sqrtPriceLower)) {
    // Price below range - only token A
    liquidity = amountADec
      .mul(sqrtPriceLower)
      .mul(sqrtPriceUpper)
      .div(sqrtPriceUpper.sub(sqrtPriceLower));
  } else if (sqrtPrice.gte(sqrtPriceUpper)) {
    // Price above range - only token B
    liquidity = amountBDec.mul(Q64_DECIMAL).div(sqrtPriceUpper.sub(sqrtPriceLower));
  } else {
    // Price in range - use both tokens
    const liquidityA = amountADec
      .mul(sqrtPrice)
      .mul(sqrtPriceUpper)
      .div(sqrtPriceUpper.sub(sqrtPrice));
    const liquidityB = amountBDec.mul(Q64_DECIMAL).div(sqrtPrice.sub(sqrtPriceLower));
    liquidity = Decimal.min(liquidityA, liquidityB);
  }

  return new BN(liquidity.floor().toFixed());
}

/**
 * Calculate token amounts from liquidity
 */
export function getAmountsFromLiquidity(
  sqrtPriceX64: BN,
  sqrtPriceLowerX64: BN,
  sqrtPriceUpperX64: BN,
  liquidity: BN,
  roundUp: boolean = false
): { amountA: BN; amountB: BN } {
  const sqrtPrice = new Decimal(sqrtPriceX64.toString());
  const sqrtPriceLower = new Decimal(sqrtPriceLowerX64.toString());
  const sqrtPriceUpper = new Decimal(sqrtPriceUpperX64.toString());
  const liquidityDec = new Decimal(liquidity.toString());

  let amountA: Decimal;
  let amountB: Decimal;

  if (sqrtPrice.lte(sqrtPriceLower)) {
    // Price below range - only token A
    amountA = liquidityDec
      .mul(sqrtPriceUpper.sub(sqrtPriceLower))
      .div(sqrtPriceLower.mul(sqrtPriceUpper));
    amountB = new Decimal(0);
  } else if (sqrtPrice.gte(sqrtPriceUpper)) {
    // Price above range - only token B
    amountA = new Decimal(0);
    amountB = liquidityDec.mul(sqrtPriceUpper.sub(sqrtPriceLower)).div(Q64_DECIMAL);
  } else {
    // Price in range
    amountA = liquidityDec.mul(sqrtPriceUpper.sub(sqrtPrice)).div(sqrtPrice.mul(sqrtPriceUpper));
    amountB = liquidityDec.mul(sqrtPrice.sub(sqrtPriceLower)).div(Q64_DECIMAL);
  }

  const round = roundUp ? (x: Decimal) => x.ceil() : (x: Decimal) => x.floor();

  return {
    amountA: new BN(round(amountA).toFixed()),
    amountB: new BN(round(amountB).toFixed()),
  };
}

/**
 * Calculate price impact for a swap
 */
export function calculatePriceImpact(
  inputAmount: BN,
  outputAmount: BN,
  inputDecimals: number,
  outputDecimals: number,
  spotPrice: Decimal
): Decimal {
  const inputDec = new Decimal(inputAmount.toString()).div(new Decimal(10).pow(inputDecimals));
  const outputDec = new Decimal(outputAmount.toString()).div(new Decimal(10).pow(outputDecimals));

  const executionPrice = outputDec.div(inputDec);
  const impact = spotPrice.sub(executionPrice).div(spotPrice).abs();

  return impact;
}

/**
 * Format token amount with decimals
 */
export function formatTokenAmount(amount: BN | bigint | string, decimals: number): string {
  const amountDec = new Decimal(amount.toString());
  const divisor = new Decimal(10).pow(decimals);
  return amountDec.div(divisor).toFixed(decimals);
}

/**
 * Parse token amount from string
 */
export function parseTokenAmount(amount: string, decimals: number): BN {
  const amountDec = new Decimal(amount);
  const multiplier = new Decimal(10).pow(decimals);
  return new BN(amountDec.mul(multiplier).floor().toFixed());
}
