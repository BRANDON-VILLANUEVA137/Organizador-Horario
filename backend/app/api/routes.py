from fastapi import APIRouter

from datetime import time
from uuid import uuid4

from app.domain.models import (
    CourseGroup,
    ExtractionRequest,
    ExtractionResponse,
    HealthResponse,
    TimeBlock,
    Weekday,
)

router = APIRouter()


@router.get("/health", response_model=HealthResponse, tags=["system"])
def health_check() -> HealthResponse:
    return HealthResponse(status="ok", service="smartschedule-api")


@router.post("/extractions", response_model=ExtractionResponse, tags=["extractions"])
def create_extraction(request: ExtractionRequest) -> ExtractionResponse:
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
    )
