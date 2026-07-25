// ── Constants ────────────────────────────────────────────────────
export const DAY_NAMES = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']
export const DAY_COLORS = ['#c05640', '#3b8069', '#2c7a9e', '#b07a2e', '#7b4f9e', '#9e6b3b']
export const START_HOUR = 6
export const END_HOUR = 22

// ── Semester key normalization ────────────────────────────────────
export function normalizeSemesterKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .toUpperCase()
}

// ── Time helpers ──────────────────────────────────────────────────
export function parseTime(timeStr) {
  if (!timeStr) return { hour: 0, minute: 0 }
  const parts = timeStr.split(':')
  return { hour: parseInt(parts[0], 10) || 0, minute: parseInt(parts[1], 10) || 0 }
}

export function formatTime(timeStr) {
  const t = parseTime(timeStr)
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
}

export function timeToMinutes(timeStr) {
  const t = parseTime(timeStr)
  return t.hour * 60 + t.minute
}

export function formatGroupTime(group) {
  if (!group.blocks || group.blocks.length === 0) return ''
  return group.blocks
    .map((b) => `${DAY_NAMES[b.weekday] || ''} ${formatTime(b.starts_at)}-${formatTime(b.ends_at)}`)
    .join(' · ')
}

export function encodeGroupData(group) {
  const data = {
    code: group.code,
    subject_code: group.subject_code,
    subject_name: group.subject_name,
    blocks: (group.blocks || []).map(b => ({
      weekday: b.weekday, starts_at: b.starts_at, ends_at: b.ends_at,
    })),
    credits: group.credits,
  }
  return JSON.stringify(data).replace(/'/g, '&#39;')
}