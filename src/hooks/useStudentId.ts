import { useCallback, useEffect, useState } from 'react';

export const STUDENT_ID_KEY = 'kd:student:v1:id';
const listeners = new Set<(value: string) => void>();

function emit(value: string): void {
  for (const listener of listeners) listener(value);
}

export function loadStudentId(): string {
  try {
    return typeof window === 'undefined' ? '' : window.localStorage.getItem(STUDENT_ID_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveStudentId(value: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(STUDENT_ID_KEY, value);
  } catch {
    // 存储不可用时仍保留当前页面内的编号。
  }
  emit(value);
}

/** 学号/编号只存在本机，多个导出区共用同一个值。 */
export function useStudentId(): [string, (value: string) => void] {
  const [value, setValue] = useState(loadStudentId);

  useEffect(() => {
    listeners.add(setValue);
    return () => { listeners.delete(setValue); };
  }, []);

  const update = useCallback((next: string) => {
    setValue(next);
    saveStudentId(next);
  }, []);

  return [value, update];
}
