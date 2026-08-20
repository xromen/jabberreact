import assert from 'node:assert/strict'
import test from 'node:test'
import { connectionSettings } from './connection-settings.ts'

test('builds a direct Openfire BOSH URL and keeps a full JID domain', () => {
  assert.deepEqual(
    connectionSettings({ username: 'max@example.org', password: 'secret', server: 'openfire.internal' }),
    { service: 'http://openfire.internal:7070/http-bind/', jid: 'max@example.org' },
  )
})
