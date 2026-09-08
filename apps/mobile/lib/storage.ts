import * as SecureStore from "expo-secure-store";

/**
 * SecureStore rejects values over about 2 KB, and a Supabase session is larger, so values are split.
 * The count is written after the parts and stale parts are removed last, so an interrupted write
 * never leaves a shorter session readable as complete.
 */
const CHUNK = 1800;
const countKey = (key: string) => `${key}.n`;
const partKey = (key: string, i: number) => `${key}.${i}`;

async function readCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key));
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export const chunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const n = await readCount(key);
    if (n === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(partKey(key, i));
      if (part === null) return null; // a partial value is not a session
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const previous = await readCount(key);
    const n = Math.max(1, Math.ceil(value.length / CHUNK));
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(partKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(countKey(key), String(n));
    for (let i = n; i < previous; i++) await SecureStore.deleteItemAsync(partKey(key, i));
  },
  async removeItem(key: string): Promise<void> {
    const n = await readCount(key);
    await SecureStore.deleteItemAsync(countKey(key));
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(partKey(key, i));
  },
};
