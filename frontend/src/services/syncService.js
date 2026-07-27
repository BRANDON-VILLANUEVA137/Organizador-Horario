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

// URL del portal de Academusoft para consulta de ruta académica
const SYNC_POPUP_URL = "https://academusoft.unicundi.edu.co/con_pen_pen.jsp";
const POPUP_WIDTH = 800;
const POPUP_HEIGHT = 600;
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

      // Validar estructura del mensaje
      if (!event.data || event.data.type !== "STUDENT_PROGRESS") return;

      // Mensaje válido recibido
      clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);

      // Cerrar popup
      if (!popup.closed) popup.close();

      const completed = event.data.completed || [];
      const diagnostics = event.data.diagnostics || [];

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
 * NOTA: Este script debe ser inyectado mediante un proxy ligero o
 * incluido como bookmarklet. No modificamos el código de Academusoft.
 * 
 * Estrategia: Observar el DOM hasta que aparezca la tabla de ruta
 * académica, extraer las materias aprobadas y enviarlas al opener.
 */
export const CAPTURE_SCRIPT = `
(function() {
  const TIMEOUT_MS = 120000; // 2 minutos
  const INTERVALO_MS = 1000;

  let resolved = false;

  function extraerMateriasAprobadas() {
    if (resolved) return;
    
    // Buscar tabla de ruta académica (varios selectores posibles)
    const tablaRuta = document.querySelector(
      'table[class*="ruta"], ' +
      'table[class*="academica"], ' +
      'table[class*="pensum"], ' +
      'table[class*="materia"], ' +
      '#tablaRuta, ' +
      '.tablaRuta'
    );
    
    if (!tablaRuta) return false;

    resolved = true;
    observer.disconnect();

    const filas = tablaRuta.querySelectorAll("tr");
    const materiasAprobadas = [];
    const diagnosticosAprobados = [];

    filas.forEach(fila => {
      const celdas = fila.querySelectorAll("td");
      celdas.forEach(celda => {
        const texto = celda.textContent.trim();
        
        // Buscar códigos de materia (ej: CAD612021102, DN-CAI10020202)
        const matchMateria = texto.match(/[A-Z]{2,4}\d{10,12}/);
        const matchDiagnostico = texto.match(/DN-[A-Z]{3,4}\d{6,10}/);
        
        if (matchMateria || matchDiagnostico) {
          const codigo = (matchMateria || matchDiagnostico)[0];
          
          // Verificar si la celda indica "Aprobada"
          const estaAprobada = 
            celda.classList.contains("aprobada") ||
            celda.classList.contains("approved") ||
            celda.querySelector(".estado-aprobado, .approved, .aprobado") ||
            celda.style.color === "green" ||
            celda.textContent.includes("APROBADA") ||
            celda.textContent.includes("Aprobada");
            
          if (estaAprobada) {
            if (codigo.startsWith("DN-")) {
              diagnosticosAprobados.push(codigo);
            } else {
              materiasAprobadas.push(codigo);
            }
          }
        }
      });
    });

    // Enviar al opener
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({
        type: "STUDENT_PROGRESS",
        completed: [...new Set(materiasAprobadas)],
        diagnostics: [...new Set(diagnosticosAprobados)]
      }, "*");
    }
    
    return true;
  }

  // Observer para detectar cuando la tabla se carga en el DOM
  const observer = new MutationObserver(() => {
    extraerMateriasAprobadas();
  });
  
  observer.observe(document.body, { 
    childList: true, 
    subtree: true 
  });

  // También intentar inmediatamente por si ya está cargada
  extraerMateriasAprobadas();

  // Timeout de seguridad
  setTimeout(() => {
    observer.disconnect();
    if (!resolved && window.opener && !window.opener.closed) {
      window.opener.postMessage({
        type: "STUDENT_PROGRESS",
        completed: [],
        diagnostics: [],
        timeout: true
      }, "*");
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