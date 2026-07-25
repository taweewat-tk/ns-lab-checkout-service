# Team Review Checklist (ตัวอย่าง — ปรับตามทีม)

1. เงินเป็น integer cents เสมอ — ห้าม float ในการคำนวณราคา
2. ทุก endpoint ใหม่ต้องมีเทสต์อย่างน้อย happy path + 1 edge case
3. ห้าม `forEach(async ...)` — ใช้ `for..of` หรือ `Promise.all`
4. error ต้องมี message ที่ actionable ไม่กลืน exception เงียบ ๆ
5. ห้าม secret/credential ใด ๆ อยู่ในดิฟฟ์
