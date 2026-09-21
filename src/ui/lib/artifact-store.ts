/**
 * Локальное хранилище артефактов (IndexedDB) — HANDOFF 04 §2.1.
 * IndexedDB, а не localStorage: дампы бывают по 100k символов, а localStorage
 * синхронный и ограничен ~5 МБ. Любая ошибка хранилища гасится — UI не ломается.
 */

import type { Mode } from '@/types';

export interface Artifact {
  id: string; // crypto.randomUUID()
  mode: Mode; // REPORT | LEARNING_DIGEST | CASE_DRAFT
  title: string; // первая строка markdown без '#', обрезанная до ~80 символов
  markdown: string; // полный текст артефакта
  createdAt: number; // Date.now()
  updatedAt: number;
}

const DB_NAME = 'acoldp';
const STORE = 'artifacts';
const TITLE_MAX = 80;

let dbPromise: Promise<IDBDatabase> | null = null;

/** Ленивая инициализация соединения (open on first call) */
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB недоступен в этом окружении'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
  // Если открытие упало — сбрасываем кэш промиса, чтобы следующая попытка повторила open
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB tx failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB tx aborted'));
  });
}

/** Заголовок артефакта: первая непустая строка markdown без '#', ≤ ~80 символов */
function artifactTitle(markdown: string): string {
  const first = markdown
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  const clean = (first ?? 'Без названия').replace(/^#{1,6}\s*/, '');
  return clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1).trimEnd()}…` : clean;
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fallthrough */
  }
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Создать запись артефакта */
export async function saveArtifact(mode: Mode, markdown: string): Promise<Artifact> {
  const now = Date.now();
  const artifact: Artifact = {
    id: newId(),
    mode,
    title: artifactTitle(markdown),
    markdown,
    createdAt: now,
    updatedAt: now,
  };
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(artifact);
    await txDone(tx);
  } catch {
    /* хранилище недоступно — возвращаем артефакт в память, UI не ломается */
  }
  return artifact;
}

/** Все артефакты, отсортированные по updatedAt desc */
export async function listArtifacts(): Promise<Artifact[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const all = await requestToPromise(tx.objectStore(STORE).getAll() as IDBRequest<Artifact[]>);
    await txDone(tx);
    return (all ?? []).slice().sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** Артефакт по id (или null) */
export async function getArtifact(id: string): Promise<Artifact | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const artifact = await requestToPromise(
      tx.objectStore(STORE).get(id) as IDBRequest<Artifact | undefined>,
    );
    await txDone(tx);
    return artifact ?? null;
  } catch {
    return null;
  }
}

/** Обновить markdown/title/updatedAt существующей записи (или null, если её нет) */
export async function updateArtifact(id: string, markdown: string): Promise<Artifact | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const existing = (await requestToPromise(store.get(id) as IDBRequest<Artifact | undefined>)) ?? null;
    if (!existing) {
      await txDone(tx);
      return null;
    }
    const updated: Artifact = {
      ...existing,
      markdown,
      title: artifactTitle(markdown),
      updatedAt: Date.now(),
    };
    store.put(updated);
    await txDone(tx);
    return updated;
  } catch {
    return null;
  }
}

/** Удалить артефакт (тихо игнорирует ошибки) */
export async function deleteArtifact(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
  } catch {
    /* хранилище недоступно — не ломаем UI */
  }
}
