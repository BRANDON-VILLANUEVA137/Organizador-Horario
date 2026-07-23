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
