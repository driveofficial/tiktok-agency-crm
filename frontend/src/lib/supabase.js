import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // เตือนชัดๆ ตอน dev ถ้าลืมตั้ง .env
  console.error('ขาด VITE_SUPABASE_URL หรือ VITE_SUPABASE_ANON_KEY — คัดลอก .env.example เป็น .env');
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
