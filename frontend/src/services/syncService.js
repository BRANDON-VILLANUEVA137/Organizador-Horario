/**
 * Servicio de sincronizacion de avance academico.
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

import { apiBase } from './api.js'

// URL del portal de Academusoft para inicio de sesion SSO
const SYNC_POPUP_URL = "https://plataforma.ucundinamarca.edu.co/ucundinamarca/hermesoft/vortal/o365/login";
const POPUP_WIDTH = 900;
const POPUP_HEIGHT = 700;

/**
 * Estado actual de la sincronizacion
 */
export const SyncState = {
  IDLE: "idle",
  OPENING: "opening",
  WAITING: "waiting",
  PROCESSING: "processing",
  SUCCESS: "success",
  ERROR: "error",
  BLOCKED: "blocked",
  TIMEOUT: "timeout",
};

let _onStateChange = null;

export function setSyncStateCallback(callback) {
  _onStateChange = callback;
}

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
      reject(new Error("El navegador bloqueo el popup. Permite popups para este sitio e intenta de nuevo."));
      return;
    }

    _notifyState(SyncState.WAITING);
    resolve(true);
  });
}

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
 * Parsea texto crudo del Registro Extendido copiado desde Academusoft UDEC.
 * Normaliza caracteres invisibles (\u00A0) y formato de notas con coma (3,6 -> 3.6).
 * Busca el patron de tabla: CODIGO  NOMBRE  CREDITOS  TIPO  NOTA_FINAL  NOTA_DEFINITIVA
 * Fallback con regex simple si la tabla pierde estructura al pegar.
 */
export function parseAcademicHistoryText(rawText) {
  if (!rawText) return { completed: [], diagnostics: [] };

  // Limpieza de caracteres invisibles (\u00A0) y espacios repetidos
  const cleanText = rawText.replace(/\u00A0/g, ' ').replace(/\r\n/g, '\n');

  const approvedCodes = new Set();
  const approvedDiagnostics = new Set();

  // Expresion regular para capturar Codigo, Asignatura y Definitiva
  // Soporta notas con comas o puntos (3,6 o 3.6)
  const lineRegex = /([A-Z0-9-]+)\s+(.+?)\s+(\d+)\s+(.+?)\s+([\d,.]+)\s+-\s+([\d,.]+)/g;

  let match;
  while ((match = lineRegex.exec(cleanText)) !== null) {
    const code = match[1].trim();
    const finalGradeStr = match[6].replace(',', '.');
    const grade = parseFloat(finalGradeStr);

    if (!isNaN(grade) && grade >= 3.0) {
      if (code.startsWith('DN-')) {
        approvedDiagnostics.add(code);
      } else {
        approvedCodes.add(code);
      }
    }
  }

  // Fallback si la tabla pierde estructura al pegar
  if (approvedCodes.size === 0) {
    const fallbackRegex = /(CAD\d+|CAI\d+)/g;
    const codesFound = cleanText.match(fallbackRegex) || [];
    codesFound.forEach(code => approvedCodes.add(code));
  }

  console.log('[SmartSchedule] Aprobadas (texto):', Array.from(approvedCodes));
  console.log('[SmartSchedule] Diagnosticos:', Array.from(approvedDiagnostics));

  const result = {
    completed: Array.from(approvedCodes),
    diagnostics: Array.from(approvedDiagnostics)
  };

  _notifyState(SyncState.SUCCESS, result);
  return result;
}

function _notifyState(state, data = null) {
  if (_onStateChange) {
    _onStateChange(state, data);
  }
}
