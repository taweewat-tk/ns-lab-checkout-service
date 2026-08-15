# Review Checklist — Code Review Gate

เกณฑ์รีวิวสำหรับ `checkout-service` ใช้เป็น **gate ก่อน merge**
ทุกข้อใน 🔴 ต้องผ่านครบ — ข้อเดียวไม่ผ่าน = ห้าม merge

> วิธีใช้: reviewer ไล่เช็คทีละข้อ อ้าง `path:line` ทุกครั้งที่ตก
> แล้วปิดท้ายด้วย verdict ตาม [template](#verdict-template) ข้างล่าง

---

## 🔴 Blocking — ห้าม merge จนกว่าจะแก้

### เงิน
- [ ] **เงินเป็น integer cents เสมอ — ห้าม float ในการคำนวณราคา**
      คำนวณผ่าน `src/lib/money.ts` (`percentOf`, `addCents`) และ `taxOf` ใน `pricingService.ts`
      ห้าม `toFixed()` / `parseFloat()` / คูณหาร 100 เองกลางทาง — `toCents()` ใช้ที่ขอบ input เท่านั้น
- [ ] **discount ถูก clamp `[0, subtotal]`**
      ต้อง clamp ทั้งใน `couponService.discountForCoupon` และ `pricingService.priceCart` (defense in depth)
      ห้ามตัดข้างใดข้างหนึ่งออกเพราะ "ซ้ำซ้อน"
- [ ] **ภาษีคิดบน `subtotal − discount`** ไม่ใช่บน subtotal ดิบ (`TAX_BPS = 700`)

### Concurrency
- [ ] **check-then-act ที่คร่อม `await` ต้องอยู่ใน `withLock()`**
      ถ้ามีโค้ด `get → ตรวจ → put` โดยมี `await` คั่น แล้วไม่มี lock = race condition
      คีย์ที่ใช้อยู่: `sku:<sku>` (`inventoryService.reserve/release`), `idem:<key>` (`orderService.checkout`)
- [ ] **สต็อกห้ามติดลบในทุกกรณี** รวมถึงตอนยิงพร้อมกัน
- [ ] **repo ที่เป็น async ต้องคง async ไว้** — `src/repositories/asyncStore.ts` รอ `setTimeout(0)` ทุก `get`/`put` โดยตั้งใจ
      ห้าม "optimize" เป็น Map ธรรมดา เพราะมันจะกลบบั๊ก concurrency แทนที่จะเผยให้เห็น

### Checkout / Idempotency
- [ ] **บันทึก idempotency key หลังสำเร็จเท่านั้น** — `idempotencyStore.put()` ต้องอยู่หลัง `doCheckout()` คืนค่า
      ถ้าบันทึกก่อน attempt ที่ fail จะ retry ไม่ได้อีกเลย
- [ ] **key ซ้ำ → คืน order เดิม และห้าม reserve สต็อกซ้ำ**
- [ ] **reserve ล้มกลางทาง → release ของที่จองไปแล้วคืนให้ครบ** ก่อน throw (rollback ใน `orderService.doCheckout`)
      ถ้าไม่ทำ สต็อกจะรั่วค้างไว้
- [ ] **ลำดับใน checkout ไม่สลับ:** resolve coupon → price cart → reserve → persist

### ความปลอดภัย
- [ ] **ห้าม secret / credential / token ใด ๆ อยู่ในดิฟฟ์**
      ข้อยกเว้นเดียว: `.env` ที่ track ไว้แล้วเป็น pretend secret ของ Lab A (permission rules) — **ห้ามเพิ่มค่าจริงลงไป**
- [ ] **input จาก request ถูก validate ก่อนใช้** — `quantity`, `sku`, `couponCode`, `Idempotency-Key`
- [ ] ไม่ log ข้อมูล sensitive (token, password hash, payload เต็ม ๆ)

### CI
- [ ] `npm run typecheck` เขียว (strict mode — ห้ามใช้ `any` / `@ts-ignore` กลบ)
- [ ] `npm test` เขียวทั้งหมด รวม concurrency tests

---

## 🟡 Should fix — ควรแก้ แต่ไม่บล็อก

- [ ] **ทุก endpoint ใหม่ต้องมีเทสต์อย่างน้อย happy path + 1 edge case**
- [ ] **อะไรที่แตะสต็อก / idempotency ต้องมีเทสต์ concurrency** (`Promise.all` ยิงพร้อมกัน) ไม่ใช่แค่ sequential
- [ ] **ห้าม `forEach(async ...)`** — ใช้ `for..of` (ถ้าต้องเรียงลำดับ) หรือ `Promise.all` (ถ้าขนานได้)
      `forEach` ไม่ await callback ผลคือ error หายเงียบและลำดับพัง
- [ ] **error ต้องมี message ที่ actionable ไม่กลืน exception เงียบ ๆ**
      บอกให้ได้ว่า sku ไหน / key ไหน เช่น `insufficient stock for ${sku}` ไม่ใช่ `"failed"`
      ห้าม `catch {}` เปล่า ๆ
- [ ] **services โยน plain `Error` เท่านั้น** — ไม่สร้าง error class ใหม่, ไม่แตะ `res.status()` ในชั้น service
      `src/middleware/errorHandler.ts` แปลงทุก error เป็น 400 ให้อยู่แล้ว
- [ ] **เวลาต้องฉีดผ่าน `Clock`** — logic ที่ขึ้นกับเวลา (เช่น coupon expiry) รับ `Clock` param
      ห้ามเรียก `new Date()` ตรง ๆ ในตัว logic ไม่งั้นเทสต์จะ deterministic ไม่ได้ (ใช้ `fixedClock(iso)`)
- [ ] **การแก้เล็กที่สุดเท่าที่ทำให้ spec เป็นจริง** — repo นี้เป็น teaching repo
      refactor นอกขอบเขต / เปลี่ยนโครงสร้างที่ไม่เกี่ยวกับ assignment = ควรแยก PR
- [ ] เทสต์ตรงกับเกณฑ์ผ่านใน `docs/ASSIGNMENTS.md` ของ track นั้น ๆ

---

## 🔵 Nit — ข้อเสนอแนะ

- [ ] ฟอร์แมตแล้วด้วย `npm run format` (Prettier)
- [ ] ตัวแปรที่เป็นเงินลงท้าย `Cents` เช่น `subtotalCents`, `discountCents`
- [ ] exported function ของ service มี JSDoc บอก `@throws` ให้ครบ
- [ ] ไม่มี `dist/`, `.DS_Store`, `report.json`, ไฟล์ scratch หลุดเข้า diff
- [ ] commit message สั้น ชัด บอก "ทำอะไร/ทำไม"

---

## Verdict template

```
🔴 Blocking (N)
  - path/to/file.ts:12 — <ปัญหา> → <วิธีแก้>

🟡 Should fix (N)
  - path/to/file.ts:34 — ...

🔵 Nit (N)
  - path/to/file.ts:56 — ...

Verdict: ✅ พร้อม merge / ❌ ยังไม่พร้อม — ติด <ข้อไหน>
```

---

## หมายเหตุการดูแลไฟล์นี้

skill `ship` และ `review-pr` ใน `.claude/skills/` **inline 5 ข้อเดิม** ของ checklist นี้ไว้ในตัว
ถ้าแก้เกณฑ์ที่นี่แล้วอยากให้ skill ตามด้วย ต้องไปแก้ `SKILL.md` ทั้งสองไฟล์เองด้วย
