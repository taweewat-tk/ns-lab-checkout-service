import { checkout } from '../services/orderService';
import { productRepo } from '../repositories/productRepo';
import { orderRepo } from '../repositories/orderRepo';
import { couponRepo } from '../repositories/couponRepo';
import { available } from '../services/inventoryService';

beforeEach(async () => {
  await productRepo.seed([{ sku: 'BOOK', name: 'Paperback', priceCents: 1500, stock: 10 }]);
  await orderRepo.seed([]);
  await couponRepo.seed([
    {
      code: 'SAVE10',
      type: 'percent',
      value: 10,
      minSubtotalCents: 2000,
      expiresAt: '2027-01-01T00:00:00.000Z',
    },
    {
      code: 'EXPIRED',
      type: 'percent',
      value: 50,
      minSubtotalCents: 0,
      expiresAt: '2020-01-01T00:00:00.000Z',
    },
  ]);
});

describe('checkout + coupons', () => {
  it('applies a valid coupon to the breakdown', async () => {
    // 2 x 1500 = 3000; SAVE10 -> 300; taxable 2700; tax 189; total 2889
    const order = await checkout({
      username: 'alice',
      lines: [{ sku: 'BOOK', quantity: 2 }],
      couponCode: 'SAVE10',
    });
    expect(order.breakdown).toEqual({
      subtotalCents: 3000,
      discountCents: 300,
      taxCents: 189,
      totalCents: 2889,
    });
    expect(order.couponCode).toBe('SAVE10');
  });

  it('ignores expired and unknown coupons (no discount)', async () => {
    const a = await checkout({
      username: 'alice',
      lines: [{ sku: 'BOOK', quantity: 1 }],
      couponCode: 'EXPIRED',
    });
    expect(a.breakdown.discountCents).toBe(0);
    const b = await checkout({
      username: 'alice',
      lines: [{ sku: 'BOOK', quantity: 1 }],
      couponCode: 'NOPE',
    });
    expect(b.breakdown.discountCents).toBe(0);
  });
});

describe('checkout + idempotency', () => {
  it('same key twice -> same order, stock reserved once', async () => {
    const first = await checkout({
      username: 'alice',
      lines: [{ sku: 'BOOK', quantity: 2 }],
      idempotencyKey: 'k1',
    });
    const second = await checkout({
      username: 'alice',
      lines: [{ sku: 'BOOK', quantity: 2 }],
      idempotencyKey: 'k1',
    });
    expect(second.id).toBe(first.id);
    expect(await available('BOOK')).toBe(8); // 10 - 2, once
    expect((await orderRepo.all()).length).toBe(1);
  });

  it('different keys -> different orders', async () => {
    const a = await checkout({
      username: 'alice',
      lines: [{ sku: 'BOOK', quantity: 1 }],
      idempotencyKey: 'kA',
    });
    const b = await checkout({
      username: 'alice',
      lines: [{ sku: 'BOOK', quantity: 1 }],
      idempotencyKey: 'kB',
    });
    expect(a.id).not.toBe(b.id);
    expect(await available('BOOK')).toBe(8);
  });

  it('STRETCH: concurrent same-key checkouts -> exactly one order', async () => {
    const [a, b] = await Promise.all([
      checkout({ username: 'alice', lines: [{ sku: 'BOOK', quantity: 2 }], idempotencyKey: 'kc' }),
      checkout({ username: 'alice', lines: [{ sku: 'BOOK', quantity: 2 }], idempotencyKey: 'kc' }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await available('BOOK')).toBe(8);
    expect((await orderRepo.all()).length).toBe(1);
  });

  it('rolls back earlier reservations when a later line fails', async () => {
    await productRepo.seed([
      { sku: 'BOOK', name: 'Paperback', priceCents: 1500, stock: 10 },
      { sku: 'RARE', name: 'Rare', priceCents: 9000, stock: 0 },
    ]);
    await expect(
      checkout({
        username: 'alice',
        lines: [
          { sku: 'BOOK', quantity: 3 },
          { sku: 'RARE', quantity: 1 },
        ],
      }),
    ).rejects.toThrow(/insufficient/);
    expect(await available('BOOK')).toBe(10); // rolled back
  });
});
