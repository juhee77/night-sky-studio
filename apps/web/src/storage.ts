// 브라우저 저장소(IndexedDB). 쇼와 내 음악 파일을 이 기기 안에만 저장한다.
// 개인 정보 보호 모드처럼 저장소를 못 쓰는 경우에는 메모리에만 두고 계속 동작한다.

import type { Show } from '@nss/engine';

export interface ShowRecord {
  id: string;
  updatedAt: number;
  show: Show;
}

export interface MusicRecord {
  id: string;
  name: string;
  blob: Blob;
  bpm: number;
  offset: number;
  duration: number;
}

const DB_NAME = 'night-sky-studio';
let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = { shows: new Map<string, ShowRecord>(), music: new Map<string, MusicRecord>() };

function open(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('shows', { keyPath: 'id' });
        db.createObjectStore('music', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function storageAvailable(): Promise<boolean> {
  return (await open()) !== null;
}

function run<T>(store: 'shows' | 'music', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (!db) return reject(new Error('no-db'));
        const req = fn(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function listShows(): Promise<ShowRecord[]> {
  try {
    const all = await run<ShowRecord[]>('shows', 'readonly', (s) => s.getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [...memory.shows.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }
}

export async function getShow(id: string): Promise<ShowRecord | undefined> {
  try {
    return await run<ShowRecord | undefined>('shows', 'readonly', (s) => s.get(id));
  } catch {
    return memory.shows.get(id);
  }
}

export async function putShow(rec: ShowRecord): Promise<void> {
  memory.shows.set(rec.id, rec);
  try {
    await run('shows', 'readwrite', (s) => s.put(rec));
  } catch {
    // 메모리에는 남아 있다.
  }
}

export async function deleteShow(id: string): Promise<void> {
  memory.shows.delete(id);
  try {
    await run('shows', 'readwrite', (s) => s.delete(id));
  } catch {
    // 메모리에서는 지웠다.
  }
}

export async function listMusic(): Promise<MusicRecord[]> {
  try {
    return await run<MusicRecord[]>('music', 'readonly', (s) => s.getAll());
  } catch {
    return [...memory.music.values()];
  }
}

export async function getMusic(id: string): Promise<MusicRecord | undefined> {
  try {
    return await run<MusicRecord | undefined>('music', 'readonly', (s) => s.get(id));
  } catch {
    return memory.music.get(id);
  }
}

export async function putMusic(rec: MusicRecord): Promise<void> {
  memory.music.set(rec.id, rec);
  try {
    await run('music', 'readwrite', (s) => s.put(rec));
  } catch {
    // 메모리에는 남아 있다.
  }
}

/** 음악 파일 지문: 크기 + 앞부분 256KB의 SHA-1 */
export async function fileFingerprint(file: Blob): Promise<string> {
  const head = await file.slice(0, 256 * 1024).arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-1', head);
  const hex = [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `file:${file.size.toString(36)}-${hex}`;
}

export function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const LAST_KEY = 'nss:lastShow';

export function rememberLastShow(id: string): void {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    // 기억하지 못해도 동작에는 문제없다.
  }
}

export function lastShowId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}
