import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Express } from 'express';
import { createApp } from '../app';
import { userRepo } from '../repositories/userRepo';
import { createUser } from '../services/authService';
import { available } from '../services/inventoryService';

async function tokenFor(app: Express, username: string, password: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

function checkoutAs(app: Express, token: string) {
  return request(app).post('/orders/checkout').set('Authorization', `Bearer ${token}`);
}

describe('POST /orders/checkout requires authentication', () => {
  it('rejects an anonymous checkout', async () => {
    const app = await createApp();

    const res = await request(app)
      .post('/orders/checkout')
      .send({ lines: [{ sku: 'MUG', quantity: 4 }] });

    expect(res.status).toBe(401);
    expect(await available('MUG')).toBe(4); // stock untouched
  });

  it('rejects a malformed Authorization header', async () => {
    const app = await createApp();

    const res = await checkoutAs(app, '')
      .set('Authorization', 'not-bearer-format')
      .send({ lines: [{ sku: 'MUG', quantity: 1 }] });

    expect(res.status).toBe(401);
  });

  it('rejects a token forged with the old hardcoded secret', async () => {
    const app = await createApp();
    const forged = jwt.sign(
      { sub: 'alice', exp: Math.floor(Date.now() / 1000) + 3600 },
      'dev-only-secret',
    );

    const res = await checkoutAs(app, forged).send({ lines: [{ sku: 'MUG', quantity: 1 }] });

    expect(res.status).toBe(401);
    expect(await available('MUG')).toBe(4);
  });

  it('creates the order for a valid token and records the owner', async () => {
    const app = await createApp();
    const token = await tokenFor(app, 'alice', 'secret123');

    const res = await checkoutAs(app, token).send({ lines: [{ sku: 'MUG', quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body.username).toBe('alice');
    expect(await available('MUG')).toBe(3);
  });
});

describe('idempotency keys are scoped per user', () => {
  it('does not hand one user the order of another using the same key', async () => {
    const app = await createApp();
    const aliceToken = await tokenFor(app, 'alice', 'secret123');
    const bobToken = await tokenFor(app, 'bob', 'hunter2');

    const aliceOrder = await checkoutAs(app, aliceToken)
      .set('Idempotency-Key', 'shared-key')
      .send({ lines: [{ sku: 'MUG', quantity: 1 }] });
    const bobOrder = await checkoutAs(app, bobToken)
      .set('Idempotency-Key', 'shared-key')
      .send({ lines: [{ sku: 'MUG', quantity: 1 }] });

    expect(aliceOrder.status).toBe(201);
    expect(bobOrder.status).toBe(201);
    expect(bobOrder.body.id).not.toBe(aliceOrder.body.id);
    expect(bobOrder.body.username).toBe('bob');
    expect(await available('MUG')).toBe(2); // reserved once for each user
  });

  it('still replays the original order for a repeat of the same user + key', async () => {
    const app = await createApp();
    const token = await tokenFor(app, 'alice', 'secret123');

    const first = await checkoutAs(app, token)
      .set('Idempotency-Key', 'repeat-key')
      .send({ lines: [{ sku: 'MUG', quantity: 1 }] });
    const second = await checkoutAs(app, token)
      .set('Idempotency-Key', 'repeat-key')
      .send({ lines: [{ sku: 'MUG', quantity: 1 }] });

    expect(second.body.id).toBe(first.body.id);
    expect(await available('MUG')).toBe(3); // reserved once
  });
});

describe('POST /orders/checkout rate limiting', () => {
  it('keeps counting successful checkouts and blocks past the limit', async () => {
    const app = await createApp();
    // A user of its own so this bucket can't collide with the other suites.
    await userRepo.put(await createUser('carol', 'carol-password'));
    const token = await tokenFor(app, 'carol', 'carol-password');
    const line = { lines: [{ sku: 'PEN', quantity: 1 }] };

    for (let i = 0; i < 10; i++) {
      const res = await checkoutAs(app, token).send(line);
      expect(res.status).toBe(201);
    }

    const blocked = await checkoutAs(app, token).send(line);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'too many requests' });
    expect(await available('PEN')).toBe(90); // the blocked attempt reserved nothing
  });
});
