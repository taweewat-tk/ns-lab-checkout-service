import { Coupon } from '../types';
import { Clock, systemClock } from '../lib/clock';
import { percentOf } from '../lib/money';

/**
 * @generated-docs
 * Computes the discount (in integer cents) that a coupon applies to a cart subtotal.
 *
 * Rules:
 *   - null coupon                        -> 0
 *   - expired (expiresAt <= now)         -> 0
 *   - subtotal < coupon.minSubtotalCents -> 0
 *   - 'percent' -> percentOf(subtotal, value) (rounded half-up)
 *   - 'fixed'   -> value (cents)
 *   - never exceeds the subtotal, never negative
 *
 * @param coupon - The coupon to evaluate, or `null` if no coupon was applied.
 * @param subtotalCents - The cart subtotal in integer cents, before discount.
 * @param clock - Injectable clock used to resolve "now" for the expiry check; defaults to `systemClock`.
 * @returns The discount in integer cents, clamped to the range `[0, subtotalCents]`.
 */
export function discountForCoupon(
  coupon: Coupon | null,
  subtotalCents: number,
  clock: Clock = systemClock,
): number {
  if (!coupon) return 0;
  if (new Date(coupon.expiresAt).getTime() <= clock.now().getTime()) return 0;
  if (subtotalCents < coupon.minSubtotalCents) return 0;

  const raw = coupon.type === 'percent' ? percentOf(subtotalCents, coupon.value) : coupon.value;
  return Math.max(0, Math.min(raw, subtotalCents));
}
