import assert from "node:assert/strict";
import test from "node:test";
import { mergeDirectoryContacts } from "./contacts.ts";
import type { Contact } from "../types.ts";

test("добавляет пользователей поиска и сохраняет данные roster", () => {
  const roster: Contact[] = [
    {
      jid: "anna@example.org",
      name: "Анна",
      groups: ["Команда"],
      presence: "online",
    },
  ];
  const found: Contact[] = [
    {
      jid: "anna@example.org",
      name: "Anna Search",
      groups: [],
      presence: "offline",
    },
    {
      jid: "boris@example.org",
      name: "Борис",
      groups: [],
      presence: "offline",
    },
  ];

  assert.deepEqual(mergeDirectoryContacts(roster, found), [
    {
      jid: "anna@example.org",
      name: "Анна",
      groups: ["Команда"],
      presence: "online",
    },
    {
      jid: "boris@example.org",
      name: "Борис",
      groups: [],
      presence: "offline",
    },
  ]);
});
