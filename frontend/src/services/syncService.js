/**
 * Servicio de sincronización de avance académico.
 * 
 * Abre un popup hacia Academusoft para guiar al usuario paso a paso
 * hasta el Registro Extendido. Luego proporciona opciones de ingesta:
 * - Arrastrar PDF (procesado por FastAPI con pdfplumber)
 * - Pegar texto copiado (parseado con regex en frontend)
 * 
 * Flujo:
 * 1. Usuario hace clic en "Sincronizar mi avance"
 * 2. Se abre popup hacia o365/login + se muestran instrucciones
 * 3. Usuario navega manualmente hasta Registro Extendido
 * 4. Guarda PDF o copia el texto (Ctrl+A, Ctrl+C)
 * 5. Arrastra el PDF o pega el texto en la zona de carga
 * 6. SmartSchedule procesa y actualiza elegibilidad
 */

import { checkEligibility, apiBase } from './api.js'

// URL del portal de Academusoft para inicio de sesión SSO
const SYNC_POPUP_URL = "https://plataforma.ucundinamarca.edu.co/ucundinamarca/hermesoft/vortal/o365/login";
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
  PROCESSING: "processing", // Procesando datos (PDF/texto)
  SUCCESS: "success",       // Sincronización exitosa
  ERROR: "error",           // Error
  BLOCKED: "blocked",       // Popup bloqueado por el navegador
  TIMEOUT: "timeout",       // Tiempo de espera agotado
};

let _onStateChange = null;

/**
 * Registra un callback para cambios de estado de sincronización.
 */
export function setSyncStateCallback(callback) {
  _onStateChange = callback;
}

/**
 * Abre el popup de sincronización hacia Academusoft.
 */
export function openSyncPopup() {
  return new Promise((resolve, reject) => {
    _notifyState(SyncState.OPENING);

    const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
    const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;

    const popup = window.open(
      SYNC_POPUP_URL,
      "syncPopup",
      `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},scrollbars=yes`
    );

    if (!popup || popup.closed) {
      _notifyState(SyncState.BLOCKED);
      reject(new Error("El navegador bloqueó el popup. Permite popups para este sitio e intenta de nuevo."));
      return;
    }

    _notifyState(SyncState.WAITING);
    resolve(true);
  });
}

/**
 * Procesa un archivo PDF subido (envía a FastAPI para extraer texto).
 * 
 * @param {File} file - Archivo PDF del Registro Extendido
 * @returns {Promise<{completed: string[], diagnostics: string[]}>}
 */
export async function processPdfFile(file) {
  _notifyState(SyncState.PROCESSING);

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${apiBase}/academic/parse-pdf`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Error al procesar el PDF');
  }

  const data = await response.json();
  _notifyState(SyncState.SUCCESS, data);
  return data;
}

/**
 * Parsea texto crudo del Registro Extendido (pegado manual).
 * 
 * @param {string} textoCrudo - Texto copiado de la página de Registro Extendido
 * @returns {{completed: string[], diagnostics: string[]}}
 */
export function parseRegistroExtendido(textoCrudo) {
  const materiasAprobadas = new Set();
  const diagnosticosAprobados = new Set();

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
  console.log('[SmartSchedule] Diagnósticos aprobados:', Array.from(diagnosticosAprobados));

  const result = {
    completed: Array.from(materiasAprobadas),
    diagnostics: Array.from(diagnosticosAprobados)
  };

  _notifyState(SyncState.SUCCESS, result);
  return result;
}

// ── Helpers internos ──────────────────────────────────────────

function _notifyState(state, data = null) {
  if (_onStateChange) {
    _onStateChange(state, data);
  }
}