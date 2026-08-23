import type { Contact } from "../types";

export function ensureContact(contacts: Contact[], jid: string): Contact[] {
  if (contacts.some((contact) => contact.jid === jid)) {
    return contacts;
  }

  return [
    ...contacts,
    { jid, name: jid.split("@")[0], groups: [], presence: "offline" },
  ];
}

export function presenceRank(contact: Contact): number {
  switch (contact.presence) {
    case "online":
      return 0;
    case "away":
      return 1;
    case "dnd":
      return 2;
    default:
      return 3;
  }
}
