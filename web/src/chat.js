export function mergeMessage(prev, message) {
  if (!message) return prev;
  if (message.id != null && prev.some((m) => String(m.id) === String(message.id))) return prev;
  return [...prev, message];
}
