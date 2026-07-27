const STORAGE_KEY = 'smartschedule_state'
const STORAGE_KEY_ACADEMIC = 'smartschedule_academic_progress'

export function saveState(extractionData, catalogData, drafts, activeDraft, designerFilters) {
  try {
    const selectedSubjects = [...document.querySelectorAll('#subject-list input:checked')].map(i => i.value)
    const state = {
      extractionData,
      catalogData,
      drafts,
      activeDraft,
      designerFilters,
      selectedSubjects,
      hasExtraction: !!extractionData,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch { /* quota exceeded, ignore */ }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const state = JSON.parse(raw)
    if (!state.hasExtraction) return null
    return state
  } catch {
    return null
  }
}

export function clearSavedState() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

// ── Persistencia de Avance Académico ──────────────────────────────

export function saveAcademicProgress(completed, diagnostics) {
  try {
    const data = {
      completed,
      diagnostics,
      updatedAt: new Date().toISOString()
    }
    localStorage.setItem(STORAGE_KEY_ACADEMIC, JSON.stringify(data))
  } catch { /* quota exceeded, ignore */ }
}

export function loadAcademicProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACADEMIC)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearAcademicProgress() {
  try { localStorage.removeItem(STORAGE_KEY_ACADEMIC) } catch { /* ignore */ }
}
