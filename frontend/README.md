# Frontend — TikTok Agency CRM (Vite + React + Supabase)

React SPA ที่แทน frontend เดิม (GAS HtmlService). คุย Supabase ตรงผ่าน anon key.

## Setup
```bash
cd frontend
cp .env.example .env      # เติม VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # http://localhost:5173
```
ต้องตั้ง backend (ดู ../backend/README.md) และผูก user เข้าทีมใน team_members ก่อน ไม่งั้น RLS จะไม่คืนข้อมูล

## Build & Deploy (Vercel)
```bash
npm run build             # ออกที่ dist/
```
Vercel: import repo, ตั้ง Root Directory = `frontend`, framework = Vite, ใส่ env `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. `vercel.json` ทำ SPA rewrite ให้แล้ว

## โครงสร้าง
```
src/
  lib/
    supabase.js   createClient
    columns.js    config คอลัมน์ + fuzzy match ไทย + สี + pipeline + deriveFields
    api.js        แทน google.script.run: map rowIndex↔record id, version lock, reshape dashboard
  hooks/          useDebounce, useStickyState
  components/
    Icons, UI_Lib, Modals, Views (CRMTable/MobileCard), Dashboard, App, AuthGate
  styles/index.css   Tailwind directives + theme teal (ยกจาก css.html เดิม)
```

## จุดต่างจากเดิม
- มีหน้า login (Supabase Auth) — เดิมไม่มี
- concurrency = คอลัมน์ version (แทน expectedRow fingerprint)
- ไม่มี Babel/CDN — build ด้วย Vite, Tailwind ผ่าน PostCSS
