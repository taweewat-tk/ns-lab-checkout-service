# 💰 Budget Tracker — Parallel Refactor Gauntlet

> กรอก **plan ก่อนเริ่มจับเวลา** · กรอก actual ระหว่างทาง (cost จาก `--output-format json` หรือ `/usage`)

ทีม: audience/aomz · เวลาเริ่ม: 2026-08-08 · เพดานงบรวมที่ประกาศ: $2.00

**Baseline ก่อนเริ่ม** (รัน `npm test` แล้วจดเดี๋ยวนี้): จำนวนเทสต์ที่ผ่าน = 43 เคส (8 suites)
> ตัวเลขนี้เป็นของ repo ทีมคุณเอง ต่างจากทีมอื่นแน่นอน — ตอนจบเทียบกับเลขนี้เท่านั้น

| Unit | วิธีรัน (มือ / agent / batch) | เพดาน cost (plan) | cost จริง | เวลาจริง (นาที) | ผล (merged? เทสต์เขียว?) |
|---|---|---|---|---|---|
| U1 money.subtractCents | มือ (inline, ในเซสชันหลัก) | $0 | ~$0 | ~1 | merged · เขียว (43→46) |
| U2 pricing.applyDiscount | agent (`claude -p`, worktree แยก) | $0.75 | $0.8667 | 4.6 | merged · เขียว (53→57) |
| U3 asyncStore.has | มือ (inline, ในเซสชันหลัก) | $0 | ~$0 | ~1 | merged · เขียว (46→48) |
| U4 inventory.availableMany | agent (`claude -p`, worktree แยก) | $0.75 | $0.8534 | 4.4 | merged · เขียว (48→53) |
| **รวม** | — | **$1.50** | **$1.72** | **~11** | 4/4 merged, 57/57 เขียว |

(เพดานรวมที่ประกาศไว้ตอนต้น $2.00 — ใช้จริง $1.72 อยู่ในงบ. ตัวเลข cost/เวลาของ U2, U4 อ่านตรงจาก `total_cost_usd`/`duration_ms` ใน JSON output ของแต่ละ `claude -p --output-format json`; ของ U1/U3 เป็นมือจึงไม่มีตัวเลขจริงจากระบบ ประมาณจากเวลาที่ใช้แก้ 2 ไฟล์เล็ก ๆ)

หลัง merge ครบ:
- จำนวนเทสต์ก่อนเริ่ม: 43 · หลังจบ: 57 (43 baseline + 3 U1 + 2 U3 + 5 U4 + 4 U2 — ครบทั้ง ≥ เดิม และเทสต์ใหม่ทุกเคส)
- Unit ที่แพงสุดคือ **U2** ($0.8667 / 17 turns) เพราะ ทั้ง U2 และ U4 เจอปัญหาเดียวกัน: prompt ที่ส่งเข้าไปเปิดด้วยข้อความ persona ของ subagent `refactor-worker` (ที่ตั้ง `isolation: worktree` ไว้ใน frontmatter) ทำให้ session ข้างในตัดสินใจ dispatch งานไปเป็น subagent นั้นเอง ซึ่งไปสร้าง **worktree ใหม่ซ้อนอีกชั้น** (ไม่ใช่ worktree ที่เราเตรียมไว้ให้) พอมันรัน `npm test` แล้วเจอว่า diff ว่างเปล่าในไดเรกทอรีที่สั่ง มันต้องมานั่งไล่ตรวจ + apply โค้ดเดิมซ้ำเองในไดเรกทอรีที่ถูกต้อง — เสีย turn ไปกับการ debug กระบวนการของตัวเอง ไม่ใช่กับโค้ด (U2 เจอหนักกว่าเพราะไล่ทัน 17 turns เทียบกับ U4 ที่ 12 turns)
- ครั้งหน้าจะลดงบยังไง: อย่าเปิด prompt ของ `claude -p` ด้วยข้อความ persona ที่ตรงกับชื่อ/คำอธิบาย subagent ที่มี `isolation: worktree` อยู่แล้วเวลาที่เราคุม worktree เองอยู่แล้ว — ให้บอกตรง ๆ ในบรรทัดแรกว่า "คุณทำงานอยู่ใน worktree นี้แล้ว ห้ามสร้าง worktree ใหม่" หรือส่ง flag ปิดการ auto-dispatch ไปยัง subagent อื่น จะตัดรอบ turn ที่เสียไปกับการ recover ออก น่าจะลด cost ต่อ unit ที่ delegate ได้ราว 30–40%
