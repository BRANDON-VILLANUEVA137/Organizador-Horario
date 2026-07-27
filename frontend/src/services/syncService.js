/**
 * Servicio de sincronización de avance académico (Popup Controlado).
 * 
 * Abre un popup nativo hacia el portal de Academusoft para que el
 * estudiante se autentique con Microsoft SSO. Una vez autenticado,
 * redirige al Registro Académico Extendido para extraer las materias
 * aprobadas y enviarlas via window.postMessage().
 * 
 * Flujo:
 * 1. Usuario hace clic en "Sincronizar mi avance"
 * 2. Se abre popup centrado hacia Academusoft (o365/login)
 * 3. Usuario se autentica con SSO Microsoft
 * 4. Script redirige al Registro Académico Extendido con ?programa=0
 * 5. Extrae códigos de materias aprobadas desde la tabla (columna Def.)
 * 6. Normaliza códigos DN- removiendo el prefijo
 * 7. Envía datos via postMessage al opener
 * 8. Popup se cierra automáticamente
 * 9. Frontend recibe los datos y consulta elegibilidad
 */

// URL del portal de Academusoft para inicio de sesión SSO
const SYNC_POPUP_URL = "https://plataforma.ucundinamarca.edu.co/ucundinamarca/hermesoft/vortal/o365/login";
const POPUP_WIDTH = 900;
const POPUP_HEIGHT = 700;
const SYNC_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos

// URL objetivo después del login: Registro Académico Extendido
// El parámetro ?programa=0 es requerido por Academusoft para cargar la carrera activa
const URL_REGISTRO_EXTENDIDO = 'https://plataforma.ucundinamarca.edu.co/ucundinamarca/academusoft/academicoEstudiante/vModern/sistemaEstudiante/calificaciones/registroExtendido/cal_adm_con_not_cra_ver.jsp?programa=0';

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

    // ── Redirección al Registro Extendido después del login ──────
    // Después de 4.5 segundos (tiempo para completar el SSO), redirigir
    // al registro académico extendido con parámetro ?programa=0
    setTimeout(() => {
      try {
        if (popup && !popup.closed) {
          console.log('[SmartSchedule] Redirigiendo al Registro Académico Extendido...');
          popup.location.href = URL_REGISTRO_EXTENDIDO;
        }
      } catch (e) {
        console.error('Error al redirigir popup:', e);
      }
    }, 4500);

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
 * Parsea texto crudo del Registro Extendido (fallback para pegado manual).
 * 
 * @param {string} textoCrudo - Texto copiado de la página de Registro Extendido
 * @returns {{completed: string[], diagnostics: string[]}}
 */
export function parseRegistroExtendido(textoCrudo) {
  const materiasAprobadas = new Set();
  const diagnosticosAprobados = new Set();

  // Dividir por líneas y procesar cada una
  const lineas = textoCrudo.split('\n');
  
  lineas.forEach(linea => {
    // Extraer Código de Asignatura
    const matchCodigo = linea.match(/(?:DN-)?([A-Z]{2,4}\d{6,12})/i);
    
    if (matchCodigo) {
      const codigoRaw = matchCodigo[0].toUpperCase();

      // Buscar nota Definitiva en la línea
      const matchNota = linea.match(/DEFINITIVA:\s*(\d[.,]\d)/i) || 
                        linea.match(/\b(\d[.,]\d)\b/);
      
      if (matchNota) {
        const nota = parseFloat(matchNota[1].replace(',', '.'));
        
        // Si la nota es >= 3.0, marcar como aprobada
        if (nota >= 3.0) {
          const codigoLimpio = codigoRaw.replace(/^DN-/, '');

          if (codigoRaw.startsWith('DN-')) {
            diagnosticosAprobados.add(codigoRaw);
            diagnosticosAprobados.add(codigoLimpio);
          } else {
            materiasAprobadas.add(codigoLimpio);
          }
        }
      }
    }
  });

  console.log('[SmartSchedule] Materias aprobadas (parseo manual):', Array.from(materiasAprobadas));
  console.log('[SmartSchedule] Diagnósticos aprobados (parseo manual):', Array.from(diagnosticosAprobados));

  return {
    completed: Array.from(materiasAprobadas),
    diagnostics: Array.from(diagnosticosAprobados)
  };
}

/**
 * Script de captura que se ejecuta DENTRO del popup.
 * 
 * Estrategia: Extracción del Registro Académico Extendido
 * 
 * 1. Usuario se autentica con Microsoft/UDEC
 * 2. La ventana padre redirige al Registro Extendido con ?programa=0
 * 3. Este script detecta la tabla de registro académico
 * 4. Extrae códigos de materias con nota Definitiva >= 3.0
 * 5. Normaliza códigos DN- removiendo el prefijo
 * 6. Envía datos via postMessage y cierra el popup
 */
export const CAPTURE_SCRIPT = `
(function() {
  const TIMEOUT_MS = 180000; // 3 minutos (tiempo suficiente para login + navegación)
  const URL_REGISTRO_EXTENDIDO = 'https://plataforma.ucundinamarca.edu.co/ucundinamarca/academusoft/academicoEstudiante/vModern/sistemaEstudiante/calificaciones/registroExtendido/cal_adm_con_not_cra_ver.jsp?programa=0';

  let resolved = false;
  let checkInterval = null;

  function intentarExtraccion() {
    const currentUrl = window.location.href;

    // Solo ejecutar en la página de Registro Extendido
    if (!currentUrl.includes('cal_adm_con_not_cra_ver.jsp')) {
      return false;
    }

    // Buscar dentro de iframes si es necesario
    const targetDocument = buscarEnIframe(window);
    
    // Buscar tabla de registro académico
    const filas = targetDocument.querySelectorAll('table tr');
    
    if (filas.length > 0) {
      console.log('[SmartSchedule] Registro Extendido detectado, extrayendo materias...');
      const datosExtraidos = extraerMateriasAprobadasRegistro(filas);
      
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

  // Verificar periódicamente si la página cambió al Registro Extendido
  checkInterval = setInterval(() => {
    if (intentarExtraccion()) {
      clearInterval(checkInterval);
    }
  }, 1000);

  // Intentar una vez al cargar por si ya está en el Registro Extendido
  intentarExtraccion();

  // ── Extractor del Registro Extendido ───────────────────────────
  function extraerMateriasAprobadasRegistro(filas) {
    const materiasAprobadas = new Set();
    const diagnosticosAprobados = new Set();

    filas.forEach(fila => {
      const texto = fila.innerText || fila.textContent || '';

      // Extraer Código de Asignatura (Ej: CAD612021207, DN-CAI1002020303, CAI1002020201)
      const matchCodigo = texto.match(/(?:DN-)?([A-Z]{2,4}\\d{6,12})/i);

      if (matchCodigo) {
        const codigoRaw = matchCodigo[0].toUpperCase();

        // Buscar columna "Def." (Definitiva) en la tabla
        const columnas = fila.querySelectorAll('td');
        let notaDefinitiva = null;

        columnas.forEach((col, index) => {
          const textoCol = col.innerText || col.textContent || '';
          // Buscar la columna que contiene "Def." o "Definitiva"
          if (textoCol.includes('Def.') || textoCol.includes('Definitiva')) {
            // La nota definitiva está en la siguiente columna
            if (columnas[index + 1]) {
              const notaTexto = columnas[index + 1].innerText || columnas[index + 1].textContent || '';
              const matchNota = notaTexto.match(/(\\d[.,]\\d)/);
              if (matchNota) {
                notaDefinitiva = parseFloat(matchNota[1].replace(',', '.'));
              }
            }
          }
        });

        // Si no se encontró por columna, buscar en el texto completo
        if (notaDefinitiva === null) {
          const notasEncontradas = [...texto.matchAll(/DEFINITIVA:\\s*(\\d[.,]\\d)/gi)]
            .map(match => parseFloat(match[1].replace(',', '.')));
          notaDefinitiva = notasEncontradas[0] || null;
        }

        // Evaluar si está aprobada (nota >= 3.0)
        if (notaDefinitiva !== null && notaDefinitiva >= 3.0) {
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