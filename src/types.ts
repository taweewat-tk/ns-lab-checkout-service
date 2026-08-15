/** All money is stored as an integer number of minor units (cents/satang). */
export type Cents = number;

export interface Product {
  sku: string;
  name: string;
  priceCents: Cents;
  stock: number;
}

export interface CartLine {
  sku: string;
  quantity: number;
}

export type CouponType = 'percent' | 'fixed';

export interface Coupon {
  code: string;
  type: CouponType;
  value: number; // percent (0-100) for 'percent', or cents for 'fixed'
  minSubtotalCents: Cents;
  expiresAt: string; // ISO timestamp
}

export interface PriceBreakdown {
  subtotalCents: Cents;
  discountCents: Cents;
  taxCents: Cents;
  totalCents: Cents;
}

export interface Order {
  id: string;
  /** Username of the authenticated buyer the order belongs to. */
  username: string;
  lines: CartLine[];
  breakdown: PriceBreakdown;
  couponCode: string | null;
  createdAt: string;
}

export interface User {
  username: string;
  passwordSalt: string;
  passwordHash: string;
}
