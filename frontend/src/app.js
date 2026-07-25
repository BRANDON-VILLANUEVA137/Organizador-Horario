const apiBase = 'http://localhost:8000/api'
const healthUrl = `${apiBase}/health`
const catalogUrl = `${apiBase}/catalog`
const extractionUrl = `${apiBase}/extractions`

const statusText = document.querySelector('.status')
const connectForm = document.querySelector('#connect-form')
const hero = document.querySelector('.hero')
const roadmap = document.querySelector('.roadmap')
const connectionPanel = document.querySelector('#connection-panel')
const connectionUrl = document.querySelector('#connection-url')
const formMessage = document.querySelector('#form-message')

const panels = [
  'connection-panel',
  'subjects-panel',
  'designer-panel',
  'export-panel',
].map((id) => document.querySelector(`#${id}`))

let extractionData = null
let catalogData = null

// ── Multiple schedule drafts ──────────────────────────────────────
const DRAFT_COUNT = 3
const draftNames = ['Horario A', 'Horario B', 'Horario C']
let activeDraft = 0
// Cada draft: [{ group, dayIndex, startHour, endHour, startMin, endMin, groupCode }, ...]
let drafts = Array.from({ length: DRAFT_COUNT }, () => [])

// ── Designer filter state ─────────────────────────────────────────
let designerFilters = {
  preferMorning: false,
  avoidFridays: false,
  compactDays: false,
  preferredDays: [],      // [] = todos, [0-5] = días específicos
  minHour: 6,
  maxHour: 22,
}

function normalizeSemesterKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
    .toUpperCase()
}

// ── Time helpers ──────────────────────────────────────────────────
function parseTime(timeStr) {
  if (!timeStr) return { hour: 0, minute: 0 }
  const parts = timeStr.split(':')
  return {
    hour: parseInt(parts[0], 10) || 0,
    minute: parseInt(parts[1], 10) || 0,
  }
}

function formatTime(timeStr) {
  const t = parseTime(timeStr)
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
}

function timeToMinutes(timeStr) {
  const t = parseTime(timeStr)
  return t.hour * 60 + t.minute
}

// ── API status check ──────────────────────────────────────────────
function updateApiStatus(state, label) {
  statusText.innerHTML = `<span class="status-dot ${state}"></span> API ${label}`
}

fetch(healthUrl)
  .then((response) => {
    if (!response.ok) throw new Error('API unavailable')
    updateApiStatus('online', 'conectada')
  })
  .catch(() => updateApiStatus('offline', 'desconectada'))

// ── Panel navigation ─────────────────────────────────────────────
function showPanel(panel) {
  panels.forEach((currentPanel) => {
    currentPanel.hidden = currentPanel !== panel
  })
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

document.querySelector('#to-subjects').addEventListener('click', () =>
  showPanel(document.querySelector('#subjects-panel'))
)
document.querySelector('#to-designer').addEventListener('click', () => {
  showPanel(document.querySelector('#designer-panel'))
  initDesigner()
})

// ── Form submission ───────────────────────────────────────────────
connectForm.addEventListener('submit', async (event) => {
  event.preventDefault()
  const portalUrl = normalizePortalUrl(
    document.querySelector('#portal-url').value
  )
  const university = document.querySelector('#university').value || null

  connectionUrl.textContent = portalUrl
  hero.hidden = true
  roadmap.hidden = true
  connectionPanel.hidden = false
  connectionPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })

  if (university === 'Universidad de Cundinamarca') {
    await showCampusSelection(portalUrl, university)
  } else {
    await runExtraction({ portal_url: portalUrl, university })
  }
})

function normalizePortalUrl(value) {
  const CANONICAL =
    'https://plataforma.ucundinamarca.edu.co/aplicacionesB/condicionales/apl_gen_public.jsp?id=ConsultaHorario'
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    const path = url.pathname || ''

    if (host.includes('ucundinamarca.edu.co')) {
      if (
        path.includes('/aplicacionesB/condicionales') ||
        path.endsWith('/apl_gen_public.jsp') ||
        path.endsWith('/inicioSeguro.jsp') ||
        path.endsWith('/pub_rep_val.jsp') ||
        path === '/' ||
        path === ''
      ) {
        return CANONICAL
      }
    }
    return url.toString()
  } catch {
    return value
  }
}

// ── Campus / Program Selection ────────────────────────────────────
async function showCampusSelection(portalUrl, university) {
  const heading = connectionPanel.querySelector('.connection-heading')

  const existingControls = connectionPanel.querySelector('.catalog-controls')
  if (existingControls) existingControls.remove()

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
    <button class="primary-action" id="start-extraction" type="button" disabled>
      Extraer horarios <span aria-hidden="true">→</span>
    </button>
  `
  heading.after(controls)

  const campusSelect = document.querySelector('#campus-select')
  const programSelect = document.querySelector('#program-select')
  const startBtn = document.querySelector('#start-extraction')

  campusSelect.addEventListener('change', () => {
    const selectedCampus = campusSelect.value
    if (!selectedCampus) {
      programSelect.innerHTML = '<option value="">Primero selecciona una sede</option>'
      programSelect.disabled = true
      startBtn.disabled = true
      return
    }

    const programs = catalogData?.programs_by_campus[selectedCampus] || []
    programSelect.innerHTML =
      '<option value="">Selecciona un programa</option>' +
      programs.map((p) => `<option value="${p.value}">${p.label}</option>`).join('')
    programSelect.disabled = false
    startBtn.disabled = true
  })

  programSelect.addEventListener('change', () => {
    startBtn.disabled = !(campusSelect.value && programSelect.value)
  })

  startBtn.addEventListener('click', () => {
    const campusCode = campusSelect.value
    const programCode = programSelect.value
    if (!campusCode || !programCode) return

    controls.hidden = true
    runExtraction({
      portal_url: portalUrl,
      university,
      campus_code: campusCode,
      program_code: programCode,
    })
  })

  try {
    const response = await fetch(catalogUrl)
    if (!response.ok) throw new Error('No se pudo obtener el catálogo')
    catalogData = await response.json()

    campusSelect.innerHTML =
      '<option value="">Selecciona una sede</option>' +
      catalogData.campuses.map((c) => `<option value="${c.value}">${c.label}</option>`).join('')
  } catch (error) {
    formMessage.textContent =
      'No se pudieron cargar las sedes. Verifica que el backend esté ejecutándose.'
  }
}

// ── Extraction ────────────────────────────────────────────────────
async function runExtraction(payload) {
  const steps = [...document.querySelectorAll('[data-step]')]
  try {
    for (const step of steps) {
      await new Promise((resolve) => setTimeout(resolve, 350))
      step.classList.add('done')
      step.querySelector('.progress-icon').textContent = '✓'
    }

    const response = await fetch(extractionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))
      throw new Error(errorBody.detail || 'No se pudo completar la extracción')
    }

    extractionData = await response.json()
    const groups = extractionData.groups

    console.log('Extracción completada:', {
      totalGroups: groups.length,
      subjects: [...new Set(groups.map(g => g.subject_code))].length,
      semesters: [...new Set(groups.map(g => g.semester).filter(Boolean))].sort()
    })

    formMessage.textContent = `${groups.length} grupos encontrados. Ya puedes escoger tus materias.`
    document.querySelector('#to-subjects').hidden = false

    renderSubjects(groups)
  } catch (error) {
    formMessage.textContent =
      error.message ||
      'No pudimos conectar con el backend. Comprueba que FastAPI esté ejecutándose en el puerto 8000.'
  }
}

// ── Subjects rendering ────────────────────────────────────────────
function renderSubjects(groups) {
  const container = document.querySelector('#subject-list')
  const semesterFilter = document.querySelector('#semester-filter')

  const subjectsMap = new Map()
  const semestersMap = new Map()

  for (const group of groups) {
    const semesterLabel = String(group.semester ?? '').trim()
    const semesterKey = semesterLabel ? normalizeSemesterKey(semesterLabel) : ''

    if (!subjectsMap.has(group.subject_code)) {
      subjectsMap.set(group.subject_code, {
        code: group.subject_code,
        name: group.subject_name,
        credits: group.credits,
        semesterKey,
        semesters: new Map(),
        groups: [],
      })
    }

    const subject = subjectsMap.get(group.subject_code)
    subject.groups.push(group)

    if (semesterKey && !subject.semesters.has(semesterKey)) {
      subject.semesters.set(semesterKey, semesterLabel)
    }

    if (semesterKey && !semestersMap.has(semesterKey)) {
      semestersMap.set(semesterKey, semesterLabel)
    }
  }

  const sortedSemesters = Array.from(semestersMap.entries()).sort((a, b) =>
    a[1].localeCompare(b[1], undefined, { numeric: true, sensitivity: 'base' })
  )
  semesterFilter.innerHTML =
    '<option value="">Todos los semestres</option>' +
    sortedSemesters
      .map(([key, label]) => `<option value="${key}">${label}</option>`)
      .join('')

  semesterFilter.onchange = () => {
    const selectedSemester = normalizeSemesterKey(semesterFilter.value)
    const allOptions = container.querySelectorAll('.subject-option')
    allOptions.forEach((option) => {
      const subjectSemesters = (option.dataset.semesters || '')
        .split('|')
        .filter(Boolean)
      const shouldHide = Boolean(selectedSemester) && !subjectSemesters.includes(selectedSemester)
      option.style.display = shouldHide ? 'none' : ''
    })
  }

  const subjects = Array.from(subjectsMap.values())

  if (subjects.length === 0) {
    container.innerHTML =
      '<p class="empty-message">No se encontraron materias en el portal.</p>'
    return
  }

  container.innerHTML = subjects
    .map(
      (subj) => `
    <label class="subject-option" data-semesters="${Array.from(subj.semesters.keys()).join('|')}">
      <input type="checkbox" value="${subj.code}" />
      <span>
        <strong>${subj.name}</strong>
        <small>${subj.code} · ${subj.credits} créditos · ${subj.groups.length} grupo(s)</small>
      </span>
    </label>
  `
    )
    .join('')

  container.querySelectorAll('.subject-option').forEach((option) => {
    const subjectCode = option.querySelector('input')?.value
    const subject = subjectsMap.get(subjectCode)
    if (!subject) return

    const semesterLabels = Array.from(subject.semesters.values())
    const semesterText = semesterLabels.length ? ` · ${semesterLabels.join(', ')}` : ''
    option.querySelector('small').textContent = `${subject.code} · ${subject.credits} créditos · ${subject.groups.length} grupo(s)${semesterText}`
  })

  semesterFilter.onchange()
}

// ── Designer (drag & drop) ────────────────────────────────────────
const DAY_NAMES = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']
const DAY_COLORS = ['#c05640', '#3b8069', '#2c7a9e', '#b07a2e', '#7b4f9e', '#9e6b3b']
const START_HOUR = 6
const END_HOUR = 22

function getPlacedBlocks() {
  return drafts[activeDraft]
}

function initDesigner() {
  drafts = Array.from({ length: DRAFT_COUNT }, () => [])
  activeDraft = 0
  designerFilters = {
    preferMorning: false,
    avoidFridays: false,
    compactDays: false,
    preferredDays: [],
    minHour: 6,
    maxHour: 22,
  }
  populateHourSelects()
  renderDraftTabs()
  renderDesignerSubjects()
  renderDesignerCalendar()
  renderPlacedBlocks()
  syncFilterUI()
}

function populateHourSelects() {
  const minSelect = document.querySelector('#filter-min-hour')
  const maxSelect = document.querySelector('#filter-max-hour')
  if (!minSelect || !maxSelect) return
  const hours = []
  for (let h = 6; h <= 22; h++) {
    hours.push(h)
  }
  const opts = hours.map(h => `<option value="${h}">${String(h).padStart(2,'0')}:00</option>`).join('')
  minSelect.innerHTML = opts
  maxSelect.innerHTML = opts
}

function renderDraftTabs() {
  const container = document.querySelector('#draft-tabs')
  if (!container) return

  container.innerHTML = draftNames
    .map((name, i) => `
      <button class="draft-tab ${i === activeDraft ? 'active' : ''}" data-draft="${i}">
        ${name}
        <span class="draft-count">${drafts[i].length ? `${drafts[i].length} bloq` : 'vacío'}</span>
      </button>
    `)
    .join('')

  container.querySelectorAll('.draft-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeDraft = parseInt(btn.dataset.draft)
      container.querySelectorAll('.draft-tab').forEach((t) => t.classList.remove('active'))
      btn.classList.add('active')
      renderDesignerSubjects()
      renderPlacedBlocks()
    })
  })
}

function getSelectedGroups() {
  if (!extractionData || !extractionData.groups) return []
  const selectedSubjects = [
    ...document.querySelectorAll('#subject-list input:checked'),
  ].map((input) => input.value)

  return extractionData.groups.filter((g) =>
    selectedSubjects.includes(g.subject_code)
  )
}

function renderDesignerSubjects() {
  const container = document.querySelector('#designer-subject-list')
  const groups = getSelectedGroups()

  if (groups.length === 0) {
    container.innerHTML = '<p class="empty-message">No hay materias seleccionadas. Vuelve atrás y elige al menos una.</p>'
    return
  }

  // Get placed group codes for this draft
  const placedGroupCodes = new Set(drafts[activeDraft].map(pb => pb.groupCode))

  // Apply filters
  let filteredGroups = groups.filter(g =>
    g.blocks.some(b => {
      const startMin = timeToMinutes(b.starts_at)
      const endMin = timeToMinutes(b.ends_at)
      return startMin >= designerFilters.minHour * 60 && endMin <= designerFilters.maxHour * 60
    })
  )

  if (designerFilters.preferMorning) {
    filteredGroups = filteredGroups.filter(g =>
      g.blocks.some(b => timeToMinutes(b.starts_at) < 12 * 60)
    )
  }
  if (designerFilters.avoidFridays) {
    filteredGroups = filteredGroups.filter(g =>
      !g.blocks.some(b => b.weekday === 4)
    )
  }
  if (designerFilters.preferredDays.length > 0) {
    filteredGroups = filteredGroups.filter(g =>
      g.blocks.some(b => designerFilters.preferredDays.includes(b.weekday))
    )
  }

  // Agrupar por materia
  const bySubject = new Map()
  for (const group of filteredGroups) {
    if (!bySubject.has(group.subject_code)) {
      bySubject.set(group.subject_code, {
        name: group.subject_name,
        code: group.subject_code,
        groups: [],
      })
    }
    bySubject.get(group.subject_code).groups.push(group)
  }

  let html = ''
  for (const [code, subject] of bySubject) {
    html += `<div class="designer-subject-header">${subject.name}</div>`
    for (const group of subject.groups) {
      const timeInfo = formatGroupTime(group)
      const isDiagnostico = group.subject_name?.includes('[DIAGNÓSTICO]')
      const isPlaced = placedGroupCodes.has(group.code)
      html += `
        <div class="designer-group-card ${isPlaced ? 'placed' : ''}" draggable="${!isPlaced}"
             data-subject-code="${code}"
             data-subject-name="${subject.name}"
             data-group-code="${group.code}"
             data-group-json='${encodeGroupData(group)}'>
          <div class="group-name">${isDiagnostico ? '📋 ' : ''}${group.code} ${isPlaced ? '✓' : ''}</div>
          <div class="group-code">${subject.name}</div>
          <div class="group-time">${timeInfo || 'Sin horario definido'}</div>
          ${isDiagnostico ? '<span class="group-badge">Diagnóstico</span>' : ''}
        </div>
      `
    }
  }

  if (filteredGroups.length === 0) {
    container.innerHTML = '<p class="empty-message">Ningún grupo coincide con los filtros actuales.</p>'
    return
  }

  container.innerHTML = html

  // Drag event listeners (only for non-placed cards)
  container.querySelectorAll('.designer-group-card:not(.placed)').forEach((card) => {
    card.addEventListener('dragstart', handleDragStart)
    card.addEventListener('dragend', handleDragEnd)
  })
}

function encodeGroupData(group) {
  const data = {
    code: group.code,
    subject_code: group.subject_code,
    subject_name: group.subject_name,
    blocks: (group.blocks || []).map(b => ({
      weekday: b.weekday,
      starts_at: b.starts_at,
      ends_at: b.ends_at,
    })),
    credits: group.credits,
  }
  return JSON.stringify(data).replace(/'/g, '&#39;')
}

function formatGroupTime(group) {
  if (!group.blocks || group.blocks.length === 0) return ''
  return group.blocks
    .map((b) => {
      const day = DAY_NAMES[b.weekday] || ''
      return `${day} ${formatTime(b.starts_at)}-${formatTime(b.ends_at)}`
    })
    .join(' · ')
}

// ── Drag & Drop handlers ──────────────────────────────────────────
let draggedGroupData = null

function handleDragStart(e) {
  const card = e.target.closest('.designer-group-card')
  if (!card) return

  if (card.classList.contains('placed')) {
    e.preventDefault()
    return
  }

  try {
    draggedGroupData = JSON.parse(card.dataset.groupJson)
  } catch {
    return
  }

  card.classList.add('dragging')
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', card.dataset.groupJson)
}

function handleDragEnd(e) {
  const card = e.target.closest('.designer-group-card')
  if (card) card.classList.remove('dragging')
  document.querySelectorAll('.calendar-cell.drag-over').forEach((c) => c.classList.remove('drag-over'))
}

function renderDesignerCalendar() {
  const grid = document.querySelector('#designer-calendar-grid')
  const hours = []
  for (let h = START_HOUR; h < END_HOUR; h++) {
    hours.push(h)
  }

  let html = ''
  html += '<div class="calendar-header"></div>'
  for (let d = 0; d < 6; d++) {
    html += `<div class="calendar-header">${DAY_NAMES[d]}</div>`
  }

  for (const hour of hours) {
    const label = `${String(hour).padStart(2, '0')}:00`
    html += `<div class="calendar-hour">${label}</div>`

    for (let d = 0; d < 6; d++) {
      const cellId = `des-cell-${d}-${hour}`
      html += `<div class="calendar-cell" id="${cellId}" data-day="${d}" data-hour="${hour}"></div>`
    }
  }

  grid.innerHTML = html

  grid.querySelectorAll('.calendar-cell').forEach((cell) => {
    cell.addEventListener('dragover', handleCellDragOver)
    cell.addEventListener('dragenter', handleCellDragEnter)
    cell.addEventListener('dragleave', handleCellDragLeave)
    cell.addEventListener('drop', handleCellDrop)
  })
}

function handleCellDragOver(e) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
}

function handleCellDragEnter(e) {
  e.preventDefault()
  const cell = e.target.closest('.calendar-cell')
  if (cell) cell.classList.add('drag-over')
}

function handleCellDragLeave(e) {
  const cell = e.target.closest('.calendar-cell')
  if (cell) cell.classList.remove('drag-over')
}

function handleCellDrop(e) {
  e.preventDefault()
  const cell = e.target.closest('.calendar-cell')
  if (!cell) return

  cell.classList.remove('drag-over')

  if (!draggedGroupData) return

  const dayIndex = parseInt(cell.dataset.day)

  // Verificar que el grupo tenga al menos un bloque en el día donde se soltó
  const hasBlockOnDropDay = draggedGroupData.blocks.some((b) => b.weekday === dayIndex)
  if (!hasBlockOnDropDay) {
    showDesignerMessage('Este grupo no tiene horario en ese día.', 'warning')
    return
  }

  const placedBlocks = getPlacedBlocks()

  // ── VALIDACIONES A NIVEL DE GRUPO COMPLETO ──

  // 1. Mismo grupo ya colocado
  if (placedBlocks.some((pb) => pb.groupCode === draggedGroupData.code)) {
    showDesignerMessage(`El grupo "${draggedGroupData.code}" ya está en el horario.`, 'warning')
    return
  }

  // 2. Otra materia del mismo subject_code ya colocada
  if (placedBlocks.some((pb) => pb.group.subject_code === draggedGroupData.subject_code)) {
    showDesignerMessage(
      `Ya tienes "${draggedGroupData.subject_name}" con otro grupo. Quita ese primero si quieres cambiar.`,
      'warning'
    )
    return
  }

  // 3. Conflicto horario: verificar TODOS los bloques del grupo contra TODOS los bloques colocados
  for (const newBlock of draggedGroupData.blocks) {
    const sTime = parseTime(newBlock.starts_at)
    const eTime = parseTime(newBlock.ends_at)
    const sHour = sTime.hour
    const eHour = eTime.hour

    const conflict = placedBlocks.find((pb) => {
      if (pb.dayIndex !== newBlock.weekday) return false
      return pb.startHour < eHour && sHour < pb.endHour
    })
    if (conflict) {
      showDesignerMessage(
        `Conflicto de horario: "${draggedGroupData.subject_name}" choca con ${conflict.group.subject_name} (${conflict.group.code}) el ${DAY_NAMES[newBlock.weekday]}.`,
        'error'
      )
      return
    }
  }

  // ── COLOCAR TODOS LOS BLOQUES DEL GRUPO ──
  for (const block of draggedGroupData.blocks) {
    const sTime = parseTime(block.starts_at)
    const eTime = parseTime(block.ends_at)

    placedBlocks.push({
      group: draggedGroupData,
      dayIndex: block.weekday,
      startHour: sTime.hour,
      endHour: eTime.hour,
      startMin: sTime.minute,
      endMin: eTime.minute,
      groupCode: draggedGroupData.code,
    })
  }

  renderPlacedBlocks()
  renderDesignerSubjects()
  renderDraftTabs()
  showDesignerMessage(
    `"${draggedGroupData.subject_name}" (${draggedGroupData.code}) — ${draggedGroupData.blocks.length} bloque(s) agregado(s).`,
    'success'
  )
  draggedGroupData = null
}

function renderPlacedBlocks() {
  const grid = document.querySelector('#designer-calendar-grid')
  if (!grid) return

  // Limpiar blocks anteriores
  grid.querySelectorAll('.calendar-block').forEach((el) => el.remove())
  grid.querySelectorAll('.has-block').forEach((el) => el.classList.remove('has-block'))

  const placedBlocks = getPlacedBlocks()

  for (const pb of placedBlocks) {
    const { dayIndex, startHour, startMin, endHour, endMin, group } = pb
    const cell = document.querySelector(`#des-cell-${dayIndex}-${startHour}`)
    if (!cell) continue

    const topOffset = startMin / 60
    const height = (endHour - startHour) + (endMin - startMin) / 60
    const color = DAY_COLORS[dayIndex % DAY_COLORS.length]

    const blockEl = document.createElement('div')
    blockEl.className = 'calendar-block'
    blockEl.style.top = `${topOffset * 100}%`
    blockEl.style.height = `${height * 100}%`
    blockEl.style.background = color
    blockEl.innerHTML = `
      <strong>${group.subject_name}</strong>
      <span>${group.code}</span>
      <span class="block-remove" data-group-code="${group.code}">✕</span>
    `
    blockEl.title = `${group.subject_name} (${group.code})\n${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')} - ${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`

    cell.classList.add('has-block')
    cell.appendChild(blockEl)

    // Evento para eliminar (por groupCode)
    blockEl.querySelector('.block-remove').addEventListener('click', (e) => {
      e.stopPropagation()
      const groupCode = e.target.dataset.groupCode
      const idx = placedBlocks.findIndex((pb) => pb.groupCode === groupCode)
      if (idx !== -1) {
        placedBlocks.splice(idx, 1)
        renderPlacedBlocks()
        renderDesignerSubjects()
        renderDraftTabs()
        showDesignerMessage(`Bloque eliminado del horario.`, 'info')
      }
    })
  }
}

function showDesignerMessage(text, type = 'info') {
  let msgEl = document.querySelector('#designer-message')
  if (!msgEl) {
    msgEl = document.createElement('p')
    msgEl.id = 'designer-message'
    msgEl.className = 'form-message'
    const calendar = document.querySelector('.designer-calendar')
    if (calendar) calendar.prepend(msgEl)
  }

  const colors = {
    success: '#3b8069',
    warning: '#f0ad4e',
    error: '#c05640',
    info: '#486581',
  }
  msgEl.style.color = colors[type] || colors.info
  msgEl.textContent = text

  clearTimeout(msgEl._timeout)
  msgEl._timeout = setTimeout(() => {
    msgEl.textContent = ''
  }, 4000)
}

// ── Filter controls ───────────────────────────────────────────────
document.querySelector('#pref-morning')?.addEventListener('change', (e) => {
  designerFilters.preferMorning = e.target.checked
  renderDesignerSubjects()
})
document.querySelector('#pref-fridays')?.addEventListener('change', (e) => {
  designerFilters.avoidFridays = e.target.checked
  renderDesignerSubjects()
})
document.querySelector('#pref-compact')?.addEventListener('change', (e) => {
  designerFilters.compactDays = e.target.checked
  renderDesignerSubjects()
})

document.querySelectorAll('[data-day-filter]').forEach((cb) => {
  cb.addEventListener('change', (e) => {
    const day = parseInt(e.target.dataset.dayFilter)
    if (e.target.checked) {
      if (!designerFilters.preferredDays.includes(day)) {
        designerFilters.preferredDays.push(day)
      }
    } else {
      designerFilters.preferredDays = designerFilters.preferredDays.filter(d => d !== day)
    }
    renderDesignerSubjects()
  })
})

document.querySelector('#filter-min-hour')?.addEventListener('change', (e) => {
  designerFilters.minHour = parseInt(e.target.value) || 6
  renderDesignerSubjects()
})
document.querySelector('#filter-max-hour')?.addEventListener('change', (e) => {
  designerFilters.maxHour = parseInt(e.target.value) || 22
  renderDesignerSubjects()
})

function syncFilterUI() {
  document.querySelector('#pref-morning').checked = designerFilters.preferMorning
  document.querySelector('#pref-fridays').checked = designerFilters.avoidFridays
  document.querySelector('#pref-compact').checked = designerFilters.compactDays
  document.querySelectorAll('[data-day-filter]').forEach((cb) => {
    cb.checked = designerFilters.preferredDays.includes(parseInt(cb.dataset.dayFilter))
  })
  document.querySelector('#filter-min-hour').value = designerFilters.minHour
  document.querySelector('#filter-max-hour').value = designerFilters.maxHour
}

// ── Export navigation ─────────────────────────────────────────────
document.querySelector('#to-export')?.addEventListener('click', () =>
  showPanel(document.querySelector('#export-panel'))
)