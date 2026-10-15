# RubberSync Web v2 — ระบบบริหารจัดการสวนยาง

เวอร์ชันนี้ปรับให้ตรงกับ Requirements หลัก 3 ระบบมากขึ้น: ระบบติดต่อสื่อสาร, ระบบจัดการรอบขายยางและแจ้งเตือน, และระบบเบิกค่าใช้จ่าย

## ฟังก์ชันหลัก
- ผู้ใช้ 4 บทบาท: เจ้าของสวน, คนดูแลสวน, คนดูแลคนงาน, คนงานกรีดยาง
- ห้องสื่อสารกลุ่มภายใน RubberSync
- ส่งข้อความจาก RubberSync ไป Discord ผ่าน Webhook
- รับข้อความจาก Discord กลับมาแสดงใน RubberSync ผ่าน Discord Bot Token + Channel ID
- เก็บแหล่งที่มาของข้อความว่า RubberSync หรือ Discord และกันข้อความ Discord ซ้ำด้วย Discord Message ID
- รอบขายยาง: วันเก็บยาง, วันขายยาง, ราคายาง/ราคาประมูล, ประวัติรอบขาย
- แจ้งเตือนกำหนดการและแจ้งเมื่อมีการเปลี่ยนวันเก็บ/วันขาย
- คนงานสร้างคำขอเบิก พร้อมแนบใบเสร็จ/หลักฐาน PNG/JPG/WebP สูงสุด 5 MB
- เจ้าของสวนอนุมัติ/ไม่อนุมัติ
- คนดูแลสวนหรือเจ้าของสวนบันทึกการจ่ายเงินและแนบสลิป
- ผู้ใช้บันทึกบัญชีรับเงินของตนเอง และผู้จ่ายเห็นบัญชีผู้รับพร้อมแนบสลิปยืนยันในหน้าจ่ายเงิน
- ตรวจรายการที่อาจเบิกซ้ำจาก ผู้ขอ + ประเภท + จำนวนเงิน + วันที่
- เก็บประวัติคำขอและสถานะย้อนหลัง
- PWA ใช้บน Windows/macOS/Android/iPhone ผ่าน Browser

## วิธีเปิดบน Windows
1. ติดตั้ง Node.js 18 ขึ้นไป
2. แตก ZIP
3. เปิดโฟลเดอร์ที่มี `server.js` และ `START_WEB.bat`
4. ดับเบิลคลิก `START_WEB.bat`
5. เปิด `http://localhost:8080`

มือถือที่อยู่ Wi-Fi เดียวกับคอม ใช้ URL IP ที่ Terminal แสดง เช่น `http://192.168.1.110:8080`

## บัญชีทดสอบ
รหัสผ่านทุกบัญชี: `12345678`

- เจ้าของสวน: `0800000000`
- คนดูแลสวน: `0800000002`
- คนดูแลคนงาน: `0800000003`
- คนงานกรีดยาง: `0800000001`

ผู้สมัครสมาชิกใหม่จะได้บทบาท `คนงานกรีดยาง` โดยอัตโนมัติ

## การตั้ง Discord
### 1) ส่ง RubberSync -> Discord
กำหนด `DISCORD_WEBHOOK_URL`

PowerShell:
```powershell
$env:DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
node server.js
```

### 2) รับ Discord -> RubberSync
Webhook ปกติรับข้อความจาก Discord กลับไม่ได้ จึงต้องใช้ Discord Bot ที่มีสิทธิ์ `View Channel` และ `Read Message History` แล้วกำหนด:

```powershell
$env:DISCORD_BOT_TOKEN="..."
$env:DISCORD_CHANNEL_ID="..."
node server.js
```

เมื่อเปิดหน้าสื่อสาร RubberSync จะดึงข้อความล่าสุดจาก Channel และบันทึกโดยใช้ Discord Message ID ป้องกันการซ้ำ

## การตั้ง SMS สำหรับลืมรหัสผ่าน
ระบบส่ง OTP ผ่าน Twilio เมื่อกำหนดค่าต่อไปนี้ก่อนเริ่มเซิร์ฟเวอร์:

```powershell
$env:TWILIO_ACCOUNT_SID="AC..."
$env:TWILIO_AUTH_TOKEN="..."
$env:TWILIO_FROM_NUMBER="+1..."
node server.js
```

รหัส OTP หมดอายุใน 5 นาทีและยืนยันผิดได้ไม่เกิน 5 ครั้ง โหมดพัฒนาที่ไม่ใช่ `NODE_ENV=production` จะแสดงรหัสทดสอบบนหน้าจอ; Production จะไม่เริ่มส่งรหัสหากยังไม่ได้ตั้งค่า Twilio

## การเชื่อมต่อ Supabase Database
ระบบใช้ Supabase Postgres เก็บข้อมูลแอปทั้งหมดในแถว JSONB เดียว โดยยังคงระบบล็อกอินและ API เดิมไว้

1. เปิด SQL Editor ใน Supabase แล้วรันสคริปต์ [`supabase/schema.sql`](./supabase/schema.sql)
2. คัดลอก `.env.example` เป็น `.env` แล้วกำหนด Project URL และ `service_role` key ในไฟล์ `.env` (ไฟล์นี้ถูก ignore โดย Git):

```env
SUPABASE_URL=https://ijhxgvzhuifkuyuarsje.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ใส่ค่า service_role key จาก Supabase
```

ห้ามส่งหรือใส่ `service_role` key ใน frontend หรือ commit ลง Git หากตารางยังไม่มีข้อมูล ระบบจะนำข้อมูลจาก `data/db.json` เข้า Supabase ในการเริ่มทำงานครั้งแรก; หากไม่มีไฟล์ดังกล่าวจะเริ่มจากข้อมูลตัวอย่าง สำหรับเครื่องที่ไม่ได้ตั้งค่า Supabase ระบบยังใช้ `data/db.json` ตามเดิม ตรวจสอบแหล่งฐานข้อมูลได้จาก `GET /api/health` (`database: "supabase"` หรือ `"local"`)

การเชื่อมต่อนี้ครอบคลุมข้อมูลในฐานข้อมูลเท่านั้น ไฟล์ใบเสร็จและสลิปยังเก็บใน `public/uploads/` บนเครื่องเซิร์ฟเวอร์ และการทำงานปัจจุบันควรใช้ Node.js backend เพียง instance เดียว

## ข้อมูลที่บันทึก
- เมื่อไม่ได้ตั้งค่า Supabase: `data/db.json` เก็บผู้ใช้ คำขอ รอบขาย ข้อความ การแจ้งเตือน ประกาศ และรายการจ่ายเงิน
- เมื่อตั้งค่า Supabase: ตาราง `rubbersync_app_state` เก็บข้อมูลแอปเดียวกัน; `data/db.json` จะใช้เป็นข้อมูลตั้งต้นเฉพาะเมื่อแถวยังไม่มี
- `public/uploads/` เก็บใบเสร็จและสลิป

## หมายเหตุสำหรับ Production
- ต้องเปลี่ยน `AUTH_SECRET`
- ควรใช้ HTTPS
- ควรใช้ Supabase และสำรองฐานข้อมูลเมื่อใช้งานจริง
- Discord Bot Token ต้องเก็บเป็น environment variable เท่านั้น ห้ามใส่ใน frontend หรือ commit ขึ้น Git
