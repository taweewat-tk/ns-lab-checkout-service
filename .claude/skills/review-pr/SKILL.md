---
name: review-pr
description: รีวิว pull request ตามหมายเลขที่ระบุ แล้วสรุปผลใน terminal (ไม่โพสต์กลับ GitHub)
allowed-tools: Read, Grep, Glob, Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh pr checks:*)
argument-hint: pr-number
model: opus
effort: xhigh
---

รีวิว pull request หมายเลข "$1" (ถ้าไม่ได้ระบุมา ให้ถามผู้ใช้ก่อน ห้ามเดาหมายเลข)

ทำตามลำดับ:

1. ดูข้อมูล PR: `gh pr view $1`
2. ดู diff ทั้งหมด: `gh pr diff $1`
3. เปิดไฟล์ที่ถูกแก้แบบเต็มด้วย `Read`/`Grep`/`Glob` เพื่อดูบริบทรอบ ๆ ที่ diff ไม่แสดง — ห้ามรีวิวจาก diff เพียว ๆ
4. ตรวจ 4 แกน:
   - **ความถูกต้อง** — bug ชัดเจน, edge case, race condition, ลำดับการทำงานผิด
   - **Convention ของ repo** — อ้างอิง `CLAUDE.md` โดยตรง เช่น เงินต้องเป็น integer cents ผ่าน `src/lib/money.ts`, concurrency ต้องผ่าน `withLock` ใน `src/lib/locks.ts`, services โยน plain `Error` เท่านั้น, และ "การแก้ต้องเล็กที่สุดเท่าที่ทำให้ spec เป็นจริง"
     **Read `docs/review-checklist.md` ก่อนรีวิวเสมอ** แล้วไล่เช็คตามทุกหมวดในไฟล์นั้นทีละข้อ (🔴 Blocking / 🟡 Should fix / 🔵 Nit) ห้ามใช้เกณฑ์จากความจำ ให้ยึดไฟล์ ณ ตอนรันเป็นฉบับจริงเสมอ
   - **ความปลอดภัย** — secret/token หลุดใน diff, input ที่ไม่ได้ validate
   - **เทสต์** — มีเทสต์ครอบการเปลี่ยนแปลงไหม ตรงกับเกณฑ์ผ่านใน `docs/ASSIGNMENTS.md` ไหม
5. เช็คสถานะ CI: `gh pr checks $1` (ถ้า repo ไม่มี workflow ให้ข้ามข้อนี้ไปเงียบ ๆ ไม่ต้องรายงานเป็นปัญหา)
6. สรุปผลใน terminal จัดกลุ่มตามความรุนแรง พร้อมอ้าง `path:line` ทุกข้อ:
   - 🔴 **Blocking** — ต้องแก้ก่อน merge
   - 🟡 **Should fix** — ควรแก้ แต่ไม่บล็อก
   - 🔵 **Nit** — ข้อเสนอแนะเล็กน้อย
   - ปิดท้ายด้วย verdict สรุปสั้น ๆ ว่า PR นี้พร้อม merge หรือยัง

ข้อห้าม:
- ห้ามโพสต์ comment / approve / request-changes / merge / close กลับขึ้น GitHub — รายงานผลใน terminal เท่านั้น
- ห้ามแก้ไฟล์ใด ๆ ใน working tree — skill นี้อ่านอย่างเดียว
