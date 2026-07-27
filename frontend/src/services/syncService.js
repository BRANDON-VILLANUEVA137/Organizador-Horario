/**
 * Servicio de sincronización de avance académico (Popup Controlado).
 * 
 * Abre un popup nativo hacia el portal de Academusoft para que el
 * estudiante se autentique con Microsoft SSO. Una vez cargada la
 * vista de ruta académica, un script interno captura los códigos
 * de materias aprobadas y los envía via window.postMessage().
 * 
 * Flujo:
 * 1. Usuario hace clic en "Sincronizar mi avance"
 * 2. Se abre popup centrado hacia Academusoft
 * 3. Usuario se autentica con SSO Microsoft
 * 4. Script interno detecta la tabla de ruta académica
 * 5. Extrae códigos de materias aprobadas
 * 6. Envía datos via postMessage al opener
 * 7. Popup se cierra automáticamente
 * 8. Frontend recibe los datos y consulta elegibilidad
 */

// URL directa del semáforo académico
// Academusoft gestiona el SSO nativamente: si no hay sesión, redirige a Microsoft O365
// y después de autenticarse, redirige de vuelta al semáforo automáticamente
const SYNC_POPUP_URL = "https://plataforma.ucundinamarca.edu.co/ucundinamarca/academusoft/academicoEstudiante/vModern/sistemaEstudiante/calificaciones/semaforoEstudiante/cal_sem_div2.jsp?nota=0";
const POPUP_WIDTH = 900;
const POPUP_HEIGHT = 700;
const SYNC_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Estado actual de la sincronización
 */
export const SyncState = {
  IDLE: "idle",
  OPENING: "opening",       // Abriendo el popup
  WAITING: "waiting",       // Esperando datos del popup
  SUCCESS: "success",       // Sincronización exitosa
  ERROR: "error",           // Error
  BLOCKED: "blocked",       // Popup bloqueado por el navegador
  TIMEOUT: "timeout",       // Tiempo de espera agotado
};

let _onStateChange = null;

/**
 * Registra un callback para cambios de estado de sincronización.
 * @param {function} callback - Recibe (SyncState, dataOrError)
 */
export function setSyncStateCallback(callback) {
  _onStateChange = callback;
}

/**
 * Abre el popup de sincronización y espera los datos del estudiante.
 * 
 * @returns {Promise<{completed: string[], diagnostics: string[]}>}
 *   Lista de códigos de materias aprobadas y diagnósticos completados.
 */
export function openSyncPopup() {
  return new Promise((resolve, reject) => {
    _notifyState(SyncState.OPENING);

    // Calcular posición centrada
    const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
    const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;

    // Intentar abrir popup nativo
    const popup = window.open(
      SYNC_POPUP_URL,
      "syncPopup",
      `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},scrollbars=yes`
    );

    // Verificar si el popup fue bloqueado
    if (!popup || popup.closed) {
      _notifyState(SyncState.BLOCKED);
      reject(new Error("El navegador bloqueó el popup. Permite popups para este sitio e intenta de nuevo."));
      return;
    }

    _notifyState(SyncState.WAITING);

    // Timeout de seguridad
    const timeoutId = setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      if (!popup.closed) popup.close();
      _notifyState(SyncState.TIMEOUT);
      reject(new Error("Tiempo de espera agotado. La sincronización tardó más de 5 minutos."));
    }, SYNC_TIMEOUT_MS);

    // Escuchar mensaje del popup
    const handleMessage = (event) => {
      // Validar origen del mensaje (seguridad - solo aceptar de Academusoft)
      const allowedOrigins = [
        "https://academusoft.unicundi.edu.co",
        "https://plataforma.ucundinamarca.edu.co",
      ];
      if (!allowedOrigins.includes(event.origin)) return;

      // Validar estructura del mensaje (nuevo formato SMARTSCHEDULE_SYNC_SUCCESS)
      if (!event.data || event.data.type !== "SMARTSCHEDULE_SYNC_SUCCESS") return;

      // Mensaje válido recibido
      clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);

      // Cerrar popup
      if (!popup.closed) popup.close();

      const payload = event.data.payload || {};
      const completed = payload.completed_subjects || [];
      const diagnostics = payload.completed_diagnostics || [];

      _notifyState(SyncState.SUCCESS, { completed, diagnostics });
      resolve({ completed, diagnostics });
    };

    window.addEventListener("message", handleMessage);

    // Polling para detectar si el usuario cerró el popup manualmente
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        clearTimeout(timeoutId);
        window.removeEventListener("message", handleMessage);
        _notifyState(SyncState.ERROR);
        reject(new Error("Cerraste la ventana de sincronización antes de completar el proceso."));
      }
    }, 1000);
  });
}

/**
 * Script de captura que se ejecuta DENTRO del popup.
 * 
 * Estrategia: Extracción del Semáforo Académico
 * 
 * 1. Usuario se autentica con Microsoft/UDEC
 * 2. La ventana padre redirige al semáforo automáticamente
 * 3. Este script detecta el semáforo y extrae las tarjetas
 * 4. Normaliza códigos DN- removiendo el prefijo
 * 5. Envía datos via postMessage y cierra el popup
 */
export const CAPTURE_SCRIPT = `
(function() {
  const TIMEOUT_MS = 180000; // 3 minutos (tiempo suficiente para login + navegación)
  const URL_SEMAFORO = 'https://plataforma.ucundinamarca.edu.co/ucundinamarca/academusoft/academicoEstudiante/vModern/sistemaEstudiante/calificaciones/semaforoEstudiante/cal_sem_div2.jsp?nota=0';

  let resolved = false;
  let checkInterval = null;

  function intentarExtraccion() {
    const currentUrl = window.location.href;

    // Solo ejecutar en la página del semáforo
    if (!currentUrl.includes('cal_sem_div2.jsp')) {
      return false;
    }

    // Buscar dentro de iframes si es necesario
    const targetDocument = buscarEnIframe(window);
    
    const tarjetasMateria = targetDocument.querySelectorAll(
      'div[class*="materia"], ' +
      'div[class*="card"], ' +
      '.mat-card, ' +
      'div[class*="semaforo"], ' +
      'div[class*="calificacion"], ' +
      'table tr'
    );

    if (tarjetasMateria.length > 0) {
      console.log('[SmartSchedule] Semáforo detectado, extrayendo materias...');
      const datosExtraidos = extraerMateriasAprobadasSemaforo(tarjetasMateria);
      
      // Transmitir datos extraídos a la ventana principal de smartschedule
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({
          type: 'SMARTSCHEDULE_SYNC_SUCCESS',
          payload: datosExtraidos
        }, '*');
      }

      // Cerrar el popup de manera automática e inmediata
      setTimeout(() => {
        window.close();
      }, 500);

      return true;
    }

    return false;
  }

  // Verificar periódicamente si la página cambió al semáforo
  checkInterval = setInterval(() => {
    if (intentarExtraccion()) {
      clearInterval(checkInterval);
    }
  }, 1000);

  // Intentar una vez al cargar por si ya está en el semáforo
  intentarExtraccion();

  // ── Extractor del Semáforo ─────────────────────────────────────
  function extraerMateriasAprobadasSemaforo(tarjetas) {
    const materiasAprobadas = new Set();
    const diagnosticosAprobados = new Set();

    tarjetas.forEach(tarjeta => {
      const texto = tarjeta.innerText || tarjeta.textContent || '';

      // Extraer Código de Asignatura (Ej: CAD612021207, DN-CAI1002020303, CAI1002020201)
      const matchCodigo = texto.match(/(?:DN-)?([A-Z]{2,4}\\d{6,12})/i);

      if (matchCodigo) {
        const codigoRaw = matchCodigo[0].toUpperCase();

        // Evaluador de Aprobación (Checks verdes o notas >= 3.0)
        const tieneCheckVerde = tarjeta.querySelectorAll(
          'i.verde, span.verde, svg[fill*="green"], ' +
          '.text-success, [class*="verde"], ' +
          'i[class*="check"], span[class*="check"]'
        ).length > 0;

        // Buscar notas DEFINITIVA en el texto
        const notasEncontradas = [...texto.matchAll(/DEFINITIVA:\\s*(\\d[.,]\\d)/gi)]
          .map(match => parseFloat(match[1].replace(',', '.')));

        const tieneNotaAprobada = notasEncontradas.some(nota => nota >= 3.0);

        if (tieneCheckVerde || tieneNotaAprobada) {
          // Normalización: Eliminar prefijo DN- para alineación con PENSUM_2020_SISTEMAS.json
          const codigoLimpio = codigoRaw.replace(/^DN-/, '');

          if (codigoRaw.startsWith('DN-')) {
            // Es un diagnóstico: guardar ambos códigos (raw y limpio)
            diagnosticosAprobados.add(codigoRaw);
            diagnosticosAprobados.add(codigoLimpio);
          } else {
            // Es una materia regular
            materiasAprobadas.add(codigoLimpio);
          }
        }
      }
    });

    console.log('[SmartSchedule] Materias aprobadas:', Array.from(materiasAprobadas));
    console.log('[SmartSchedule] Diagnósticos aprobados:', Array.from(diagnosticosAprobados));

    return {
      completed_subjects: Array.from(materiasAprobadas),
      completed_diagnostics: Array.from(diagnosticosAprobados)
    };
  }

  // ── Búsqueda dentro de Iframes ─────────────────────────────────
  function buscarEnIframe(popup) {
    try {
      // Buscar iframe de contenido de Academusoft
      const iframe = popup.document.querySelector(
        'iframe[id*="IfrFormTab"], iframe[src*="academicoEstudiante"], iframe[src*="est_bus_dpe_lis_pro"]'
      );

      if (iframe && iframe.contentDocument) {
        console.log('[SmartSchedule] Iframe detectado, accediendo al documento interno...');
        return iframe.contentDocument;
      }
    } catch (e) {
      // Same-Origin Policy: no se puede acceder al iframe
      console.log('[SmartSchedule] No se puede acceder al iframe (Same-Origin):', e.message);
    }

    return popup.document;
  }

  // ── Timeout de seguridad ───────────────────────────────────────
  setTimeout(() => {
    if (!resolved && window.opener && !window.opener.closed) {
      window.opener.postMessage({
        type: 'SMARTSCHEDULE_SYNC_SUCCESS',
        payload: {
          completed_subjects: [],
          completed_diagnostics: [],
          timeout: true
        }
      }, '*');
    }
  }, TIMEOUT_MS);
})();
`;

// ── Helpers internos ──────────────────────────────────────────

function _notifyState(state, data = null) {
  if (_onStateChange) {
    _onStateChange(state, data);
  }
}