# TODO: Integración Parser PDF + Motor DAG + Limpieza de UI

## Paso 1: Modificar `designer.js`
- [x] Agregar `let completedSubjectsCache = null`
- [x] Agregar función `setCompletedSubjects(subjects)`
- [x] Agregar función `getCompletedSubjects()`
- [x] Modificar `renderDesignerSubjects()` para ocultar materias completadas
- [x] Exportar nuevas funciones

## Paso 2: Modificar `app.js`
- [x] Importar `setCompletedSubjects` desde designer.js
- [x] En `handlePdfUpload()`: llamar `setCompletedSubjects(syncData.completed)`
- [x] En `handleManualSync()`: llamar `setCompletedSubjects(syncData.completed)`
- [x] En `restartApp()`: limpiar cache con `setCompletedSubjects(null)`

## Paso 3: Verificar flujo completo
- [x] Código implementado y listo para pruebas
- [ ] Probar: subir PDF → parsear → elegibilidad → diseñador filtrado
- [ ] Confirmar que materias completadas no aparecen en vista
- [ ] Confirmar que combinaciones solo usan materias elegibles

