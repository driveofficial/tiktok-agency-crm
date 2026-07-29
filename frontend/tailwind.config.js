/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  // ปิด preflight ไม่จำเป็น — theme override อยู่ใน styles/index.css แล้ว
  plugins: [],
};
