import type { ChatMessage } from '../types'

const bare = (jid: string) => jid.trim().split('/')[0].toLowerCase()
const element = (xml: string, name: string) => decodeXml(xml.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '')

export function parseSparkTranscript(xml: string, account: string): ChatMessage[] {
  const ownJid = bare(account)
  return [...xml.matchAll(/<message>([\s\S]*?)<\/message>/gi)].flatMap((match) => {
    const from = bare(element(match[1], 'from'))
    const to = bare(element(match[1], 'to'))
    const body = element(match[1], 'body')
    if (!from || !to || !body) return []

    const direction = from === ownJid ? 'outgoing' as const : 'incoming' as const
    const conversation = direction === 'outgoing' ? to : from
    const timestamp = parseSparkDate(element(match[1], 'date'))
    const fingerprint = `${ownJid}|${from}|${to}|${timestamp}|${body}`

    return [{
      id: `spark-${hash(fingerprint)}`,
      account: ownJid,
      conversation,
      from,
      to,
      body,
      timestamp,
      direction,
      imported: true,
    }]
  })
}

export function parseHistoryBackup(json: string, account: string): ChatMessage[] {
  const value = JSON.parse(json) as { version?: number; messages?: ChatMessage[] }
  if (value.version !== 1 || !Array.isArray(value.messages)) throw new Error('Неподдерживаемый формат резервной копии')
  return value.messages.filter((message) => message.account === account && message.body && message.conversation)
}

function parseSparkDate(value: string): number {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/)
  if (!match) return Date.now()
  return new Date(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]), Number(match[6]), Number((match[7] ?? '0').padEnd(3, '0').slice(0, 3)),
  ).getTime()
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&').trim()
}

function hash(value: string): string {
  let result = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i)
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(36)
}
