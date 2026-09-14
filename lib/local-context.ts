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

  const iso = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;

  return `Current local time: ${stamp} (${timezone}). Today's date for tools: ${iso}. For iMessage "today", set date_from=${iso} and omit date_to. Filter people with contact=their name, not query.`;
}
