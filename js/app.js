// ============================================================
// Organizador de Horarios Universitarios v3
// ============================================================
// Improvements:
// 1. Multi-course subjects (one subject, many course offerings)
// 2. Multi-disciplinary personal schedule (subjects from different courses)
// 3. Conflict detection only on personal schedule
// 4. Register subjects without adding to personal schedule
// 5. Smart recommendations using all offerings
// 6. JSON export/import
// ============================================================

const App = (() => {
    // ---- Constants ----
    const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const START_HOUR = 7;
    const END_HOUR = 22;
    const MAX_CREDITS = 18;
    const STORAGE_KEY = 'oh_data_v3';

    // ---- State ----
    let subjects = [];       // All registered subjects
    let currentTab = 'registered'; // 'registered' | 'personal'

    // ---- DOM ----
    const $ = id => document.getElementById(id);

    const DOM = {
        grid:               $('scheduleGrid'),
        subjectsList:       $('subjectsList'),
        totalCredits:       $('totalCredits'),
        subjectCount:       $('subjectCount'),
        modal:              $('subjectModal'),
        modalTitle:         $('modalTitle'),
        offeringModal:      $('offeringModal'),
        offeringModalBody:  $('offeringModalBody'),
        recModal:           $('recommendationsModal'),
        recBody:            $('recommendationsBody'),
        form:               $('subjectForm'),
        name:               $('subjectName'),
        credits:            $('subjectCredits'),
        color:              $('subjectColor'),
        editId:             $('editId'),
        offeringsContainer: $('offeringsContainer'),
        toastContainer:     $('toastContainer'),
        importFileInput:    $('importFileInput'),
    };

    // ============================================================
    // UTILITY
    // ============================================================
    function getTimeLabel(h) {
        if (h < 12) return `${h}:00 AM`;
        if (h === 12) return `12:00 PM`;
        return `${h - 12}:00 PM`;
    }

    function timeOpts() {
        const opts = [];
        for (let h = START_HOUR; h <= END_HOUR; h++) {
            opts.push({ v: h, l: getTimeLabel(h) });
        }
        return opts;
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function timesOverlap(s1, e1, s2, e2) {
        return (s1 * 60) < (e2 * 60) && (s2 * 60) < (e1 * 60);
    }

    function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

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
    // STORAGE
    // ============================================================
    function loadData() {
        try {
            const d = localStorage.getItem(STORAGE_KEY);
            if (d) {
                const parsed = JSON.parse(d);
                subjects = parsed.subjects || [];
                // migration: ensure personalSchedule array exists
                subjects.forEach(s => {
                    if (!s.personalSchedule) s.personalSchedule = [];
                });
            } else {
                subjects = [];
            }
        } catch (e) { subjects = []; }
        return subjects;
    }

    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ subjects }));
    }

    function getTotalCredits() {
        // Count credits only for subjects that have personal schedule entries
        const usedIds = new Set();
        subjects.forEach(s => {
            if (s.personalSchedule && s.personalSchedule.length > 0) usedIds.add(s.id);
        });
        return subjects.filter(s => usedIds.has(s.id)).reduce((sum, s) => sum + s.credits, 0);
    }

    function hasPersonalEntries(subject) {
        return subject.personalSchedule && subject.personalSchedule.length > 0;
    }

    // ============================================================
    // CONFLICT DETECTION (personal schedule only)
    // ============================================================
    function checkPersonalConflict(entries, excludeSubjectId) {
        for (let i = 0; i < entries.length; i++) {
            for (let j = i + 1; j < entries.length; j++) {
                const a = entries[i], b = entries[j];
                if (a.day !== b.day) continue;
                if (a.subjectId === b.subjectId) continue;
                if (excludeSubjectId && (a.subjectId === excludeSubjectId || b.subjectId === excludeSubjectId)) continue;
                if (timesOverlap(a.start, a.end, b.start, b.end)) return true;
            }
        }
        return false;
    }

    function getAllPersonalEntries() {
        const entries = [];
        subjects.forEach(sub => {
            if (sub.personalSchedule) {
                sub.personalSchedule.forEach(e => {
                    entries.push({ ...e, subjectId: sub.id });
                });
            }
        });
        return entries;
    }

    function hasConflictWithPersonal(newEntries, excludeSubjectId) {
        const all = getAllPersonalEntries().filter(e => e.subjectId !== excludeSubjectId);
        const combined = [...all, ...newEntries];
        return checkPersonalConflict(combined, excludeSubjectId);
    }

    // ============================================================
    // OFFERING SELECTOR MODAL
    // ============================================================
    function showOfferingSelector(subjectId, dayIndex, rowIndex) {
        const sub = subjects.find(s => s.id === subjectId);
        if (!sub) return;

        DOM.offeringModalBody.innerHTML = '';
        const p = document.createElement('p');
        p.style.marginBottom = '12px';
        p.innerHTML = `<strong>${sub.name}</strong> - Selecciona el curso y horario:`;
        DOM.offeringModalBody.appendChild(p);

        if (!sub.offerings || sub.offerings.length === 0) {
            DOM.offeringModalBody.innerHTML += '<p class="text-small" style="color:var(--danger)">Esta materia no tiene cursos configurados</p>';
            DOM.offeringModal.classList.add('active');
            return;
        }

        sub.offerings.forEach((off, idx) => {
            const days = Object.keys(off.schedules || {}).filter(d => off.schedules[d]);
            if (days.length === 0) return;

            const btn = document.createElement('button');
            btn.className = 'btn btn-outline';
            btn.style.width = '100%';
            btn.style.textAlign = 'left';
            btn.style.marginBottom = '8px';
            btn.style.padding = '12px';
            btn.style.borderRadius = '8px';
            btn.style.justifyContent = 'flex-start';
            btn.style.flexWrap = 'wrap';
            btn.style.gap = '6px';

            let html = `<strong style="width:100%">Curso ${off.courseCode}</strong>`;
            days.forEach(day => {
                const s = off.schedules[day];
                html += `<span class="rec-subject" style="background:${sub.color};font-size:0.7rem;padding:2px 6px;margin:0">${day} ${getTimeLabel(s.start)}-${getTimeLabel(s.end)}</span>`;
            });
            btn.innerHTML = html;

            btn.addEventListener('click', () => {
                DOM.offeringModal.classList.remove('active');
                // Place on grid using first day of this offering
                const targetDay = DAYS[dayIndex];
                // Check if this offering has the target day
                if (off.schedules[targetDay]) {
                    const s = off.schedules[targetDay];
                    const newStart = rowIndex + START_HOUR;
                    const duration = s.end - s.start;
                    const newEnd = newStart + duration;
                    if (newEnd > END_HOUR) {
                        showToast('Excede el límite de las 10 PM', 'error');
                        return;
                    }
                    // Build entry for conflict check
                    const entry = { subjectId, day: targetDay, start: newStart, end: newEnd };
                    if (hasConflictWithPersonal([entry])) {
                        showToast(`"${sub.name}" se cruza con otra materia en ${targetDay}`, 'error');
                        return;
                    }
                    // Add to personal schedule
                    if (!sub.personalSchedule) sub.personalSchedule = [];
                    // Remove existing entries for this subject on this day
                    sub.personalSchedule = sub.personalSchedule.filter(e => e.day !== targetDay);
                    sub.personalSchedule.push({ offeringIndex: idx, day: targetDay, start: newStart, end: newEnd });
                    saveData();
                    renderAll();
                    showToast(`${sub.name} agregado a ${targetDay} ${getTimeLabel(newStart)}`, 'success');
                } else {
                    // Place on first available day of the offering
                    const availDay = days[0];
                    const s = off.schedules[availDay];
                    if (!sub.personalSchedule) sub.personalSchedule = [];
                    sub.personalSchedule.push({ offeringIndex: idx, day: availDay, start: s.start, end: s.end });
                    saveData();
                    renderAll();
                    showToast(`${sub.name} agregado en ${availDay} (${getTimeLabel(s.start)}-${getTimeLabel(s.end)})`, 'success');
                }
            });

            DOM.offeringModalBody.appendChild(btn);
        });

        DOM.offeringModal.classList.add('active');
    }

    // ============================================================
    // FORM: OFFERINGS (Course blocks)
    // ============================================================
    function renderOfferings(offerings) {
        DOM.offeringsContainer.innerHTML = '';
        if (!offerings || offerings.length === 0) {
            offerings = [{ courseCode: '', schedules: {} }];
        }

        const opts = timeOpts();
        const startOpts = opts.slice(0, -1).map(o =>
            `<option value="${o.v}">${o.l}</option>`
        ).join('');
        const endOpts = opts.slice(1).map(o =>
            `<option value="${o.v}">${o.l}</option>`
        ).join('');

        offerings.forEach((off, idx) => {
            const row = document.createElement('div');
            row.className = 'offering-row';
            row.dataset.index = idx;

            // Header
            const header = document.createElement('div');
            header.className = 'offering-header';
            header.innerHTML = `
                <label>
                    <i class="fas fa-graduation-cap"></i> Curso:
                    <input type="text" class="offering-course-input" value="${off.courseCode}" placeholder="Ej: 401">
                </label>
                <button type="button" class="offering-delete" title="Eliminar curso">&times;</button>
            `;
            row.appendChild(header);

            // Schedule grid
            const schedDiv = document.createElement('div');
            schedDiv.className = 'offering-schedules';

            DAYS.forEach(day => {
                const sd = off.schedules ? off.schedules[day] : null;
                const dayRow = document.createElement('div');
                dayRow.className = 'offering-day-row';
                dayRow.innerHTML = `
                    <input type="checkbox" class="day-cb" ${sd ? 'checked' : ''}>
                    <span class="day-lb">${day}</span>
                    <select class="day-start" ${sd ? '' : 'disabled'}>
                        ${startOpts}
                    </select>
                    <select class="day-end" ${sd ? '' : 'disabled'}>
                        ${endOpts}
                    </select>
                `;
                // Set values
                if (sd) {
                    dayRow.querySelector('.day-start').value = sd.start;
                    dayRow.querySelector('.day-end').value = sd.end;
                }
                // Toggle on checkbox
                dayRow.querySelector('.day-cb').addEventListener('change', function() {
                    const st = dayRow.querySelector('.day-start');
                    const en = dayRow.querySelector('.day-end');
                    st.disabled = !this.checked;
                    en.disabled = !this.checked;
                    if (this.checked && !st.value) {
                        st.value = 7;
                        en.value = 9;
                    }
                });
                schedDiv.appendChild(dayRow);
            });

            row.appendChild(schedDiv);

            // Delete offering
            header.querySelector('.offering-delete').addEventListener('click', () => {
                row.remove();
            });

            DOM.offeringsContainer.appendChild(row);
        });
    }

    function getOfferingsFromForm() {
        const offerings = [];
        DOM.offeringsContainer.querySelectorAll('.offering-row').forEach(row => {
            const courseCode = row.querySelector('.offering-course-input').value.trim();
            if (!courseCode) return;
            const schedules = {};
            row.querySelectorAll('.offering-day-row').forEach(dr => {
                const cb = dr.querySelector('.day-cb');
                if (!cb.checked) return;
                const day = dr.querySelector('.day-lb').textContent;
                const start = parseInt(dr.querySelector('.day-start').value);
                const end = parseInt(dr.querySelector('.day-end').value);
                if (start >= end) return;
                schedules[day] = { start, end };
            });
            if (Object.keys(schedules).length > 0) {
                offerings.push({ courseCode, schedules });
            }
        });
        return offerings;
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
            DOM.credits.value = subject.credits;
            DOM.color.value = subject.color;
            DOM.editId.value = subject.id;
            renderOfferings(subject.offerings || []);
        } else {
            DOM.modalTitle.innerHTML = '<i class="fas fa-plus-circle"></i> Nueva Materia';
            renderOfferings([{ courseCode: '', schedules: {} }]);
        }
        // Set first day-enabled to default times
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
        // No credit check on register - only when added to personal schedule
        const sub = {
            id: generateId(),
            name: data.name,
            credits: data.credits,
            color: data.color,
            offerings: data.offerings,
            personalSchedule: [],  // Empty until user adds to schedule
            createdAt: Date.now()
        };
        subjects.push(sub);
        saveData();
        renderAll();
        showToast(`"${data.name}" registrada`, 'success');
        return true;
    }

    function updateSubject(id, data) {
        const idx = subjects.findIndex(s => s.id === id);
        if (idx === -1) return false;

        // Preserve personal schedule
        const oldPersonal = subjects[idx].personalSchedule || [];

        // Check if personal schedule entries are still valid with new offerings
        // Validate each entry
        const validPersonal = oldPersonal.filter(e => {
            const off = data.offerings[e.offeringIndex];
            if (!off) return false;
            return off.schedules[e.day] && off.schedules[e.day].start === e.start && off.schedules[e.day].end === e.end;
        });

        const updated = {
            ...subjects[idx],
            name: data.name,
            credits: data.credits,
            color: data.color,
            offerings: data.offerings,
            personalSchedule: validPersonal
        };

        subjects[idx] = updated;
        saveData();
        renderAll();
        showToast(`"${data.name}" actualizada`, 'success');
        return true;
    }

    function deleteSubject(id) {
        if (!confirm('¿Eliminar esta materia de todos los registros?')) return;
        subjects = subjects.filter(s => s.id !== id);
        saveData();
        renderAll();
        showToast('Materia eliminada', 'info');
    }

    function removeFromPersonalSchedule(subjectId, day) {
        const sub = subjects.find(s => s.id === subjectId);
        if (!sub) return;
        if (day !== undefined) {
            sub.personalSchedule = sub.personalSchedule.filter(e => e.day !== day);
        } else {
            sub.personalSchedule = [];
        }
        saveData();
        renderAll();
        showToast('Materia quitada del horario personal', 'info');
    }

    // ============================================================
    // RENDER: SUBJECTS LIST (SIDEBAR)
    // ============================================================
    function renderSubjectsList() {
        DOM.subjectsList.innerHTML = '';

        let list = subjects;

        if (currentTab === 'personal') {
            list = subjects.filter(s => hasPersonalEntries(s));
        }

        if (list.length === 0) {
            const msg = currentTab === 'personal'
                ? 'No hay materias en tu horario personal. Arrastra desde "Registradas" o usa "Recomendar Horarios".'
                : 'No hay materias registradas. Agrega tus materias para comenzar.';
            DOM.subjectsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-${currentTab === 'personal' ? 'calendar-check' : 'book-open'}"></i>
                    <p>${msg}</p>
                </div>
            `;
            return;
        }

        list.forEach(sub => {
            const offerings = sub.offerings || [];
            const coursesStr = offerings.map(o => o.courseCode).filter(c => c).join(', ') || 'Sin curso';
            const inSchedule = hasPersonalEntries(sub);

            const card = document.createElement('div');
            card.className = 'subject-card';
            card.dataset.id = sub.id;
            card.draggable = true;

            let scheduleStr = '';
            if (inSchedule) {
                const days = sub.personalSchedule.map(e =>
                    `${e.day} ${getTimeLabel(e.start)}-${getTimeLabel(e.end)}`
                ).join(', ');
                scheduleStr = `<span><i class="fas fa-calendar-check"></i> ${days}</span>`;
            }

            const addBtn = inSchedule
                ? `<button class="btn-icon remove-sched" title="Quitar del horario personal" data-id="${sub.id}"><i class="fas fa-times-circle"></i></button>`
                : `<button class="btn-icon add-sched" title="Agregar al horario personal" data-id="${sub.id}"><i class="fas fa-plus-circle"></i></button>`;

            card.innerHTML = `
                <div class="subject-color-bar" style="background:${sub.color}"></div>
                <div class="subject-card-content">
                    <div class="subject-name">${sub.name}</div>
                    <div class="subject-meta">
                        <span><i class="fas fa-star"></i> ${sub.credits} créd.</span>
                        <span><i class="fas fa-graduation-cap"></i> ${coursesStr}</span>
                        ${scheduleStr}
                    </div>
                    <div class="subject-actions">
                        ${addBtn}
                        <button class="btn-icon edit" title="Editar" data-id="${sub.id}"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon delete" title="Eliminar" data-id="${sub.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
            DOM.subjectsList.appendChild(card);

            // Events
            card.querySelector('.edit').addEventListener('click', e => {
                e.stopPropagation();
                const s = subjects.find(x => x.id === sub.id);
                if (s) openModal(s);
            });
            card.querySelector('.delete').addEventListener('click', e => {
                e.stopPropagation();
                deleteSubject(sub.id);
            });
            const addSched = card.querySelector('.add-sched');
            if (addSched) {
                addSched.addEventListener('click', e => {
                    e.stopPropagation();
                    // Open offering selector to add to personal schedule
                    if (!sub.offerings || sub.offerings.length === 0) {
                        showToast('Esta materia no tiene cursos configurados', 'warning');
                        return;
                    }
                    // Add all days from first offering to personal schedule
                    const off = sub.offerings[0];
                    if (!sub.personalSchedule) sub.personalSchedule = [];
                    Object.keys(off.schedules).forEach(day => {
                        const existing = sub.personalSchedule.find(e => e.day === day);
                        if (!existing) {
                            sub.personalSchedule.push({
                                offeringIndex: 0,
                                day,
                                start: off.schedules[day].start,
                                end: off.schedules[day].end
                            });
                        }
                    });
                    saveData();
                    renderAll();
                    showToast(`"${sub.name}" agregado al horario personal`, 'success');
                });
            }
            const removeSched = card.querySelector('.remove-sched');
            if (removeSched) {
                removeSched.addEventListener('click', e => {
                    e.stopPropagation();
                    removeFromPersonalSchedule(sub.id);
                });
            }
        });

        setupDragCards();
    }

    // ============================================================
    // DRAG & DROP
    // ============================================================
    function setupDragCards() {
        document.querySelectorAll('.subject-card').forEach(card => {
            card.addEventListener('dragstart', e => {
                card.classList.add('dragging');
                e.dataTransfer.setData('text/plain', card.dataset.id);
            });
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                document.querySelectorAll('.slot-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
            });

            // Touch
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
                    handleDrop(card.dataset.id, col, row);
                }
            }, { passive: true });
        });
    }

    function handleDrop(subjectId, colIndex, rowIndex) {
        const sub = subjects.find(s => s.id === subjectId);
        if (!sub) { showToast('Materia no encontrada', 'error'); return; }

        const day = DAYS[colIndex];
        if (!day) return;

        // Check if subject has offerings
        if (!sub.offerings || sub.offerings.length === 0) {
            showToast('Esta materia no tiene horarios configurados', 'warning');
            return;
        }

        // Check if subject already has this day in personal schedule
        const existing = (sub.personalSchedule || []).find(e => e.day === day);
        if (existing) {
            showToast(`"${sub.name}" ya está en ${day}. Quítalo primero.`, 'warning');
            return;
        }

        // Show offering selector
        showOfferingSelector(subjectId, colIndex, rowIndex);
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

                cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('drag-over'); });
                cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
                cell.addEventListener('drop', e => {
                    e.preventDefault();
                    cell.classList.remove('drag-over');
                    const id = e.dataTransfer.getData('text/plain');
                    if (id) handleDrop(id, d, hour - START_HOUR);
                });

                // Click to remove block
                cell.addEventListener('click', () => {
                    const block = cell.querySelector('.subject-block');
                    if (block) {
                        const id = block.dataset.id;
                        const day = DAYS[parseInt(block.dataset.day)];
                        removeFromPersonalSchedule(id, day);
                    }
                });

                DOM.grid.appendChild(cell);
            }
        }

        renderAllScheduleBlocks();
    }

    function renderAllScheduleBlocks() {
        DOM.grid.querySelectorAll('.subject-block').forEach(b => b.remove());

        subjects.forEach(sub => {
            if (!sub.personalSchedule) return;
            sub.personalSchedule.forEach(entry => {
                const dayIndex = DAYS.indexOf(entry.day);
                if (dayIndex === -1) return;
                const duration = entry.end - entry.start;
                const row = entry.start - START_HOUR;

                const cells = DOM.grid.querySelectorAll(`.slot-cell[data-day="${dayIndex}"][data-hour="${entry.start}"]`);
                if (cells.length === 0) return;
                const firstCell = cells[0];

                // Get course code from offering
                let courseInfo = '';
                const off = sub.offerings ? sub.offerings[entry.offeringIndex] : null;
                if (off) courseInfo = ` (${off.courseCode})`;

                const block = document.createElement('div');
                block.className = 'subject-block';
                block.dataset.id = sub.id;
                block.dataset.day = dayIndex;
                block.dataset.startRow = row;
                block.dataset.duration = duration;
                block.style.background = sub.color;
                block.innerHTML = `
                    <div class="sb-name">${sub.name}${courseInfo}</div>
                    <div class="sb-time">${getTimeLabel(entry.start)} - ${getTimeLabel(entry.end)}</div>
                    <button class="sb-delete" data-id="${sub.id}" data-day="${entry.day}" title="Quitar">&times;</button>
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
                    removeFromPersonalSchedule(sub.id, entry.day);
                });
            });
        });

        highlightConflicts();
    }

    function highlightConflicts() {
        DOM.grid.querySelectorAll('.conflict-highlight').forEach(c => c.classList.remove('conflict-highlight'));
        DOM.grid.querySelectorAll('.subject-block.conflict').forEach(c => c.classList.remove('conflict'));

        const entries = [];
        subjects.forEach(sub => {
            if (!sub.personalSchedule) return;
            sub.personalSchedule.forEach(e => {
                const dayIndex = DAYS.indexOf(e.day);
                if (dayIndex === -1) return;
                const blk = DOM.grid.querySelector(`.subject-block[data-id="${sub.id}"][data-day="${dayIndex}"]`);
                if (blk) entries.push({ el: blk, day: dayIndex, start: e.start, end: e.end });
            });
        });

        for (let i = 0; i < entries.length; i++) {
            for (let j = i + 1; j < entries.length; j++) {
                if (entries[i].day !== entries[j].day) continue;
                if (timesOverlap(entries[i].start, entries[i].end, entries[j].start, entries[j].end)) {
                    entries[i].el.classList.add('conflict');
                    entries[j].el.classList.add('conflict');
                    const cA = entries[i].el.closest('.slot-cell');
                    const cB = entries[j].el.closest('.slot-cell');
                    if (cA) cA.classList.add('conflict-highlight');
                    if (cB) cB.classList.add('conflict-highlight');
                }
            }
        }
    }

    // ============================================================
    // HEADER
    // ============================================================
    function updateHeader() {
        const total = getTotalCredits();
        DOM.totalCredits.innerHTML = `<i class="fas fa-star"></i> Créditos: ${total} / ${MAX_CREDITS}`;
        DOM.totalCredits.style.background = total >= MAX_CREDITS ? 'rgba(255,200,0,0.25)' : 'rgba(255,255,255,0.15)';
        const inSchedule = subjects.filter(s => hasPersonalEntries(s)).length;
        DOM.subjectCount.innerHTML = `<i class="fas fa-book"></i> En horario: ${inSchedule} / ${subjects.length}`;
    }

    // ============================================================
    // RECOMMENDATIONS
    // ============================================================
    function generateRecommendations() {
        const inSchedule = subjects.filter(s => hasPersonalEntries(s));
        if (inSchedule.length === 0 && subjects.length === 0) {
            showToast('Registra materias primero', 'warning');
            return;
        }

        const total = getTotalCredits();
        if (total > MAX_CREDITS) {
            showToast(`Excedes el límite de ${MAX_CREDITS} créditos (${total})`, 'error');
            return;
        }

        // Only recommend for subjects NOT yet scheduled
        const unscheduled = subjects.filter(s => !hasPersonalEntries(s));
        if (unscheduled.length === 0) {
            showToast('Todas las materias ya están en tu horario personal', 'info');
            return;
        }

        const alreadyScheduled = subjects.filter(s => hasPersonalEntries(s));

        // Get all personal entries as base
        const baseEntries = [];
        alreadyScheduled.forEach(s => {
            if (s.personalSchedule) {
                s.personalSchedule.forEach(e => {
                    baseEntries.push({ ...e, subjectId: s.id, subjectName: s.name, color: s.color });
                });
            }
        });

        const recommendations = [];

        const r1 = buildRec(unscheduled, baseEntries, 'balanced', 'Balanceado', 'fa-scale-balanced', 'balanced',
            'Distribuye las nuevas materias en días con menos carga');
        if (r1) recommendations.push(r1);

        const r2 = buildRec(unscheduled, baseEntries, 'compact', 'Compacto', 'fa-compress', 'compact',
            'Concentra las nuevas materias en la menor cantidad de días');
        if (r2) recommendations.push(r2);

        const r3 = buildRec(unscheduled, baseEntries, 'morning', 'Matutino', 'fa-sun', 'spread',
            'Prioriza horarios de mañana para las nuevas materias');
        if (r3) recommendations.push(r3);

        if (recommendations.length === 0) {
            showToast('No se pudieron generar recomendaciones', 'error');
            return;
        }

        showRecommendationsModal(recommendations);
    }

    function buildRec(unscheduled, baseEntries, type, name, icon, badge, desc) {
        const schedule = [];
        const usedDays = {};

        // Build a list of all possible placements from offerings
        const candidates = [];
        unscheduled.forEach(sub => {
            const offerings = sub.offerings || [];
            offerings.forEach((off, offIdx) => {
                Object.keys(off.schedules).forEach(day => {
                    if (!off.schedules[day]) return;
                    candidates.push({
                        subjectId: sub.id,
                        subject: sub,
                        offeringIndex: offIdx,
                        courseCode: off.courseCode,
                        day,
                        start: off.schedules[day].start,
                        end: off.schedules[day].end
                    });
                });
            });
        });

        // Sort based on strategy
        if (type === 'balanced') {
            candidates.sort((a, b) => {
                // Sort by start time then by subject name
                if (a.start !== b.start) return a.start - b.start;
                return a.subject.name.localeCompare(b.subject.name);
            });
        } else if (type === 'compact') {
            candidates.sort((a, b) => (a.end - a.start) - (b.end - b.start));
        } else if (type === 'morning') {
            candidates.sort((a, b) => {
                const aM = a.start < 14 ? 0 : 1;
                const bM = b.start < 14 ? 0 : 1;
                return aM - bM || a.start - b.start;
            });
        }

        const usedSubjects = new Set();
        for (const cand of candidates) {
            if (usedSubjects.has(cand.subjectId)) continue;

            // Check if this day has capacity constraints
            const dayEntries = [
                ...baseEntries,
                ...schedule
            ].filter(e => e.day === cand.day);

            const testEntry = { subjectId: cand.subjectId, day: cand.day, start: cand.start, end: cand.end };
            const allTest = [...dayEntries, testEntry];

            if (checkPersonalConflict(allTest)) continue;

            schedule.push({
                subjectId: cand.subjectId,
                subject: cand.subject,
                offeringIndex: cand.offeringIndex,
                courseCode: cand.courseCode,
                day: cand.day,
                start: cand.start,
                end: cand.end
            });

            usedSubjects.add(cand.subjectId);
            if (!usedDays[cand.day]) usedDays[cand.day] = 0;
            usedDays[cand.day]++;
        }

        if (schedule.length === 0) return null;

        return {
            type, name, icon, badge, description, schedule,
            daysUsed: Object.keys(usedDays).length,
            totalHours: schedule.reduce((s, item) => s + (item.end - item.start), 0),
            subjectsCount: schedule.length
        };
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
                    ${sub.name} (Curso ${item.courseCode} - ${item.day} ${getTimeLabel(item.start)}-${getTimeLabel(item.end)})
                </span> `;
            });

            card.innerHTML = `
                <div class="rec-card-header">
                    <h3><i class="fas ${rec.icon}"></i> ${rec.name}</h3>
                    <span class="rec-badge ${rec.badge}">${rec.subjectsCount} mat. en ${rec.daysUsed} día${rec.daysUsed !== 1 ? 's' : ''}</span>
                </div>
                <div class="rec-card-body">${subjectsHtml}</div>
                <div class="rec-card-footer">
                    <span><i class="far fa-clock"></i> ${rec.totalHours}h</span>
                    <span><i class="fas fa-calendar-day"></i> ${rec.daysUsed} día${rec.daysUsed !== 1 ? 's' : ''}</span>
                    <span><i class="fas fa-graduation-cap"></i> ${rec.subjectsCount} materias</span>
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
        rec.schedule.forEach(item => {
            const sub = subjects.find(s => s.id === item.subjectId);
            if (!sub) return;
            if (!sub.personalSchedule) sub.personalSchedule = [];
            // Remove existing entry for this day
            sub.personalSchedule = sub.personalSchedule.filter(e => e.day !== item.day);
            sub.personalSchedule.push({
                offeringIndex: item.offeringIndex,
                day: item.day,
                start: item.start,
                end: item.end
            });
        });
        saveData();
        renderAll();
        DOM.recModal.classList.remove('active');
        showToast('Recomendación aplicada al horario personal', 'success');
    }

    // ============================================================
    // CLEAR
    // ============================================================
    function clearSchedule() {
        subjects.forEach(s => { s.personalSchedule = []; });
        saveData();
        renderAll();
        showToast('Horario personal limpiado', 'info');
    }

    // ============================================================
    // EXPORT / IMPORT JSON
    // ============================================================
    function exportData() {
        const data = {
            version: '3.0',
            exportedAt: new Date().toISOString(),
            subjects: subjects
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `horario_export_${new Date().toISOString().slice(0,10)}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('Datos exportados correctamente', 'success');
    }

    function importData() {
        DOM.importFileInput.click();
    }

    function handleImportFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (!data.subjects || !Array.isArray(data.subjects)) {
                    showToast('Archivo JSON inválido', 'error');
                    return;
                }
                // Merge: replace current data
                if (confirm(`¿Importar ${data.subjects.length} materias? Esto reemplazará todos los datos actuales.`)) {
                    subjects = data.subjects.map(s => {
                        if (!s.personalSchedule) s.personalSchedule = [];
                        return s;
                    });
                    saveData();
                    renderAll();
                    showToast(`${subjects.length} materias importadas`, 'success');
                }
            } catch (err) {
                showToast('Error al leer el archivo: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    // ============================================================
    // FORM SAVE
    // ============================================================
    function handleSave() {
        const name = DOM.name.value.trim();
        const credits = parseInt(DOM.credits.value) || 3;
        const color = DOM.color.value;
        const offerings = getOfferingsFromForm();
        const editIdVal = DOM.editId.value;

        if (!name) { showToast('El nombre es obligatorio', 'error'); return; }
        if (offerings.length === 0) {
            showToast('Agrega al menos un curso con horarios', 'error');
            return;
        }

        const data = { name, credits, color, offerings };

        if (editIdVal) {
            updateSubject(editIdVal, data);
        } else {
            addSubject(data);
        }
        closeModal();
        renderAll();
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
        loadData();

        // Fix: ensure personalSchedule exists
        subjects.forEach(s => {
            if (!s.personalSchedule) s.personalSchedule = [];
            if (!s.offerings) s.offerings = [];
        });

        // Save button
        $('btnSaveSubject').addEventListener('click', handleSave);
        DOM.form.addEventListener('submit', e => { e.preventDefault(); handleSave(); });

        // Add subject
        $('btnAddSubject').addEventListener('click', () => openModal());

        // Add offering inside modal
        $('btnAddOffering').addEventListener('click', () => {
            const rows = DOM.offeringsContainer.querySelectorAll('.offering-row');
            const last = rows[rows.length - 1];
            const code = last ? last.querySelector('.offering-course-input').value : '';
            // Duplicate last or create new
            const existing = [];
            DOM.offeringsContainer.querySelectorAll('.offering-row').forEach((r, i) => {
                const c = r.querySelector('.offering-course-input').value.trim();
                existing.push(c || `curso_${i}`);
            });
            renderOfferings([...existing.map((c, i) => {
                const row = DOM.offeringsContainer.querySelectorAll('.offering-row')[i];
                const sched = {};
                if (row) {
                    row.querySelectorAll('.offering-day-row').forEach(dr => {
                        const cb = dr.querySelector('.day-cb');
                        if (!cb.checked) return;
                        const day = dr.querySelector('.day-lb').textContent;
                        sched[day] = {
                            start: parseInt(dr.querySelector('.day-start').value),
                            end: parseInt(dr.querySelector('.day-end').value)
                        };
                    });
                }
                return { courseCode: c, schedules: sched };
            }), { courseCode: '', schedules: {} }]);
        });

        // Close modals
        $('btnCloseModal').addEventListener('click', closeModal);
        $('btnCancelModal').addEventListener('click', closeModal);
        DOM.modal.addEventListener('click', e => { if (e.target === DOM.modal) closeModal(); });

        // Offering modal
        $('btnCloseOfferingModal').addEventListener('click', () => DOM.offeringModal.classList.remove('active'));
        $('btnCancelOffering').addEventListener('click', () => DOM.offeringModal.classList.remove('active'));
        DOM.offeringModal.addEventListener('click', e => {
            if (e.target === DOM.offeringModal) DOM.offeringModal.classList.remove('active');
        });

        // Recommendations
        $('btnGenerateSchedules').addEventListener('click', generateRecommendations);
        $('btnCloseRecommendations').addEventListener('click', () => DOM.recModal.classList.remove('active'));
        DOM.recModal.addEventListener('click', e => { if (e.target === DOM.recModal) DOM.recModal.classList.remove('active'); });

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTab = btn.dataset.tab;
                renderSubjectsList();
            });
        });

        // Clear & Print
        $('btnClearSchedule').addEventListener('click', clearSchedule);
        $('btnPrintSchedule').addEventListener('click', () => window.print());

        // Export / Import
        $('btnExportData').addEventListener('click', exportData);
        $('btnImportData').addEventListener('click', importData);
        DOM.importFileInput.addEventListener('change', handleImportFile);

        renderAll();
        console.log('📚 OH v3 iniciado. Materias:', subjects.length);
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());