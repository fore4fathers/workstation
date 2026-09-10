export function money(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

export function when(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

export function typeLabel(type) {
  return { image: 'Image', text: 'Text', intent: 'Intent' }[type] || type;
}

export function typeIcon(type) {
  return { image: '▣', text: 'Aa', intent: '?' }[type] || '•';
}

export function parseItemLines(text, type) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseItemLine(line, type));
}

export function parseItemLine(line, type) {
  let payload;
  let labelsRaw;
  let gold;
  if (line.includes('|')) {
    const parts = line.split('|').map((s) => s.trim());
    payload = parts[0] || '';
    labelsRaw = parts[1] || '';
    gold = parts[2] || '';
  } else {
    const parts = line.split(',').map((s) => s.trim());
    if (parts.length >= 3) {
      gold = parts[parts.length - 1];
      labelsRaw = parts[parts.length - 2];
      payload = parts.slice(0, -2).join(',');
    } else {
      payload = parts[0] || '';
      labelsRaw = parts[1] || '';
      gold = '';
    }
  }
  const labels = labelsRaw.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
  if (type === 'image') return { image_url: payload, labels, gold: gold || null };
  if (type === 'text') return { text: payload, labels, gold: gold || null };
  return { utterance: payload, intents: labels, gold: gold || null };
}

export function itemPreview(item, type) {
  if (type === 'image') return item.image_url || '';
  if (type === 'text') return item.text || '';
  return item.utterance || '';
}

export function itemLabels(item, type) {
  return type === 'intent' ? (item.intents || []) : (item.labels || []);
}
