import express, { Express } from 'express';
import { productRouter } from './routes/productRoutes';
import { orderRouter } from './routes/orderRoutes';
import { authRouter } from './routes/authRoutes';
import { errorHandler } from './middleware/errorHandler';
import { productRepo } from './repositories/productRepo';
import { couponRepo } from './repositories/couponRepo';
import { userRepo } from './repositories/userRepo';
import { createUser } from './services/authService';

export async function createApp(): Promise<Express> {
  const app = express();
  app.use(express.json());

  await productRepo.seed([
    { sku: 'BOOK', name: 'Paperback', priceCents: 1500, stock: 25 },
    { sku: 'PEN', name: 'Gel Pen', priceCents: 250, stock: 100 },
    { sku: 'MUG', name: 'Coffee Mug', priceCents: 900, stock: 4 },
  ]);

  await couponRepo.seed([
    {
      code: 'SAVE10',
      type: 'percent',
      value: 10,
      minSubtotalCents: 2000,
      expiresAt: '2027-01-01T00:00:00.000Z',
    },
    {
      code: 'WELCOME200',
      type: 'fixed',
      value: 200,
      minSubtotalCents: 1000,
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

  await userRepo.seed([await createUser('alice', 'secret123'), await createUser('bob', 'hunter2')]);

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/products', productRouter);
  app.use('/orders', orderRouter);
  app.use('/auth', authRouter);

  app.use(errorHandler);
  return app;
}
