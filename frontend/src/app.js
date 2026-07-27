// ── SmartSchedule - Main Orchestrator ────────────────────────────
import { checkHealth, fetchCatalog, runExtraction, checkEligibility } from './services/api.js'
import { saveState, loadState, clearSavedState } from './utils/storage.js'
import { normalizeSemesterKey } from './utils/helpers.js'
import { showPanel, navigateTo } from './components/navigation.js'
import { renderSubjects, getSelectedSubjectCodes } from './components/subjects.js'
import { renderCalendarGrid, placeBlocks, setupDropListeners } from './components/calendar.js'
import {
  renderDesignerSubjects, renderDraftTabs, populateHourSelects, syncFilterUI,
  setOnStateChange, handleDrop, handleRemoveBlock, clearDraggedGroupData,
  loadEligibility, isEligibilityLoaded
} from './components/designer.js'
import {
  getDrafts, getActiveDraft, getDraftNames, getDraftCount,
  setDrafts, setActiveDraft, resetDrafts, restoreDrafts,
  getPlacedBlocks
} from './services/scheduler.js'
import { openSyncPopup, SyncState } from './services/syncService.js'

// ── DOM refs ──────────────────────────────────────────────────────
const statusText = document.querySelector('.status')
const connectForm = document.querySelector('#connect-form')
const hero = document.querySelector('.hero')
const roadmap = document.querySelector('.roadmap')
const connectionPanel = document.querySelector('#connection-panel')
const connectionUrl = document.querySelector('#connection-url')
const formMessage = document.querySelector('#form-message')

const panels = [
  'connection-panel', 'subjects-panel', 'designer-panel', 'export-panel',
].map((id) => document.querySelector(`#${id}`))

let extractionData = null
let catalogData = null

// ── Designer filter state ─────────────────────────────────────────
let designerFilters = {
  preferMorning: false, avoidFridays: false, compactDays: false,
  preferredDays: [], minHour: 6, maxHour: 22,
}

// ── Message helper ────────────────────────────────────────────────
function showDesignerMessage(text, type = 'info') {
  let msgEl = document.querySelector('#designer-message')
  if (!msgEl) {
    msgEl = document.createElement('p')
    msgEl.id = 'designer-message'
    msgEl.className = 'form-message'
    const calendar = document.querySelector('.designer-calendar')
    if (calendar) calendar.prepend(msgEl)
  }
  const colors = { success: '#3b8069', warning: '#f0ad4e', error: '#c05640', info: '#486581' }
  msgEl.style.color = colors[type] || colors.info
  msgEl.textContent = text
  clearTimeout(msgEl._timeout)
  msgEl._timeout = setTimeout(() => { msgEl.textContent = '' }, 4000)
}

// ── Refresh all designer UI ───────────────────────────────────────
function refreshDesigner() {
  const container = document.querySelector('#designer-subject-list')
  const grid = document.querySelector('#designer-calendar-grid')
  const draftContainer = document.querySelector('#draft-tabs')

  renderDesignerSubjects(container, extractionData, getDrafts(), getActiveDraft(), designerFilters)

  // Render calendar grid and set up drop listeners
  renderCalendarGrid(grid, getPlacedBlocks(), (groupCode) => {
    handleRemoveBlock(groupCode, showDesignerMessage)
  })
  setupDropListeners(grid, (dayIndex) => {
    handleDrop(dayIndex, showDesignerMessage)
  })

  renderDraftTabs(draftContainer, getDrafts(), getActiveDraft(), getDraftNames(), (index) => {
    setActiveDraft(index)
    refreshDesigner()
  })
  saveState(extractionData, catalogData, getDrafts(), getActiveDraft(), designerFilters)
}

// ── API status ────────────────────────────────────────────────────
function updateApiStatus(state, label) {
  statusText.innerHTML = `<span class="status-dot ${state}"></span> API ${label}`
}

checkHealth()
  .then(() => updateApiStatus('online', 'conectada'))
  .catch(() => updateApiStatus('offline', 'desconectada'))

// ── Panel navigation ─────────────────────────────────────────────
document.querySelector('#to-subjects').addEventListener('click', () => {
  navigateTo(panels, 'subjects-panel')
})
document.querySelector('#to-designer').addEventListener('click', () => {
  navigateTo(panels, 'designer-panel')
  if (getDrafts().some(d => d.length > 0)) {
    refreshDesigner()
  } else {
    initDesigner()
  }
})
document.querySelectorAll('[data-back]').forEach((btn) => {
  btn.addEventListener('click', () => navigateTo(panels, btn.dataset.back))
})
document.querySelector('#to-export')?.addEventListener('click', () => navigateTo(panels, 'export-panel'))

// ── Reset button ──────────────────────────────────────────────────
document.querySelector('#reset-designer')?.addEventListener('click', () => {
  if (confirm('¿Estás seguro? Se borrarán todos los horarios que hayas armado.')) {
    resetDrafts()
    refreshDesigner()
    showDesignerMessage('Horario reiniciado. Puedes empezar de nuevo.', 'info')
  }
})

// ── Restart / Nueva consulta ──────────────────────────────────────
function restartApp() {
  if (!confirm('¿Estás seguro? Se borrarán todos los datos actuales y podrás ingresar una nueva URL.')) return

  // Limpiar todo el estado
  extractionData = null
  catalogData = null
  resetDrafts()
  clearSavedState()

  // Ocultar todos los paneles
  panels.forEach(p => p.hidden = true)

  // Mostrar hero y roadmap
  hero.hidden = false
  roadmap.hidden = false

  // Resetear el formulario
  connectForm.reset()
  document.querySelector('#to-subjects').hidden = true
  formMessage.textContent = ''

  // Limpiar controles de catálogo si existen
  const catalogControls = document.querySelector('.catalog-controls')
  if (catalogControls) catalogControls.remove()

  // Scroll al inicio
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

document.querySelectorAll('.restart-button').forEach(btn => {
  btn.addEventListener('click', restartApp)
})

// ── Form submission ───────────────────────────────────────────────
connectForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const portalUrl = normalizePortalUrl(document.querySelector('#portal-url').value)
  const university = document.querySelector('#university').value || null

  connectionUrl.textContent = portalUrl
  hero.hidden = true
  roadmap.hidden = true
  connectionPanel.hidden = false
  connectionPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })

  if (university === 'Universidad de Cundinamarca') {
    await showCampusSelection(portalUrl, university)
  } else {
    await doExtraction({ portal_url: portalUrl, university })
  }
})

function normalizePortalUrl(value) {
  const CANONICAL = 'https://plataforma.ucundinamarca.edu.co/aplicacionesB/condicionales/apl_gen_public.jsp?id=ConsultaHorario'
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    const path = url.pathname || ''
    if (host.includes('ucundinamarca.edu.co')) {
      if (path.includes('/aplicacionesB/condicionales') || path.endsWith('/apl_gen_public.jsp') ||
          path.endsWith('/inicioSeguro.jsp') || path.endsWith('/pub_rep_val.jsp') || path === '/' || path === '') {
        return CANONICAL
      }
    }
    return url.toString()
  } catch { return value }
}

// ── Campus / Program Selection ────────────────────────────────────
async function showCampusSelection(portalUrl, university) {
  const heading = connectionPanel.querySelector('.connection-heading')
  const existing = connectionPanel.querySelector('.catalog-controls')
  if (existing) existing.remove()

  const controls = document.createElement('div')
  controls.className = 'catalog-controls'
  controls.innerHTML = `
    <div class="catalog-field">
      <label for="campus-select">Sede</label>
      <select id="campus-select"><option value="">Cargando sedes...</option></select>
    </div>
    <div class="catalog-field">
      <label for="program-select">Programa académico</label>
      <select id="program-select" disabled><option value="">Primero selecciona una sede</option></select>
    </div>
    <button class="primary-action" id="start-extraction" type="button" disabled>Extraer horarios <span aria-hidden="true">→</span></button>
  `
  heading.after(controls)

  const campusSelect = document.querySelector('#campus-select')
  const programSelect = document.querySelector('#program-select')
  const startBtn = document.querySelector('#start-extraction')

  campusSelect.addEventListener('change', () => {
    if (!campusSelect.value) {
      programSelect.innerHTML = '<option value="">Primero selecciona una sede</option>'
      programSelect.disabled = true; startBtn.disabled = true; return
    }
    const programs = catalogData?.programs_by_campus[campusSelect.value] || []
    programSelect.innerHTML = '<option value="">Selecciona un programa</option>' +
      programs.map((p) => `<option value="${p.value}">${p.label}</option>`).join('')
    programSelect.disabled = false; startBtn.disabled = true
  })
  programSelect.addEventListener('change', () => {
    startBtn.disabled = !(campusSelect.value && programSelect.value)
  })
  startBtn.addEventListener('click', () => {
    if (!campusSelect.value || !programSelect.value) return
    controls.hidden = true
    doExtraction({ portal_url: portalUrl, university, campus_code: campusSelect.value, program_code: programSelect.value })
  })

  try {
    catalogData = await fetchCatalog()
    campusSelect.innerHTML = '<option value="">Selecciona una sede</option>' +
      catalogData.campuses.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')
  } catch {
    formMessage.textContent = 'No se pudieron cargar las sedes. Verifica que el backend esté ejecutándose.'
  }
}

// ── Sincronización de avance académico ────────────────────────────
let syncData = null // { completed, diagnostics }

const syncButton = document.querySelector('#sync-button')
const syncStatus = document.querySelector('#sync-status')
const syncStatusIcon = document.querySelector('#sync-status-icon')
const syncStatusText = document.querySelector('#sync-status-text')
const syncResult = document.querySelector('#sync-result')
const syncCountSubjects = document.querySelector('#sync-count-subjects')
const syncCountDiagnostics = document.querySelector('#sync-count-diagnostics')
const syncProgressPct = document.querySelector('#sync-progress-pct')

function updateSyncUI(state, data) {
  if (!syncButton || !syncStatus) return

  switch (state) {
    case SyncState.OPENING:
      syncButton.disabled = true
      syncButton.querySelector('.sync-label').textContent = 'Abriendo portal...'
      syncStatus.hidden = false
      syncStatus.className = 'sync-status loading'
      syncStatusIcon.textContent = '⏳'
      syncStatusText.textContent = 'Abriendo ventana de Academusoft...'
      syncResult.hidden = true
      break

    case SyncState.WAITING:
      syncButton.querySelector('.sync-label').textContent = 'Esperando autenticación...'
      syncStatusText.textContent = 'Autentícate en el portal y espera mientras se cargan tus materias...'
      break

    case SyncState.SUCCESS:
      syncButton.disabled = false
      syncButton.querySelector('.sync-label').textContent = 'Sincronizar mi avance'
      syncStatus.hidden = true

      // Mostrar resultado
      syncResult.hidden = false
      syncCountSubjects.textContent = data.completed.length
      syncCountDiagnostics.textContent = data.diagnostics.length
      break

    case SyncState.BLOCKED:
      syncButton.disabled = false
      syncButton.querySelector('.sync-label').textContent = 'Sincronizar mi avance'
      syncStatus.className = 'sync-status'
      syncStatusIcon.textContent = '⚠️'
      syncStatusText.textContent = 'Popup bloqueado. Permite popups para este sitio.'
      setTimeout(() => { syncStatus.hidden = true }, 5000)
      break

    case SyncState.ERROR:
      syncButton.disabled = false
      syncButton.querySelector('.sync-label').textContent = 'Sincronizar mi avance'
      syncStatus.className = 'sync-status'
      syncStatusIcon.textContent = '❌'
      syncStatusText.textContent = data || 'Error al sincronizar. Intenta de nuevo.'
      setTimeout(() => { syncStatus.hidden = true }, 5000)
      break

    case SyncState.TIMEOUT:
      syncButton.disabled = false
      syncButton.querySelector('.sync-label').textContent = 'Sincronizar mi avance'
      syncStatus.className = 'sync-status'
      syncStatusIcon.textContent = '⏰'
      syncStatusText.textContent = 'Tiempo de espera agotado. Intenta de nuevo.'
      setTimeout(() => { syncStatus.hidden = true }, 5000)
      break
  }
}

async function handleSyncClick() {
  try {
    syncData = await openSyncPopup()
    // Sincronización exitosa, consultar elegibilidad con datos reales
    syncProgressPct.textContent = 'Consultando...'
    
    const eligResult = await checkEligibility(syncData.completed, syncData.diagnostics)
    
    // Actualizar progreso
    syncProgressPct.textContent = `${eligResult.progress_percentage}%`
    
    // Actualizar elegibilidad en el diseñador
    await loadEligibility(syncData.completed, syncData.diagnostics)
    
    // Si estamos en el diseñador, refrescar
    if (!document.querySelector('#designer-panel').hidden) {
      refreshDesigner()
    }
    
    showDesignerMessage(
      `✅ Sincronización completa: ${syncData.completed.length} materias, ${syncData.diagnostics.length} diagnósticos. ${eligResult.progress_percentage}% de carrera.`,
      'success'
    )
  } catch (err) {
    // Error ya manejado por updateSyncUI
    if (err.message) {
      showDesignerMessage(err.message, 'error')
    }
  }
}

if (syncButton) {
  syncButton.addEventListener('click', handleSyncClick)
}

// ── Extraction ────────────────────────────────────────────────────
async function doExtraction(payload) {
  const steps = [...document.querySelectorAll('[data-step]')]
  try {
    for (const step of steps) {
      await new Promise((resolve) => setTimeout(resolve, 350))
      step.classList.add('done')
      step.querySelector('.progress-icon').textContent = '✓'
    }

    extractionData = await runExtraction(payload)
    const groups = extractionData.groups
    formMessage.textContent = `${groups.length} grupos encontrados. Ya puedes escoger tus materias.`
    document.querySelector('#to-subjects').hidden = false

    renderSubjects(document.querySelector('#subject-list'), groups, [], () => {
      saveState(extractionData, catalogData, getDrafts(), getActiveDraft(), designerFilters)
    })
    saveState(extractionData, catalogData, getDrafts(), getActiveDraft(), designerFilters)
  } catch (error) {
    formMessage.textContent = error.message || 'No pudimos conectar con el backend.'
  }
}

// ── Init designer ─────────────────────────────────────────────────
async function initDesigner() {
  resetDrafts()
  designerFilters = { preferMorning: false, avoidFridays: false, compactDays: false, preferredDays: [], minHour: 6, maxHour: 22 }
  populateHourSelects()
  syncFilterUI(designerFilters)

  // Cargar elegibilidad desde el backend
  // Por ahora enviamos listas vacías (el usuario no ha sincronizado su avance)
  // En el futuro, esto vendrá del popup de sincronización
  showDesignerMessage('Cargando elegibilidad de materias...', 'info')
  await loadEligibility([], [])
  showDesignerMessage(
    isEligibilityLoaded()
      ? 'Elegibilidad cargada. Las materias bloqueadas se muestran con opacidad reducida.'
      : 'No se pudo cargar la elegibilidad. Todas las materias estarán disponibles.',
    isEligibilityLoaded() ? 'success' : 'warning'
  )

  refreshDesigner()
  saveState(extractionData, catalogData, getDrafts(), getActiveDraft(), designerFilters)
}

// ── Set up state change callback for designer ─────────────────────
setOnStateChange(() => {
  refreshDesigner()
  saveState(extractionData, catalogData, getDrafts(), getActiveDraft(), designerFilters)
})

// ── Filter controls ───────────────────────────────────────────────
document.querySelector('#pref-morning')?.addEventListener('change', (e) => {
  designerFilters.preferMorning = e.target.checked
  renderDesignerSubjects(document.querySelector('#designer-subject-list'), extractionData, getDrafts(), getActiveDraft(), designerFilters)
})
document.querySelector('#pref-fridays')?.addEventListener('change', (e) => {
  designerFilters.avoidFridays = e.target.checked
  renderDesignerSubjects(document.querySelector('#designer-subject-list'), extractionData, getDrafts(), getActiveDraft(), designerFilters)
})
document.querySelector('#pref-compact')?.addEventListener('change', (e) => {
  designerFilters.compactDays = e.target.checked
  renderDesignerSubjects(document.querySelector('#designer-subject-list'), extractionData, getDrafts(), getActiveDraft(), designerFilters)
})
document.querySelectorAll('[data-day-filter]').forEach((cb) => {
  cb.addEventListener('change', (e) => {
    const day = parseInt(e.target.dataset.dayFilter)
    if (e.target.checked) { if (!designerFilters.preferredDays.includes(day)) designerFilters.preferredDays.push(day) }
    else { designerFilters.preferredDays = designerFilters.preferredDays.filter(d => d !== day) }
    renderDesignerSubjects(document.querySelector('#designer-subject-list'), extractionData, getDrafts(), getActiveDraft(), designerFilters)
  })
})
document.querySelector('#filter-min-hour')?.addEventListener('change', (e) => {
  designerFilters.minHour = parseInt(e.target.value) || 6
  renderDesignerSubjects(document.querySelector('#designer-subject-list'), extractionData, getDrafts(), getActiveDraft(), designerFilters)
})
document.querySelector('#filter-max-hour')?.addEventListener('change', (e) => {
  designerFilters.maxHour = parseInt(e.target.value) || 22
  renderDesignerSubjects(document.querySelector('#designer-subject-list'), extractionData, getDrafts(), getActiveDraft(), designerFilters)
})

// ── Restore saved state on load ───────────────────────────────────
function restoreSavedState() {
  const saved = loadState()
  if (!saved) return false

  extractionData = saved.extractionData
  catalogData = saved.catalogData
  restoreDrafts(saved.drafts, saved.activeDraft)
  designerFilters = saved.designerFilters || { preferMorning: false, avoidFridays: false, compactDays: false, preferredDays: [], minHour: 6, maxHour: 22 }

  hero.hidden = true
  roadmap.hidden = true
  connectionPanel.hidden = true
  document.querySelector('#subjects-panel').hidden = false
  document.querySelector('#to-subjects').hidden = false

  renderSubjects(document.querySelector('#subject-list'), extractionData.groups, saved.selectedSubjects || [], () => {
    saveState(extractionData, catalogData, getDrafts(), getActiveDraft(), designerFilters)
  })

  if (getDrafts().some(d => d.length > 0)) {
    document.querySelector('#designer-panel').hidden = false
    populateHourSelects()
    syncFilterUI(designerFilters)
    refreshDesigner()
  }

  return true
}

// ── Setup calendar drop zone ──────────────────────────────────────
// This runs once on page load to set up the grid's drop listeners
// The grid is re-rendered dynamically, so we need to re-attach after each render
// We handle this via refreshDesigner() which calls placeBlocks + renderDesignerSubjects
// The drop listeners are set up in the calendar module's renderCalendarGrid

// ── Bootstrap ─────────────────────────────────────────────────────
if (!restoreSavedState()) {
  console.log('No saved state found, starting fresh.')
}