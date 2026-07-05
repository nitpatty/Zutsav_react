// Parses a legacy free-text duration string into { value, unit }
function parseLegacyDuration(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  const hours = s.match(/^(\d+)\s*(hr|hrs|hour|hours)$/);
  if (hours) return { value: parseInt(hours[1], 10), unit: 'hours' };
  const days = s.match(/^(\d+)\s*(day|days)$/);
  if (days) return { value: parseInt(days[1], 10), unit: 'days' };
  return null;
}

/**
 * Returns a display string like "2 Hours" / "1 Day" from a pooja object.
 * Handles both new structured fields (durationValue + durationUnit)
 * and legacy free-text duration strings.
 */
export function formatDuration(pooja) {
  if (!pooja) return '';

  let value = pooja.durationValue;
  let unit  = pooja.durationUnit;

  // Fall back to parsing the legacy string if new fields are absent
  if (!value && pooja.duration) {
    const parsed = parseLegacyDuration(pooja.duration);
    if (parsed) { value = parsed.value; unit = parsed.unit; }
    else return pooja.duration; // unparseable legacy — show as-is
  }

  if (!value) return '';

  const v = Number(value);
  if (unit === 'days')  return `${v} ${v === 1 ? 'Day'  : 'Days'}`;
  if (unit === 'hours') return `${v} ${v === 1 ? 'Hour' : 'Hours'}`;
  return `${v}`;
}

/**
 * Parses a legacy duration string into { durationValue, durationUnit } for
 * pre-filling edit forms when a pooja was created with the old free-text field.
 * Returns null if the string cannot be recognized.
 */
export function parseDurationForForm(legacyStr) {
  const parsed = parseLegacyDuration(legacyStr);
  if (!parsed) return null;
  return { durationValue: String(parsed.value), durationUnit: parsed.unit };
}
