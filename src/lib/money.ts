import { Cents } from '../types';

/** Convert a major-unit amount (e.g. 19.99) to integer cents (1999). */
export function toCents(amount: number): Cents {
  return Math.round(amount * 100);
}

/** Format integer cents as a major-unit string, e.g. 1999 -> "19.99". */
export function formatCents(c: Cents): string {
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** percent (0-100) of an amount, rounded half-up to the nearest cent. */
export function percentOf(c: Cents, percent: number): Cents {
  return Math.round((c * percent) / 100);
}

export function addCents(...vals: Cents[]): Cents {
  return vals.reduce((a, b) => a + b, 0);
}

/** a - b, clamped to never go below 0. */
export function subtractCents(a: Cents, b: Cents): Cents {
  return Math.max(0, a - b);
}
