# ระบบสั่งอาหารสำหรับร้านอาหารรายเดียว (Single-Restaurant QR Order System)

ระบบสั่งอาหารและจัดการร้านอาหารสำหรับเจ้าของร้านรายเดียว เขียนด้วย **HTML + Vanilla CSS + JavaScript** เชื่อมกับ backend ที่ `server/` ผ่าน REST API และ Socket.IO

---

## 📁 โครงสร้างโฟลเดอร์ในโปรเจกต์

```text
Project/
├── owner/                      → เว็บฝั่งเจ้าของร้าน (Owner Web App)
│   ├── index.html              → หน้าหลัก (สถานะร้าน, รายการโต๊ะเปิดอยู่)
│   ├── new-orders.html         → รายการออเดอร์ใหม่ + ปุ่มกดรับออเดอร์
│   ├── close-bill.html         → เลือกโต๊ะปิดบิล
│   ├── table-detail.html       → รายละเอียดโต๊ะ + ปิดบิล
│   ├── menu.html               → จัดการเมนูอาหาร + ของหมด
│   ├── edit-menu-item.html     → แก้ไขเมนู + จัดการท็อปปิ้ง
│   ├── sales.html              → สรุปยอดขายวันนี้ + เมนูขายดี
│   ├── css/styles.css          → สไตล์ฝั่งเจ้าของร้าน
│   └── js/                     → Logic ฝั่งเจ้าของร้าน (api.js, home.js, etc.)
│
├── customer/                   → เว็บฝั่งลูกค้า (Customer Web App)
│   ├── index.html              → หน้าสั่งอาหาร & ติดตามสถานะออเดอร์ (customer.html)
│   ├── css/customer.css        → สไตล์ฝั่งลูกค้า (Mobile-First UI, Bottom Sheet, Floating Cart)
│   └── js/customer.js          → Logic ฝั่งลูกค้า (เลือกท็อปปิ้ง, ตะกร้าสินค้า, สั่งอาหาร, Socket.IO)
│
└── server/                     → Backend Server (Node.js + Express + Socket.IO)
    ├── server.js               → REST API endpoints + Socket.IO real-time server
    └── package.json
```

---

## 🚀 วิธีการรันระบบ

1. เข้าไปที่โฟลเดอร์ `server` และติดตั้ง dependencies (หากยังไม่ได้ติดตั้ง):
   ```bash
   cd server
   npm install
   ```

2. รัน Server:
   ```bash
   npm start
   # หรือรัน dev mode: npm run dev
   ```
   ต้องเห็นข้อความ: `Server running at http://localhost:3001`

3. **เข้าใช้งานผ่านเว็บเบราว์เซอร์**:
   - **ฝั่งเจ้าของร้าน (Owner)**: `http://localhost:3001/owner/index.html` (หรือ `http://localhost:3001/owner`)
   - **ฝั่งลูกค้า (Customer)**: `http://localhost:3001/customer/index.html?table=5` (หรือ `http://localhost:3001/customer/?table=5`)

---

## ✨ ฟีเจอร์ที่ทำงานได้จริง

### ฝั่งเจ้าของร้าน (Owner)
- ✅ เปิด-ปิดร้าน และ เปิด-ปิดรับออเดอร์ Dine-in
- ✅ ดูรายการโต๊ะที่เปิดอยู่ real-time ผ่าน Socket.IO
- ✅ รับแจ้งเตือนออเดอร์ใหม่ + กดรับออเดอร์
- ✅ เลือกโต๊ะปิดบิล พร้อมสรุปยอดขายแยกตามรอบ
- ✅ จัดการเมนู: เพิ่ม/แก้ไข/toggle ของหมด และจัดการตัวเลือกย่อย/ท็อปปิ้ง
- ✅ ดูสรุปยอดขายประจำวันนี้ และ 5 เมนูขายดี

### ฝั่งลูกค้า (Customer)
- ✅ สแกน/เข้าผ่าน URL ระบุหมายเลขโต๊ะ (เช่น `?table=5`)
- ✅ ตรวจสอบสถานะร้านเปิด/ปิด real-time
- ✅ ดูรายการเมนูแยกตามหมวดหมู่
- ✅ Modal ปรับแต่งความเผ็ด/ความหวาน/เพิ่มท็อปปิ้ง + ระบุโน้ตพิเศษ + ปุ่มปรับจำนวน (- 1 +)
- ✅ Floating Cart Bar แสดงจำนวนรายการและราคารวม
- ✅ ตรวจสอบรายการในตะกร้า แก้ไข/ลบรายการ และกดส่งออเดอร์
- ✅ ติดตามสถานะออเดอร์ (`⏳ รอร้านรับออเดอร์`, `✅ ร้านรับออเดอร์แล้ว`) และดูยอดรวมบิลโต๊ะปัจจุบัน real-time
