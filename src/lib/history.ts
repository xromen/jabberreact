import type { ChatMessage } from "../types";

const DB_NAME = "jabber-react-history";
const STORE_NAME = "messages";

export type MessagePage = {
  messages: ChatMessage[];
  hasMore: boolean;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, {
        keyPath: "id",
      });
      store.createIndex("conversation", ["account", "conversation", "timestamp"]);
      store.createIndex("account", "account");
    };
  });
}

async function write(run: (store: IDBObjectStore) => void): Promise<void> {
  const database = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
      run(transaction.objectStore(STORE_NAME));
    });
  } finally {
    database.close();
  }
}

async function readAll(
  request: (store: IDBObjectStore) => IDBRequest,
): Promise<ChatMessage[]> {
  const database = await openDatabase();

  try {
    return await new Promise<ChatMessage[]>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      transaction.onerror = () => reject(transaction.error);

      const query = request(transaction.objectStore(STORE_NAME));
      query.onerror = () => reject(query.error);
      query.onsuccess = () => resolve(query.result as ChatMessage[]);
    });
  } finally {
    database.close();
  }
}

export function saveMessage(message: ChatMessage): Promise<void> {
  return write((store) => store.put(message));
}

export async function saveMessages(messages: ChatMessage[]): Promise<void> {
  if (!messages.length) {
    return;
  }

  await write((store) => {
    messages.forEach((message) => store.put(message));
  });
}

export function getMessages(
  account: string,
  conversation: string,
): Promise<ChatMessage[]> {
  return readAll((store) => {
    const range = IDBKeyRange.bound(
      [account, conversation, 0],
      [account, conversation, Number.MAX_SAFE_INTEGER],
    );
    return store.index("conversation").getAll(range);
  });
}

export async function getMessagePage(
  account: string,
  conversation: string,
  before = Number.MAX_SAFE_INTEGER,
  limit = 50,
): Promise<MessagePage> {
  const database = await openDatabase();

  try {
    return await new Promise<MessagePage>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      transaction.onerror = () => reject(transaction.error);
      const range = IDBKeyRange.bound(
        [account, conversation, 0],
        [account, conversation, Math.max(0, before - 1)],
      );
      const request = transaction
        .objectStore(STORE_NAME)
        .index("conversation")
        .openCursor(range, "prev");
      const messages: ChatMessage[] = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || messages.length > limit) {
          const hasMore = messages.length > limit;
          resolve({
            messages: messages.slice(0, limit).reverse(),
            hasMore,
          });
          return;
        }

        messages.push(cursor.value as ChatMessage);
        cursor.continue();
      };
    });
  } finally {
    database.close();
  }
}

export async function getMessagesFrom(
  account: string,
  conversation: string,
  from: number,
  limit = 50,
): Promise<ChatMessage[]> {
  const database = await openDatabase();

  try {
    return await new Promise<ChatMessage[]>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      transaction.onerror = () => reject(transaction.error);
      const range = IDBKeyRange.bound(
        [account, conversation, from],
        [account, conversation, Number.MAX_SAFE_INTEGER],
      );
      const request = transaction
        .objectStore(STORE_NAME)
        .index("conversation")
        .openCursor(range, "next");
      const messages: ChatMessage[] = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || messages.length === limit) {
          resolve(messages);
          return;
        }

        messages.push(cursor.value as ChatMessage);
        cursor.continue();
      };
    });
  } finally {
    database.close();
  }
}

export async function searchMessages(
  account: string,
  conversation: string,
  query: string,
  limit = 100,
): Promise<ChatMessage[]> {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return [];
  }

  return (await getMessages(account, conversation))
    .filter((message) => message.body.toLocaleLowerCase().includes(normalized))
    .slice(-limit)
    .reverse();
}

export async function getAccountHistory(
  account: string,
): Promise<ChatMessage[]> {
  const messages = await readAll((store) =>
    store.index("account").getAll(account),
  );
  return messages.sort((first, second) => first.timestamp - second.timestamp);
}

export function clearAccountHistory(account: string): Promise<void> {
  return write((store) => {
    const request = store.index("account").openKeyCursor(IDBKeyRange.only(account));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }

      store.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}

export async function exportHistory(account: string): Promise<void> {
  const messages = await getAccountHistory(account);
  const blob = new Blob(
    [JSON.stringify({ version: 1, account, messages }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `jabber-history-${account.replace(/[^a-z0-9.-]/gi, "_")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
