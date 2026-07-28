import { formatGroupTime, encodeGroupData, timeToMinutes, DAY_NAMES } from '../utils/helpers.js'
import { getSelectedSubjectCodes } from './subjects.js'
import { getPlacedBlocks, isGroupPlaced, isSubjectPlaced, hasConflict, placeGroup, removeGroup } from '../services/scheduler.js'
import { checkEligibility } from '../services/api.js'

let draggedGroupData = null
let onStateChange = null

// Cache de elegibilidad: { subject_code -> { eligible, reason, missing_requirements, missing_diagnostics } }
let eligibilityCache = null
let eligibilityLoading = false

// Cache de materias completadas (aprobadas) para ocultar del diseñador
// Siempre almacenado como Set para búsqueda O(1) con .has()
let completedSubjectsCache = new Set()

// ── Manual unlock state ────────────────────────────────────────────
// Set of subject_codes that the user has manually unlocked via checkbox
let manuallyUnlocked = new Set()

export function toggleManualUnlock(subjectCode) {
  if (manuallyUnlocked.has(subjectCode)) {
    manuallyUnlocked.delete(subjectCode)
  } else {
    manuallyUnlocked.add(subjectCode)
  }
}

export function isManuallyUnlocked(subjectCode) {
  return manuallyUnlocked.has(subjectCode)
}

export function resetManuallyUnlocked() {
  manuallyUnlocked = new Set()
}

export function setCompletedSubjects(subjects) {
  if (Array.isArray(subjects)) {
    completedSubjectsCache = new Set(subjects)
  } else if (subjects instanceof Set) {
    completedSubjectsCache = subjects
  } else {
    completedSubjectsCache = new Set()
  }
}

export function getCompletedSubjects() {
  return Array.from(completedSubjectsCache)
}

export function setOnStateChange(callback) {
  onStateChange = callback
}

export function getDraggedGroupData() { return draggedGroupData }
export function clearDraggedGroupData() { draggedGroupData = null }

// ── Cargar elegibilidad desde el backend ─────────────────────────
export async function loadEligibility(completedSubjects, completedDiagnostics = []) {
  eligibilityLoading = true
  try {
    // Limpiar cache anterior para evitar datos obsoletos de extracciones previas
    eligibilityCache = null
    
    const result = await checkEligibility(completedSubjects, completedDiagnostics)
    // Construir mapa: subject_code -> info de elegibilidad
    const map = {}
    for (const s of result.eligible_subjects) {
      map[s.codigo] = { eligible: true, reason: null, missing_requirements: [], missing_diagnostics: [] }
    }
    for (const s of result.blocked_subjects) {
      map[s.codigo] = {
        eligible: false,
        reason: s.reason,
        missing_requirements: s.missing_requirements,
        missing_diagnostics: s.missing_diagnostics,
      }
    }

    // 🔥 SOBRESCRIBIR: Las materias ya cursadas/aprobadas NUNCA deben aparecer como bloqueadas
    // Aunque el backend las marque como bloqueadas (por ejemplo si el pensum cambió),
    // el usuario ya las aprobó, así que forzamos eligible=true para que se oculten del diseñador
    const completedSet = new Set(completedSubjects.map(c => c.toUpperCase()))
    for (const code of Object.keys(map)) {
      if (completedSet.has(code.toUpperCase())) {
        console.log('[designer.js] Override: materia completada detectada:', code)
        map[code] = { eligible: true, reason: null, missing_requirements: [], missing_diagnostics: [] }
      }
    }
    
    // 🔥 DEBUG: Log del estado de elegibilidad
    console.log('[designer.js] Materias bloqueadas:', Object.entries(map).filter(([k,v]) => !v.eligible).map(([k,v]) => ({code: k, reason: v.reason})))

    eligibilityCache = map
    return result
  } catch (err) {
    console.warn('No se pudo cargar elegibilidad:', err)
    eligibilityCache = null
    return null
  } finally {
    eligibilityLoading = false
  }
}

export function getEligibility(subjectCode) {
  if (!eligibilityCache) return null
  return eligibilityCache[subjectCode] || null
}

export function isEligibilityLoaded() {
  return eligibilityCache !== null
}

// ── Búsqueda de materias por nombre o código ──────────────────────
let searchQuery = ''

export function setSearchQuery(query) {
  searchQuery = (query || '').toLowerCase().trim()
}

export function getSearchQuery() {
  return searchQuery
}

// ── Render available subjects in designer sidebar ─────────────────
export function renderDesignerSubjects(container, extractionData, drafts, activeDraft, filters, queryOverride, showMessage) {
  const groups = getFilteredGroups(extractionData, filters)

  if (groups.length === 0) {
    container.innerHTML = '<p class="empty-message">No hay materias seleccionadas. Vuelve atrás y elige al menos una.</p>'
    return
  }

  const placedGroupCodes = new Set(drafts[activeDraft].map(pb => pb.groupCode))

  const bySubject = new Map()
  for (const group of groups) {
    if (!bySubject.has(group.subject_code)) {
      bySubject.set(group.subject_code, {
        name: group.subject_name, code: group.subject_code, groups: [],
      })
    }
    bySubject.get(group.subject_code).groups.push(group)
  }

  // Obtener materias completadas para filtrarlas de la vista
  const completedSubjects = new Set(completedSubjectsCache || [])

  // Aplicar filtro de búsqueda por nombre o código (case-insensitive)
  const q = (queryOverride ?? searchQuery ?? '').toString().toLowerCase().trim()

  let html = ''
  let completedCount = 0
  for (const [code, subject] of bySubject) {
    // Saltar materias completadas (aprobadas) — no se muestran en el diseñador
    if (completedSubjects.has(code)) {
      completedCount++
      continue
    }

    // Filtrar por búsqueda: coincidencia en nombre o código
    if (q && !subject.name.toLowerCase().includes(q) && !subject.code.toLowerCase().includes(q)) {
      continue
    }

    // Verificar elegibilidad de esta materia
    const elig = getEligibility(code)
    const isBlocked = elig && !elig.eligible
    const isUnlocked = manuallyUnlocked.has(code)
    // Si está manualmente desbloqueada, se comporta como no bloqueada
    const effectivelyBlocked = isBlocked && !isUnlocked
    const blockReason = elig ? elig.reason : null

    // Checkbox de desbloqueo manual (solo para materias bloqueadas)
    const unlockCheckbox = isBlocked
      ? `<label class="unlock-toggle" title="Desbloquear manualmente">
           <input type="checkbox" class="unlock-checkbox" data-subject-code="${code}" ${isUnlocked ? 'checked' : ''}>
           <span class="unlock-label">Desbloquear</span>
         </label>`
      : ''

    html += `<div class="designer-subject-header ${effectivelyBlocked ? 'blocked' : ''}">${subject.name}${unlockCheckbox}</div>`
    for (const group of subject.groups) {
      const timeInfo = formatGroupTime(group)
      const isDiagnostico = group.subject_name?.includes('[DIAGNÓSTICO]')
      const isPlaced = placedGroupCodes.has(group.code)
      const canDrag = !isPlaced && !effectivelyBlocked

      html += `
        <div class="designer-group-card 
             ${isPlaced ? 'placed' : ''} 
             ${effectivelyBlocked ? 'blocked' : ''}" 
             draggable="${canDrag}"
             data-subject-code="${code}"
             data-subject-name="${subject.name}"
             data-group-code="${group.code}"
             data-group-json='${encodeGroupData(group)}'
             ${blockReason ? `title="🔒 Bloqueada: ${blockReason}"` : ''}>
          <div class="group-name">
            ${isDiagnostico ? '📋 ' : ''}
            ${effectivelyBlocked ? '🔒 ' : ''}
            ${group.code} ${isPlaced ? '✓' : ''}
          </div>
          <div class="group-code">${subject.name}</div>
          <div class="group-time">${timeInfo || 'Sin horario definido'}</div>
          <div class="group-meta">${group.blocks.length} día(s) · ${group.credits} créditos</div>
          <div class="group-actions">
            ${isPlaced 
              ? '<span class="added-badge">✓ Añadido</span>' 
              : effectivelyBlocked 
                ? '<span class="blocked-action">Bloqueada</span>' 
                : `<button class="add-button" data-group-code="${group.code}" data-group-json='${encodeGroupData(group)}' ${canDrag ? '' : 'disabled'}>➕ Añadir</button>`
            }
          </div>
          ${isDiagnostico ? '<span class="group-badge">Diagnóstico</span>' : ''}
          ${effectivelyBlocked ? '<span class="group-badge blocked-badge">Bloqueada</span>' : ''}
        </div>
      `
    }
  }

  if (html === '') {
    container.innerHTML = q
      ? '<p class="empty-message">Ninguna materia coincide con la búsqueda.</p>'
      : '<p class="empty-message">Ningún grupo coincide con los filtros actuales.</p>'
    return
  }

  container.innerHTML = html

  // Drag event listeners (solo para cards no placed y no blocked)
  container.querySelectorAll('.designer-group-card:not(.placed):not(.blocked)').forEach((card) => {
    card.addEventListener('dragstart', handleDragStart)
    card.addEventListener('dragend', handleDragEnd)
  })

  // Manual unlock checkbox listeners
  container.querySelectorAll('.unlock-checkbox').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      const subjectCode = e.target.dataset.subjectCode
      toggleManualUnlock(subjectCode)
      // Re-render to update drag state and visual styling
      renderDesignerSubjects(container, extractionData, drafts, activeDraft, filters, queryOverride)
      if (onStateChange) onStateChange()
    })
  })

  // 🔥 One-tap add button listeners (para móviles)
  container.querySelectorAll('.add-button').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      
      try {
        const groupData = JSON.parse(btn.dataset.groupJson)
        handleOneTapAdd(groupData, showMessage)
      } catch (err) {
        console.error('Error parsing group data:', err)
      }
    })
  })
}

function getFilteredGroups(extractionData, filters) {
  if (!extractionData || !extractionData.groups) return []
  const selectedSubjects = getSelectedSubjectCodes()
  let groups = extractionData.groups.filter((g) => selectedSubjects.includes(g.subject_code))

  // Apply filters
  groups = groups.filter(g =>
    g.blocks.some(b => {
      const startMin = timeToMinutes(b.starts_at)
      const endMin = timeToMinutes(b.ends_at)
      return startMin >= filters.minHour * 60 && endMin <= filters.maxHour * 60
    })
  )

  if (filters.preferMorning) {
    groups = groups.filter(g => g.blocks.some(b => timeToMinutes(b.starts_at) < 12 * 60))
  }
  if (filters.avoidFridays) {
    groups = groups.filter(g => !g.blocks.some(b => b.weekday === 4))
  }
  if (filters.preferredDays.length > 0) {
    groups = groups.filter(g => g.blocks.some(b => filters.preferredDays.includes(b.weekday)))
  }

  return groups
}

// ── Drag handlers ─────────────────────────────────────────────────
function handleDragStart(e) {
  const card = e.target.closest('.designer-group-card')
  if (!card) return
  if (card.classList.contains('placed')) { e.preventDefault(); return }

  try { draggedGroupData = JSON.parse(card.dataset.groupJson) } catch { return }

  card.classList.add('dragging')
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', card.dataset.groupJson)
}

function handleDragEnd(e) {
  const card = e.target.closest('.designer-group-card')
  if (card) card.classList.remove('dragging')
  document.querySelectorAll('.calendar-cell.drag-over').forEach((c) => c.classList.remove('drag-over'))
}

// ── Handle drop on calendar cell ──────────────────────────────────
export function handleDrop(dayIndex, showMessage) {
  if (!draggedGroupData) return

  if (!draggedGroupData.blocks.some((b) => b.weekday === dayIndex)) {
    showMessage('Este grupo no tiene horario en ese día.', 'warning')
    return
  }

  const placedBlocks = getPlacedBlocks()

  // Validations
  if (isGroupPlaced(placedBlocks, draggedGroupData.code)) {
    showMessage(`El grupo "${draggedGroupData.code}" ya está en el horario.`, 'warning')
    clearDraggedGroupData()
    return
  }
  if (isSubjectPlaced(placedBlocks, draggedGroupData.subject_code)) {
    showMessage(
      `Ya tienes "${draggedGroupData.subject_name}" con otro grupo. Quita ese primero si quieres cambiar.`,
      'warning'
    )
    clearDraggedGroupData()
    return
  }

  const conflict = hasConflict(placedBlocks, draggedGroupData)
  if (conflict) {
    showMessage(
      `Conflicto: "${draggedGroupData.subject_name}" choca con ${conflict.group.subject_name} el ${DAY_NAMES[conflict.dayIndex]}.`,
      'error'
    )
    clearDraggedGroupData()
    return
  }

  // 🔥 Validar límite de 18 créditos por semestre
  const newCredits = draggedGroupData.credits || 0
  const currentCredits = calculateTotalCredits(placedBlocks)
  const totalAfterAdd = currentCredits + newCredits
  
  if (totalAfterAdd > 18) {
    showMessage(
      `Límite de créditos excedido: ${currentCredits} + ${newCredits} = ${totalAfterAdd} créditos. El máximo permitido es 18.`,
      'error'
    )
    clearDraggedGroupData()
    return
  }

  // Place all blocks
  placeGroup(placedBlocks, draggedGroupData)
  const blockCount = draggedGroupData.blocks.length
  
  // Actualizar contador de créditos
  updateCreditsCounter(getPlacedBlocks())
  
  showMessage(`"${draggedGroupData.subject_name}" (${draggedGroupData.code}) — ${blockCount} bloque(s) agregado(s). Créditos: ${totalAfterAdd}/18`, 'success')
  clearDraggedGroupData()

  if (onStateChange) onStateChange()
}

// ── Remove block ──────────────────────────────────────────────────
export function handleRemoveBlock(groupCode, showMessage) {
  const placedBlocks = getPlacedBlocks()
  const creditsBefore = calculateTotalCredits(placedBlocks)
  
  if (removeGroup(placedBlocks, groupCode)) {
    const creditsAfter = calculateTotalCredits(placedBlocks)
    
    // Actualizar contador de créditos
    updateCreditsCounter(getPlacedBlocks())
    
    if (onStateChange) onStateChange()
    showMessage(`Bloque eliminado del horario. Créditos: ${creditsAfter}/18`, 'info')
  }
}

// ── Draft tabs ────────────────────────────────────────────────────
export function renderDraftTabs(container, drafts, activeDraft, draftNames, onTabClick) {
  if (!container) return

  container.innerHTML = draftNames
    .map((name, i) => `
      <button class="draft-tab ${i === activeDraft ? 'active' : ''}" data-draft="${i}">
        ${name}
        <span class="draft-count">${drafts[i].length ? `${drafts[i].length} bloq` : 'vacío'}</span>
      </button>
    `).join('')

  container.querySelectorAll('.draft-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.draft)
      onTabClick(index)
    })
  })
}

// ── Populate hour selects ─────────────────────────────────────────
export function populateHourSelects() {
  const minSelect = document.querySelector('#filter-min-hour')
  const maxSelect = document.querySelector('#filter-max-hour')
  if (!minSelect || !maxSelect) return
  const hours = []
  for (let h = 6; h <= 22; h++) hours.push(h)
  const opts = hours.map(h => `<option value="${h}">${String(h).padStart(2,'0')}:00</option>`).join('')
  minSelect.innerHTML = opts
  maxSelect.innerHTML = opts
}

// ── Sync filter UI with state ─────────────────────────────────────
export function syncFilterUI(filters) {
  document.querySelector('#pref-morning').checked = filters.preferMorning
  document.querySelector('#pref-fridays').checked = filters.avoidFridays
  document.querySelector('#pref-compact').checked = filters.compactDays
  document.querySelectorAll('[data-day-filter]').forEach((cb) => {
    cb.checked = filters.preferredDays.includes(parseInt(cb.dataset.dayFilter))
  })
  document.querySelector('#filter-min-hour').value = filters.minHour
  document.querySelector('#filter-max-hour').value = filters.maxHour
}

// ── Calcular créditos totales del horario ─────────────────────────
export function calculateTotalCredits(placedBlocks) {
  if (!placedBlocks || !Array.isArray(placedBlocks)) return 0
  
  console.log('[credits] Calculando créditos de placedBlocks:', placedBlocks.length, 'bloques')
  
  // Usar un Set para evitar contar créditos duplicados de la misma materia
  const uniqueSubjects = new Set(placedBlocks.map(pb => pb.subjectCode))
  console.log('[credits] Materias únicas:', Array.from(uniqueSubjects))
  
  let totalCredits = 0
  for (const subjectCode of uniqueSubjects) {
    // Buscar el grupo colocado para obtener sus créditos
    const placedBlock = placedBlocks.find(pb => pb.subjectCode === subjectCode)
    console.log('[credits] Buscando créditos para', subjectCode, ':', placedBlock?.credits)
    if (placedBlock && placedBlock.credits) {
      totalCredits += placedBlock.credits
    }
  }
  
  console.log('[credits] Total calculado:', totalCredits)
  return totalCredits
}

// ── Actualizar contador de créditos en la UI ──────────────────────
export function updateCreditsCounter(placedBlocks) {
  const counterElement = document.querySelector('#credits-counter')
  if (!counterElement) return
  
  const totalCredits = calculateTotalCredits(placedBlocks)
  const remaining = 18 - totalCredits
  
  counterElement.textContent = `${totalCredits}/18 créditos`
  
  // Cambiar color según el estado
  if (totalCredits > 18) {
    counterElement.className = 'credits-counter over-limit'
  } else if (totalCredits === 18) {
    counterElement.className = 'credits-counter at-limit'
  } else {
    counterElement.className = 'credits-counter'
  }
}

// ── One-tap add: validar y colocar automáticamente en el horario ──
export function handleOneTapAdd(groupData, showMessage) {
  if (!groupData) return

  const placedBlocks = getPlacedBlocks()

  // Validar si ya está colocado
  if (isGroupPlaced(placedBlocks, groupData.code)) {
    showMessage(`El grupo "${groupData.code}" ya está en el horario.`, 'warning')
    return
  }
  if (isSubjectPlaced(placedBlocks, groupData.subject_code)) {
    showMessage(
      `Ya tienes "${groupData.subject_name}" con otro grupo. Quita ese primero si quieres cambiar.`,
      'warning'
    )
    return
  }

  // Validar conflictos
  const conflict = hasConflict(placedBlocks, groupData)
  if (conflict) {
    showMessage(
      `Conflicto: "${groupData.subject_name}" choca con ${conflict.group.subject_name} el ${DAY_NAMES[conflict.dayIndex]}.`,
      'error'
    )
    return
  }

  // Validar límite de 18 créditos
  const newCredits = groupData.credits || 0
  const currentCredits = calculateTotalCredits(placedBlocks)
  const totalAfterAdd = currentCredits + newCredits

  if (totalAfterAdd > 18) {
    showMessage(
      `Límite de créditos excedido: ${currentCredits} + ${newCredits} = ${totalAfterAdd} créditos. El máximo permitido es 18.`,
      'error'
    )
    return
  }

  // Colocar grupo
  placeGroup(placedBlocks, groupData)
  const blockCount = groupData.blocks.length

  // Actualizar contador de créditos
  updateCreditsCounter(getPlacedBlocks())

  showMessage(`"${groupData.subject_name}" (${groupData.code}) — ${blockCount} bloque(s) agregado(s). Créditos: ${totalAfterAdd}/18`, 'success')

  // Mostrar toast en móviles
  if (window.showToast) {
    window.showToast(`✓ "${groupData.subject_name}" agregado al horario`, 'success', 2500)
  }

  if (onStateChange) onStateChange()
}
