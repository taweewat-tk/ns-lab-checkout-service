import { checkout } from '../services/orderService';
import { productRepo } from '../repositories/productRepo';
import { orderRepo } from '../repositories/orderRepo';
import { available } from '../services/inventoryService';

beforeEach(async () => {
  await productRepo.seed([{ sku: 'BOOK', name: 'Paperback', priceCents: 1500, stock: 5 }]);
  await orderRepo.seed([]);
});

describe('checkout', () => {
  it('prices, reserves stock and persists the order', async () => {
    const order = await checkout({ username: 'alice', lines: [{ sku: 'BOOK', quantity: 2 }] });
    expect(order.breakdown).toEqual({
      subtotalCents: 3000,
      discountCents: 0,
      taxCents: 210,
      totalCents: 3210,
    });
    expect(await available('BOOK')).toBe(3);
    expect(await orderRepo.get(order.id)).toBeTruthy();
  });

  it('rejects when stock is insufficient', async () => {
    await expect(
      checkout({ username: 'alice', lines: [{ sku: 'BOOK', quantity: 99 }] }),
    ).rejects.toThrow(/insufficient/);
  });
});
