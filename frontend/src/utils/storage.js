const STORAGE_KEY = 'smartschedule_state'

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