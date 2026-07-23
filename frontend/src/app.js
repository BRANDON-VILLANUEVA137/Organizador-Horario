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
  'preferences-panel',
  'results-panel',
  'export-panel',
].map((id) => document.querySelector(`#${id}`))

let extractionData = null
let catalogData = null

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
document.querySelector('#to-preferences').addEventListener('click', () =>
  showPanel(document.querySelector('#preferences-panel'))
)
document.querySelector('#to-results').addEventListener('click', generateSchedules)
document.querySelector('#to-export').addEventListener('click', () =>
  showPanel(document.querySelector('#export-panel'))
)

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
  try {
    const url = new URL(value)
    if (url.pathname.endsWith('/condicionales/inicioSeguro.jsp')) {
      url.pathname = url.pathname.replace(
        'inicioSeguro.jsp',
        'apl_gen_public.jsp'
      )
      url.search = '?id=ConsultaHorario'
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
  const semestersSet = new Set()

  for (const group of groups) {
    if (!subjectsMap.has(group.subject_code)) {
      subjectsMap.set(group.subject_code, {
        code: group.subject_code,
        name: group.subject_name,
        credits: group.credits,
        semester: group.semester || null,
        groups: [],
      })
    }
    subjectsMap.get(group.subject_code).groups.push(group)

    if (group.semester) {
      semestersSet.add(group.semester)
    }
  }

  const sortedSemesters = Array.from(semestersSet).sort()
  semesterFilter.innerHTML =
    '<option value="">Todos los semestres</option>' +
    sortedSemesters.map((s) => `<option value="${s}">${s}</option>`).join('')

  semesterFilter.onchange = () => {
    const selectedSemester = semesterFilter.value
    const allOptions = container.querySelectorAll('.subject-option')
    allOptions.forEach((option) => {
      const subjectSemester = option.dataset.semester || null
      if (!selectedSemester || subjectSemester === selectedSemester) {
        option.hidden = false
      } else {
        option.hidden = true
      }
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
    <label class="subject-option" data-semester="${subj.semester || ''}">
      <input type="checkbox" checked value="${subj.code}" />
      <span>
        <strong>${subj.name}</strong>
        <small>${subj.code} · ${subj.credits} créditos · ${subj.groups.length} grupo(s)${subj.semester ? ' · ' + subj.semester : ''}</small>
      </span>
    </label>
  `
    )
    .join('')
}

// ── Schedule generation ───────────────────────────────────────────
async function generateSchedules() {
  const resultList = document.querySelector('#result-list')
  const summary = document.querySelector('#results-summary')
  const resultsPanel = document.querySelector('#results-panel')

  showPanel(resultsPanel)
  summary.textContent = 'Generando horarios...'
  resultList.innerHTML = '<p class="empty-message">Calculando combinaciones...</p>'

  if (!extractionData || !extractionData.groups.length) {
    summary.textContent = 'No hay datos de extracción disponibles.'
    resultList.innerHTML = ''
    return
  }

  const selectedSubjects = [
    ...document.querySelectorAll('#subject-list input:checked'),
  ].map((input) => input.value)

  if (selectedSubjects.length === 0) {
    summary.textContent = 'Selecciona al menos una materia.'
    resultList.innerHTML = ''
    return
  }

  const preferMorning = document.querySelector('#pref-morning').checked
  const avoidFridays = document.querySelector('#pref-fridays').checked

  const selectedGroups = extractionData.groups.filter((g) =>
    selectedSubjects.includes(g.subject_code)
  )

  const bySubject = new Map()
  for (const group of selectedGroups) {
    if (!bySubject.has(group.subject_code)) {
      bySubject.set(group.subject_code, [])
    }
    bySubject.get(group.subject_code).push(group)
  }

  const combinations = generateCombinations(Array.from(bySubject.values()))
  const scored = combinations.map((combo) => ({
    groups: combo,
    score: calculateScore(combo, { preferMorning, avoidFridays }),
    days: extractDays(combo),
    credits: combo.reduce((sum, g) => sum + (g.credits || 0), 0),
  }))

  scored.sort((a, b) => b.score - a.score)
  const topResults = scored.slice(0, 10)

  if (topResults.length === 0) {
    summary.textContent =
      'No se encontraron horarios sin conflictos. Intenta seleccionar más materias.'
    resultList.innerHTML = ''
    return
  }

  summary.textContent = `${topResults.length} horario(s) válido(s) ordenados según tus preferencias.`

  window._scoredResults = topResults

  resultList.innerHTML = topResults
    .map(
      (item, i) => `
    <article class="result-card ${i === 0 ? 'featured' : ''}" data-index="${i}">
      <span class="result-rank">${String(i + 1).padStart(2, '0')}</span>
      <div>
        <strong>${item.days.join(' · ')}</strong>
        <small>${item.credits} créditos</small>
      </div>
      <b>${Math.round(item.score)} pts</b>
    </article>
  `
    )
    .join('')

  document.querySelectorAll('.result-card').forEach((card) => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.index)
      const result = window._scoredResults[index]
      if (result) renderCalendar(result.groups)
    })
  })

  if (topResults.length > 0) {
    renderCalendar(topResults[0].groups)
  }
}

// ── Calendar rendering ────────────────────────────────────────────
const DAY_NAMES = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES']
const DAY_COLORS = [
  '#c05640',
  '#3b8069',
  '#2c7a9e',
  '#b07a2e',
  '#7b4f9e',
]

function renderCalendar(groups) {
  const panel = document.querySelector('#calendar-panel')
  const grid = document.querySelector('#calendar-grid')
  panel.hidden = false

  const startHour = 6
  const endHour = 22
  const hours = []
  for (let h = startHour; h < endHour; h++) {
    hours.push(h)
  }

  const blocksByDay = {}
  for (const group of groups) {
    for (const block of group.blocks) {
      const dayIndex = block.weekday
      if (dayIndex > 4) continue

      if (!blocksByDay[dayIndex]) blocksByDay[dayIndex] = []
      blocksByDay[dayIndex].push({
        subject: group.subject_name,
        code: group.subject_code,
        group: group.code,
        starts_at: block.starts_at,
        ends_at: block.ends_at,
      })
    }
  }

  let html = ''
  html += '<div class="calendar-header"></div>'
  for (let d = 0; d < 5; d++) {
    html += `<div class="calendar-header">${DAY_NAMES[d]}</div>`
  }

  for (const hour of hours) {
    const label = `${String(hour).padStart(2, '0')}:00`
    html += `<div class="calendar-hour">${label}</div>`

    for (let d = 0; d < 5; d++) {
      const cellId = `cell-${d}-${hour}`
      html += `<div class="calendar-cell" id="${cellId}"></div>`
    }
  }

  grid.innerHTML = html

  for (let d = 0; d < 5; d++) {
    const dayBlocks = blocksByDay[d] || []
    for (const block of dayBlocks) {
      const sHour = block.starts_at.hour || 0
      const sMin = block.starts_at.minute || 0
      const eHour = block.ends_at.hour || 0
      const eMin = block.ends_at.minute || 0

      const topOffset = sMin / 60
      const height = (eHour - sHour) + (eMin - sMin) / 60

      const cell = document.querySelector(`#cell-${d}-${sHour}`)
      if (!cell) continue

      const color = DAY_COLORS[d % DAY_COLORS.length]

      const blockEl = document.createElement('div')
      blockEl.className = 'calendar-block'
      blockEl.style.top = `${topOffset * 100}%`
      blockEl.style.height = `${height * 100}%`
      blockEl.style.background = color
      blockEl.innerHTML = `<strong>${block.subject}</strong>`
      blockEl.title = `${block.subject} (${block.group})\n${String(sHour).padStart(2,'0')}:${String(sMin).padStart(2,'0')} - ${String(eHour).padStart(2,'0')}:${String(eMin).padStart(2,'0')}`
      cell.appendChild(blockEl)
    }
  }
}

// ── Combinatorics ─────────────────────────────────────────────────
function generateCombinations(groupsBySubject) {
  if (groupsBySubject.length === 0) return []

  function cartesian(arrays) {
    if (arrays.length === 0) return [[]]
    const [first, ...rest] = arrays
    const restCombos = cartesian(rest)
    return first.flatMap((item) => restCombos.map((combo) => [item, ...combo]))
  }

  const allCombos = cartesian(groupsBySubject)
  return allCombos.filter((combo) => !hasConflicts(combo))
}

function hasConflicts(groups) {
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (groupsOverlap(groups[i], groups[j])) return true
    }
  }
  return false
}

function groupsOverlap(a, b) {
  for (const blockA of a.blocks) {
    for (const blockB of b.blocks) {
      if (blocksOverlap(blockA, blockB)) return true
    }
  }
  return false
}

function blocksOverlap(a, b) {
  if (a.weekday !== b.weekday) return false
  return a.starts_at < b.ends_at && b.starts_at < a.ends_at
}

// ── Scoring ───────────────────────────────────────────────────────
function calculateScore(combo, { preferMorning, avoidFridays }) {
  let score = 50

  if (preferMorning) {
    const morningCount = combo.filter((g) =>
      g.blocks.some((b) => {
        const hour = b.starts_at.hour || 0
        return hour >= 6 && hour < 12
      })
    ).length
    score += (morningCount / combo.length) * 25
  }

  if (avoidFridays) {
    const fridayCount = combo.filter((g) =>
      g.blocks.some((b) => b.weekday === 4)
    ).length
    score -= (fridayCount / combo.length) * 30
  }

  const allDays = new Set()
  for (const g of combo) {
    for (const b of g.blocks) {
      allDays.add(b.weekday)
    }
  }
  const dayBonus = Math.max(0, (5 - allDays.size) * 5)
  score += dayBonus

  return Math.max(0, Math.min(100, score))
}

function extractDays(combo) {
  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  const days = new Set()
  for (const g of combo) {
    for (const b of g.blocks) {
      days.add(b.weekday)
    }
  }
  return Array.from(days).sort().map((d) => dayNames[d])
}