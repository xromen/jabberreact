import assert from "node:assert/strict";
import test from "node:test";
import { reconnectDelay } from "./reconnect.ts";

test("останавливает переподключение после пяти попыток", () => {
  assert.equal(reconnectDelay(0), 1_000);
  assert.equal(reconnectDelay(4), 16_000);
  assert.equal(reconnectDelay(5), null);
});
