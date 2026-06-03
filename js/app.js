// ============================================================
// Organizador de Horarios Universitarios - App Logic
// ============================================================

const App = (() => {
    // ---- Constants ----
    const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const START_HOUR = 7; // 7:00 AM
    const END_HOUR = 22; // 10:00 PM
    const MAX_CREDITS = 18;
    const HOUR_SLOTS = END_HOUR - START_HOUR; // 15 slots

    // Course code mapping: first digit = period group, last 2 digits determine time
    // 601: 7-9am, 602: 10am-1pm, 603: 2-4pm, 604: 5-7pm, 605: 8-10pm
    // 701: 7-9am, 702: 10am-1pm, etc.
    const COURSE_TIMES = {
        '01': { start: 7, end: 9 },
        '02': { start: 10, end: 13 },
        '03': { start: 14, end: 16 },
        '04': { start: 17, end: 19 },
        '05': { start: 20, end: 22 },
    };

    // ---- State ----
    let subjects = [];
    let editId = null;
    let scheduledSubjects = []; // subjects placed on grid with their positions

    // ---- DOM Refs ----
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const DOM = {
        grid:             $('#scheduleGrid'),
        subjectsList:     $('#subjectsList'),
        totalCredits:     $('#totalCredits'),
        subjectCount:     $('#subjectCount'),
        modal:            $('#subjectModal'),
        modalTitle:       $('#modalTitle'),
        recModal:         $('#recommendationsModal'),
        recBody:          $('#recommendationsBody'),
        form:             $('#subjectForm'),
        name:             $('#subjectName'),
        course:           $('#subjectCourse'),
        credits:          $('#subjectCredits'),
        color:            $('#subjectColor'),
        editId:           $('#editId'),
        startTime:        $('#startTime'),
        endTime:          $('#endTime'),
        daysSelector:     $('#daysSelector'),
        toastContainer:   $('#toastContainer'),
    };

    // ---- Utility Functions ----
    function generateTimeOptions() {
        const options = [];
        for (let h = START_HOUR; h <= END_HOUR; h++) {
            const val = h;
            const label = h < 12 ? `${h}:00 AM` : h === 12 ? `12:00 PM` : `${h - 12}:00 PM`;
            options.push({ val, label });
        }
        return options;
    }

    function populateTimeSelects() {
        const opts = generateTimeOptions();
        DOM.startTime.innerHTML = '';
        DOM.endTime.innerHTML = '';
        opts.forEach((o, i) => {
            if (i < opts.length - 1) {
                DOM.startTime.innerHTML += `<option value="${o.val}">${o.label}</option>`;
            }
            if (i > 0) {
                DOM.endTime.innerHTML += `<option value="${o.val}">${o.label}</option>`;
            }
        });
        // Default start 7am, end 9am
        DOM.startTime.value = 7;
        DOM.endTime.value = 9;
    }

    function parseCourseCode(code) {
        // Returns { start, end } or null if unrecognized
        if (!code || code.length < 3) return null;
        const suffix = code.slice(-2);
        const entry = COURSE_TIMES[suffix];
        if (entry) return { ...entry };
        return null;
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function getTimeLabel(hour) {
        if (hour < 12) return `${hour}:00 AM`;
        if (hour === 12) return `12:00 PM`;
        return `${hour - 12}:00 PM`;
    }

    function hoursToMinutes(h) {
        return h * 60;
    }

    function timesOverlap(s1, e1, s2, e2) {
        return hoursToMinutes(s1) < hoursToMinutes(e2) && hoursToMinutes(s2) < hoursToMinutes(e1);
    }

    // ---- Toast ----
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
        toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
        DOM.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ---- Modal ----
    function openModal(subject = null) {
        DOM.form.reset();
        DOM.editId.value = '';
        editId = null;
        // Reset days
        DOM.daysSelector.querySelectorAll('input').forEach(cb => cb.checked = false);

        if (subject) {
            DOM.modalTitle.innerHTML = '<i class="fas fa-edit"></i> Editar Materia';
            DOM.name.value = subject.name;
            DOM.course.value = subject.course;
            DOM.credits.value = subject.credits;
            DOM.color.value = subject.color;
            DOM.editId.value = subject.id;
            editId = subject.id;
            subject.days.forEach(d => {
                const cb = DOM.daysSelector.querySelector(`input[value="${d}"]`);
                if (cb) cb.checked = true;
            });
            DOM.startTime.value = subject.start;
            DOM.endTime.value = subject.end;
        } else {
            DOM.modalTitle.innerHTML = '<i class="fas fa-plus-circle"></i> Nueva Materia';
            DOM.startTime.value = 7;
            DOM.endTime.value = 9;
        }
        DOM.modal.classList.add('active');
    }

    function closeModal() {
        DOM.modal.classList.remove('active');
        DOM.form.reset();
        DOM.editId.value = '';
        editId = null;
    }

    // ---- Subject CRUD ----
    function getSubjects() {
        const stored = localStorage.getItem('oh_subjects');
        if (stored) {
            try {
                subjects = JSON.parse(stored);
            } catch(e) {
                subjects = [];
            }
        } else {
            subjects = [];
        }
        return subjects;
    }

    function saveSubjects() {
        localStorage.setItem('oh_subjects', JSON.stringify(subjects));
    }

    function addSubject(data) {
        if (getTotalCredits() + data.credits > MAX_CREDITS) {
            showToast(`No puedes superar los ${MAX_CREDITS} créditos`, 'error');
            return false;
        }
        // Check conflict with existing scheduled
        if (hasConflict(data, subjects)) {
            showToast('Esta materia se cruza con otra materia existente', 'error');
            return false;
        }
        const newSubject = {
            id: generateId(),
            name: data.name,
            course: data.course,
            credits: data.credits,
            color: data.color,
            days: data.days,
            start: data.start,
            end: data.end,
            createdAt: Date.now()
        };
        subjects.push(newSubject);
        saveSubjects();
        renderAll();
        showToast(`"${data.name}" registrada exitosamente`, 'success');
        return true;
    }

    function updateSubject(id, data) {
        const idx = subjects.findIndex(s => s.id === id);
        if (idx === -1) return false;

        // Check credit limit excluding this subject
        const otherCredits = subjects.filter(s => s.id !== id).reduce((sum, s) => sum + s.credits, 0);
        if (otherCredits + data.credits > MAX_CREDITS) {
            showToast(`No puedes superar los ${MAX_CREDITS} créditos`, 'error');
            return false;
        }

        // Check conflict excluding self
        const others = subjects.filter(s => s.id !== id);
        const testSubject = { ...data };
        if (hasConflict(testSubject, others)) {
            showToast('Esta materia se cruza con otra materia existente', 'error');
            return false;
        }

        subjects[idx] = { ...subjects[idx], ...data };
        saveSubjects();
        renderAll();
        showToast(`"${data.name}" actualizada`, 'success');
        return true;
    }

    function deleteSubject(id) {
        if (!confirm('¿Eliminar esta materia?')) return;
        subjects = subjects.filter(s => s.id !== id);
        saveSubjects();
        renderAll();
        showToast('Materia eliminada', 'info');
    }

    function getTotalCredits() {
        return subjects.reduce((sum, s) => sum + s.credits, 0);
    }

    function hasConflict(subject, subjectList) {
        const s1 = subject.start;
        const e1 = subject.end;
        for (const other of subjectList) {
            if (other.id === subject.id) continue;
            const s2 = other.start;
            const e2 = other.end;
            // Check day overlap and time overlap
            const commonDays = subject.days.filter(d => other.days.includes(d));
            if (commonDays.length > 0 && timesOverlap(s1, e1, s2, e2)) {
                return true;
            }
        }
        return false;
    }

    function applyCourseCode(subject) {
        const parsed = parseCourseCode(subject.course);
        if (parsed) {
            subject.start = parsed.start;
            subject.end = parsed.end;
        }
        return subject;
    }

    // ---- Render: Subjects List ----
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
            const timeStr = `${getTimeLabel(sub.start)} - ${getTimeLabel(sub.end)}`;
            const daysStr = sub.days.join(', ');
            const card = document.createElement('div');
            card.className = 'subject-card';
            card.dataset.id = sub.id;
            card.innerHTML = `
                <div class="subject-color-bar" style="background:${sub.color}"></div>
                <div class="subject-card-content">
                    <div class="subject-name">${sub.name}</div>
                    <div class="subject-meta">
                        <span><i class="fas fa-hashtag"></i> ${sub.course}</span>
                        <span><i class="fas fa-star"></i> ${sub.credits} créd.</span>
                        <span><i class="fas fa-clock"></i> ${timeStr}</span>
                        <span><i class="fas fa-calendar-day"></i> ${daysStr}</span>
                    </div>
                    <div class="subject-actions">
                        <button class="btn-icon edit" title="Editar" data-id="${sub.id}"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete" title="Eliminar" data-id="${sub.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
            DOM.subjectsList.appendChild(card);
        });

        // Event listeners for edit/delete
        DOM.subjectsList.querySelectorAll('.btn-icon.edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const sub = subjects.find(s => s.id === id);
                if (sub) openModal(sub);
            });
        });
        DOM.subjectsList.querySelectorAll('.btn-icon.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteSubject(btn.dataset.id);
            });
        });

        // Enable drag on subject cards (for touch/mobile)
        makeCardsDraggable();
    }

    // ---- Drag from Sidebar to Grid ----
    function makeCardsDraggable() {
        const cards = DOM.subjectsList.querySelectorAll('.subject-card');
        cards.forEach(card => {
            card.draggable = true;
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragend', handleDragEnd);

            // Touch events for mobile
            let touchClone = null;
            let touchStartY = 0;
            let touchStartX = 0;

            card.addEventListener('touchstart', (e) => {
                const touch = e.touches[0];
                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
                card.classList.add('dragging');

                // Create clone for visual feedback
                touchClone = card.cloneNode(true);
                touchClone.style.position = 'fixed';
                touchClone.style.width = '150px';
                touchClone.style.pointerEvents = 'none';
                touchClone.style.zIndex = '9999';
                touchClone.style.opacity = '0.7';
                touchClone.style.transform = 'rotate(3deg)';
                touchClone.style.left = (touch.clientX - 75) + 'px';
                touchClone.style.top = (touch.clientY - 30) + 'px';
                document.body.appendChild(touchClone);
            }, { passive: true });

            card.addEventListener('touchmove', (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                if (touchClone) {
                    touchClone.style.left = (touch.clientX - 75) + 'px';
                    touchClone.style.top = (touch.clientY - 30) + 'px';
                }

                // Check what grid cell we're over
                const el = document.elementFromPoint(touch.clientX, touch.clientY);
                if (el && el.classList.contains('slot-cell')) {
                    document.querySelectorAll('.slot-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
                    el.classList.add('drag-over');
                } else if (el && el.closest('.slot-cell')) {
                    const cell = el.closest('.slot-cell');
                    document.querySelectorAll('.slot-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
                    cell.classList.add('drag-over');
                }
            }, { passive: false });

            card.addEventListener('touchend', (e) => {
                card.classList.remove('dragging');
                if (touchClone) {
                    touchClone.remove();
                    touchClone = null;
                }
                document.querySelectorAll('.slot-cell.drag-over').forEach(c => c.classList.remove('drag-over'));

                const touch = e.changedTouches[0];
                const el = document.elementFromPoint(touch.clientX, touch.clientY);
                const cell = el && (el.classList.contains('slot-cell') ? el : el.closest('.slot-cell'));
                if (cell) {
                    const col = parseInt(cell.dataset.col);
                    const row = parseInt(cell.dataset.row);
                    const subjectId = card.dataset.id;
                    placeSubjectOnGrid(subjectId, col, row);
                }
            }, { passive: true });
        });
    }

    // ---- HTML5 Drag handlers ----
    let draggedId = null;

    function handleDragStart(e) {
        draggedId = this.dataset.id;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedId);
    }

    function handleDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.slot-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
    }

    // ---- Render: Schedule Grid ----
    function renderGrid() {
        DOM.grid.innerHTML = '';

        // Header row
        const emptyHeader = document.createElement('div');
        emptyHeader.className = 'time-header';
        emptyHeader.textContent = 'Hora';
        DOM.grid.appendChild(emptyHeader);

        DAYS.forEach(day => {
            const dh = document.createElement('div');
            dh.className = 'day-header';
            dh.textContent = day;
            DOM.grid.appendChild(dh);
        });

        // Time slots
        for (let hour = START_HOUR; hour < END_HOUR; hour++) {
            // Time label
            const tl = document.createElement('div');
            tl.className = 'time-label';
            tl.textContent = getTimeLabel(hour);
            DOM.grid.appendChild(tl);

            // Day cells for this hour
            for (let d = 0; d < 6; d++) {
                const cell = document.createElement('div');
                cell.className = 'slot-cell';
                cell.dataset.day = d;
                cell.dataset.hour = hour;
                cell.dataset.col = d;
                cell.dataset.row = hour - START_HOUR;

                // Drop zone events
                cell.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    cell.classList.add('drag-over');
                });
                cell.addEventListener('dragleave', () => {
                    cell.classList.remove('drag-over');
                });
                cell.addEventListener('drop', (e) => {
                    e.preventDefault();
                    cell.classList.remove('drag-over');
                    const id = e.dataTransfer.getData('text/plain') || draggedId;
                    if (id) {
                        placeSubjectOnGrid(id, d, hour - START_HOUR);
                    }
                });

                // Click to toggle placement
                cell.addEventListener('click', () => {
                    // If there's already a subject block in this cell, remove it
                    const block = cell.querySelector('.subject-block');
                    if (block) {
                        removeSubjectFromGrid(block.dataset.id);
                        return;
                    }
                    // Otherwise we'd need to know which subject to place - open modal instead
                    // For simplicity, clicking empty cell does nothing in this implementation
                    // The user uses sidebar drag
                });

                DOM.grid.appendChild(cell);
            }
        }

        // Render existing scheduled subjects
        renderScheduleBlocks();
    }

    function renderScheduleBlocks() {
        // Clear existing blocks
        DOM.grid.querySelectorAll('.subject-block').forEach(b => b.remove());

        // Group scheduled by (day, startHour)
        // scheduledSubjects: [{ id, day, row }]
        subjects.forEach(sub => {
            const duration = sub.end - sub.start;
            sub.days.forEach(day => {
                const dayIndex = DAYS.indexOf(day);
                if (dayIndex === -1) return;
                const startRow = sub.start - START_HOUR;

                // Find the cell at the start position
                const cells = DOM.grid.querySelectorAll(`.slot-cell[data-day="${dayIndex}"][data-hour="${sub.start}"]`);
                if (cells.length === 0) return;

                // Create block
                const block = document.createElement('div');
                block.className = 'subject-block';
                block.dataset.id = sub.id;
                block.dataset.day = dayIndex;
                block.dataset.startRow = startRow;
                block.dataset.duration = duration;
                block.style.background = sub.color;
                block.style.top = '0px';
                block.style.height = `${duration * 60}px`; // Each hour row is --hour-height, but we use absolute
                block.innerHTML = `
                    <div class="sb-name">${sub.name}</div>
                    <div class="sb-time">${getTimeLabel(sub.start)} - ${getTimeLabel(sub.end)}</div>
                    <button class="sb-delete" data-id="${sub.id}" title="Quitar del horario">&times;</button>
                `;

                // Position it over all cells it spans
                // We'll append to the first cell and make it span using position absolute
                const firstCell = cells[0];
                firstCell.style.position = 'relative';
                block.style.position = 'absolute';
                block.style.left = '2px';
                block.style.right = '2px';
                block.style.top = '2px';
                block.style.bottom = '2px';
                block.style.zIndex = '10';
                block.style.height = `calc(${duration * 60}px - 4px)`;
                firstCell.appendChild(block);

                // Delete button
                block.querySelector('.sb-delete').addEventListener('click', (e) => {
                    e.stopPropagation();
                    block.remove();
                    showToast(`"${sub.name}" quitado del horario`, 'info');
                });
            });
        });

        // Check for conflicts visually
        highlightConflicts();
    }

    function highlightConflicts() {
        // Remove existing conflict highlights
        DOM.grid.querySelectorAll('.conflict-highlight').forEach(c => c.classList.remove('conflict-highlight'));
        DOM.grid.querySelectorAll('.subject-block.conflict').forEach(c => c.classList.remove('conflict'));

        // Find all placed subjects and check overlaps
        const placed = [];
        DOM.grid.querySelectorAll('.subject-block').forEach(block => {
            placed.push({
                el: block,
                id: block.dataset.id,
                day: parseInt(block.dataset.day),
                start: parseInt(block.dataset.startRow) + START_HOUR,
                duration: parseInt(block.dataset.duration),
            });
        });

        for (let i = 0; i < placed.length; i++) {
            for (let j = i + 1; j < placed.length; j++) {
                if (placed[i].day !== placed[j].day) continue;
                const a = placed[i], b = placed[j];
                if (timesOverlap(a.start, a.start + a.duration, b.start, b.start + b.duration)) {
                    a.el.classList.add('conflict');
                    b.el.classList.add('conflict');
                    // Also highlight cells as conflict
                    const cellA = a.el.closest('.slot-cell');
                    const cellB = b.el.closest('.slot-cell');
                    if (cellA) cellA.classList.add('conflict-highlight');
                    if (cellB) cellB.classList.add('conflict-highlight');
                }
            }
        }
    }

    // ---- Place subject on grid ----
    function placeSubjectOnGrid(subjectId, colIndex, rowIndex) {
        const sub = subjects.find(s => s.id === subjectId);
        if (!sub) {
            showToast('Materia no encontrada', 'error');
            return;
        }

        const day = DAYS[colIndex];
        if (!sub.days.includes(day)) {
            showToast(`"${sub.name}" no está registrada para ${day}`, 'warning');
            return;
        }

        const newStart = rowIndex + START_HOUR;
        const duration = sub.end - sub.start;
        const newEnd = newStart + duration;

        if (newEnd > END_HOUR) {
            showToast('El horario excede el límite de las 10 PM', 'error');
            return;
        }

        // Check conflicts with already placed subjects
        const existingBlocks = DOM.grid.querySelectorAll('.subject-block');
        let hasOverlap = false;
        existingBlocks.forEach(block => {
            if (block.dataset.id === subjectId) return;
            const bDay = parseInt(block.dataset.day);
            if (bDay !== colIndex) return;
            const bStart = parseInt(block.dataset.startRow) + START_HOUR;
            const bDur = parseInt(block.dataset.duration);
            if (timesOverlap(newStart, newEnd, bStart, bStart + bDur)) {
                hasOverlap = true;
            }
        });

        if (hasOverlap) {
            showToast(`"${sub.name}" se cruza con otra materia en ${day}`, 'error');
            return;
        }

        // Remove existing block for this subject if it exists on this day
        existingBlocks.forEach(block => {
            if (block.dataset.id === subjectId && parseInt(block.dataset.day) === colIndex) {
                block.remove();
            }
        });

        // Update subject days/schedule to match placement
        // We actually just update the in-memory representation for the grid
        // by re-rendering
        // But for simplicity, we'll just update the sub's start time to match placement
        // Actually we keep original times but show them at the placed position
        // Let's re-render after modifying a temporary placement state
        // For this approach, we just render the block directly

        const cells = DOM.grid.querySelectorAll(`.slot-cell[data-day="${colIndex}"][data-hour="${newStart}"]`);
        if (cells.length === 0) {
            showToast('Celda no disponible', 'error');
            return;
        }
        const firstCell = cells[0];

        // Remove existing block for this subject in this day
        const existing = firstCell.querySelector(`.subject-block[data-id="${subjectId}"]`);
        if (existing) existing.remove();

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
            <button class="sb-delete" data-id="${sub.id}" title="Quitar del horario">&times;</button>
        `;
        block.style.position = 'absolute';
        block.style.left = '2px';
        block.style.right = '2px';
        block.style.top = '2px';
        block.style.zIndex = '10';
        block.style.height = `calc(${duration * 60}px - 4px)`;
        firstCell.style.position = 'relative';
        firstCell.appendChild(block);

        block.querySelector('.sb-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            block.remove();
            highlightConflicts();
            showToast(`"${sub.name}" quitado del horario`, 'info');
        });

        highlightConflicts();
        showToast(`"${sub.name}" colocado en ${day} ${getTimeLabel(newStart)}`, 'success');
    }

    function removeSubjectFromGrid(id) {
        DOM.grid.querySelectorAll(`.subject-block[data-id="${id}"]`).forEach(b => b.remove());
        highlightConflicts();
        showToast('Materia quitada del horario', 'info');
    }

    // ---- Header Updates ----
    function updateHeader() {
        const total = getTotalCredits();
        DOM.totalCredits.innerHTML = `<i class="fas fa-star"></i> Créditos: ${total} / ${MAX_CREDITS}`;
        if (total >= MAX_CREDITS) {
            DOM.totalCredits.style.background = 'rgba(255,200,0,0.25)';
        } else {
            DOM.totalCredits.style.background = 'rgba(255,255,255,0.15)';
        }
        DOM.subjectCount.innerHTML = `<i class="fas fa-book"></i> Materias: ${subjects.length}`;
    }

    // ---- Recommendations Engine ----
    function generateRecommendations() {
        if (subjects.length === 0) {
            showToast('Registra materias primero', 'warning');
            return;
        }

        const totalCredits = getTotalCredits();
        if (totalCredits > MAX_CREDITS) {
            showToast(`Excedes el límite de ${MAX_CREDITS} créditos (${totalCredits})`, 'error');
            return;
        }

        // Strategy: generate 3 different schedules
        const recommendations = [];

        // 1. Balanced schedule: spread classes evenly across days
        const rec1 = buildBalancedSchedule();
        if (rec1) recommendations.push(rec1);

        // 2. Compact schedule: pack classes into fewer days
        const rec2 = buildCompactSchedule();
        if (rec2) recommendations.push(rec2);

        // 3. Morning-focused schedule: prefer morning hours
        const rec3 = buildMorningSchedule();
        if (rec3) recommendations.push(rec3);

        if (recommendations.length === 0) {
            showToast('No se pudieron generar recomendaciones con las materias actuales', 'error');
            return;
        }

        showRecommendationsModal(recommendations);
    }

    function buildBalancedSchedule() {
        // Try to spread subjects across days, avoiding overlaps
        const sorted = [...subjects].sort((a, b) => a.start - b.start);
        const schedule = [];
        const usedDays = {};

        for (const sub of sorted) {
            const availableDays = sub.days.filter(d => {
                if (!usedDays[d]) usedDays[d] = [];
                return !usedDays[d].some(existing =>
                    timesOverlap(existing.start, existing.end, sub.start, sub.end)
                );
            });

            if (availableDays.length === 0) continue;

            // Pick day with least subjects scheduled so far
            const dayCounts = availableDays.map(d => ({
                day: d,
                count: usedDays[d] ? usedDays[d].length : 0
            }));
            dayCounts.sort((a, b) => a.count - b.count);
            const chosenDay = dayCounts[0].day;

            if (!usedDays[chosenDay]) usedDays[chosenDay] = [];
            usedDays[chosenDay].push({ id: sub.id, start: sub.start, end: sub.end });
            schedule.push({ id: sub.id, day: chosenDay, subject: sub });
        }

        if (schedule.length === 0) return null;

        return {
            type: 'balanced',
            name: 'Balanceado',
            icon: 'fa-scale-balanced',
            badge: 'balanced',
            description: 'Distribuye las materias uniformemente entre los días disponibles',
            schedule,
            daysUsed: Object.keys(usedDays).length,
            totalHours: schedule.reduce((sum, s) => sum + (s.subject.end - s.subject.start), 0),
        };
    }

    function buildCompactSchedule() {
        // Try to pack into as few days as possible
        const sorted = [...subjects].sort((a, b) => (a.end - a.start) - (b.end - b.start));
        const schedule = [];
        const usedDays = {};

        for (const sub of sorted) {
            const availableDays = sub.days.filter(d => {
                if (!usedDays[d]) usedDays[d] = [];
                // Check if we can fit this subject in this day without overlap
                return !usedDays[d].some(existing =>
                    timesOverlap(existing.start, existing.end, sub.start, sub.end)
                );
            });

            if (availableDays.length === 0) continue;

            // Pick day with most classes already (to pack)
            const dayCounts = availableDays.map(d => ({
                day: d,
                count: usedDays[d] ? usedDays[d].length : 0
            }));
            dayCounts.sort((a, b) => b.count - a.count);
            const chosenDay = dayCounts[0].day;

            if (!usedDays[chosenDay]) usedDays[chosenDay] = [];
            usedDays[chosenDay].push({ id: sub.id, start: sub.start, end: sub.end });
            schedule.push({ id: sub.id, day: chosenDay, subject: sub });
        }

        if (schedule.length === 0) return null;

        return {
            type: 'compact',
            name: 'Compacto',
            icon: 'fa-compress',
            badge: 'compact',
            description: 'Concentra las materias en la menor cantidad de días posible',
            schedule,
            daysUsed: Object.keys(usedDays).length,
            totalHours: schedule.reduce((sum, s) => sum + (s.subject.end - s.subject.start), 0),
        };
    }

    function buildMorningSchedule() {
        // Prefer morning hours (before 2pm)
        const sorted = [...subjects].sort((a, b) => {
            // Morning subjects first
            const aMorning = a.start < 14 ? 0 : 1;
            const bMorning = b.start < 14 ? 0 : 1;
            if (aMorning !== bMorning) return aMorning - bMorning;
            return a.start - b.start;
        });

        const schedule = [];
        const usedDays = {};

        for (const sub of sorted) {
            const availableDays = sub.days.filter(d => {
                if (!usedDays[d]) usedDays[d] = [];
                return !usedDays[d].some(existing =>
                    timesOverlap(existing.start, existing.end, sub.start, sub.end)
                );
            });

            if (availableDays.length === 0) continue;

            const chosenDay = availableDays[0]; // Just take first available

            if (!usedDays[chosenDay]) usedDays[chosenDay] = [];
            usedDays[chosenDay].push({ id: sub.id, start: sub.start, end: sub.end });
            schedule.push({ id: sub.id, day: chosenDay, subject: sub });
        }

        if (schedule.length === 0) return null;

        return {
            type: 'morning',
            name: 'Matutino',
            icon: 'fa-sun',
            badge: 'spread',
            description: 'Prioriza horarios de la mañana (antes de 2 PM)',
            schedule,
            daysUsed: Object.keys(usedDays).length,
            totalHours: schedule.reduce((sum, s) => sum + (s.subject.end - s.subject.start), 0),
        };
    }

    function showRecommendationsModal(recommendations) {
        DOM.recBody.innerHTML = '';

        const list = document.createElement('div');
        list.className = 'recommendations-list';

        recommendations.forEach((rec, idx) => {
            const card = document.createElement('div');
            card.className = 'rec-card';
            card.dataset.index = idx;

            let subjectsHtml = '';
            rec.schedule.forEach(item => {
                const sub = item.subject;
                subjectsHtml += `<span class="rec-subject" style="background:${sub.color}">
                    ${sub.name} (${item.day} ${getTimeLabel(sub.start)}-${getTimeLabel(sub.end)})
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
                // Deselect others
                list.querySelectorAll('.rec-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                applyRecommendation(rec);
            });

            list.appendChild(card);
        });

        DOM.recBody.appendChild(list);
        DOM.recModal.classList.add('active');
    }

    function applyRecommendation(rec) {
        // Remove all existing blocks from grid
        DOM.grid.querySelectorAll('.subject-block').forEach(b => b.remove());

        // Place each subject per the recommendation
        rec.schedule.forEach(item => {
            const sub = item.subject;
            const dayIndex = DAYS.indexOf(item.day);
            if (dayIndex === -1) return;
            const row = sub.start - START_HOUR;
            const duration = sub.end - sub.start;

            const cells = DOM.grid.querySelectorAll(`.slot-cell[data-day="${dayIndex}"][data-hour="${sub.start}"]`);
            if (cells.length === 0) return;
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
                <div class="sb-time">${getTimeLabel(sub.start)} - ${getTimeLabel(sub.end)}</div>
                <button class="sb-delete" data-id="${sub.id}" title="Quitar del horario">&times;</button>
            `;
            block.style.position = 'absolute';
            block.style.left = '2px';
            block.style.right = '2px';
            block.style.top = '2px';
            block.style.zIndex = '10';
            block.style.height = `calc(${duration * 60}px - 4px)`;
            firstCell.style.position = 'relative';
            firstCell.appendChild(block);

            block.querySelector('.sb-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                block.remove();
                highlightConflicts();
            });
        });

        highlightConflicts();
        DOM.recModal.classList.remove('active');
        showToast('Recomendación aplicada al horario', 'success');
    }

    // ---- Render All ----
    function renderAll() {
        renderGrid();
        renderSubjectsList();
        updateHeader();
    }

    // ---- Clear Schedule ----
    function clearSchedule() {
        DOM.grid.querySelectorAll('.subject-block').forEach(b => b.remove());
        highlightConflicts();
        showToast('Horario limpiado', 'info');
    }

    // ---- Export ----
    function exportSchedule() {
        const blocks = DOM.grid.querySelectorAll('.subject-block');
        if (blocks.length === 0) {
            showToast('No hay nada que exportar', 'warning');
            return;
        }

        let text = '=== MI HORARIO UNIVERSITARIO ===\n\n';
        text += `Generado: ${new Date().toLocaleString()}\n`;
        text += `Créditos: ${getTotalCredits()} / ${MAX_CREDITS}\n\n`;

        for (const day of DAYS) {
            text += `--- ${day} ---\n`;
            const dayBlocks = [];
            DOM.grid.querySelectorAll('.subject-block').forEach(b => {
                if (parseInt(b.dataset.day) === DAYS.indexOf(day)) {
                    const sub = subjects.find(s => s.id === b.dataset.id);
                    if (sub) {
                        const start = parseInt(b.dataset.startRow) + START_HOUR;
                        const dur = parseInt(b.dataset.duration);
                        dayBlocks.push({
                            name: sub.name,
                            course: sub.course,
                            start,
                            end: start + dur,
                            credits: sub.credits
                        });
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
        }

        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `horario_${new Date().toISOString().slice(0,10)}.txt`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('Horario exportado', 'success');
    }

    // ---- Form Submission ----
    function handleFormSubmit(e) {
        e.preventDefault();

        const data = {
            name: DOM.name.value.trim(),
            course: DOM.course.value.trim(),
            credits: parseInt(DOM.credits.value) || 3,
            color: DOM.color.value,
            days: [],
            start: parseInt(DOM.startTime.value),
            end: parseInt(DOM.endTime.value),
        };

        if (!data.name) {
            showToast('El nombre es obligatorio', 'error');
            return;
        }
        if (!data.course) {
            showToast('El código de curso es obligatorio', 'error');
            return;
        }

        // Try auto-fill from course code
        const parsed = parseCourseCode(data.course);
        if (parsed) {
            data.start = parsed.start;
            data.end = parsed.end;
        }

        if (data.start >= data.end) {
            showToast('La hora de inicio debe ser menor a la de fin', 'error');
            return;
        }

        DOM.daysSelector.querySelectorAll('input:checked').forEach(cb => {
            data.days.push(cb.value);
        });

        if (data.days.length === 0) {
            showToast('Selecciona al menos un día', 'error');
            return;
        }

        const editIdVal = DOM.editId.value;
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

    // ---- Init ----
    function init() {
        // Load subjects
        getSubjects();

        // Populate time selects
        populateTimeSelects();

        // Set up event listeners
        DOM.form.addEventListener('submit', handleFormSubmit);

        // Add Subject button
        $('#btnAddSubject').addEventListener('click', () => openModal());

        // Close modal
        $('#btnCloseModal').addEventListener('click', closeModal);
        $('#btnCancelModal').addEventListener('click', closeModal);
        DOM.modal.addEventListener('click', (e) => {
            if (e.target === DOM.modal) closeModal();
        });

        // Recommendations
        $('#btnGenerateSchedules').addEventListener('click', generateRecommendations);
        $('#btnCloseRecommendations').addEventListener('click', () => {
            DOM.recModal.classList.remove('active');
        });
        DOM.recModal.addEventListener('click', (e) => {
            if (e.target === DOM.recModal) DOM.recModal.classList.remove('active');
        });

        // Clear schedule
        $('#btnClearSchedule').addEventListener('click', clearSchedule);

        // Export
        $('#btnExport').addEventListener('click', exportSchedule);

        // Auto-fill course code
        DOM.course.addEventListener('blur', () => {
            const parsed = parseCourseCode(DOM.course.value.trim());
            if (parsed) {
                DOM.startTime.value = parsed.start;
                DOM.endTime.value = parsed.end;
            }
        });

        // Render
        renderAll();

        console.log('📚 Organizador de Horarios inicializado');
        console.log(`📅 ${subjects.length} materias cargadas, ${getTotalCredits()} créditos`);
    }

    return { init };
})();

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());