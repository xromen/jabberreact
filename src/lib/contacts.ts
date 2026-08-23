import type { Contact } from "../types";

export function mergeContacts(current: Contact[], next: Contact[]): Contact[] {
  return next.reduce((contacts, contact) => {
    const existing = contacts.find((item) => item.jid === contact.jid);
    if (!existing) {
      return [...contacts, contact];
    }

    return contacts.map((item) =>
      item.jid === contact.jid
        ? {
            ...item,
            ...contact,
            groups: contact.groups.length ? contact.groups : item.groups,
            presence: item.presence,
            status: item.status,
          }
        : item,
    );
  }, current);
}

export function mergeDirectoryContacts(
  current: Contact[],
  found: Contact[],
): Contact[] {
  const knownJids = new Set(current.map((contact) => contact.jid));
  return [...current, ...found.filter((contact) => !knownJids.has(contact.jid))];
}
