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
2. รีวิวหา bug ชัด ๆ / secret หลุด / โค้ดที่ผิด convention ทีม — **Read `docs/review-checklist.md` ก่อนรีวิวเสมอ** แล้วไล่เช็คดิฟฟ์ตามทุกหมวดในไฟล์นั้นทีละข้อ ห้ามใช้เกณฑ์จากความจำ ให้ยึดไฟล์ ณ ตอนรันเป็นฉบับจริงเสมอ
   - หมวด 🔴 Blocking: ถ้าเจอข้อไหนไม่ผ่าน ให้หยุดเหมือนเทสต์แดง — ห้าม commit จนกว่าจะแก้
   - หมวด 🟡 Should fix / 🔵 Nit: ไม่บล็อก แต่ต้องรายงานให้ครบ
   - สรุปผลรีวิวตาม Verdict template ท้ายไฟล์
3. รัน `npm test` - ถ้าแดง ให้หยุด รายงานสาเหตุ และห้าม commit
4. ถ้าเขียวทั้งหมด: `git add` เฉพาะไฟล์ที่เกี่ยว, commit ข้อความสั้นชัด
5. เปิด PR ชื่อ "$1" (ถ้าไม่ให้มา ให้ตั้งจาก diff) พร้อมสรุป ทำอะไร/ทำไม
