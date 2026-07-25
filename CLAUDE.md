# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A small but realistic checkout/orders service used as a **training lab** (Claude Code Bootcamp "Lab B", Dev + QA tracks). This is the **SOLUTION branch** — all assignments are implemented, `npm run build` is clean, and `npm test` passes (~29 tests including concurrency tests). The learner-facing branch ships these same files as stubs/bugs; see `SOLUTION.md` for the file-by-file diff between solution and learner state, and `docs/ASSIGNMENTS.md` for the original tasks (docs are in Thai).

Stack: Node.js · TypeScript (strict) · Express 4 · Jest (ts-jest). No database — data lives in async in-memory stores.

## Commands

```bash
npm install
npm run build          # tsc -> dist/
npm run typecheck      # tsc --noEmit (no output)
npm test               # jest, all suites
npm run dev            # tsx watch, http://localhost:3000
npm start              # run compiled dist/index.js

npx jest src/__tests__/inventory.test.ts        # single test file
npx jest -t "does not oversell"                 # single test by name
```

## Core design decisions (the parts that span files)

- **Money is integer cents**, never floats. All arithmetic goes through `src/lib/money.ts` (`percentOf`, `taxOf`, `addCents`). `Cents` is just `number` but the convention is load-bearing — don't introduce decimal dollars.

- **Repositories are deliberately async.** `src/repositories/asyncStore.ts` awaits a `setTimeout(0)` tick on every `get`/`put`. This is intentional: it forces real interleaving so concurrency bugs are observable rather than hidden by synchronous Maps. All three repos (`productRepo`, `orderRepo`, `couponRepo`) are singletons built from `createAsyncStore`, seeded in `src/app.ts`.

- **Concurrency is controlled by one primitive:** `withLock(key, fn)` in `src/lib/locks.ts` — a per-key async mutex (a `Map<key, Promise>` chain). Two places depend on it and both are the heart of the lab:
  - `inventoryService.reserve/release` wrap their read-check-write in `withLock('sku:<sku>')` so concurrent reservations of the last unit can't both succeed (QA-track oversell bug). The bug being fixed is *check-then-act across an `await`* — removing the lock reintroduces oversell.
  - `orderService.checkout` wraps the whole operation in `withLock('idem:<key>')` when an `Idempotency-Key` is present.

- **Checkout orchestration** (`src/services/orderService.ts`) is the one flow that ties everything together. Order of operations matters:
  1. resolve coupon → 2. price cart (`priceCart(lines, discount)`) → 3. reserve stock line-by-line, **releasing already-reserved lines if a later line fails** (rollback) → 4. persist.
  - **Idempotency:** the key is checked *before* work and recorded in `idempotencyStore` **only after success** — so a failed attempt can be safely retried. A repeated key returns the *original* order and does not touch stock again.

- **Tax** is 7% (`TAX_BPS = 700`), charged on `subtotal − discount`. Discount is clamped to `[0, subtotal]` in both `couponService` and `priceCart` (defense in depth).

- **Clock is injectable** (`src/lib/clock.ts`). `couponService.discountForCoupon` takes a `Clock` param (defaults to `systemClock`) so expiry logic is deterministic in tests via `fixedClock(iso)`.

## Layout

- `src/lib/` — `money` (cents math), `clock` (injectable time), `locks` (per-key mutex)
- `src/repositories/` — `asyncStore` factory + product/order/coupon singletons
- `src/services/` — `pricing`, `inventory`, `coupon`, `order` (orchestration)
- `src/routes/` — Express routers; `orderRoutes` reads `couponCode` from body and `Idempotency-Key` from headers
- `src/middleware/errorHandler.ts` — any thrown Error → `400 { error: message }`
- `src/app.ts` — builds the app and seeds products + coupons; `index.ts` starts the server

## Conventions

- Services throw plain `Error`; the error middleware turns every thrown error into HTTP 400. There is no typed error hierarchy.
- Keep changes minimal and spec-driven — this is a teaching repo; the goal is the smallest change that makes the assignment's spec true.
