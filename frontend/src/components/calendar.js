import { DAY_NAMES, DAY_COLORS, START_HOUR, END_HOUR, parseTime } from '../utils/helpers.js'

// ── Render calendar grid ──────────────────────────────────────────
export function renderCalendarGrid(gridElement, placedBlocks, onRemoveBlock) {
  const hours = []
  for (let h = START_HOUR; h < END_HOUR; h++) hours.push(h)

  let html = '<div class="calendar-header"></div>'
  for (let d = 0; d < 6; d++) html += `<div class="calendar-header">${DAY_NAMES[d]}</div>`

  for (const hour of hours) {
    html += `<div class="calendar-hour">${String(hour).padStart(2, '0')}:00</div>`
    for (let d = 0; d < 6; d++) {
      html += `<div class="calendar-cell" id="des-cell-${d}-${hour}" data-day="${d}" data-hour="${hour}"></div>`
    }
  }

  gridElement.innerHTML = html
  placeBlocks(gridElement, placedBlocks, onRemoveBlock)
  return html
}

// ── Place blocks onto grid ────────────────────────────────────────
export function placeBlocks(gridElement, placedBlocks, onRemoveBlock) {
  if (!gridElement) return

  gridElement.querySelectorAll('.calendar-block').forEach((el) => el.remove())
  gridElement.querySelectorAll('.has-block').forEach((el) => el.classList.remove('has-block'))

  for (const pb of placedBlocks) {
    const { dayIndex, startHour, startMin, endHour, endMin, group } = pb
    const cell = gridElement.querySelector(`#des-cell-${dayIndex}-${startHour}`)
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
    blockEl.title = `${group.subject_name} (${group.code})\n${String(startHour).padStart(2,'0')}:${String(startMin).padStart(2,'0')} - ${String(endHour).padStart(2,'0')}:${String(endMin).padStart(2,'0')}`

    cell.classList.add('has-block')
    cell.appendChild(blockEl)

    if (onRemoveBlock) {
      blockEl.querySelector('.block-remove').addEventListener('click', (e) => {
        e.stopPropagation()
        const groupCode = e.target.dataset.groupCode
        onRemoveBlock(groupCode)
      })
    }
  }
}

// ── Setup drop event listeners ────────────────────────────────────
export function setupDropListeners(gridElement, onDrop) {
  gridElement.querySelectorAll('.calendar-cell').forEach((cell) => {
    cell.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' })
    cell.addEventListener('dragenter', (e) => {
      e.preventDefault()
      const c = e.target.closest('.calendar-cell')
      if (c) c.classList.add('drag-over')
    })
    cell.addEventListener('dragleave', (e) => {
      const c = e.target.closest('.calendar-cell')
      if (c) c.classList.remove('drag-over')
    })
    cell.addEventListener('drop', (e) => {
      e.preventDefault()
      const c = e.target.closest('.calendar-cell')
      if (!c) return
      c.classList.remove('drag-over')
      const dayIndex = parseInt(c.dataset.day)
      onDrop(dayIndex)
    })
  })
}

export function clearDragOver() {
  document.querySelectorAll('.calendar-cell.drag-over').forEach((c) => c.classList.remove('drag-over'))
}