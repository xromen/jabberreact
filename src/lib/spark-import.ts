import { bareJid } from "./jid.ts";
import type { ChatMessage } from "../types";

const SPARK_MESSAGE_PATTERN = /<message>([\s\S]*?)<\/message>/gi;

export function parseSparkTranscript(
  xml: string,
  account: string,
): ChatMessage[] {
  const ownJid = bareJid(account);

  return [...xml.matchAll(SPARK_MESSAGE_PATTERN)].flatMap((match) => {
    const from = bareJid(getElementText(match[1], "from"));
    const to = bareJid(getElementText(match[1], "to"));
    const body = getElementText(match[1], "body");
    if (!from || !to || !body) {
      return [];
    }

    const direction = from === ownJid ? "outgoing" : "incoming";
    const conversation = direction === "outgoing" ? to : from;
    const timestamp = parseSparkDate(getElementText(match[1], "date"));
    const fingerprint = `${ownJid}|${from}|${to}|${timestamp}|${body}`;

    return [
      {
        id: `spark-${hash(fingerprint)}`,
        account: ownJid,
        conversation,
        from,
        to,
        body,
        timestamp,
        direction,
        imported: true,
      },
    ];
  });
}

export function parseHistoryBackup(json: string, account: string): ChatMessage[] {
  const value = JSON.parse(json) as {
    version?: number;
    messages?: ChatMessage[];
  };

  if (value.version !== 1 || !Array.isArray(value.messages)) {
    throw new Error("Неподдерживаемый формат резервной копии");
  }

  return value.messages.filter(
    (message) =>
      message.account === account && message.body && message.conversation,
  );
}

function getElementText(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, "i"));
  return decodeXml(match?.[1] ?? "");
}

function parseSparkDate(value: string): number {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/,
  );
  if (!match) {
    return Date.now();
  }

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
    Number((match[7] ?? "0").padEnd(3, "0").slice(0, 3)),
  ).getTime();
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function hash(value: string): string {
  let result = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }

  return (result >>> 0).toString(36);
}
