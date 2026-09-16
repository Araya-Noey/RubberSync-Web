# RubberSync Backend

ส่วนนี้เป็น REST API, ระบบล็อกอิน, คำขอเบิกจ่าย, ประกาศ, ข้อความ, การจ่ายเงิน และข้อมูล JSON

## เปิดใช้งาน

```bash
npm start
```

ตรวจสอบ API ที่ `http://localhost:8080/api/health`

## Git branch

```bash
git switch backend
git add backend
git commit -m "Update backend"
git push origin backend
```

ห้ามนำค่า `AUTH_SECRET` หรือ `DISCORD_WEBHOOK_URL` จริงขึ้น GitHub