const DELAYS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

export function reconnectDelay(attempt: number): number | null {
  return DELAYS[attempt] ?? null;
}
