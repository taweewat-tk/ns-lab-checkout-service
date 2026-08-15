import { Router, Request, Response, NextFunction } from 'express';
import { checkout } from '../services/orderService';
import { CartLine } from '../types';
import { requireAuth, authedUsername } from '../middleware/requireAuth';
import { rateLimit } from '../middleware/rateLimit';

export const orderRouter = Router();

// Caps how fast one account can consume stock. `resetOnSuccess` stays off on
// purpose: successful checkouts are exactly what needs capping here, so
// clearing the bucket on 201 would leave no limit at all.
const checkoutLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyOf: (req) => `checkout:${authedUsername(req)}`,
});

// POST /orders/checkout
// Dev track: read `couponCode` from the body and `Idempotency-Key` from headers.
// requireAuth runs first so the limiter can key on the identity, and an
// unauthenticated flood is turned away before it reaches any store.
orderRouter.post(
  '/checkout',
  requireAuth,
  checkoutLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const lines = (req.body?.lines ?? []) as CartLine[];
      const order = await checkout({
        lines,
        username: authedUsername(req),
        couponCode: req.body?.couponCode ?? null,
        idempotencyKey: req.header('Idempotency-Key') ?? undefined,
      });
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  },
);
