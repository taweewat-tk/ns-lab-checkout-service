# Basic Auth (username/password → JWT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add username/password login that issues a JWT, and a `/auth/me` endpoint that verifies it — scoped entirely to new `/auth/*` routes, with zero changes to existing checkout/order/product behavior.

**Architecture:** Password hashing and JWT issuance/verification live in a new `authService.ts`, following the existing service-layer pattern (plain functions, injectable `Clock`, throws plain `Error`). A new `userRepo` (same `createAsyncStore` factory as the other three repos) holds seeded users. A new `authRouter` handles HTTP concerns only — it answers 401 directly instead of delegating to the flat 400-only `errorHandler`.

**Tech Stack:** Express 4, TypeScript (strict), Jest + ts-jest + supertest (first HTTP-level tests in this repo), Node's built-in `crypto` (scrypt password hashing), `jsonwebtoken` (new dependency) for JWT.

## Global Constraints

- Scope: only `/auth/*` routes are added. `/orders/*` and `/products/*` must remain unchanged and unauthenticated.
- No new runtime dependency besides `jsonwebtoken` (`@types/jsonwebtoken` is dev-only). No `bcrypt`, no `dotenv`, no `express-session`, no `cookie-parser`.
- JWT secret: `process.env.JWT_SECRET ?? 'dev-only-secret'`; throw at module load if `NODE_ENV === 'production'` and `JWT_SECRET` is unset.
- Token TTL: exactly 1 hour (3600 seconds), computed via the injectable `Clock` (`src/lib/clock.ts`) — never `Date.now()` directly.
- Error message strings (exact — used in both `rejects.toThrow(/regex/)` assertions and HTTP response bodies): `'invalid credentials'` for bad login, `'invalid or expired token'` for a bad/missing/expired token.
- HTTP status codes: `200` for successful login/me, `401` for auth failures (answered directly in the route handler, not via `next(err)`), `400` for a malformed request body (via `next(err)` → existing `errorHandler`).
- No register, logout, refresh token, roles, or rate limiting — explicitly out of scope (YAGNI).

---

### Task 1: User model, repository, and password hashing

**Files:**
- Modify: `src/types.ts`
- Create: `src/repositories/userRepo.ts`
- Create: `src/services/authService.ts`
- Test: `src/__tests__/auth.test.ts`

**Interfaces:**
- Consumes: `createAsyncStore<T>(key: (item: T) => string)` from `src/repositories/asyncStore.ts` (existing — returns `{ get, put, all, seed }`).
- Produces:
  - `interface User { username: string; passwordSalt: string; passwordHash: string; }` (in `src/types.ts`)
  - `userRepo: ReturnType<typeof createAsyncStore<User>>` (in `src/repositories/userRepo.ts`)
  - `hashPassword(password: string): Promise<{ salt: string; hash: string }>`
  - `verifyPassword(password: string, user: User): Promise<boolean>`
  - `createUser(username: string, password: string): Promise<User>`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/auth.test.ts`:

```ts
import { createUser, verifyPassword } from '../services/authService';

describe('password hashing', () => {
  it('verifies the correct password and rejects a wrong one', async () => {
    const user = await createUser('alice', 'secret123');
    await expect(verifyPassword('secret123', user)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', user)).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/auth.test.ts`
Expected: FAIL — `Cannot find module '../services/authService'`

- [ ] **Step 3: Add the `User` type**

Append to `src/types.ts` (after the existing `Order` interface, end of file):

```ts
export interface User {
  username: string;
  passwordSalt: string;
  passwordHash: string;
}
```

- [ ] **Step 4: Create the user repository**

Create `src/repositories/userRepo.ts`:

```ts
import { User } from '../types';
import { createAsyncStore } from './asyncStore';

export const userRepo = createAsyncStore<User>((u) => u.username);
```

- [ ] **Step 5: Implement password hashing**

Create `src/services/authService.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { User } from '../types';

const scryptAsync = promisify(scrypt) as unknown as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<{ salt: string; hash: string }> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return { salt, hash: derived.toString('hex') };
}

export async function verifyPassword(password: string, user: User): Promise<boolean> {
  const derived = await scryptAsync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, 'hex');
  if (derived.length !== stored.length) return false;
  return timingSafeEqual(derived, stored);
}

export async function createUser(username: string, password: string): Promise<User> {
  const { salt, hash } = await hashPassword(password);
  return { username, passwordSalt: salt, passwordHash: hash };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest src/__tests__/auth.test.ts`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit code 0

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/repositories/userRepo.ts src/services/authService.ts src/__tests__/auth.test.ts
git commit -m "feat(auth): add user model, repository, and password hashing"
```

---

### Task 2: Login and token verification (JWT)

**Files:**
- Modify: `package.json` (add `jsonwebtoken` dependency)
- Modify: `src/services/authService.ts` (append `login`, `verifyToken`)
- Modify: `src/__tests__/auth.test.ts` (append `login` and `verifyToken` test suites)

**Interfaces:**
- Consumes: `User`, `userRepo` (Task 1); `verifyPassword` (Task 1); `Clock`, `systemClock`, `fixedClock` from `src/lib/clock.ts` (existing — `Clock.now(): Date`).
- Produces:
  - `interface LoginResult { token: string; expiresAt: string; }`
  - `login(username: string, password: string, clock?: Clock): Promise<LoginResult>` — throws `Error('invalid credentials')` on bad username or password.
  - `verifyToken(token: string, clock?: Clock): string` — returns the username; throws `Error('invalid or expired token')` on any failure (missing, expired, tampered).

- [ ] **Step 1: Add the `jsonwebtoken` dependency**

In `package.json`, add to `"dependencies"`:

```json
"jsonwebtoken": "^9.0.2"
```

And add to `"devDependencies"` (keep alphabetical order, right after `@types/jest`):

```json
"@types/jsonwebtoken": "^9.0.7"
```

Then run:

```bash
npm install
```

Verify: `ls node_modules/jsonwebtoken` succeeds.

- [ ] **Step 2: Write the failing tests**

Replace the full contents of `src/__tests__/auth.test.ts` with:

```ts
import { createUser, verifyPassword, login, verifyToken } from '../services/authService';
import { userRepo } from '../repositories/userRepo';
import { fixedClock } from '../lib/clock';

beforeEach(async () => {
  await userRepo.seed([await createUser('alice', 'secret123')]);
});

describe('password hashing', () => {
  it('verifies the correct password and rejects a wrong one', async () => {
    const user = await createUser('alice', 'secret123');
    await expect(verifyPassword('secret123', user)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', user)).resolves.toBe(false);
  });
});

describe('login', () => {
  it('returns a token for correct credentials', async () => {
    const result = await login('alice', 'secret123');
    expect(result.token).toEqual(expect.any(String));
    expect(result.expiresAt).toEqual(expect.any(String));
  });

  it('rejects wrong password', async () => {
    await expect(login('alice', 'wrong-password')).rejects.toThrow(/invalid credentials/);
  });

  it('rejects unknown username', async () => {
    await expect(login('nobody', 'secret123')).rejects.toThrow(/invalid credentials/);
  });
});

describe('verifyToken', () => {
  it('returns the username for a valid, unexpired token', async () => {
    const clock = fixedClock('2026-01-01T00:00:00.000Z');
    const { token } = await login('alice', 'secret123', clock);
    expect(verifyToken(token, clock)).toBe('alice');
  });

  it('rejects a token past its 1-hour expiry', async () => {
    const issuedAt = fixedClock('2026-01-01T00:00:00.000Z');
    const { token } = await login('alice', 'secret123', issuedAt);
    const later = fixedClock('2026-01-01T01:00:01.000Z'); // 1h + 1s later
    expect(() => verifyToken(token, later)).toThrow(/invalid or expired token/);
  });

  it('rejects a token with a tampered signature', async () => {
    const { token } = await login('alice', 'secret123');
    const parts = token.split('.');
    parts[2] = parts[2][0] === 'x' ? 'y' + parts[2].slice(1) : 'x' + parts[2].slice(1);
    expect(() => verifyToken(parts.join('.'))).toThrow(/invalid or expired token/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest src/__tests__/auth.test.ts`
Expected: FAIL — `login`/`verifyToken` are not exported from `authService`

- [ ] **Step 4: Implement `login` and `verifyToken`**

Append to `src/services/authService.ts` (add these imports to the top of the file, alongside the existing ones, and append the code below the existing functions):

```ts
import jwt from 'jsonwebtoken';
import { Clock, systemClock } from '../lib/clock';
import { userRepo } from '../repositories/userRepo';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-secret';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

const TOKEN_TTL_SECONDS = 60 * 60;

export interface LoginResult {
  token: string;
  expiresAt: string;
}

export async function login(
  username: string,
  password: string,
  clock: Clock = systemClock,
): Promise<LoginResult> {
  const user = await userRepo.get(username);
  if (!user) throw new Error('invalid credentials');

  const ok = await verifyPassword(password, user);
  if (!ok) throw new Error('invalid credentials');

  const nowSeconds = Math.floor(clock.now().getTime() / 1000);
  const expSeconds = nowSeconds + TOKEN_TTL_SECONDS;
  const token = jwt.sign({ sub: user.username, exp: expSeconds }, JWT_SECRET);
  return { token, expiresAt: new Date(expSeconds * 1000).toISOString() };
}

export function verifyToken(token: string, clock: Clock = systemClock): string {
  const nowSeconds = Math.floor(clock.now().getTime() / 1000);
  let payload: unknown;
  try {
    payload = jwt.verify(token, JWT_SECRET, { clockTimestamp: nowSeconds });
  } catch {
    throw new Error('invalid or expired token');
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    typeof (payload as { sub?: unknown }).sub !== 'string'
  ) {
    throw new Error('invalid or expired token');
  }
  return (payload as { sub: string }).sub;
}
```

> Note: `exp` is set directly in the payload from the injected `Clock`, and `verifyToken` passes `clockTimestamp` (seconds) to `jwt.verify` — this is how the library's internal clock is reconciled with this repo's `Clock` abstraction. Do not add `expiresIn` to `jwt.sign`'s options — `jsonwebtoken` throws if both `exp` (payload) and `expiresIn` (options) are set.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/__tests__/auth.test.ts`
Expected: PASS (7 tests: 1 hashing + 3 login + 3 verifyToken)

- [ ] **Step 6: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck silent/exit 0; all suites green (7 original + this new one)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/services/authService.ts src/__tests__/auth.test.ts
git commit -m "feat(auth): add JWT login and token verification"
```

---

### Task 3: HTTP layer — routes and app wiring

**Files:**
- Create: `src/routes/authRoutes.ts`
- Modify: `src/app.ts`
- Test: `src/__tests__/authHttp.test.ts`

**Interfaces:**
- Consumes: `login`, `verifyToken`, `createUser` (Task 1 & 2); `userRepo` (Task 1); `createApp` from `src/app.ts` (existing, returns `Promise<Express>`).
- Produces: `authRouter: Router` (in `src/routes/authRoutes.ts`), mounted at `/auth` — `POST /auth/login`, `GET /auth/me`.

- [ ] **Step 1: Write the failing HTTP tests**

Create `src/__tests__/authHttp.test.ts`:

```ts
import request from 'supertest';
import { createApp } from '../app';

describe('POST /auth/login (HTTP)', () => {
  it('returns 200 and a token for correct credentials', async () => {
    const app = await createApp();
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'alice', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('returns 401 for wrong password', async () => {
    const app = await createApp();
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'alice', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid credentials' });
  });

  it('returns 400 when password is missing from the body', async () => {
    const app = await createApp();
    const res = await request(app).post('/auth/login').send({ username: 'alice' });
    expect(res.status).toBe(400);
  });
});

describe('GET /auth/me (HTTP)', () => {
  it('returns 200 and the username for a valid Bearer token', async () => {
    const app = await createApp();
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ username: 'alice', password: 'secret123' });
    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'alice' });
  });

  it('returns 401 with no Authorization header', async () => {
    const app = await createApp();
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed Authorization header', async () => {
    const app = await createApp();
    const res = await request(app).get('/auth/me').set('Authorization', 'not-bearer-format');
    expect(res.status).toBe(401);
  });
});

describe('existing routes remain unauthenticated', () => {
  it('GET /products still works without a token', async () => {
    const app = await createApp();
    const res = await request(app).get('/products');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/authHttp.test.ts`
Expected: FAIL — `/auth/login` and `/auth/me` don't exist yet (404s), so status assertions fail

- [ ] **Step 3: Create the auth router**

Create `src/routes/authRoutes.ts`:

```ts
import { Router, Request, Response, NextFunction } from 'express';
import { login, verifyToken } from '../services/authService';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  const username = req.body?.username;
  const password = req.body?.password;
  if (!username || !password) {
    next(new Error('username and password are required'));
    return;
  }
  try {
    const result = await login(username, password);
    res.status(200).json(result);
  } catch {
    res.status(401).json({ error: 'invalid credentials' });
  }
});

authRouter.get('/me', (req: Request, res: Response) => {
  const header = req.header('Authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'invalid or expired token' });
    return;
  }
  try {
    const username = verifyToken(token);
    res.status(200).json({ username });
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
});
```

- [ ] **Step 4: Wire into `app.ts`**

Replace the full contents of `src/app.ts` with:

```ts
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
    { code: 'SAVE10', type: 'percent', value: 10, minSubtotalCents: 2000, expiresAt: '2027-01-01T00:00:00.000Z' },
    { code: 'WELCOME200', type: 'fixed', value: 200, minSubtotalCents: 1000, expiresAt: '2027-01-01T00:00:00.000Z' },
    { code: 'EXPIRED', type: 'percent', value: 50, minSubtotalCents: 0, expiresAt: '2020-01-01T00:00:00.000Z' },
  ]);

  await userRepo.seed([
    await createUser('alice', 'secret123'),
    await createUser('bob', 'hunter2'),
  ]);

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/products', productRouter);
  app.use('/orders', orderRouter);
  app.use('/auth', authRouter);

  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest src/__tests__/authHttp.test.ts`
Expected: PASS (7 tests: 3 login + 3 me + 1 existing-route sanity check)

- [ ] **Step 6: Run the full suite**

Run: `npm run typecheck && npm test`
Expected: typecheck silent/exit 0; every suite green, including the 6 original suites, `auth.test.ts`, and `authHttp.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/routes/authRoutes.ts src/app.ts src/__tests__/authHttp.test.ts
git commit -m "feat(auth): add /auth/login and /auth/me HTTP endpoints"
```

---

### Task 4: End-to-end verification

**Files:** none (verification only — no code changes expected)

**Interfaces:** none — this task exercises the running server via `curl` to prove the HTTP contract holds outside of the supertest in-process harness.

- [ ] **Step 1: Full automated check**

Run: `npm run typecheck && npm test`
Expected: typecheck silent/exit 0; all suites green (6 original + `auth.test.ts` + `authHttp.test.ts` = 8 suites)

- [ ] **Step 2: Start the dev server**

Run in the background: `npm run dev`
Expected: `checkout-service listening on http://localhost:3000`

- [ ] **Step 3: Manual login**

```bash
curl -s -X POST localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"secret123"}'
```
Expected: `{"token":"eyJ...","expiresAt":"..."}`

- [ ] **Step 4: Manual /me with the token**

```bash
TOKEN=$(curl -s -X POST localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"username":"alice","password":"secret123"}' | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).token))")
curl -s localhost:3000/auth/me -H "Authorization: Bearer $TOKEN"
```
Expected: `{"username":"alice"}`

- [ ] **Step 5: Manual wrong-password check**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"alice","password":"wrong"}'
```
Expected: `401`

- [ ] **Step 6: Confirm existing routes are untouched**

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/products
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/orders/checkout \
  -H 'Content-Type: application/json' -d '{"lines":[{"sku":"BOOK","quantity":1}]}'
```
Expected: `/products` → `200`, `/orders/checkout` → `201` — no `Authorization` header sent, neither route requires one

- [ ] **Step 7: Stop the dev server**

Stop the background `npm run dev` process.

If any manual check in Steps 3–6 fails, fix the relevant file from Task 1–3, re-run Step 1, and commit the fix before proceeding. If all checks pass, no further commit is needed for this task.
