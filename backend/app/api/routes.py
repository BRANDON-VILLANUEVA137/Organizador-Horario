from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse

from datetime import time
from uuid import uuid4
import traceback
import tempfile
import os
import re

from app.domain.models import (
    AcademicPlan,
    CatalogItem,
    CatalogResponse,
    CourseGroup,
    EligibilityResponse,
    ExtractionRequest,
    ExtractionResponse,
    HealthResponse,
    Pensum,
    StudentAcademicState,
    SyncProgressRequest,
    SyncProgressResponse,
    TimeBlock,
    Weekday,
)
from app.extractors.cundinamarca import (
    CundinamarcaExtractor,
    normalize_cundinamarca_portal_url,
)
from app.normalizers.cundinamarca_normalizer import normalize_table
from app.repositories.extractions import (
    list_extraction_ids,
    load_extraction_response,
    save_extraction_response,
)
from app.services.dag_engine import DAGEngine
from app.services.pensum_service import PensumService

router = APIRouter()
extractor = CundinamarcaExtractor()
pensum_service = PensumService()


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="smartschedule-api")


@router.get("/extractions", tags=["extractions"])
def list_extractions() -> list[str]:
    """Lista los ids de las extracciones guardadas localmente."""
    return list_extraction_ids()


@router.get("/extractions/{extraction_id}", response_model=ExtractionResponse, tags=["extractions"])
def get_extraction(extraction_id: str) -> ExtractionResponse:
    """Carga una extracción guardada por su id."""
    response = load_extraction_response(extraction_id)
    if response is None:
        raise HTTPException(
            status_code=404,
            detail=f"Extracción '{extraction_id}' no encontrada.",
        )
    return response


@router.get("/catalog", response_model=CatalogResponse, tags=["catalog"])
def get_catalog() -> CatalogResponse:
    """
    Descubre las sedes y programas disponibles en el portal
    de la Universidad de Cundinamarca usando Playwright.
    """
    try:
        catalog = extractor.discover_catalog()
        return CatalogResponse(
            university="Universidad de Cundinamarca",
            campuses=[
                CatalogItem(value=c.value, label=c.label) for c in catalog.campuses
            ],
            programs_by_campus={
                campus_key: [
                    CatalogItem(value=p.value, label=p.label)
                    for p in programs
                ]
                for campus_key, programs in catalog.programs_by_campus.items()
            },
        )
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo obtener el catálogo del portal: {exc}",
        )


@router.post("/extractions", response_model=ExtractionResponse, tags=["extractions"])
def create_extraction(request: ExtractionRequest) -> ExtractionResponse:
    """
    Ejecuta la extracción de horarios.

    Si la universidad es 'Universidad de Cundinamarca' y se proporcionan
    campus_code y program_code, usa el extractor real con Playwright.
    De lo contrario, devuelve datos demo.
    """
    # --- Extracción real con Playwright ---
    if (
        request.university == "Universidad de Cundinamarca"
        and request.campus_code
        and request.program_code
    ):
        # Forzar el entrypoint correcto del frameset; otras URLs del portal
        # no cargan #sede_sel y terminan en 502 "schedule form frame was not found".
        portal_url = normalize_cundinamarca_portal_url(str(request.portal_url))
        try:
            tables = extractor.query_schedule(
                campus_value=request.campus_code,
                program_value=request.program_code,
                portal_url=portal_url,
            )
        except Exception as exc:
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=502,
                detail=f"Error al ejecutar el extractor web: {exc}",
            )

        if not tables:
            raise HTTPException(
                status_code=404,
                detail="No se encontraron tablas de horarios en el portal.",
            )

        # Procesar TODAS las tablas para obtener todas las materias
        all_groups: list[CourseGroup] = []
        for idx, table in enumerate(tables):
            try:
                groups = normalize_table(table.headers, table.rows)
                print(f"[DEBUG] Tabla {idx}: {len(table.rows)} filas, {len(groups)} grupos normalizados")
                all_groups.extend(groups)
            except ValueError as exc:
                print(f"[DEBUG] Tabla {idx} falló: {exc}")
                continue

        if not all_groups:
            raise HTTPException(
                status_code=422,
                detail="No se pudo normalizar ninguna tabla de horarios.",
            )

        response = ExtractionResponse(
            extraction_id=str(uuid4()),
            portal_url=request.portal_url,
            university=request.university,
            groups=all_groups,
            source="cundinamarca",
        )
    else:
        # --- Datos demo (fallback) ---
        groups = [
            CourseGroup(
                code="MAT-101-01",
                subject_code="MAT-101",
                subject_name="Calculo I",
                teacher="Laura Gomez",
                classroom="A-204",
                credits=3,
                blocks=[TimeBlock(weekday=Weekday.MONDAY, starts_at=time(7), ends_at=time(9))],
            ),
            CourseGroup(
                code="PRO-101-01",
                subject_code="PRO-101",
                subject_name="Programacion I",
                teacher="Diego Ruiz",
                classroom="Lab-3",
                credits=3,
                blocks=[TimeBlock(weekday=Weekday.TUESDAY, starts_at=time(9), ends_at=time(11))],
            ),
        ]
        response = ExtractionResponse(
            extraction_id=str(uuid4()),
            portal_url=request.portal_url,
            university=request.university,
            groups=groups,
            source="demo",
        )

    try:
        save_extraction_response(response)
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"No se pudo guardar la extracción en JSON local: {exc}",
        )
    return response


# ──────────────────────────────────────────────
# Endpoints de Malla Curricular y Sincronización
# ──────────────────────────────────────────────


@router.get("/pensum", response_model=Pensum, tags=["pensum"])
def get_pensum() -> Pensum:
    """
    Devuelve la malla curricular completa (pensum) de la carrera.

    Carga el archivo PENSUM_2020_SISTEMAS.json y lo retorna como un objeto
    estructurado con todas las materias, créditos, prerrequisitos
    y diagnósticos.
    """
    try:
        return pensum_service.get_pensum()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error al cargar el pensum: {exc}",
        )


@router.post("/sync-progress", response_model=SyncProgressResponse, tags=["sync"])
def sync_student_progress(request: SyncProgressRequest) -> SyncProgressResponse:
    """
    Sincroniza el avance académico del estudiante.

    Recibe los códigos de materias y diagnósticos aprobados, los
    procesa contra la malla curricular usando un Grafo Acíclico
    Dirigido (DAG) y devuelve:

    - Materias habilitadas para el siguiente período.
    - Diagnósticos pendientes que bloquean materias.
    - Materias cursadas con sus detalles.
    - Progreso de carrera (porcentaje de créditos).
    """
    try:
        pensum = pensum_service.get_pensum()
        engine = DAGEngine(pensum)

        habilitadas = engine.calcular_habilitadas(
            request.completed_codes,
            request.diagnostic_completed_codes,
        )

        diagnosticos_pendientes = engine.diagnosticos_pendientes(
            request.completed_codes,
            request.diagnostic_completed_codes,
        )

        materias_cursadas = [
            m for m in pensum.materias if m.codigo in request.completed_codes
        ]

        progreso = engine.calcular_progreso(request.completed_codes)
        creditos_aprob = engine.creditos_aprobados(request.completed_codes)
        creditos_rest = engine.creditos_restantes(request.completed_codes)

        return SyncProgressResponse(
            habilitadas=habilitadas,
            diagnosticos_pendientes=diagnosticos_pendientes,
            materias_cursadas=materias_cursadas,
            progreso_carrera=progreso,
            creditos_aprobados=creditos_aprob,
            creditos_restantes=creditos_rest,
        )

    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error al procesar la sincronización: {exc}",
        )


# ──────────────────────────────────────────────
# Endpoints Académicos (AcademicPlan)
# ──────────────────────────────────────────────


@router.get("/academic/pensum", response_model=AcademicPlan, tags=["academic"])
def get_academic_pensum() -> AcademicPlan:
    """
    Devuelve el plan académico completo (AcademicPlan).

    Retorna la malla curricular con la estructura de PrerequisiteSubject
    y DiagnosticRequirement para ser usada por el frontend.
    """
    try:
        return pensum_service.get_academic_plan()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error al cargar el plan académico: {exc}",
        )


@router.post("/academic/eligibility", response_model=EligibilityResponse, tags=["academic"])
def check_eligibility(state: StudentAcademicState) -> EligibilityResponse:
    """
    Evalúa la elegibilidad de materias según el avance del estudiante.

    Recibe las materias y diagnósticos que el estudiante ha completado
    y devuelve dos listas:

    - **eligible_subjects**: Materias que puede cursar (cumplen requisitos).
    - **blocked_subjects**: Materias bloqueadas con el detalle de qué
      requisitos le faltan (materias y/o diagnósticos).

    Esto permite al frontend mostrar las materias bloqueadas con opacidad
    reducida y un tooltip con el motivo del bloqueo.
    """
    try:
        plan = pensum_service.get_academic_plan()
        engine = DAGEngine(plan)

        eligible, blocked = engine.calcular_elegibilidad(
            state.completed_subjects,
            state.completed_diagnostics,
        )

        progreso = engine.calcular_progreso(state.completed_subjects)
        creditos_aprob = engine.creditos_aprobados(state.completed_subjects)
        creditos_rest = engine.creditos_restantes(state.completed_subjects)

        return EligibilityResponse(
            eligible_subjects=eligible,
            blocked_subjects=blocked,
            progress_percentage=progreso,
            total_credits_approved=creditos_aprob,
            total_credits_remaining=creditos_rest,
        )

    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error al evaluar elegibilidad: {exc}",
        )


@router.post("/academic/parse-pdf", tags=["academic"])
async def parse_pdf(file: UploadFile = File(...)):
    """
    Procesa un archivo PDF del Registro Académico Extendido.
    
    Extrae el texto del PDF usando pdfplumber, parsea las materias
    con nota Definitiva >= 3.0 y devuelve la lista de códigos.
    
    Reglas de extracción:
    - Patrón de códigos: r'\\b(DN-)?(CAD\\d+|CAI\\d+)\\b'
    - Nota Definitiva: último valor numérico de la línea (formato X.X o X,X)
    - Aprobación: nota >= 3.0
    - Diagnósticos: prefijo DN- se remueve, se guarda código base limpio
    - Acumulación: Set para eliminar repetidos
    """
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF")

    completed_subjects = set()
    diagnostics = set()

    # Patrón para detectar códigos UDEC (CAD... / CAI... / DN-...)
    code_pattern = re.compile(r'\b(DN-)?(CAD\d+|CAI\d+)\b')

    try:
        with pdfplumber.open(file.file) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if not text:
                    continue

                for line in text.split('\n'):
                    match = code_pattern.search(line)
                    if match:
                        full_code = match.group(0)
                        base_code = match.group(2)
                        
                        # Extraer notas con formato X.X o X,X
                        scores = re.findall(r'\b\d(?:[\.,]\d)\b', line)
                        
                        if scores:
                            # La nota definitiva suele ser el último valor numérico de la línea
                            raw_def_score = scores[-1].replace(',', '.')
                            try:
                                def_score = float(raw_def_score)
                                if def_score >= 3.0:
                                    completed_subjects.add(base_code)
                                    if full_code.startswith("DN-"):
                                        diagnostics.add(base_code)
                            except ValueError:
                                continue

        return JSONResponse({
            "success": True,
            "total_completed": len(completed_subjects),
            "completed": list(completed_subjects),
            "diagnostics": list(diagnostics)
        })

    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error al procesar el archivo PDF: {str(e)}"
        )
