---
name: ship-and-review
description: chain ship + review-pr — ตรวจ เทสต์ commit เปิด PR แล้วรีวิว PR ที่เพิ่งเปิดซ้ำเชิงลึก
allowed-tools: Skill(ship), Skill(review-pr *), Bash(gh pr view:*)
argument-hint: pr-title
model: opus
effort: xhigh
---

รัน skill `ship` ต่อด้วย `review-pr` เป็น flow เดียว โดยส่งชื่อ PR "$1" เข้าไป

ทำตามลำดับ ห้ามข้ามขั้นตอน:

## เฟส 1 — ship

1. เรียก skill `ship` พร้อมชื่อ PR "$1"
2. ถ้า `ship` หยุดกลางทาง (เทสต์แดง / เจอ secret หลุด / commit ไม่สำเร็จ) — **หยุดทั้ง flow ทันที** รายงานสาเหตุที่ `ship` แจ้งมา และห้ามเข้าเฟส 2

## เฟส 2 — review-pr

3. หาเลข PR ที่เพิ่งเปิดจากผลลัพธ์ของ `ship` (URL ที่ `gh pr create` คืนมา) ถ้าไม่ชัดเจนให้รัน `gh pr view --json number,url` บน branch ปัจจุบันเพื่อยืนยันเลข
4. เรียก skill `review-pr` พร้อมเลข PR ที่ได้

## สรุปปิดท้าย

5. แสดงลิงก์ PR พร้อมผลรีวิวที่ได้จาก `review-pr` จัดกลุ่ม 🔴 Blocking / 🟡 Should fix / 🔵 Nit
6. ถ้าเจอ 🔴 Blocking อย่างน้อยหนึ่งข้อ — **หยุด** สรุปให้ชัดว่าเจออะไรบ้าง แล้วรอคำสั่งจากผู้ใช้ว่าจะแก้หรือปล่อยผ่าน ห้ามตัดสินใจแก้เอง

ข้อห้าม (สืบทอดจากทั้งสอง skill):
- ห้ามแก้โค้ดเองนอกเหนือจากที่ `ship` ทำใน local diff เดิม
- ห้าม merge / close PR
- ห้ามโพสต์ comment กลับขึ้น GitHub
