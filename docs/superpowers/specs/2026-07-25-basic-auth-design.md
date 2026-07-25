# Basic auth (username + password → JWT) — design

## Context

repo นี้เป็น checkout service ที่ไม่มีโค้ด auth ใด ๆ เลย (ยืนยันจากการ grep `auth|user|login|password|session|token|jwt|bcrypt|credential` ทั้ง `src/` — เจอแค่ข้อความในเอกสาร ไม่มีโค้ด) และมี runtime dependency ตัวเดียวคือ `express`

ต้องการเพิ่ม basic authentication ด้วย username + password เพื่อ**ฝึกมือ/prototype** — ไม่ได้จะเอาไปใช้จริงใน production จึงเน้นความเรียบง่ายและ YAGNI มากกว่าความครบถ้วน

**ผลลัพธ์ที่ต้องการ:** `POST /auth/login` ด้วย username+password แล้วได้ JWT กลับมา จากนั้นเรียก `GET /auth/me` พร้อม `Authorization: Bearer <token>` เพื่อดูข้อมูลตัวเอง

## ขอบเขต

| หัวข้อ | ตัดสินใจ |
|--------|----------|
| รูปแบบ | Login → คืน token → ใช้ `Authorization: Bearer <token>` |
| ขอบเขต | แค่ `/auth/*` เท่านั้น ไม่แตะ `/orders` หรือ `/products` เดิม |
| user มาจากไหน | seed ไว้ใน `createApp` เหมือน products/coupons — ไม่มี register |
| token | JWT ผ่าน `jsonwebtoken` |
| expiry | มี — คุมด้วย Clock ที่ inject ได้ |
| secret | `process.env.JWT_SECRET ?? 'dev-only-secret'` (ไม่ลง dotenv) |

**สิ่งที่จงใจไม่ทำ (YAGNI):** register, logout/revoke, refresh token, role/permission, rate limiting, การป้องกัน route เดิม (`/orders`, `/products` ยังเรียกได้โดยไม่ต้องมี token)

## ประเด็นที่ต้องจัดการเป็นพิเศษ

### 1. `errorHandler` แปลงทุก error เป็น 400 — แต่ login ที่ผิดควรได้ 401

`src/middleware/errorHandler.ts` ปัจจุบันคือ:
```ts
res.status(400).json({ error: message });
```
ทุก error ที่ `next(err)` ไป จะกลายเป็น 400 เสมอ ไม่มีทางได้ 401 และ CLAUDE.md ระบุชัดว่า "There is no typed error hierarchy"

**ทางออกที่เลือก:** ให้ route handler ของ `/auth/*` ตอบ 401 กลับตรง ๆ เอง ไม่เรียก `next(err)` สำหรับกรณี credential ผิด/token ไม่ถูกต้อง — ไม่ต้องแก้ `errorHandler` ที่เป็นทางผ่านของทุกเทสต์เดิม ตรงกับหลัก "smallest change that makes the spec true" ใน CLAUDE.md

error อื่น ๆ ที่ไม่ใช่เรื่อง auth (เช่น body ไม่ครบ) ยังโยนผ่าน `next(err)` → 400 ตามปกติ

### 2. `jsonwebtoken` ใช้นาฬิกาของตัวเอง — ต้องประสานกับ Clock ที่ inject ได้

lib นี้คำนวณ `exp` และตรวจหมดอายุจาก `Date.now()` ภายในตัวเอง ไม่รับ Clock จากข้างนอกโดยตรง

**ทางออก (ยืนยันจากเอกสารทางการของ jsonwebtoken แล้ว):**
- ตอน sign: กำหนด `exp` ลง payload เองจาก `clock.now()` — ห้ามใช้ option `expiresIn` พร้อมกัน (`exp` ใน payload และ `expiresIn` option ใส่พร้อมกันไม่ได้ ไลบรารีจะ error)
- ตอน verify: ส่ง option `clockTimestamp` (หน่วยวินาที) = `Math.floor(clock.now() / 1000)` เพื่อ override "เวลาปัจจุบัน" ที่ใช้เช็ค `exp`

## สถาปัตยกรรม

```
POST /auth/login  ──> authService.login(username, password, clock)
                        ├─ userRepo.get(username)
                        ├─ verifyPassword(password, user)   [scrypt + timingSafeEqual]
                        └─ signToken(username, clock)       [jwt.sign, exp จาก clock]
                      → 200 { token, expiresAt }
                      → 401 { error: 'invalid credentials' }  (ตอบตรงใน route)

GET /auth/me      ──> อ่าน header Authorization: Bearer <token>
                        └─ authService.verifyToken(token, clock)  [jwt.verify + clockTimestamp]
                      → 200 { username }
                      → 401 { error: 'invalid or expired token' }
```

### ไฟล์ที่จะสร้าง/แก้

| ไฟล์ | สถานะ | เนื้อหา |
|------|-------|---------|
| `src/types.ts` | แก้ | เพิ่ม `interface User { username: string; passwordSalt: string; passwordHash: string; }` — ตามแบบ interface แบน ๆ ที่มีอยู่ ไม่มี class ไม่มี Date |
| `src/repositories/userRepo.ts` | ใหม่ | `export const userRepo = createAsyncStore<User>((u) => u.username);` — one-liner เหมือน 3 repo เดิม (key ด้วย username ทำให้ login lookup เป็น O(1) เพราะ store ไม่มี query-by-field) |
| `src/services/authService.ts` | ใหม่ | `hashPassword`, `verifyPassword`, `login`, `signToken`, `verifyToken` + `JWT_SECRET` |
| `src/routes/authRoutes.ts` | ใหม่ | `POST /login`, `GET /me` — ตามแบบ `orderRoutes.ts` (named export, typed params, try/catch + next(err)) แต่ auth failure ตอบ 401 ตรง |
| `src/app.ts` | แก้ | `await userRepo.seed([...])` ต่อจาก couponRepo และ `app.use('/auth', authRouter)` |
| `src/__tests__/auth.test.ts` | ใหม่ | เทสต์ระดับ service ตามแบบ 6 suite เดิม |
| `src/__tests__/authHttp.test.ts` | ใหม่ | เทสต์ระดับ HTTP ผ่าน `supertest` (ดูหัวข้อ Testing) — ไฟล์แยกจาก `auth.test.ts` เพราะเทสต์คนละ layer (route response code vs. service logic) |
| `package.json` | แก้ | เพิ่ม `jsonwebtoken` (dependencies) + `@types/jsonwebtoken` (devDependencies) |

### รายละเอียดสำคัญ

**Password hashing** — ใช้ `crypto` ของ Node ล้วน ไม่ลง bcrypt:
- `randomBytes(16)` เป็น salt ต่อ user
- `scrypt(password, salt, 64)` — promisify เพราะเป็น callback API และทุกอย่างใน repo นี้เป็น async
- เทียบด้วย `timingSafeEqual` ไม่ใช่ `===` (กัน timing attack)

**Seed users** — password ต้อง hash ตอน seed ซึ่งเป็น async pattern ที่ `createApp` รองรับอยู่แล้ว (เป็น `async function` และ `await` seed อยู่แล้ว):
```ts
await userRepo.seed([
  await makeUser('alice', 'secret123'),
  await makeUser('bob', 'hunter2'),
]);
```

**Clock** — ตามแบบ `couponService.discountForCoupon(coupon, subtotal, clock = systemClock)`:
```ts
export async function login(username: string, password: string, clock: Clock = systemClock)
export function verifyToken(token: string, clock: Clock = systemClock)
```
เทสต์ใช้ `fixedClock(iso)` ที่มีอยู่แล้วใน `src/lib/clock.ts` — ไม่ใช้ jest fake timers (ตรงกับ convention เดิม)

**TTL** — คงที่ 1 ชั่วโมง ประกาศเป็น constant ใน `authService.ts` (เช่น `const TOKEN_TTL_MS = 60 * 60 * 1000`)

**JWT secret**:
```ts
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-secret';
```
พร้อม guard: ถ้า `process.env.NODE_ENV === 'production'` และไม่มี `JWT_SECRET` ให้ throw ตอน module load — กันเผลอ deploy ด้วย secret ปลอม

## Error handling

| สถานการณ์ | ผลลัพธ์ | ทางที่ไป |
|-----------|---------|----------|
| username ไม่มีในระบบ | `401 { error: 'invalid credentials' }` | ตอบตรงใน route |
| password ผิด | `401 { error: 'invalid credentials' }` (ข้อความเดียวกัน ไม่บอกว่าผิดตรงไหน) | ตอบตรงใน route |
| ไม่ส่ง header / format ผิด | `401 { error: 'invalid or expired token' }` | ตอบตรงใน route |
| token หมดอายุ / signature ผิด | `401 { error: 'invalid or expired token' }` | ตอบตรงใน route |
| body ไม่มี username/password | `400 { error: ... }` | `next(err)` → errorHandler เดิม |

## Testing

ตามแบบ 6 suite เดิม: เทสต์ระดับ service เรียกฟังก์ชันตรง ๆ + `beforeEach` re-seed repo singleton (repo เป็น module-level singleton แชร์กันในไฟล์) + `rejects.toThrow(/regex/)` สำหรับ error

เคสที่ต้องครอบ:
1. login ด้วย credential ถูก → ได้ token ที่ verify ผ่าน
2. login ด้วย password ผิด → ล้มเหลว
3. login ด้วย username ที่ไม่มี → ล้มเหลว (ข้อความเดียวกับข้อ 2)
4. token ที่ยังไม่หมดอายุ → verify ผ่าน ได้ username กลับมา
5. token หมดอายุ → verify ไม่ผ่าน (ใช้ `fixedClock` ตั้งเวลา sign แล้วตั้ง `fixedClock` อีกตัวที่เลย TTL ตอน verify — จุดที่ Clock injection คุ้มค่าที่สุด)
6. token ที่ถูกแก้ signature → verify ไม่ผ่าน

**HTTP-level test (`src/__tests__/authHttp.test.ts`):** repo นี้ยังไม่มีเทสต์ระดับ HTTP เลยแม้แต่ไฟล์เดียว (`supertest` ลงไว้แล้วแต่ไม่เคยถูก import) การตอบ 401 ตรงใน route เป็นตรรกะที่อยู่นอก service จึงเทสต์ระดับ service ไม่ได้ — เพิ่มไฟล์นี้เพื่อทดสอบผ่าน HTTP โดยตรง:
```ts
const app = await createApp();
await request(app).post('/auth/login').send({ username: 'alice', password: 'wrong' }).expect(401);
```

## Verification

1. `npm run typecheck` — เขียว
2. `npm test` — 29 เทสต์เดิมยังเขียวครบ + เทสต์ auth ใหม่ผ่าน
3. รันจริง `npm run dev` แล้วยิง:
   ```bash
   curl -s -X POST localhost:3000/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"alice","password":"secret123"}'
   # → { "token": "eyJ...", "expiresAt": "..." }

   curl -s localhost:3000/auth/me -H "Authorization: Bearer <token>"
   # → { "username": "alice" }

   curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/auth/login \
     -H 'Content-Type: application/json' -d '{"username":"alice","password":"wrong"}'
   # → 401
   ```
4. ยืนยันว่า `/orders/checkout` และ `/products` ยังเรียกได้โดยไม่ต้องมี token (ขอบเขตไม่รั่ว)
