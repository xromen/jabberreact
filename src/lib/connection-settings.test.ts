import assert from "node:assert/strict";
import test from "node:test";
import { connectionSettings } from "./connection-settings.ts";

test("строит WebSocket URL и сохраняет домен полного JID", () => {
  assert.deepEqual(
    connectionSettings({
      username: "max@example.org",
      password: "secret",
      server: "openfire.internal",
    }),
    {
      service: "ws://openfire.internal:7070/ws/",
      jid: "max@example.org",
    },
  );
});
