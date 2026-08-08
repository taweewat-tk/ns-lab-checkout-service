import { toCents, formatCents, percentOf, addCents, subtractCents } from '../lib/money';

describe('money', () => {
  it('toCents rounds to integer cents', () => {
    expect(toCents(15)).toBe(1500);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30); // float-safe
  });

  it('formatCents formats with padding and sign', () => {
    expect(formatCents(1999)).toBe('19.99');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(-250)).toBe('-2.50');
  });

  it('percentOf rounds half up', () => {
    expect(percentOf(1000, 10)).toBe(100);
    expect(percentOf(255, 10)).toBe(26); // 25.5 -> 26
  });

  it('addCents sums', () => {
    expect(addCents(100, 200, 50)).toBe(350);
  });

  it('subtractCents subtracts normally', () => {
    expect(subtractCents(1712, 500)).toBe(1212);
  });

  it('subtractCents clamps to 0 when b > a', () => {
    expect(subtractCents(500, 1712)).toBe(0);
  });

  it('subtractCents returns 0 when a equals b', () => {
    expect(subtractCents(500, 500)).toBe(0);
  });
});
