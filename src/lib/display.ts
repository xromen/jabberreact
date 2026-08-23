const AVATAR_COLORS = [
  "#5865f2",
  "#3ba55c",
  "#eb459e",
  "#faa61a",
  "#ed4245",
  "#00a8fc",
];

export function initials(value: string): string {
  return value.substring(0, 2) || "?";
}

export function avatarColor(value: string): string {
  const colorIndex =
    [...value].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
    AVATAR_COLORS.length;

  return AVATAR_COLORS[colorIndex];
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("ru", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

export function formatDividerDate(timestamp: number): string {
  return new Intl.DateTimeFormat("ru", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(timestamp);
}

export function isSameDay(first: number, second: number): boolean {
  const firstDate = new Date(first);
  const secondDate = new Date(second);

  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}
