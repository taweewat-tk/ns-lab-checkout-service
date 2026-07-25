---
name: ship
description: review งานปัจจุบัน รันเทสต์ แล้ว commit + เปิด PR เมื่อทุกอย่างเขียว
allowed-tools: Read, Grep, Glob, Bash(npm test:*), Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(gh pr create:*)
argument-hint: pr-title
model: sonnet
effort: high
---

ทำตามลำดับ ห้ามข้ามขั้นตอน:

1. ดู diff ปัจจุบัน: !`git diff`
2. รีวิวหา bug ชัด ๆ / secret หลุด / โค้ดที่ผิด convention ทีม — เช็คตาม `docs/review-checklist.md` ทีละข้อ:
   1. เงินเป็น integer cents เสมอ — ห้าม float ในการคำนวณราคา
   2. ทุก endpoint ใหม่ต้องมีเทสต์อย่างน้อย happy path + 1 edge case
   3. ห้าม `forEach(async ...)` — ใช้ `for..of` หรือ `Promise.all`
   4. error ต้องมี message ที่ actionable ไม่กลืน exception เงียบ ๆ
   5. ห้าม secret/credential ใด ๆ อยู่ในดิฟฟ์
   ถ้าเจอข้อไหนไม่ผ่าน ให้หยุดเหมือนเทสต์แดง — ห้าม commit จนกว่าจะแก้
3. รัน `npm test` - ถ้าแดง ให้หยุด รายงานสาเหตุ และห้าม commit
4. ถ้าเขียวทั้งหมด: `git add` เฉพาะไฟล์ที่เกี่ยว, commit ข้อความสั้นชัด
5. เปิด PR ชื่อ "$1" (ถ้าไม่ให้มา ให้ตั้งจาก diff) พร้อมสรุป ทำอะไร/ทำไม
