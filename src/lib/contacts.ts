import type { Contact } from '../types.ts'

export function mergeContacts(current: Contact[], next: Contact[]): Contact[] {
  return next.reduce((result, contact) => {
    const existing = result.find((item) => item.jid === contact.jid)
    if (!existing) return [...result, contact]

    return result.map((item) => item.jid === contact.jid ? {
      ...item,
      ...contact,
      groups: contact.groups.length ? contact.groups : item.groups,
      presence: item.presence,
      status: item.status,
    } : item)
  }, current)
}

export function mergeDirectoryContacts(current: Contact[], found: Contact[]): Contact[] {
  const known = new Set(current.map((contact) => contact.jid))
  return [...current, ...found.filter((contact) => !known.has(contact.jid))]
}
