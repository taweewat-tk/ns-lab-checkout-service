/**
 * @generated-docs
 * JSDoc in this file was added by an automated documentation pass.
 * No behavioral logic was changed.
 */
import { randomUUID } from 'crypto';
import { CartLine, Order } from '../types';
import { computeSubtotal, priceCart } from './pricingService';
import { discountForCoupon } from './couponService';
import * as inventory from './inventoryService';
import { orderRepo } from '../repositories/orderRepo';
import { couponRepo } from '../repositories/couponRepo';
import { createAsyncStore } from '../repositories/asyncStore';
import { withLock } from '../lib/locks';

export interface CheckoutInput {
  lines: CartLine[];
  couponCode?: string | null;
  idempotencyKey?: string;
}

interface IdempotencyRecord {
  key: string;
  orderId: string;
}

const idempotencyStore = createAsyncStore<IdempotencyRecord>((r) => r.key);

async function doCheckout(input: CheckoutInput): Promise<Order> {
  // 1) Resolve the coupon (unknown / missing code -> no discount).
  const coupon = input.couponCode ? ((await couponRepo.get(input.couponCode)) ?? null) : null;

  // 2) Price the cart with the coupon's discount.
  const subtotal = await computeSubtotal(input.lines);
  const discount = discountForCoupon(coupon, subtotal);
  const breakdown = await priceCart(input.lines, discount);

  // 3) Reserve stock, releasing anything already taken if a later line fails.
  const reserved: CartLine[] = [];
  for (const line of input.lines) {
    const ok = await inventory.reserve(line.sku, line.quantity);
    if (!ok) {
      for (const r of reserved) await inventory.release(r.sku, r.quantity);
      throw new Error(`insufficient stock for ${line.sku}`);
    }
    reserved.push(line);
  }

  // 4) Persist.
  const order: Order = {
    id: randomUUID(),
    lines: input.lines,
    breakdown,
    couponCode: coupon?.code ?? null,
    createdAt: new Date().toISOString(),
  };
  await orderRepo.put(order);
  return order;
}

/**
 * Check out a cart.
 *
 * Idempotency: when an Idempotency-Key is supplied, the whole operation is
 * serialized per key, and a key that already completed returns the ORIGINAL
 * order without touching stock again — safe retries, even concurrent ones.
 *
 * @param input - Cart lines to purchase, plus an optional coupon code and
 *   optional idempotency key.
 * @returns The created order, or (for a repeated idempotency key) the
 *   original order from the first successful attempt.
 * @throws {Error} If any line's stock cannot be reserved. Lines already
 *   reserved earlier in the same call are released before the error is
 *   thrown, so a failed checkout doesn't leak reserved stock.
 */
export async function checkout(input: CheckoutInput): Promise<Order> {
  if (!input.idempotencyKey) return doCheckout(input);

  const key = input.idempotencyKey;
  return withLock(`idem:${key}`, async () => {
    const existing = await idempotencyStore.get(key);
    if (existing) {
      const order = await orderRepo.get(existing.orderId);
      if (order) return order;
    }
    const order = await doCheckout(input);
    // Record the key only AFTER success, so a failed attempt can be retried.
    await idempotencyStore.put({ key, orderId: order.id });
    return order;
  });
}
