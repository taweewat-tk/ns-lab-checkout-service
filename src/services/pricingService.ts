/** @generated-docs */
import { CartLine, PriceBreakdown } from '../types';
import { productRepo } from '../repositories/productRepo';

const TAX_BPS = 700; // 7.00% expressed in basis points

/**
 * Compute the pre-tax, pre-discount subtotal for a cart by looking up each
 * line's product price and multiplying by quantity.
 *
 * @param lines - Cart lines to price, each referencing a SKU and quantity.
 * @returns The subtotal in cents (integer).
 * @throws {Error} If a line's quantity is not positive.
 * @throws {Error} If a line references an unknown SKU.
 */
export async function computeSubtotal(lines: CartLine[]): Promise<number> {
  let subtotal = 0;
  for (const line of lines) {
    if (line.quantity <= 0) throw new Error(`quantity must be positive for ${line.sku}`);
    const product = await productRepo.get(line.sku);
    if (!product) throw new Error(`unknown sku: ${line.sku}`);
    subtotal += product.priceCents * line.quantity;
  }
  return subtotal;
}

/**
 * Tax on an amount of cents, rounded half-up.
 *
 * @param amountCents - Taxable amount in cents.
 * @returns The tax amount in cents (integer, rounded half-up).
 */
export function taxOf(amountCents: number): number {
  return Math.round((amountCents * TAX_BPS) / 10000);
}

/**
 * Clamp a discount into the range `[0, subtotalCents]` and return the clamped
 * discount itself (not the discounted subtotal).
 *
 * A negative discount becomes 0, and a discount larger than the subtotal is
 * capped at the subtotal, so a discount can never make an order negative.
 *
 * @param subtotalCents - Cart subtotal in integer cents; the upper bound.
 * @param discountCents - Requested discount in integer cents.
 * @returns The discount in integer cents, clamped to `[0, subtotalCents]`.
 */
export function applyDiscount(subtotalCents: number, discountCents: number): number {
  return Math.max(0, Math.min(discountCents, subtotalCents));
}

/**
 * Price a cart. `discountCents` is supplied by the caller (Dev track will
 * wire couponService in). Tax is charged on (subtotal - discount).
 * Discount is clamped so it can never exceed the subtotal.
 *
 * @param lines - Cart lines to price, each referencing a SKU and quantity.
 * @param discountCents - Discount to apply in cents, clamped to `[0, subtotalCents]`. Defaults to 0.
 * @returns A {@link PriceBreakdown} with subtotal, clamped discount, tax, and total, all in cents.
 * @throws {Error} If a line's quantity is not positive or references an unknown SKU (via {@link computeSubtotal}).
 */
export async function priceCart(lines: CartLine[], discountCents = 0): Promise<PriceBreakdown> {
  const subtotalCents = await computeSubtotal(lines);
  const discount = applyDiscount(subtotalCents, discountCents);
  const taxable = subtotalCents - discount;
  const taxCents = taxOf(taxable);
  return { subtotalCents, discountCents: discount, taxCents, totalCents: taxable + taxCents };
}
