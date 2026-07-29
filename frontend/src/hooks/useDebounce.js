import { useState, useEffect } from 'react';

// หน่วงค่าเพื่อไม่ให้ค้นหากระตุกเวลาพิมพ์เร็ว
export function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}
