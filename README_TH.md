# RubberSync Web — เวอร์ชันใช้งานจริงบนเว็บ

โปรเจกต์นี้เขียนใหม่ทั้งหมด เป็นเว็บ Responsive + PWA พร้อม Backend ในตัว ใช้ได้บน Windows, macOS, Android และ iPhone ผ่าน Browser

## จุดสำคัญ
- ไม่ใช้ React Native / Expo
- ไม่ต้อง `npm install` เพราะ Backend ใช้ Node.js built-in modules เท่านั้น
- ข้อมูลผู้ใช้ / คำขอ / ประกาศ / การจ่ายเงิน บันทึกลง `data/db.json`
- มือถือหลายเครื่องที่เข้า URL ของคอม/เซิร์ฟเวอร์เครื่องเดียวกัน จะเห็นข้อมูลชุดเดียวกัน
- รองรับแนบใบเสร็จในคำขอเบิก และสลิปยืนยันการจ่ายเงินจริง (PNG/JPG/WebP สูงสุด 5 MB)
- มีห้องสนทนากลางภายในระบบ และรายชื่อพร้อมข้อมูลติดต่อของผู้ใช้
- รองรับ PWA สามารถ Add to Home Screen ได้

## วิธีเปิดบน Windows
1. ต้องมี Node.js 18 ขึ้นไป
2. แตก ZIP
3. เข้าโฟลเดอร์ที่เห็น `server.js`, `package.json`, `START_WEB.bat` อยู่ทันที
4. ดับเบิลคลิก `START_WEB.bat`
5. เปิด `http://localhost:8080`

มือถือ Android/iPhone ให้ต่อ Wi‑Fi เดียวกับคอม แล้วเปิด URL ที่ Terminal แสดง เช่น
`http://192.168.1.110:8080`

## บัญชีทดสอบ
User
- เบอร์: `0800000001`
- รหัสผ่าน: `12345678`

## เชื่อม Discord Chat

1. สร้าง Discord Bot และเชิญ Bot เข้า Server ที่ต้องการ
2. เปิด Developer Mode ใน Discord แล้วคัดลอก Channel ID ของห้องแชท
3. สร้างไฟล์ `.env` ที่โฟลเดอร์หลักจาก `.env.example` แล้วตั้งค่า:

```env
DISCORD_BOT_TOKEN=ใส่_Bot_Token_ของคุณ
DISCORD_CHANNEL_ID=ใส่_Channel_ID_ของคุณ
```

Bot ต้องมีสิทธิ์ `View Channel`, `Read Message History` และ `Send Messages` จึงจะแสดงประวัติและส่งข้อความจาก RubberSync ได้

Admin
- เบอร์: `0800000000`
- รหัสผ่าน: `12345678`

## ข้อมูลที่บันทึก
- `data/db.json` ฐานข้อมูลแบบ JSON สำหรับระบบนี้
- `public/uploads/` รูปใบเสร็จและสลิปที่อัปโหลด

สำหรับขึ้นออนไลน์จริง แนะนำ deploy บน VPS/Render/Railway พร้อม HTTPS และย้ายฐานข้อมูลไป PostgreSQL/MySQL เมื่อมีผู้ใช้จำนวนมาก
