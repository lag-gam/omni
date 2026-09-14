/** Facts Claude cannot know unless we send them. The Messages API has no clock. */

export function localContextBlock(at: Date = new Date()): string {
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local";
  const stamp = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(at);

  return `Current local time: ${stamp} (${timezone})`;
}
