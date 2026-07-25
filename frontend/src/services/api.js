const apiBase = 'http://localhost:8000/api'
const healthUrl = `${apiBase}/health`
const catalogUrl = `${apiBase}/catalog`
const extractionUrl = `${apiBase}/extractions`

// ── Health check ──────────────────────────────────────────────────
export async function checkHealth() {
  const response = await fetch(healthUrl)
  if (!response.ok) throw new Error('API unavailable')
  return response.json()
}

// ── Catalog ───────────────────────────────────────────────────────
export async function fetchCatalog() {
  const response = await fetch(catalogUrl)
  if (!response.ok) throw new Error('No se pudo obtener el catálogo')
  return response.json()
}

// ── Extraction ────────────────────────────────────────────────────
export async function runExtraction(payload) {
  const response = await fetch(extractionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(errorBody.detail || 'No se pudo completar la extracción')
  }
  return response.json()
}

export { apiBase }