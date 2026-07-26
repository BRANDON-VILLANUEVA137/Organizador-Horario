from datetime import time
from enum import IntEnum

from pydantic import AnyHttpUrl, BaseModel, Field, model_validator


class Weekday(IntEnum):
    MONDAY = 0
    TUESDAY = 1
    WEDNESDAY = 2
    THURSDAY = 3
    FRIDAY = 4
    SATURDAY = 5
    SUNDAY = 6


class TimeBlock(BaseModel):
    weekday: Weekday
    starts_at: time
    ends_at: time

    @model_validator(mode="after")
    def validate_interval(self) -> "TimeBlock":
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be later than starts_at")
        return self


class University(BaseModel):
    code: str = Field(min_length=2)
    name: str = Field(min_length=2)
    portal_url: str


class Campus(BaseModel):
    code: str = Field(min_length=1)
    name: str = Field(min_length=2)
    university_code: str


class AcademicProgram(BaseModel):
    code: str = Field(min_length=1)
    name: str = Field(min_length=2)
    campus_code: str


class AcademicTerm(BaseModel):
    code: str = Field(min_length=1)
    name: str = Field(min_length=2)
    program_code: str


class Subject(BaseModel):
    code: str = Field(min_length=1)
    name: str = Field(min_length=2)
    credits: int = Field(default=0, ge=0)
    program_code: str


class CourseGroup(BaseModel):
    code: str
    subject_code: str
    subject_name: str
    teacher: str | None = None
    classroom: str | None = None
    credits: int = Field(default=0, ge=0)
    semester: str | None = None
    blocks: list[TimeBlock] = Field(default_factory=list)


class SchedulePreferences(BaseModel):
    avoid_fridays: bool = False
    prefer_morning: bool = False
    prefer_afternoon: bool = False
    maximize_free_days: bool = False
    max_daily_hours: int | None = Field(default=None, ge=1, le=24)


class GeneratedSchedule(BaseModel):
    groups: list[CourseGroup] = Field(default_factory=list)
    score: float = 0
    preferences: SchedulePreferences = Field(default_factory=SchedulePreferences)


class ExtractionRequest(BaseModel):
    portal_url: AnyHttpUrl
    university: str | None = None
    campus_code: str | None = None
    program_code: str | None = None


class ExtractionResponse(BaseModel):
    extraction_id: str
    portal_url: AnyHttpUrl
    university: str | None = None
    groups: list[CourseGroup] = Field(default_factory=list)
    source: str = "demo"


class CatalogItem(BaseModel):
    value: str
    label: str


class CatalogResponse(BaseModel):
    university: str
    campuses: list[CatalogItem] = Field(default_factory=list)
    programs_by_campus: dict[str, list[CatalogItem]] = Field(default_factory=dict)


class HealthResponse(BaseModel):
    status: str
    service: str


# ──────────────────────────────────────────────
# Modelos para Malla Curricular (Pensum / AcademicPlan)
# ──────────────────────────────────────────────


class PensumSubject(BaseModel):
    """Materia en el pensum (malla curricular)"""
    codigo: str
    nombre: str
    creditos: int = 0
    periodo: int = 0
    requisitos: list[str] = []
    diagnosticos: list[str] = []
    correquisitos: list[str] = []
    tipo: str = "obligatoria"
    area: str | None = None


class Diagnostico(BaseModel):
    """Diagnóstico que puede bloquear materias"""
    codigo: str
    nombre: str
    obligatorio_para: list[str] = []


class Pensum(BaseModel):
    """Malla curricular completa de una carrera"""
    carrera: str
    codigo_carrera: str
    version_pensum: str
    total_creditos: int
    materias: list[PensumSubject]
    diagnosticos: list[Diagnostico] = []


class SyncProgressRequest(BaseModel):
    """Solicitud de sincronización de avance académico"""
    completed_codes: list[str]
    diagnostic_completed_codes: list[str] = []


class SyncProgressResponse(BaseModel):
    """Respuesta con materias habilitadas y progreso de carrera"""
    habilitadas: list[PensumSubject]
    diagnosticos_pendientes: list[Diagnostico]
    materias_cursadas: list[PensumSubject]
    progreso_carrera: float = 0.0
    creditos_aprobados: int = 0
    creditos_restantes: int = 0


# ──────────────────────────────────────────────
# Modelos para AcademicPlan (Nuevos esquemas)
# ──────────────────────────────────────────────


class PrerequisiteSubject(BaseModel):
    """Materia dentro del plan académico (AcademicPlan)"""
    codigo: str
    nombre: str
    creditos: int = 0
    periodo: int = 0
    requisitos: list[str] = Field(default_factory=list)
    diagnosticos: list[str] = Field(default_factory=list)
    correquisitos: list[str] = Field(default_factory=list)
    tipo: str = "obligatoria"


class DiagnosticRequirement(BaseModel):
    """Requisito diagnóstico del plan académico"""
    codigo: str
    nombre: str
    obligatorio_para: list[str] = Field(default_factory=list)


class AcademicPlan(BaseModel):
    """Plan académico completo (malla curricular)"""
    carrera: str
    codigo_carrera: str
    version_pensum: str
    total_creditos: int
    subjects: list[PrerequisiteSubject]
    diagnostics: list[DiagnosticRequirement] = Field(default_factory=list)


class StudentAcademicState(BaseModel):
    """Estado académico actual del estudiante enviado desde el frontend"""
    completed_subjects: list[str] = Field(default_factory=list)
    completed_diagnostics: list[str] = Field(default_factory=list)


class SubjectEligibility(BaseModel):
    """Resultado de elegibilidad para una materia"""
    codigo: str
    nombre: str
    creditos: int
    periodo: int
    tipo: str
    eligible: bool
    reason: str | None = None
    missing_requirements: list[str] = Field(default_factory=list)
    missing_diagnostics: list[str] = Field(default_factory=list)


class EligibilityResponse(BaseModel):
    """Respuesta del endpoint de elegibilidad"""
    eligible_subjects: list[SubjectEligibility]
    blocked_subjects: list[SubjectEligibility]
    progress_percentage: float = 0.0
    total_credits_approved: int = 0
    total_credits_remaining: int = 0