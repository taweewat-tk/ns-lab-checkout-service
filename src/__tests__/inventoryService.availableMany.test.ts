import { availableMany, reserve } from '../services/inventoryService';
import { productRepo } from '../repositories/productRepo';

beforeEach(async () => {
  await productRepo.seed([
    { sku: 'A', name: 'A', priceCents: 100, stock: 3 },
    { sku: 'B', name: 'B', priceCents: 250, stock: 0 },
    { sku: 'C', name: 'C', priceCents: 700, stock: 12 },
  ]);
});

describe('inventoryService.availableMany', () => {
  it('returns the seeded stock for every known sku asked at once', async () => {
    expect(await availableMany(['A', 'B', 'C'])).toEqual({ A: 3, B: 0, C: 12 });
  });

  it('returns 0 for unknown skus instead of throwing, mixed with known ones', async () => {
    expect(await availableMany(['A', 'NOPE', 'C', 'ALSO-NOPE'])).toEqual({
      A: 3,
      NOPE: 0,
      C: 12,
      'ALSO-NOPE': 0,
    });
  });

  it('returns an empty map for an empty sku list', async () => {
    expect(await availableMany([])).toEqual({});
  });

  it('reflects stock changes made by reserve', async () => {
    expect(await reserve('A', 2)).toBe(true);
    expect(await availableMany(['A', 'C'])).toEqual({ A: 1, C: 12 });
  });

  it('de-duplicates repeated skus into a single consistent entry', async () => {
    expect(await availableMany(['A', 'A', 'C'])).toEqual({ A: 3, C: 12 });
  });
});
