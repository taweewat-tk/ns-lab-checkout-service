/**
 * @generated-docs
 * Inventory service — stock reservation, release, and availability lookups
 * for products in `productRepo`. Reservation and release are serialized
 * per SKU via `withLock` to keep concurrent access safe.
 */
import { productRepo } from '../repositories/productRepo';
import { withLock } from '../lib/locks';

/**
 * Reserve `quantity` units of `sku`. Returns true if the reservation
 * succeeded. Stock never goes below zero — the read-check-write section
 * is serialized per SKU with an async lock, so concurrent reservations
 * of the last unit cannot both succeed (the Lab B QA-track bug).
 *
 * @param sku - Product SKU to reserve stock for.
 * @param quantity - Number of units to reserve.
 * @returns `true` if enough stock was available and the reservation
 *   succeeded; `false` if there was insufficient stock.
 * @throws {Error} If `sku` does not exist in `productRepo`.
 */
export async function reserve(sku: string, quantity: number): Promise<boolean> {
  return withLock(`sku:${sku}`, async () => {
    const product = await productRepo.get(sku);
    if (!product) throw new Error(`unknown sku: ${sku}`);

    if (product.stock < quantity) return false;

    await productRepo.put({ ...product, stock: product.stock - quantity });
    return true;
  });
}

/**
 * Release (return) `quantity` previously reserved units of `sku` back to
 * stock. Used to roll back a partial checkout when a later line item
 * fails to reserve. Serialized per SKU with the same lock as `reserve`.
 *
 * @param sku - Product SKU to release stock back to.
 * @param quantity - Number of units to return to stock.
 * @throws {Error} If `sku` does not exist in `productRepo`.
 */
export async function release(sku: string, quantity: number): Promise<void> {
  await withLock(`sku:${sku}`, async () => {
    const product = await productRepo.get(sku);
    if (!product) throw new Error(`unknown sku: ${sku}`);
    await productRepo.put({ ...product, stock: product.stock + quantity });
  });
}

/**
 * Look up the current available stock for `sku`.
 *
 * @param sku - Product SKU to look up.
 * @returns Current stock quantity, or `0` if the SKU does not exist.
 */
export async function available(sku: string): Promise<number> {
  const product = await productRepo.get(sku);
  return product?.stock ?? 0;
}
