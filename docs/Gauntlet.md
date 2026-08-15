# 🔴 Parallel Refactor Gauntlet — สเปก Units (Day 3 Boss)

ทำบน **checkout-service** · เวลารวม 35 นาที · ทุก unit ต้องมีเทสต์ของตัวเองและ **ห้ามทำเทสต์เดิมแดง**

> **📌 จด baseline ก่อนเริ่มจับเวลา** — รัน `npm test` แล้วจดจำนวนเคสจริงของ repo ตัวเองลง `budget-tracker.md`
> ```bash
> npm test 2>&1 | tail -5      # จดบรรทัด Tests: … passed
> ```
> ตัวเลขนี้**ต่างกันทุกทีม** เพราะแต่ละทีมเพิ่มเทสต์ไว้ไม่เท่ากันตั้งแต่ Day 1 (coupon · idempotency · inventory)
> ตอนจบต้องได้ **≥ baseline ของตัวเอง + เทสต์ใหม่ทุกเคส** — ห้ามเทียบกับเลขของทีมอื่นหรือเลขในเอกสาร

> **U1 กับ U3 ทำไปแล้วใน Lab B** — ถ้า merge เข้า main เรียบร้อยแล้ว นับต่อได้เลย เหลือ U2 + U4 + การรวมทั้งระบบ
> (คะแนน Boss ให้ที่ U2/U4 + การรวม ไม่ได้ให้ซ้ำกับของที่ทำไปแล้วใน Lab B — ดูตารางคะแนนใน workbook)

ไฟล์ของทั้ง 4 unit **ไม่ทับกันเลย** — ออกแบบมาให้ขนานได้เต็มสูบ (merge ลำดับไหนก็ได้)

---

## U1 · `src/lib/money.ts` (+ เทสต์ใน `src/__tests__/money.test.ts`)
เพิ่มฟังก์ชัน:
```ts
export function subtractCents(a: Cents, b: Cents): Cents
```
- ผลลัพธ์**ห้ามติดลบ** — ถ้า `b > a` ให้คืน `0`
- ห้ามแตะ 4 ฟังก์ชันเดิม (`toCents` `formatCents` `percentOf` `addCents`)
- เทสต์ ≥3: `subtractCents(1712, 500) === 1212` · `subtractCents(500, 1712) === 0` · `subtractCents(500, 500) === 0`

## U2 · `src/services/pricingService.ts` (+ เทสต์ใน `src/__tests__/pricing.test.ts`)
Refactor เพื่อความอ่านง่าย — **พฤติกรรมห้ามเปลี่ยน**:
- แยก logic clamp ส่วนลด (บรรทัด `Math.max(0, Math.min(...))` ใน `priceCart`) ออกเป็น
  ```ts
  export function applyDiscount(subtotalCents: number, discountCents: number): number
  ```
  พร้อม JSDoc แล้วให้ `priceCart` เรียกใช้
- เทสต์เดิม 5 เคสต้องเขียว**เป๊ะ** + เพิ่ม ≥1 เทสต์ตรงของ `applyDiscount` (เคสส่วนลดเกิน subtotal → ได้เท่ากับ subtotal)

## U3 · `src/repositories/asyncStore.ts` (+ เทสต์ใน `src/__tests__/asyncStore.test.ts` — สร้างถ้ายังไม่มี)
เพิ่มเมธอดใน object ที่ `createAsyncStore` คืน:
```ts
async has(id: string): Promise<boolean>
```
- ต้อง `await tick()` เหมือนเมธอดอื่น (คงพฤติกรรม "ร้านช้า" ของ store)
- ห้ามแตะเมธอดเดิม (`get` `put` `all` `seed` และเมธอดอื่นที่ทีมเพิ่มไว้เองตั้งแต่ Day 1)
- เทสต์ ≥2: มีของ → `true` · ไม่มีของ → `false`
- ถ้า `asyncStore.test.ts` มีอยู่แล้ว ให้ **เพิ่ม describe block ใหม่** ไม่ต้องเขียนทับไฟล์เดิม

## U4 · `src/services/inventoryService.ts` (+ ไฟล์ใหม่ `src/__tests__/inventoryService.availableMany.test.ts`)
เพิ่มฟังก์ชัน:
```ts
export async function availableMany(skus: string[]): Promise<Record<string, number>>
```
- sku ที่ไม่รู้จัก → ค่า `0` (**ห้าม throw** — ต่างจาก `reserve`/`release` โดยตั้งใจ)
- **ห้ามแตะ `reserve` / `release` / `available` เดิม** — ของพวกนี้ (รวมทั้ง lock ที่ QA track แก้ race ไว้ตั้งแต่ Day 1) ต้องเหมือนเดิมเป๊ะ
  จุดสอน: unit ใหม่ต้อง**ต่อยอด**ของที่ทีมแก้ไว้แล้ว ไม่ใช่รื้อใหม่ — reviewer จะดูตรงนี้
- เทสต์ ≥2: seed ของจริงแล้วถามหลาย sku · ถาม sku มั่วปนของจริง

---

## ลำดับ merge แนะนำ (แต่ลำดับไหนก็ได้)
U1 → U3 → U4 → U2 · **merge ทีละ unit แล้วรัน `npm test` ทุกครั้ง** — ถ้าพังจะรู้ทันทีว่า unit ไหนผิด

## ปิดงาน
- [ ] `npm test` เต็มชุดเขียว และจำนวนเทสต์ = baseline **ที่จดไว้ตอนต้น** + เทสต์ใหม่ทั้งหมด
- [ ] `git worktree list` เหลือตัวหลักตัวเดียว
- [ ] `budget-tracker.md` กรอกครบทั้ง plan และ actual
