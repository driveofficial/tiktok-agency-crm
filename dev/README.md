# Dev tooling — TikTok Agency CRM

โฟลเดอร์นี้คือเครื่องมือพัฒนา **ในเครื่องเท่านั้น** — ไม่ต้องคัดลอกเข้า Apps Script.
ต้องมี Node.js. รันครั้งแรก: `cd dev && npm install`.

## 1. Local preview (แก้แล้วเห็นผลทันที ไม่ต้อง deploy)

```bash
npm run preview          # สร้าง dev/preview.html
node serve.mjs           # เสิร์ฟที่ http://localhost:4173
```

เปิด http://localhost:4173 ในเบราว์เซอร์. ใช้ **mock data** (ไม่ต่อ Google Sheet) —
utils.html มีสาขา mock อยู่แล้วเมื่อ `window.isGAS` เป็น false. แก้ไฟล์ต้นฉบับ แล้ว `npm run preview` ใหม่.

## 3. Build สำหรับ deploy (precompile JSX — ตัด Babel ออก)

```bash
npm run build            # สร้างโฟลเดอร์ ../dist/
```

`dist/` = ไฟล์พร้อมวางเข้า Apps Script. JSX ถูกคอมไพล์เป็น `React.createElement` แล้ว
และ `index.html` ไม่โหลด Babel CDN อีก (หน้าโหลดเร็วขึ้นบนมือถือ).

**เวิร์กโฟลว์ใหม่:** แก้ไฟล์ต้นฉบับที่ root → `npm run build` → คัดลอก **ทุกไฟล์ใน `dist/`**
เข้า Apps Script editor → Deploy. (ชื่อไฟล์/โครงสร้างเหมือนเดิมทุกอย่าง — แค่คัดจาก `dist/` แทน root)

> ต้นฉบับที่แก้ = ไฟล์ที่ root (App.html, Views.html, ...). `dist/` เป็นผลลัพธ์ build อย่าแก้ตรงนั้น.

## 5. Tests

```bash
npm test
```

ทดสอบฟังก์ชัน pure ที่เสี่ยงพังเงียบๆ (วันที่ พ.ศ./ค.ศ., fuzzy match หัวคอลัมน์ไทย,
pipeline stage) โดยโหลด **โค้ดจริง** จาก `code.gs` + `utils.html` ผ่าน `node:vm` — ไม่ก๊อปโลจิก
มาไว้ในเทสต์ จึงไม่มี drift. เพิ่มเคสได้ที่ `tests/*.test.mjs`.

## ไฟล์ในโฟลเดอร์นี้

| ไฟล์ | หน้าที่ |
|------|---------|
| `lib.mjs` | ตัวช่วยร่วม: อ่านไฟล์, ดึง script block, คอมไพล์ JSX ด้วย esbuild |
| `build.mjs` | สร้าง `../dist/` (#3) |
| `preview.mjs` | สร้าง `preview.html` (#1) |
| `serve.mjs` | static server เล็กๆ (file:// เปิดตรงไม่ได้) |
| `tests/` | ชุดเทสต์ (#5) |
