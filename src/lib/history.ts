import type { ChatMessage } from '../types'

const DB_NAME = 'jabber-react-history'
const STORE_NAME = 'messages'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
      store.createIndex('conversation', ['account', 'conversation', 'timestamp'])
      store.createIndex('account', 'account')
    }
  })
}

async function write(run: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.onerror = () => reject(tx.error)
    tx.oncomplete = () => resolve()
    run(tx.objectStore(STORE_NAME))
  })
  db.close()
}

async function readAll(request: (store: IDBObjectStore) => IDBRequest): Promise<ChatMessage[]> {
  const db = await openDatabase()
  const result = await new Promise<ChatMessage[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    tx.onerror = () => reject(tx.error)
    const query = request(tx.objectStore(STORE_NAME))
    query.onerror = () => reject(query.error)
    query.onsuccess = () => resolve(query.result as ChatMessage[])
  })
  db.close()
  return result
}

export function saveMessage(message: ChatMessage): Promise<void> {
  return write((store) => { store.put(message) })
}

export async function saveMessages(messages: ChatMessage[]): Promise<void> {
  if (!messages.length) return
  await write((store) => {
    messages.forEach((message) => store.put(message))
  })
}

export function getMessages(account: string, conversation: string): Promise<ChatMessage[]> {
  return readAll((store) => {
    const range = IDBKeyRange.bound([account, conversation, 0], [account, conversation, Number.MAX_SAFE_INTEGER])
    return store.index('conversation').getAll(range)
  })
}

export async function getAccountHistory(account: string): Promise<ChatMessage[]> {
  const messages = await readAll((store) => store.index('account').getAll(account))
  return messages.sort((a, b) => a.timestamp - b.timestamp)
}

export function clearAccountHistory(account: string): Promise<void> {
  return write((store) => {
    const request = store.index('account').openKeyCursor(IDBKeyRange.only(account))
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor) {
        store.delete(cursor.primaryKey)
        cursor.continue()
      }
    }
  })
}

export async function exportHistory(account: string): Promise<void> {
  const messages = await getAccountHistory(account)
  const blob = new Blob([JSON.stringify({ version: 1, account, messages }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `jabber-history-${account.replace(/[^a-z0-9.-]/gi, '_')}.json`
  link.click()
  URL.revokeObjectURL(url)
}
