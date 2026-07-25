import { formatGroupTime, encodeGroupData, timeToMinutes, DAY_NAMES } from '../utils/helpers.js'
import { getSelectedSubjectCodes } from './subjects.js'
import { getPlacedBlocks, isGroupPlaced, isSubjectPlaced, hasConflict, placeGroup, removeGroup } from '../services/scheduler.js'

let draggedGroupData = null
let onStateChange = null

export function setOnStateChange(callback) {
  onStateChange = callback
}

export function getDraggedGroupData() { return draggedGroupData }
export function clearDraggedGroupData() { draggedGroupData = null }

// ── Render available subjects in designer sidebar ─────────────────
export function renderDesignerSubjects(container, extractionData, drafts, activeDraft, filters) {
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

  if (groups.length === 0) {
    container.innerHTML = '<p class="empty-message">Ningún grupo coincide con los filtros actuales.</p>'
    return
  }

  container.innerHTML = html

  // Drag event listeners
  container.querySelectorAll('.designer-group-card:not(.placed)').forEach((card) => {
    card.addEventListener('dragstart', handleDragStart)
    card.addEventListener('dragend', handleDragEnd)
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

  // Place all blocks
  placeGroup(placedBlocks, draggedGroupData)
  const blockCount = draggedGroupData.blocks.length
  showMessage(`"${draggedGroupData.subject_name}" (${draggedGroupData.code}) — ${blockCount} bloque(s) agregado(s).`, 'success')
  clearDraggedGroupData()

  if (onStateChange) onStateChange()
}

// ── Remove block ──────────────────────────────────────────────────
export function handleRemoveBlock(groupCode, showMessage) {
  const placedBlocks = getPlacedBlocks()
  if (removeGroup(placedBlocks, groupCode)) {
    if (onStateChange) onStateChange()
    showMessage('Bloque eliminado del horario.', 'info')
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