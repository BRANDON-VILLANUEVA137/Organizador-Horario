// ============================================================
// Organizador de Horarios Universitarios v2
// ============================================================
// FEATURES:
// - Per-day custom schedule (each day can have different hours)
// - Conflict detection per day/time
// - 18 credit limit
// - Drag & drop (mouse + touch)
// - 3 schedule recommendations
// - Export to text
// - localStorage persistence
// ============================================================

const App = (() => {
    // ---- Constants ----
    const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const START_HOUR = 7;
    const END_HOUR = 22;
    const MAX_CREDITS = 18;

    // Course code mapping: last 2 digits determine default time
    const COURSE_TIMES = {
        '01': { start: 7, end: 9 },
        '02': { start: 10, end: 13 },
        '03': { start: 14, end: 16 },
        '04': { start: 17, end: 19 },
        '05': { start: 20, end: 22 },
    };

    // ---- State ----
    let subjects = [];

    // ---- DOM Shortcuts ----
    const $ = id => document.getElementById(id);

    const DOM = {
        grid:             $('scheduleGrid'),
        subjectsList:     $('subjectsList'),
        totalCredits:     $('totalCredits'),
        subjectCount:     $('subjectCount'),
        modal:            $('subjectModal'),
        modalTitle:       $('modalTitle'),
        recModal:         $('recommendationsModal'),
        recBody:          $('recommendationsBody'),
        form:             $('subjectForm'),
        name:             $('subjectName'),
        course:           $('subjectCourse'),
        credits:          $('subjectCredits'),
        color:            $('subjectColor'),
        editId:           $('editId'),
        dayScheduleList:  $('dayScheduleList'),
        toastContainer:   $('toastContainer'),
    };

    // ============================================================
    // UTILITY
    // ============================================================
    function getTimeLabel(h) {
        if (h < 12) return `${h}:00 AM`;
        if (h === 12) return `12:00 PM`;
        return `${h - 12}:00 PM`;
    }

    function getTimeOptions() {
        const opts = [];
        for (let h = START_HOUR; h <= END_HOUR; h++) {
            opts.push({ value: h, label: getTimeLabel(h) });
        }
        return opts;
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function parseCourseCode(code) {
        if (!code || code.length < 3) return null;
        const suffix = code.slice(-2);
        return COURSE_TIMES[suffix] || null;
    }

    function timesOverlap(s1, e1, s2, e2) {
        return (s1 * 60) < (e2 * 60) && (s2 * 60) < (e1 * 60);
    }

    // ============================================================
    // TOAST
    // ============================================================
    function showToast(msg, type = 'info') {
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${msg}`;
        DOM.toastContainer.appendChild(t);
        setTimeout(() => {
            t.style.transition = 'all 0.3s ease';
            t.style.opacity = '0';
            t.style.transform = 'translateX(100%)';
            setTimeout(() => t.remove(), 300);
        }, 3000);
    }

    // ============================================================
    // LOCAL STORAGE
    // ============================================================
    function loadSubjects() {
        try {
            const d = localStorage.getItem('oh_subjects');
            subjects = d ? JSON.parse(d) : [];
        } catch (e) { subjects = []; }
        return subjects;
    }

    function saveSubjects() {
        localStorage.setItem('oh_subjects', JSON.stringify(subjects));
    }

    function getTotalCredits() {
        return subjects.reduce((sum, s) => sum + s.credits, 0);
    }

    // ============================================================
    // CONFLICT DETECTION (per-day)
    // ============================================================
    function checkConflict(subject, list) {
        // subject.schedules = { "Lun": { start, end }, "Mar": { start, end }, ... }
        const sched = subject.schedules || {};
        for (const day in sched) {
            if (!sched[day]) continue;
            const s1 = sched[day].start;
            const e1 = sched[day].end;
            for (const other of list) {
                if (other.id === subject.id) continue;
                const oSched = other.schedules || {};
                const oDay = oSched[day];
                if (!oDay) continue;
                if (timesOverlap(s1, e1, oDay.start, oDay.end)) return true;
            }
        }
        return false;
    }

    // ============================================================
    // FORM: PER-DAY SCHEDULE ROWS
    // ============================================================
    const timeOpts = getTimeOptions();

    function buildStartOpts(selected) {
        let h = '';
        for (let i = 0; i < timeOpts.length - 1; i++) {
            const sel = timeOpts[i].value === selected ? 'selected' : '';
            h += `<option value="${timeOpts[i].value}" ${sel}>${timeOpts[i].label}</option>`;
        }
        return h;
    }

    function buildEndOpts(selected) {
        let h = '';
        for (let i = 1; i < timeOpts.length; i++) {
            const sel = timeOpts[i].value === selected ? 'selected' : '';
            h += `<option value="${timeOpts[i].value}" ${sel}>${timeOpts[i].label}</option>`;
        }
        return h;
    }

    function renderDayScheduleRows(schedules) {
        // schedules = { "Lun": { start: 7, end: 9 }, ... } or null for new
        const defaultS = { start: 7, end: 9 };
        let html = '';
        DAYS.forEach(day => {
            const sd = schedules ? (schedules[day] || null) : null;
            const s = sd || defaultS;
            const checked = sd ? 'checked' : '';
            html += `
                <div class="day-sched-row" data-day="${day}">
                    <label class="day-sched-check">
                        <input type="checkbox" class="day-cb" value="${day}" ${checked}>
                        <span class="day-label">${day}</span>
                    </label>
                    <div class="day-sched-times">
                        <select class="day-start" ${sd ? '' : 'disabled'}>
                            ${buildStartOpts(s.start)}
                        </select>
                        <span class="day-sep">a</span>
                        <select class="day-end" ${sd ? '' : 'disabled'}>
                            ${buildEndOpts(s.end)}
                        </select>
                    </div>
                    <button type="button" class="btn-icon day-copy" title="Copiar horario a todos los días"><i class="fas fa-copy"></i></button>
                </div>
            `;
        });
        DOM.dayScheduleList.innerHTML = html;

        // Toggle enable/disable time selects based on checkbox
        DOM.dayScheduleList.querySelectorAll('.day-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const row = cb.closest('.day-sched-row');
                const selects = row.querySelectorAll('.day-start, .day-end');
                selects.forEach(s => s.disabled = !cb.checked);
                // If newly checked, set default times
                if (cb.checked) {
                    const st = row.querySelector('.day-start');
                    const en = row.querySelector('.day-end');
                    // Try to parse from course code
                    const courseVal = DOM.course.value.trim();
                    const parsed = parseCourseCode(courseVal);
                    if (parsed) {
                        st.value = parsed.start;
                        en.value = parsed.end;
                    }
                }
            });
        });

        // Copy button
        DOM.dayScheduleList.querySelectorAll('.day-copy').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.day-sched-row');
                const cb = row.querySelector('.day-cb');
                if (!cb.checked) {
                    showToast('Activa este día primero', 'warning');
                    return;
                }
                const srcStart = row.querySelector('.day-start').value;
                const srcEnd = row.querySelector('.day-end').value;
                DOM.dayScheduleList.querySelectorAll('.day-sched-row').forEach(r => {
                    const rCb = r.querySelector('.day-cb');
                    rCb.checked = true;
                    const st = r.querySelector('.day-start');
                    const en = r.querySelector('.day-end');
                    st.disabled = false;
                    en.disabled = false;
                    st.value = srcStart;
                    en.value = srcEnd;
                });
                showToast('Horario copiado a todos los días', 'info');
            });
        });
    }

    function getSchedulesFromForm() {
        const sched = {};
        DOM.dayScheduleList.querySelectorAll('.day-sched-row').forEach(row => {
            const cb = row.querySelector('.day-cb');
            if (!cb.checked) return;
            const day = cb.value;
            const start = parseInt(row.querySelector('.day-start').value);
            const end = parseInt(row.querySelector('.day-end').value);
            if (start >= end) return;
            sched[day] = { start, end };
        });
        return sched;
    }

    // ============================================================
    // MODAL
    // ============================================================
    function openModal(subject) {
        DOM.form.reset();
        DOM.editId.value = '';
        if (subject) {
            DOM.modalTitle.innerHTML = '<i class="fas fa-edit"></i> Editar Materia';
            DOM.name.value = subject.name;
            DOM.course.value = subject.course;
            DOM.credits.value = subject.credits;
            DOM.color.value = subject.color;
            DOM.editId.value = subject.id;
            renderDayScheduleRows(subject.schedules || {});
        } else {
            DOM.modalTitle.innerHTML = '<i class="fas fa-plus-circle"></i> Nueva Materia';
            renderDayScheduleRows(null);
        }
        DOM.modal.classList.add('active');
    }

    function closeModal() {
        DOM.modal.classList.remove('active');
        DOM.form.reset();
        DOM.editId.value = '';
    }

    // ============================================================
    // CRUD
    // ============================================================
    function addSubject(data) {
        if (getTotalCredits() + data.credits > MAX_CREDITS) {
            showToast(`Máximo ${MAX_CREDITS} créditos`, 'error');
            return false;
        }
        const sub = {
            id: generateId(),
            name: data.name,
            course: data.course,
            credits: data.credits,
            color: data.color,
            schedules: data.schedules, // { "Lun": {start, end}, ... }
            createdAt: Date.now()
        };
        if (checkConflict(sub, subjects)) {
            showToast('Esta materia se cruza con otra existente', 'error');
            return false;
        }
        subjects.push(sub);
        saveSubjects();
        renderAll();
        showToast(`"${data.name}" registrada`, 'success');
        return true;
    }

    function updateSubject(id, data) {
        const idx = subjects.findIndex(s => s.id === id);
        if (idx === -1) return false;

        const others = subjects.filter(s => s.id !== id);
        const otherCredits = others.reduce((sum, s) => sum + s.credits, 0);
        if (otherCredits + data.credits > MAX_CREDITS) {
            showToast(`Máximo ${MAX_CREDITS} créditos`, 'error');
            return false;
        }

        const updated = { ...subjects[idx], ...data };
        if (checkConflict(updated, others)) {
            showToast('Esta materia se cruza con otra existente', 'error');
            return false;
        }

        subjects[idx] = updated;
        saveSubjects();
        renderAll();
        showToast(`"${data.name}" actualizada`, 'success');
        return true;
    }

    function deleteSubject(id) {
        if (!confirm('¿Eliminar esta materia de todos los registros?')) return;
        subjects = subjects.filter(s => s.id !== id);
        saveSubjects();
        renderAll();
        showToast('Materia eliminada', 'info');
    }

    function getScheduledDays(subject) {
        // Returns array of { day, start, end } for scheduling grid
        const list = [];
        const sched = subject.schedules || {};
        for (const day in sched) {
            if (sched[day]) list.push({ day, start: sched[day].start, end: sched[day].end });
        }
        return list;
    }

    // ============================================================
    // RENDER: SUBJECTS LIST (SIDEBAR)
    // ============================================================
    function renderSubjectsList() {
        DOM.subjectsList.innerHTML = '';
        if (subjects.length === 0) {
            DOM.subjectsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <p>No hay materias registradas</p>
                    <p class="text-small">Agrega tus materias para comenzar</p>
                </div>
            `;
            return;
        }

        subjects.forEach(sub => {
            const sched = sub.schedules || {};
            const dayList = Object.keys(sched).filter(d => sched[d]);
            let timesStr = dayList.map(d => `${d} ${getTimeLabel(sched[d].start)}-${getTimeLabel(sched[d].end)}`).join(', ');
            if (!timesStr) timesStr = 'Sin horario';

            const card = document.createElement('div');
            card.className = 'subject-card';
            card.dataset.id = sub.id;
            card.draggable = true;
            card.innerHTML = `
                <div class="subject-color-bar" style="background:${sub.color}"></div>
                <div class="subject-card-content">
                    <div class="subject-name">${sub.name}</div>
                    <div class="subject-meta">
                        <span><i class="fas fa-hashtag"></i> ${sub.course}</span>
                        <span><i class="fas fa-star"></i> ${sub.credits} créd.</span>
                        <span><i class="fas fa-clock"></i> ${timesStr}</span>
                    </div>
                    <div class="subject-actions">
                        <button class="btn-icon edit" title="Editar" data-id="${sub.id}"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete" title="Eliminar" data-id="${sub.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
            DOM.subjectsList.appendChild(card);

            // Edit
            card.querySelector('.edit').addEventListener('click', (e) => {
                e.stopPropagation();
                const s = subjects.find(x => x.id === sub.id);
                if (s) openModal(s);
            });
            // Delete
            card.querySelector('.delete').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteSubject(sub.id);
            });
        });

        setupDragCards();
    }

    // ============================================================
    // DRAG & DROP (mouse + touch)
    // ============================================================
    function setupDragCards() {
        document.querySelectorAll('.subject-card').forEach(card => {
            // HTML5 Drag
            card.addEventListener('dragstart', e => {
                card.classList.add('dragging');
                e.dataTransfer.setData('text/plain', card.dataset.id);
            });
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                document.querySelectorAll('.slot-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
            });

            // Touch events for mobile
            let touchClone = null;
            card.addEventListener('touchstart', e => {
                const t = e.touches[0];
                card.classList.add('dragging');
                touchClone = card.cloneNode(true);
                touchClone.style.position = 'fixed';
                touchClone.style.width = '150px';
                touchClone.style.pointerEvents = 'none';
                touchClone.style.zIndex = '9999';
                touchClone.style.opacity = '0.7';
                touchClone.style.transform = 'rotate(3deg)';
                touchClone.style.left = (t.clientX - 75) + 'px';
                touchClone.style.top = (t.clientY - 30) + 'px';
                document.body.appendChild(touchClone);
            }, { passive: true });

            card.addEventListener('touchmove', e => {
                e.preventDefault();
                const t = e.touches[0];
                if (touchClone) {
                    touchClone.style.left = (t.clientX - 75) + 'px';
                    touchClone.style.top = (t.clientY - 30) + 'px';
                }
                const el = document.elementFromPoint(t.clientX, t.clientY);
                const cell = el ? (el.classList.contains('slot-cell') ? el : el.closest('.slot-cell')) : null;
                document.querySelectorAll('.slot-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
                if (cell) cell.classList.add('drag-over');
            }, { passive: false });

            card.addEventListener('touchend', e => {
                card.classList.remove('dragging');
                if (touchClone) { touchClone.remove(); touchClone = null; }
                document.querySelectorAll('.slot-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
                const t = e.changedTouches[0];
                const el = document.elementFromPoint(t.clientX, t.clientY);
                const cell = el ? (el.classList.contains('slot-cell') ? el : el.closest('.slot-cell')) : null;
                if (cell) {
                    const col = parseInt(cell.dataset.col);
                    const row = parseInt(cell.dataset.row);
                    placeSubjectOnGrid(card.dataset.id, col, row);
                }
            }, { passive: true });
        });
    }

    // ============================================================
    // RENDER: SCHEDULE GRID
    // ============================================================
    function renderGrid() {
        DOM.grid.innerHTML = '';

        // Header
        const emptyH = document.createElement('div');
        emptyH.className = 'time-header';
        emptyH.textContent = 'Hora';
        DOM.grid.appendChild(emptyH);

        DAYS.forEach(day => {
            const h = document.createElement('div');
            h.className = 'day-header';
            h.textContent = day;
            DOM.grid.appendChild(h);
        });

        // Cells
        for (let hour = START_HOUR; hour < END_HOUR; hour++) {
            const tl = document.createElement('div');
            tl.className = 'time-label';
            tl.textContent = getTimeLabel(hour);
            DOM.grid.appendChild(tl);

            for (let d = 0; d < 6; d++) {
                const cell = document.createElement('div');
                cell.className = 'slot-cell';
                cell.dataset.day = d;
                cell.dataset.hour = hour;
                cell.dataset.col = d;
                cell.dataset.row = hour - START_HOUR;

                // Drop
                cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('drag-over'); });
                cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
                cell.addEventListener('drop', e => {
                    e.preventDefault();
                    cell.classList.remove('drag-over');
                    const id = e.dataTransfer.getData('text/plain');
                    if (id) placeSubjectOnGrid(id, d, hour - START_HOUR);
                });

                // Click to remove block
                cell.addEventListener('click', () => {
                    const block = cell.querySelector('.subject-block');
                    if (block) {
                        block.remove();
                        highlightConflicts();
                        showToast('Materia quitada del horario', 'info');
                    }
                });

                DOM.grid.appendChild(cell);
            }
        }

        // Render blocks from per-day schedules
        renderAllScheduleBlocks();
    }

    function renderAllScheduleBlocks() {
        DOM.grid.querySelectorAll('.subject-block').forEach(b => b.remove());

        subjects.forEach(sub => {
            const sched = sub.schedules || {};
            for (const day in sched) {
                if (!sched[day]) continue;
                const dayIndex = DAYS.indexOf(day);
                if (dayIndex === -1) continue;
                const { start, end } = sched[day];
                const duration = end - start;
                const row = start - START_HOUR;

                const cells = DOM.grid.querySelectorAll(`.slot-cell[data-day="${dayIndex}"][data-hour="${start}"]`);
                if (cells.length === 0) continue;
                const firstCell = cells[0];

                const block = document.createElement('div');
                block.className = 'subject-block';
                block.dataset.id = sub.id;
                block.dataset.day = dayIndex;
                block.dataset.startRow = row;
                block.dataset.duration = duration;
                block.style.background = sub.color;
                block.innerHTML = `
                    <div class="sb-name">${sub.name}</div>
                    <div class="sb-time">${getTimeLabel(start)} - ${getTimeLabel(end)}</div>
                    <button class="sb-delete" data-id="${sub.id}" title="Quitar">&times;</button>
                `;
                block.style.position = 'absolute';
                block.style.left = '2px';
                block.style.right = '2px';
                block.style.top = '2px';
                block.style.zIndex = '10';
                block.style.height = `calc(${duration * 60}px - 4px)`;
                firstCell.style.position = 'relative';
                firstCell.appendChild(block);

                block.querySelector('.sb-delete').addEventListener('click', e => {
                    e.stopPropagation();
                    block.remove();
                    highlightConflicts();
                });
            }
        });

        highlightConflicts();
    }

    function highlightConflicts() {
        DOM.grid.querySelectorAll('.conflict-highlight').forEach(c => c.classList.remove('conflict-highlight'));
        DOM.grid.querySelectorAll('.subject-block.conflict').forEach(c => c.classList.remove('conflict'));

        const placed = [];
        DOM.grid.querySelectorAll('.subject-block').forEach(b => {
            placed.push({
                el: b,
                id: b.dataset.id,
                day: parseInt(b.dataset.day),
                start: parseInt(b.dataset.startRow) + START_HOUR,
                duration: parseInt(b.dataset.duration),
            });
        });

        for (let i = 0; i < placed.length; i++) {
            for (let j = i + 1; j < placed.length; j++) {
                if (placed[i].day !== placed[j].day) continue;
                const a = placed[i], b = placed[j];
                if (timesOverlap(a.start, a.start + a.duration, b.start, b.start + b.duration)) {
                    a.el.classList.add('conflict');
                    b.el.classList.add('conflict');
                    const cA = a.el.closest('.slot-cell');
                    const cB = b.el.closest('.slot-cell');
                    if (cA) cA.classList.add('conflict-highlight');
                    if (cB) cB.classList.add('conflict-highlight');
                }
            }
        }
    }

    // ============================================================
    // PLACE SUBJECT ON GRID (drag-drop)
    // ============================================================
    function placeSubjectOnGrid(subjectId, colIndex, rowIndex) {
        const sub = subjects.find(s => s.id === subjectId);
        if (!sub) {
            showToast('Materia no encontrada', 'error');
            return;
        }

        const day = DAYS[colIndex];
        if (!day) return;
        const newStart = rowIndex + START_HOUR;
        // Use the subject's own duration from any existing schedule entry, or default 2h
        let duration = 2;
        const sched = sub.schedules || {};
        if (sched[day]) {
            duration = sched[day].end - sched[day].start;
        } else {
            // Find first schedule entry to get duration
            for (const d in sched) {
                if (sched[d]) { duration = sched[d].end - sched[d].start; break; }
            }
        }
        const newEnd = newStart + duration;
        if (newEnd > END_HOUR) {
            showToast('Excede el límite de las 10 PM', 'error');
            return;
        }

        // Check conflicts with existing blocks
        let hasOverlap = false;
        DOM.grid.querySelectorAll('.subject-block').forEach(block => {
            if (block.dataset.id === subjectId) return;
            if (parseInt(block.dataset.day) !== colIndex) return;
            const bStart = parseInt(block.dataset.startRow) + START_HOUR;
            const bDur = parseInt(block.dataset.duration);
            if (timesOverlap(newStart, newEnd, bStart, bStart + bDur)) hasOverlap = true;
        });

        if (hasOverlap) {
            showToast(`"${sub.name}" se cruza con otra materia en ${day}`, 'error');
            return;
        }

        // Remove existing block for this subject on this day
        DOM.grid.querySelectorAll(`.subject-block[data-id="${subjectId}"]`).forEach(b => {
            if (parseInt(b.dataset.day) === colIndex) b.remove();
        });

        // Find cell
        const cells = DOM.grid.querySelectorAll(`.slot-cell[data-day="${colIndex}"][data-hour="${newStart}"]`);
        if (cells.length === 0) return;
        const firstCell = cells[0];

        const block = document.createElement('div');
        block.className = 'subject-block';
        block.dataset.id = sub.id;
        block.dataset.day = colIndex;
        block.dataset.startRow = rowIndex;
        block.dataset.duration = duration;
        block.style.background = sub.color;
        block.innerHTML = `
            <div class="sb-name">${sub.name}</div>
            <div class="sb-time">${getTimeLabel(newStart)} - ${getTimeLabel(newEnd)}</div>
            <button class="sb-delete" data-id="${sub.id}" title="Quitar">&times;</button>
        `;
        block.style.position = 'absolute';
        block.style.left = '2px';
        block.style.right = '2px';
        block.style.top = '2px';
        block.style.zIndex = '10';
        block.style.height = `calc(${duration * 60}px - 4px)`;
        firstCell.style.position = 'relative';
        firstCell.appendChild(block);

        block.querySelector('.sb-delete').addEventListener('click', e => {
            e.stopPropagation();
            block.remove();
            highlightConflicts();
        });

        // Update subject's schedule for this day
        if (!sub.schedules) sub.schedules = {};
        sub.schedules[day] = { start: newStart, end: newEnd };
        saveSubjects();

        highlightConflicts();
        showToast(`${sub.name} en ${day} ${getTimeLabel(newStart)}`, 'success');
    }

    // ============================================================
    // HEADER UPDATE
    // ============================================================
    function updateHeader() {
        const total = getTotalCredits();
        DOM.totalCredits.innerHTML = `<i class="fas fa-star"></i> Créditos: ${total} / ${MAX_CREDITS}`;
        DOM.totalCredits.style.background = total >= MAX_CREDITS ? 'rgba(255,200,0,0.25)' : 'rgba(255,255,255,0.15)';
        DOM.subjectCount.innerHTML = `<i class="fas fa-book"></i> Materias: ${subjects.length}`;
    }

    // ============================================================
    // RECOMMENDATIONS ENGINE
    // ============================================================
    function generateRecommendations() {
        if (subjects.length === 0) {
            showToast('Registra materias primero', 'warning');
            return;
        }

        const total = getTotalCredits();
        if (total > MAX_CREDITS) {
            showToast(`Excedes el límite de ${MAX_CREDITS} créditos (${total})`, 'error');
            return;
        }

        // Ensure each subject has a base schedule from course code or defaults
        subjects.forEach(sub => {
            if (!sub.schedules || Object.keys(sub.schedules).length === 0) {
                // Assign default schedule
                const parsed = parseCourseCode(sub.course);
                const start = parsed ? parsed.start : 7;
                const end = parsed ? parsed.end : 9;
                sub.schedules = {};
                // Assign to all weekdays (Lun-Vie) by default for recommendation
                ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].forEach(d => {
                    sub.schedules[d] = { start, end };
                });
            }
        });
        saveSubjects();

        const recommendations = [];

        const rec1 = buildBalanced();
        if (rec1) recommendations.push(rec1);
        const rec2 = buildCompact();
        if (rec2) recommendations.push(rec2);
        const rec3 = buildMorning();
        if (rec3) recommendations.push(rec3);

        if (recommendations.length === 0) {
            showToast('No se pudieron generar recomendaciones', 'error');
            return;
        }

        showRecommendationsModal(recommendations);
    }

    function buildBalanced() {
        // Spread across days evenly
        const sorted = [...subjects].sort((a, b) => {
            const aStart = getFirstStart(a);
            const bStart = getFirstStart(b);
            return aStart - bStart;
        });
        const assigned = {};
        const schedule = [];

        for (const sub of sorted) {
            const baseSched = sub.schedules || {};
            const days = Object.keys(baseSched).filter(d => baseSched[d]);
            // Pick day with least subjects
            const counts = days.map(d => ({ day: d, count: (assigned[d] || []).length }));
            counts.sort((a, b) => a.count - b.count);
            if (counts.length === 0) continue;
            const chosen = counts[0].day;
            if (!assigned[chosen]) assigned[chosen] = [];
            assigned[chosen].push(sub.id);
            schedule.push({ id: sub.id, day: chosen, subject: sub, start: baseSched[chosen].start, end: baseSched[chosen].end });
        }

        if (schedule.length === 0) return null;
        return {
            type: 'balanced', name: 'Balanceado', icon: 'fa-scale-balanced', badge: 'balanced',
            description: 'Distribuye las materias uniformemente entre los días',
            schedule, daysUsed: Object.keys(assigned).length,
            totalHours: schedule.reduce((s, item) => s + (item.end - item.start), 0),
        };
    }

    function buildCompact() {
        // Pack into fewest days
        const sorted = [...subjects].sort((a, b) => {
            const aDur = getAvgDuration(a);
            const bDur = getAvgDuration(b);
            return aDur - bDur; // shorter first to pack more
        });
        const assigned = {};
        const schedule = [];

        for (const sub of sorted) {
            const baseSched = sub.schedules || {};
            const days = Object.keys(baseSched).filter(d => baseSched[d]);
            const counts = days.map(d => ({ day: d, count: (assigned[d] || []).length }));
            counts.sort((a, b) => b.count - a.count); // most packed first
            if (counts.length === 0) continue;
            const chosen = counts[0].day;
            if (!assigned[chosen]) assigned[chosen] = [];
            assigned[chosen].push(sub.id);
            schedule.push({ id: sub.id, day: chosen, subject: sub, start: baseSched[chosen].start, end: baseSched[chosen].end });
        }

        if (schedule.length === 0) return null;
        return {
            type: 'compact', name: 'Compacto', icon: 'fa-compress', badge: 'compact',
            description: 'Concentra en la menor cantidad de días',
            schedule, daysUsed: Object.keys(assigned).length,
            totalHours: schedule.reduce((s, item) => s + (item.end - item.start), 0),
        };
    }

    function buildMorning() {
        // Prefer morning hours
        const sorted = [...subjects].sort((a, b) => {
            const aStart = getFirstStart(a);
            const bStart = getFirstStart(b);
            const aM = aStart < 14 ? 0 : 1;
            const bM = bStart < 14 ? 0 : 1;
            return aM - bM || aStart - bStart;
        });
        const assigned = {};
        const schedule = [];

        for (const sub of sorted) {
            const baseSched = sub.schedules || {};
            const days = Object.keys(baseSched).filter(d => baseSched[d]);
            if (days.length === 0) continue;
            const chosen = days[0];
            if (!assigned[chosen]) assigned[chosen] = [];
            assigned[chosen].push(sub.id);
            schedule.push({ id: sub.id, day: chosen, subject: sub, start: baseSched[chosen].start, end: baseSched[chosen].end });
        }

        if (schedule.length === 0) return null;
        return {
            type: 'morning', name: 'Matutino', icon: 'fa-sun', badge: 'spread',
            description: 'Prioriza horarios de la mañana (antes de 2 PM)',
            schedule, daysUsed: Object.keys(assigned).length,
            totalHours: schedule.reduce((s, item) => s + (item.end - item.start), 0),
        };
    }

    function getFirstStart(sub) {
        const s = sub.schedules || {};
        for (const d in s) { if (s[d]) return s[d].start; }
        return 7;
    }

    function getAvgDuration(sub) {
        const s = sub.schedules || {};
        let total = 0, count = 0;
        for (const d in s) { if (s[d]) { total += (s[d].end - s[d].start); count++; } }
        return count ? total / count : 2;
    }

    function showRecommendationsModal(recommendations) {
        DOM.recBody.innerHTML = '';
        const list = document.createElement('div');
        list.className = 'recommendations-list';

        recommendations.forEach(rec => {
            const card = document.createElement('div');
            card.className = 'rec-card';

            let subjectsHtml = '';
            rec.schedule.forEach(item => {
                const sub = item.subject;
                subjectsHtml += `<span class="rec-subject" style="background:${sub.color}">
                    ${sub.name} (${item.day} ${getTimeLabel(item.start)}-${getTimeLabel(item.end)})
                </span> `;
            });

            card.innerHTML = `
                <div class="rec-card-header">
                    <h3><i class="fas ${rec.icon}"></i> ${rec.name}</h3>
                    <span class="rec-badge ${rec.badge}">${rec.daysUsed} día${rec.daysUsed !== 1 ? 's' : ''}</span>
                </div>
                <div class="rec-card-body">${subjectsHtml}</div>
                <div class="rec-card-footer">
                    <span><i class="far fa-clock"></i> ${rec.totalHours}h totales</span>
                    <span><i class="fas fa-calendar-day"></i> ${rec.daysUsed} día${rec.daysUsed !== 1 ? 's' : ''}</span>
                </div>
            `;

            card.addEventListener('click', () => {
                list.querySelectorAll('.rec-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                applyRec(rec);
            });

            list.appendChild(card);
        });

        DOM.recBody.appendChild(list);
        DOM.recModal.classList.add('active');
    }

    function applyRec(rec) {
        DOM.grid.querySelectorAll('.subject-block').forEach(b => b.remove());

        // Update subject schedules per recommendation
        rec.schedule.forEach(item => {
            const sub = subjects.find(s => s.id === item.id);
            if (!sub) return;
            if (!sub.schedules) sub.schedules = {};
            sub.schedules[item.day] = { start: item.start, end: item.end };
        });
        saveSubjects();
        renderAllScheduleBlocks();
        DOM.recModal.classList.remove('active');
        showToast('Recomendación aplicada al horario', 'success');
    }

    // ============================================================
    // CLEAR & EXPORT
    // ============================================================
    function clearSchedule() {
        DOM.grid.querySelectorAll('.subject-block').forEach(b => b.remove());
        highlightConflicts();
        showToast('Horario limpiado (solo vista)', 'info');
    }

    function exportSchedule() {
        const blocks = DOM.grid.querySelectorAll('.subject-block');
        if (blocks.length === 0) {
            showToast('No hay nada que exportar', 'warning');
            return;
        }

        let text = '=== MI HORARIO UNIVERSITARIO ===\n';
        text += `Generado: ${new Date().toLocaleString()}\n`;
        text += `Créditos: ${getTotalCredits()} / ${MAX_CREDITS}\n\n`;

        DAYS.forEach(day => {
            text += `--- ${day} ---\n`;
            const dayBlocks = [];
            DOM.grid.querySelectorAll('.subject-block').forEach(b => {
                if (parseInt(b.dataset.day) === DAYS.indexOf(day)) {
                    const sub = subjects.find(s => s.id === b.dataset.id);
                    if (sub) {
                        const start = parseInt(b.dataset.startRow) + START_HOUR;
                        const dur = parseInt(b.dataset.duration);
                        dayBlocks.push({ name: sub.name, course: sub.course, start, end: start + dur, credits: sub.credits });
                    }
                }
            });

            if (dayBlocks.length === 0) {
                text += '  (libre)\n';
            } else {
                dayBlocks.sort((a, b) => a.start - b.start);
                dayBlocks.forEach(b => {
                    text += `  ${getTimeLabel(b.start)} - ${getTimeLabel(b.end)} | ${b.name} (${b.course}) [${b.credits} créd.]\n`;
                });
            }
            text += '\n';
        });

        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `horario_${new Date().toISOString().slice(0, 10)}.txt`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('Horario exportado', 'success');
    }

    // ============================================================
    // FORM SUBMIT HANDLER
    // ============================================================
    function handleSave() {
        const name = DOM.name.value.trim();
        const course = DOM.course.value.trim();
        const credits = parseInt(DOM.credits.value) || 3;
        const color = DOM.color.value;
        const schedules = getSchedulesFromForm();
        const editIdVal = DOM.editId.value;

        if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
        if (!course) { showToast('El código de curso es obligatorio', 'error'); return; }
        const dayCount = Object.keys(schedules).length;
        if (dayCount === 0) { showToast('Selecciona al menos un día con horario', 'error'); return; }

        // Validate no start >= end in any schedule
        for (const d in schedules) {
            if (schedules[d].start >= schedules[d].end) {
                showToast(`Horario inválido en ${d}: inicio debe ser menor que fin`, 'error');
                return;
            }
        }

        const data = { name, course, credits, color, schedules };

        let success = false;
        if (editIdVal) {
            success = updateSubject(editIdVal, data);
        } else {
            success = addSubject(data);
        }

        if (success) {
            closeModal();
            renderAll();
        }
    }

    // ============================================================
    // RENDER ALL
    // ============================================================
    function renderAll() {
        renderGrid();
        renderSubjectsList();
        updateHeader();
    }

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        loadSubjects();

        // Guardar button click
        $('btnSaveSubject').addEventListener('click', handleSave);

        // Form submit as backup
        DOM.form.addEventListener('submit', e => {
            e.preventDefault();
            handleSave();
        });

        // Add subject
        $('btnAddSubject').addEventListener('click', () => openModal());

        // Close modal
        $('btnCloseModal').addEventListener('click', closeModal);
        $('btnCancelModal').addEventListener('click', closeModal);
        DOM.modal.addEventListener('click', e => { if (e.target === DOM.modal) closeModal(); });

        // Recommendations
        $('btnGenerateSchedules').addEventListener('click', generateRecommendations);
        $('btnCloseRecommendations').addEventListener('click', () => DOM.recModal.classList.remove('active'));
        DOM.recModal.addEventListener('click', e => { if (e.target === DOM.recModal) DOM.recModal.classList.remove('active'); });

        // Clear & Export
        $('btnClearSchedule').addEventListener('click', clearSchedule);
        $('btnExport').addEventListener('click', exportSchedule);

        // Auto-fill course code
        DOM.course.addEventListener('blur', () => {
            const parsed = parseCourseCode(DOM.course.value.trim());
            if (!parsed) return;
            DOM.dayScheduleList.querySelectorAll('.day-sched-row').forEach(row => {
                const cb = row.querySelector('.day-cb');
                if (!cb.checked) return;
                row.querySelector('.day-start').value = parsed.start;
                row.querySelector('.day-end').value = parsed.end;
            });
        });

        renderAll();
        console.log('📚 Organizador de Horarios v2 iniciado');
        console.log(`📅 ${subjects.length} materias, ${getTotalCredits()} créditos`);
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());