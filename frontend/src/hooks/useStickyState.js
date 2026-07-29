import { useState, useEffect } from 'react';

// จำค่าไว้ใน localStorage (instant load รอบหน้า)
export function useStickyState(defaultValue, key) {
  const [value, setValue] = useState(() => {
    const sticky = window.localStorage.getItem(key);
    return sticky !== null ? JSON.parse(sticky) : defaultValue;
  });
  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue];
}
