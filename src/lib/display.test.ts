import assert from "node:assert/strict";
import test from "node:test";
import { lastSeenAt } from "./display.ts";

test("вычисляет время последнего появления из ответа XMPP", () => {
  assert.equal(lastSeenAt("90", 100_000), 10_000);
  assert.equal(lastSeenAt(null, 100_000), null);
  assert.equal(lastSeenAt("unknown", 100_000), null);
});
