export interface StoredFont {
  id: string;
  name: string;
  buffer: ArrayBuffer;
}

const DB_NAME = "label-designer";
const STORE = "fonts";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open font storage"));
  });
}

export async function listStoredFonts(): Promise<StoredFont[]> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
      const fonts: StoredFont[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(fonts);
          return;
        }
        const value = cursor.value as { name?: string; buffer: ArrayBuffer };
        fonts.push({ id: String(cursor.key), name: value.name ?? String(cursor.key), buffer: value.buffer });
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error("Could not read fonts"));
    });
  } finally {
    db.close();
  }
}

export async function saveStoredFont(font: StoredFont): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .put({ name: font.name, buffer: font.buffer }, font.id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not save the font"));
    });
  } finally {
    db.close();
  }
}

export async function deleteStoredFont(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not delete the font"));
    });
  } finally {
    db.close();
  }
}
