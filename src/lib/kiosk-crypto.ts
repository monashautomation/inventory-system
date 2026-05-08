const DB_NAME = "kiosk-auth";
const STORE_NAME = "keys";
const KEY_ID = "terminal-key";
const TOKEN_STORAGE_KEY = "kiosk-terminal-token";

// In-memory cache so we only decrypt once per session
let _cachedToken: string | null | undefined = undefined;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(key);
    req.onsuccess = () => resolve(req.result as CryptoKey | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getOrCreateKey(): Promise<CryptoKey> {
  const db = await openDB();
  const existing = await idbGet(db, KEY_ID);
  if (existing) return existing;

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: cannot be read out of the browser
    ["encrypt", "decrypt"],
  );
  await idbPut(db, KEY_ID, key);
  return key;
}

export async function storeToken(token: string): Promise<void> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Encode to base64 safely without spread (avoids stack overflow on larger payloads)
  let binary = "";
  for (let i = 0; i < combined.length; i++)
    binary += String.fromCharCode(combined[i]);
  localStorage.setItem(TOKEN_STORAGE_KEY, btoa(binary));

  _cachedToken = token;
}

export async function loadToken(): Promise<string | null> {
  if (_cachedToken !== undefined) return _cachedToken;

  const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!stored) {
    _cachedToken = null;
    return null;
  }

  try {
    const db = await openDB();
    const key = await idbGet(db, KEY_ID);
    if (!key) {
      _cachedToken = null;
      return null;
    }

    const binary = atob(stored);
    const combined = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) combined[i] = binary.charCodeAt(i);

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    _cachedToken = new TextDecoder().decode(decrypted);
    return _cachedToken;
  } catch {
    _cachedToken = null;
    return null;
  }
}

export function hasStoredCiphertext(): boolean {
  return !!localStorage.getItem(TOKEN_STORAGE_KEY);
}

export async function clearToken(): Promise<void> {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  _cachedToken = undefined;
  const db = await openDB();
  await idbDelete(db, KEY_ID);
}
