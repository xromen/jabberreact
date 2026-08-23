export function bareJid(value: string): string {
  return value.split("/")[0].toLowerCase();
}
