from fastapi import APIRouter, HTTPException

from datetime import time
from uuid import uuid4

from app.domain.models import (
    CatalogItem,
    CatalogResponse,
    CourseGroup,
    ExtractionRequest,
    ExtractionResponse,
    HealthResponse,
    TimeBlock,
    Weekday,
)
from app.extractors.cundinamarca import CundinamarcaExtractor, PUBLIC_SCHEDULE_URL
from app.normalizers.cundinamarca_normalizer import normalize_table

router = APIRouter()
extractor = CundinamarcaExtractor()


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="smartschedule-api")


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
        try:
            tables = extractor.query_schedule(
                campus_value=request.campus_code,
                program_value=request.program_code,
                portal_url=str(request.portal_url),
            )
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Error al ejecutar el extractor web: {exc}",
            )

        if not tables:
            raise HTTPException(
                status_code=404,
                detail="No se encontraron tablas de horarios en el portal.",
            )

        # Usar la primera tabla que tenga datos
        table = tables[0]
        try:
            groups = normalize_table(table.headers, table.rows)
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Error al normalizar la tabla extraída: {exc}",
            )

        return ExtractionResponse(
            extraction_id=str(uuid4()),
            portal_url=request.portal_url,
            university=request.university,
            groups=groups,
            source="cundinamarca",
        )

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
    return ExtractionResponse(
        extraction_id=str(uuid4()),
        portal_url=request.portal_url,
        university=request.university,
        groups=groups,
        source="demo",
    )