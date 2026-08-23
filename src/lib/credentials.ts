import type { LoginData } from "../types";

const DB_NAME = "jabber-react-credentials";
const STORE_NAME = "secure-data";
const KEY_ID = "encryption-key";
const LOGIN_ID = "login";

type EncryptedLogin = {
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
  });
}

async function read<T>(id: string): Promise<T | undefined> {
  const database = await openDatabase();

  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = database
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as T | undefined);
    });
  } finally {
    database.close();
  }
}

async function write(id: string, value: unknown): Promise<void> {
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
      transaction.objectStore(STORE_NAME).put(value, id);
    });
  } finally {
    database.close();
  }
}

export async function saveLogin(login: LoginData): Promise<void> {
  let key = await read<CryptoKey>(KEY_ID);
  if (!key) {
    key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
    await write(KEY_ID, key);
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(login));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext,
  );
  await write(LOGIN_ID, { iv, ciphertext } satisfies EncryptedLogin);
}

export async function loadLogin(): Promise<LoginData | null> {
  const [key, encrypted] = await Promise.all([
    read<CryptoKey>(KEY_ID),
    read<EncryptedLogin>(LOGIN_ID),
  ]);
  if (!key || !encrypted) {
    return null;
  }

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: encrypted.iv },
      key,
      encrypted.ciphertext,
    );
    const login = JSON.parse(new TextDecoder().decode(plaintext)) as LoginData;
    return login.username && login.password && login.server ? login : null;
  } catch {
    await clearLogin();
    return null;
  }
}

export async function clearLogin(): Promise<void> {
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
      const store = transaction.objectStore(STORE_NAME);
      store.delete(KEY_ID);
      store.delete(LOGIN_ID);
    });
  } finally {
    database.close();
  }
}
