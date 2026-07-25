import { normalizeSemesterKey } from '../utils/helpers.js'

// ── Render subject list ───────────────────────────────────────────
export function renderSubjects(container, groups, selectedSubjects = [], onCheckChange) {
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

  // Populate semester filter
  const sortedSemesters = Array.from(semestersMap.entries()).sort((a, b) =>
    a[1].localeCompare(b[1], undefined, { numeric: true, sensitivity: 'base' })
  )
  semesterFilter.innerHTML =
    '<option value="">Todos los semestres</option>' +
    sortedSemesters.map(([key, label]) => `<option value="${key}">${label}</option>`).join('')

  // Semester filter change handler
  semesterFilter.onchange = () => {
    const selected = normalizeSemesterKey(semesterFilter.value)
    container.querySelectorAll('.subject-option').forEach((option) => {
      const subjectSemesters = (option.dataset.semesters || '').split('|').filter(Boolean)
      option.style.display = (selected && !subjectSemesters.includes(selected)) ? 'none' : ''
    })
  }

  const subjects = Array.from(subjectsMap.values())

  if (subjects.length === 0) {
    container.innerHTML = '<p class="empty-message">No se encontraron materias en el portal.</p>'
    return
  }

  container.innerHTML = subjects
    .map((subj) => {
      const isChecked = selectedSubjects.includes(subj.code)
      return `
    <label class="subject-option" data-semesters="${Array.from(subj.semesters.keys()).join('|')}">
      <input type="checkbox" value="${subj.code}" ${isChecked ? 'checked' : ''} />
      <span>
        <strong>${subj.name}</strong>
        <small>${subj.code} · ${subj.credits} créditos · ${subj.groups.length} grupo(s)</small>
      </span>
    </label>
  `
    }).join('')

  // Update metadata (semester text) for each option
  container.querySelectorAll('.subject-option').forEach((option) => {
    const subjectCode = option.querySelector('input')?.value
    const subject = subjectsMap.get(subjectCode)
    if (!subject) return
    const semesterLabels = Array.from(subject.semesters.values())
    const semesterText = semesterLabels.length ? ` · ${semesterLabels.join(', ')}` : ''
    option.querySelector('small').textContent = `${subject.code} · ${subject.credits} créditos · ${subject.groups.length} grupo(s)${semesterText}`
  })

  // Attach change handlers
  if (onCheckChange) {
    container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', onCheckChange)
    })
  }

  semesterFilter.onchange()
}

// ── Get selected subject codes ────────────────────────────────────
export function getSelectedSubjectCodes() {
  return [...document.querySelectorAll('#subject-list input:checked')].map((input) => input.value)
}