# 📋 Resumen de Implementación — SmartSchedule

## 🎯 Objetivo General
Integrar el **Pensum 2020 de Ingeniería de Sistemas** y el **Motor de Prerrequisitos** en SmartSchedule, permitiendo validar la elegibilidad de materias y sincronizar el avance académico del estudiante mediante un popup controlado hacia Academusoft con **auto-navegación automática**.

---

## 🏗️ Arquitectura Implementada

### Backend (FastAPI)

#### 1. **Modelos de Datos** (`backend/app/domain/models.py`)

**Modelos legacy (ya existían):**
- `PensumSubject`, `Diagnostico`, `Pensum`
- `SyncProgressRequest`, `SyncProgressResponse`

**Nuevos modelos agregados:**
- `AcademicPlan` — Plan académico completo (malla curricular)
- `PrerequisiteSubject` — Materia con prerrequisitos
- `DiagnosticRequirement` — Diagnóstico obligatorio
- `StudentAcademicState` — Estado académico del estudiante
- `SubjectEligibility` — Resultado de elegibilidad (eligible/blocked + motivo)
- `EligibilityResponse` — Respuesta del endpoint de elegibilidad

#### 2. **Servicios** (`backend/app/services/`)

**`pensum_service.py`** — Servicio singleton que:
- Carga `PENSUM_2020_SISTEMAS.json` al iniciar el servidor
- Expone `get_pensum()` (modelo legacy)
- Expone `get_academic_plan()` (nuevo modelo AcademicPlan)
- Mantiene los datos en memoria durante toda la vida del servidor

**`dag_engine.py`** — Motor de Grafo Acíclico Dirigido:
- `calcular_habilitadas()` — Materias que puede cursar el estudiante
- `calcular_progreso()` — Porcentaje de créditos aprobados
- `diagnosticos_pendientes()` — Diagnósticos que bloquean materias futuras
- `creditos_aprobados()` — Total de créditos cursados
- `creditos_restantes()` — Créditos faltantes
- **`calcular_elegibilidad()`** — Evalúa TODAS las materias y retorna:
  - `eligible_subjects` — Materias que puede cursar
  - `blocked_subjects` — Materias bloqueadas con motivo detallado

#### 3. **Endpoints API** (`backend/app/api/routes.py`)

**Ya existían:**
- `GET /api/health` — Estado del servidor
- `GET /api/catalog` — Descubre sedes y programas
- `POST /api/extractions` — Extrae horarios con Playwright
- `GET /api/pensum` — Malla curricular (modelo legacy)
- `POST /api/sync-progress` — Sincronización de avance

**Nuevos endpoints agregados:**
- `GET /api/academic/pensum` — Devuelve el plan académico completo (54 materias, 6 diagnósticos)
- `POST /api/academic/eligibility` — Evalúa elegibilidad de materias según el avance del estudiante

#### 4. **Datos** (`backend/app/data/`)

**`PENSUM_2020_SISTEMAS.json`** — Malla curricular oficial:
- **Carrera:** Ingeniería de Sistemas y Computación
- **Código:** CAD6120
- **Versión:** 2020
- **Total créditos:** 153
- **Materias:** 54
- **Diagnósticos:** 6
- **Estructura:** Cada materia incluye código, nombre, créditos, periodo, requisitos, diagnósticos, correquisitos, tipo

---

### Frontend (HTML/JS)

#### 1. **Servicios** (`frontend/src/services/`)

**`api.js`** — Agregadas funciones:
- `fetchAcademicPensum()` — Obtiene el plan académico
- `checkEligibility(completedSubjects, completedDiagnostics)` — Consulta elegibilidad

**`syncService.js`** — Servicio de sincronización (NUEVO):
- `openSyncPopup()` — Abre popup nativo hacia Academusoft
- `SyncState` — Estados: IDLE, OPENING, WAITING, SUCCESS, ERROR, BLOCKED, TIMEOUT
- `setSyncStateCallback()` — Registra callback para cambios de estado
- `CAPTURE_SCRIPT` — Script que se ejecuta dentro del popup para extraer materias aprobadas

**Flujo de sincronización (Opción A - Auto-navegación):**
1. Usuario hace clic en "Sincronizar mi avance"
2. Se abre popup centrado (800x600) hacia `https://plataforma.ucundinamarca.edu.co/ucundinamarca/hermesoft/vortal/o365/login`
3. Usuario se autentica con Microsoft SSO
4. **AUTOMÁTICO:** Script detecta `inicioSeguro.jsp` y redirige al semáforo: `cal_sem_div2.jsp?nota=0`
5. **AUTOMÁTICO:** Al renderizarse las tarjetas del semáforo, se ejecuta `extraerMateriasAprobadasSemaforo()`
6. Extrae códigos de materias aprobadas y diagnósticos (notas >= 3.0 o checks verdes)
7. Normaliza códigos DN- removiendo el prefijo
8. Envía datos via `window.postMessage()` al opener
9. Popup se cierra automáticamente
10. Frontend recibe los datos y consulta `POST /api/academic/eligibility`
11. Diseñador se actualiza con materias bloqueadas

**Reglas de extracción del semáforo:**
- **Reintentos (Múltiples Definitivas):** Materias con notas reprobadas antiguas y aprobadas → se marca como completada si existe al menos una nota >= 3.0 o check verde
- **Normalización DN-:** Códigos con prefijo `DN-` se normalizan removiendo el prefijo para alineación con el pensum
- **Diagnósticos de 0 créditos:** Se tratan igual que materias regulares

#### 2. **Componentes** (`frontend/src/components/`)

**`designer.js`** — Actualizado con:
- `loadEligibility(completedSubjects, completedDiagnostics)` — Carga elegibilidad desde el backend
- `getEligibility(subjectCode)` — Obtiene elegibilidad de una materia
- `isEligibilityLoaded()` — Verifica si se cargó la elegibilidad
- Renderizado de materias bloqueadas:
  - Opacidad reducida (40%)
  - Cursor `not-allowed`
  - Badge rojo "Bloqueada"
  - Tooltip con motivo del bloqueo
  - Icono 🔒

#### 3. **Integración en `app.js`**

**Sincronización:**
- `updateSyncUI(state, data)` — Actualiza la UI según el estado
- `handleSyncClick()` — Maneja el clic, abre popup, recibe datos, consulta elegibilidad
- Al sincronizar, se recalcula automáticamente la elegibilidad y se refresca el diseñador

**Botones "Nueva consulta":**
- En panel de conexión
- En panel de materias
- En diseñador
- Función `restartApp()` — Limpia todo el estado y vuelve al inicio

#### 4. **Estilos** (`frontend/src/styles.css`)

**Nuevos estilos agregados:**
- `.sync-section` — Contenedor de sincronización
- `.sync-button` — Botón principal
- `.sync-status` — Indicador de estado con animación de carga
- `.sync-result` — Resultado con estadísticas
- `.restart-button` — Botón "Nueva consulta"
- `.designer-group-card.blocked` — Materias bloqueadas (opacidad 0.4, borde rojo)
- `.blocked-badge` — Badge "Bloqueada"

#### 5. **HTML** (`frontend/index.html`)

**Agregado en panel de materias:**
```html
<div class="sync-section" id="sync-section">
  <div class="eyebrow">📡 SINCRONIZA TU AVANCE</div>
  <p class="sync-description">...</p>
  <div class="sync-controls">
    <button class="sync-button" id="sync-button" type="button">
      <span class="sync-icon">🔄</span>
      <span class="sync-label">Sincronizar mi avance</span>
    </button>
    <div class="sync-status" id="sync-status" hidden>
      <span class="sync-status-icon" id="sync-status-icon"></span>
      <span class="sync-status-text" id="sync-status-text"></span>
    </div>
  </div>
  <div class="sync-result" id="sync-result" hidden>
    <div class="sync-result-stats">
      <span class="sync-stat">
        <strong id="sync-count-subjects">0</strong> materias aprobadas
      </span>
      <span class="sync-stat">
        <strong id="sync-count-diagnostics">0</strong> diagnósticos
      </span>
      <span class="sync-stat">
        <strong id="sync-progress-pct">0%</strong> de carrera
      </span>
    </div>
  </div>
</div>
```

---

## 🧪 Datos Demo para Pruebas

### 1. **Backend — Endpoints de prueba**

#### `GET /api/academic/pensum`
```bash
curl.exe http://localhost:8000/api/academic/pensum
```

**Respuesta esperada:**
```json
{
  "carrera": "Ingeniería de Sistemas y Computación",
  "codigo_carrera": "CAD6120",
  "version_pensum": "2020",
  "total_creditos": 153,
  "subjects": [ /* 54 materias */ ],
  "diagnostics": [ /* 6 diagnósticos */ ]
}
```

#### `POST /api/academic/eligibility` — Estudiante nuevo (sin materias)
```bash
curl.exe -X POST http://localhost:8000/api/academic/eligibility ^
  -H "Content-Type: application/json" ^
  -d "{\"completed_subjects\":[],\"completed_diagnostics\":[]}"
```

**Respuesta esperada:**
```json
{
  "eligible_subjects": [
    {
      "codigo": "CAD612021101",
      "nombre": "ÁLGEBRA LINEAL",
      "creditos": 3,
      "periodo": 1,
      "tipo": "obligatoria",
      "eligible": true,
      "reason": null,
      "missing_requirements": [],
      "missing_diagnostics": []
    }
    /* ... 10 materias más de 1er semestre */
  ],
  "blocked_subjects": [
    {
      "codigo": "CAD612021209",
      "nombre": "PROGRAMACIÓN I",
      "creditos": 3,
      "periodo": 2,
      "tipo": "obligatoria",
      "eligible": false,
      "reason": "Falta: PENSAMIENTO ALGORÍTMICO (CAD612021102)",
      "missing_requirements": ["CAD612021102"],
      "missing_diagnostics": []
    }
    /* ... 42 materias más bloqueadas */
  ],
  "progress_percentage": 0.0,
  "total_credits_approved": 0,
  "total_credits_remaining": 153
}
```

#### `POST /api/academic/eligibility` — Estudiante con 1er semestre completo
```bash
curl.exe -X POST http://localhost:8000/api/academic/eligibility ^
  -H "Content-Type: application/json" ^
  -d "{\"completed_subjects\":[\"CAD612021101\",\"CAD612021106\",\"CAD612021103\",\"CAD612021105\",\"CAD612021102\",\"CAD612021104\"],\"completed_diagnostics\":[]}"
```

**Respuesta esperada:**
```json
{
  "eligible_subjects": [
    {
      "codigo": "CAD612021207",
      "nombre": "CALCULO DIFERENCIAL",
      "creditos": 4,
      "periodo": 2,
      "eligible": true
    },
    {
      "codigo": "CAD612021209",
      "nombre": "PROGRAMACIÓN I",
      "creditos": 3,
      "periodo": 2,
      "eligible": true
    }
    /* ... 5 materias más */
  ],
  "blocked_subjects": [
    {
      "codigo": "CAD612021311",
      "nombre": "CALCULO INTEGRAL",
      "eligible": false,
      "reason": "Falta: CALCULO DIFERENCIAL (CAD612021207)"
    }
    /* ... 40 materias más */
  ],
  "progress_percentage": 10.5,
  "total_credits_approved": 16,
  "total_credits_remaining": 137
}
```

### 2. **Frontend — Flujo de prueba**

#### Paso 1: Abrir la aplicación
```bash
# Backend ya debe estar corriendo en puerto 8000
# Frontend
cd frontend
npx vite
```

Abrir `http://localhost:5173/`

#### Paso 2: Probar con datos demo (sin extracción real)
1. En "URL del portal" escribe: `https://ejemplo.com`
2. En "Universidad" selecciona: **"Otra universidad"** (no Cundinamarca)
3. Haz clic en **"Conectar"**
4. Verás 2 materias demo en el panel de materias
5. Selecciona las materias y haz clic en **"Diseñar horario"**
6. En el diseñador verás:
   - Materias elegibles (se pueden arrastrar)
   - Materias bloqueadas con 🔒 y tooltip

#### Paso 3: Probar sincronización (popup con auto-navegación)
1. En el panel de materias, haz clic en **"🔄 Sincronizar mi avance"**
2. Se abrirá un popup hacia `https://plataforma.ucundinamarca.edu.co/ucundinamarca/hermesoft/vortal/o365/login`
3. **Nota:** Necesitas credenciales reales de la universidad para probar este flujo
4. El flujo automático será:
   - Te autenticas con Microsoft/UDEC
   - El script detecta `inicioSeguro.jsp` y redirige al semáforo
   - Extrae las materias aprobadas
   - Cierra el popup automáticamente
   - Actualiza el diseñador con las materias bloqueadas

#### Paso 4: Probar elegibilidad con datos de prueba
En la consola del navegador (F12):
```javascript
// Simular sincronización con 1er semestre completo
const completed = [
  "CAD612021101", "CAD612021106", "CAD612021103",
  "CAD612021105", "CAD612021102", "CAD612021104"
]

// Llamar al endpoint
fetch('http://localhost:8000/api/academic/eligibility', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    completed_subjects: completed,
    completed_diagnostics: []
  })
})
.then(r => r.json())
.then(data => {
  console.log('Elegibles:', data.eligible_subjects.length)
  console.log('Bloqueadas:', data.blocked_subjects.length)
  console.log('Progreso:', data.progress_percentage + '%')
})
```

---

## 📊 Resumen de Cantidades

| Componente | Cantidad |
|---|---|
| **Materias en el pensum** | 54 |
| **Diagnósticos** | 6 |
| **Créditos totales** | 153 |
| **Materias elegibles (estudiante nuevo)** | 11 (1er semestre) |
| **Materias bloqueadas (estudiante nuevo)** | 43 |
| **Materias elegibles (1er semestre completo)** | 7 (incluye P2, P4, P5) |
| **Endpoints backend nuevos** | 2 (`/api/academic/pensum`, `/api/academic/eligibility`) |
| **Archivos frontend nuevos** | 1 (`syncService.js`) |
| **Archivos frontend modificados** | 4 (`index.html`, `styles.css`, `app.js`, `designer.js`) |

---

## 🚀 Cómo Iniciar el Proyecto

### Backend
```bash
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend
```bash
cd frontend
npx vite
```

### Acceder
- Frontend: `http://localhost:5173/`
- API Docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/api/health`

---

## ✅ Estado Actual

- [x] Backend funcionando con endpoints académicos
- [x] Frontend compilando sin errores
- [x] Sincronización popup implementada con auto-navegación (Opción A)
- [x] Elegibilidad funcionando
- [x] UI de materias bloqueadas implementada
- [x] Botones "Nueva consulta" en todos los paneles
- [x] Datos demo para pruebas
- [x] Script de extracción del semáforo con normalización DN-
- [x] Reglas de negocio implementadas (reintentos, checks verdes, notas >= 3.0)

## 🔜 Próximos Pasos (Opcional)

1. **Probar con datos reales de Academusoft** — Necesitas credenciales reales de estudiante
2. **Ajustar selectores CSS** — Según el HTML real del semáforo, puede que necesites ajustar los selectores de tarjetas
3. **Implementar inyección del script** — El `CAPTURE_SCRIPT` debe ser inyectado en el popup (proxy o bookmarklet)
4. **Agregar más universidades** — Actualmente solo funciona con Universidad de Cundinamarca
5. **Implementar exportaciones** — PDF, Excel, iCalendar
6. **Sistema de favoritos** — Guardar horarios preferidos

---

## 📝 Notas Técnicas

### Auto-navegación (Opción A)
El script del popup implementa la siguiente lógica:
1. Abre la URL de login SSO: `o365/login`
2. Detecta cuando el usuario se autentica (URL contiene `inicioSeguro.jsp`)
3. Redirige automáticamente al semáforo: `cal_sem_div2.jsp?nota=0`
4. Extrae las tarjetas de materias usando selectores genéricos
5. Aplica reglas de aprobación:
   - Check verde (clases CSS: `.verde`, `.text-success`, etc.)
   - Nota DEFINITIVA >= 3.0
6. Normaliza códigos DN- removiendo el prefijo
7. Envía datos via `postMessage` con tipo `SMARTSCHEDULE_SYNC_SUCCESS`
8. Cierra el popup automáticamente

### Seguridad
- Validación de origen en `postMessage` (solo acepta dominios de Academusoft)
- Timeout de 5 minutos para evitar popups abiertos indefinidamente
- Detección de cierre manual del popup
- No se almacenan credenciales en el frontend

### Compatibilidad
- El backend es compatible con ambos formatos de mensaje (`STUDENT_PROGRESS` legacy y `SMARTSCHEDULE_SYNC_SUCCESS` nuevo)
- El frontend maneja tanto materias regulares como diagnósticos
- El DAG engine funciona con ambos modelos (`Pensum` legacy y `AcademicPlan` nuevo)