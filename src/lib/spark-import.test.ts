import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSparkTranscript } from './spark-import.ts'

test('imports incoming and outgoing Spark transcript messages', () => {
  const messages = parseSparkTranscript(`<transcript><messages>
    <message><to>max@example.test/JabberReact</to><from>anna@example.test/Spark</from><body>Привет &amp; добро пожаловать</body><date>2026-08-19 10:11:12.345 VLAT</date></message>
    <message><to>anna@example.test</to><from>max@example.test/Spark</from><body>Спасибо!</body><date>2026-08-19 10:12:00.0 VLAT</date></message>
  </messages></transcript>`, 'max@example.test')

  assert.equal(messages.length, 2)
  assert.equal(messages[0].conversation, 'anna@example.test')
  assert.equal(messages[0].direction, 'incoming')
  assert.equal(messages[0].body, 'Привет & добро пожаловать')
  assert.equal(messages[1].direction, 'outgoing')
})
