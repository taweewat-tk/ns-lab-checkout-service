import { computeSubtotal, taxOf, priceCart, applyDiscount } from '../services/pricingService';
import { productRepo } from '../repositories/productRepo';

beforeEach(async () => {
  await productRepo.seed([
    { sku: 'BOOK', name: 'Paperback', priceCents: 1500, stock: 100 },
    { sku: 'PEN', name: 'Gel Pen', priceCents: 250, stock: 100 },
  ]);
});

describe('pricingService', () => {
  it('computes a subtotal across lines', async () => {
    const subtotal = await computeSubtotal([
      { sku: 'BOOK', quantity: 2 },
      { sku: 'PEN', quantity: 3 },
    ]);
    expect(subtotal).toBe(3750); // 3000 + 750
  });

  it('rejects a non-positive quantity', async () => {
    await expect(computeSubtotal([{ sku: 'BOOK', quantity: 0 }])).rejects.toThrow(/positive/);
  });

  it('taxes at 7%', () => {
    expect(taxOf(3750)).toBe(263); // 262.5 -> 263
  });

  it('prices a cart with no discount', async () => {
    const b = await priceCart([
      { sku: 'BOOK', quantity: 2 },
      { sku: 'PEN', quantity: 3 },
    ]);
    expect(b).toEqual({ subtotalCents: 3750, discountCents: 0, taxCents: 263, totalCents: 4013 });
  });

  it('taxes AFTER the discount and clamps the discount', async () => {
    const b = await priceCart(
      [
        { sku: 'BOOK', quantity: 2 },
        { sku: 'PEN', quantity: 3 },
      ],
      500,
    );
    // taxable 3250 -> tax round(227.5)=228 -> total 3478
    expect(b).toEqual({ subtotalCents: 3750, discountCents: 500, taxCents: 228, totalCents: 3478 });
    const clamped = await priceCart([{ sku: 'PEN', quantity: 1 }], 99999);
    expect(clamped.discountCents).toBe(250);
    expect(clamped.totalCents).toBe(0);
  });
});

describe('applyDiscount', () => {
  it('clamps a discount larger than the subtotal down to the subtotal', () => {
    expect(applyDiscount(1000, 5000)).toBe(1000);
  });

  it('clamps a negative discount up to 0', () => {
    expect(applyDiscount(1000, -1)).toBe(0);
  });

  it('returns the discount unchanged when it is within [0, subtotal]', () => {
    expect(applyDiscount(1000, 0)).toBe(0);
    expect(applyDiscount(1000, 400)).toBe(400);
    expect(applyDiscount(1000, 1000)).toBe(1000);
  });

  it('returns 0 for a zero subtotal regardless of the discount', () => {
    expect(applyDiscount(0, 5000)).toBe(0);
    expect(applyDiscount(0, 0)).toBe(0);
  });
});
