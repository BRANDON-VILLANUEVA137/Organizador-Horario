from datetime import time
from enum import IntEnum

from pydantic import BaseModel, Field


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


class CourseGroup(BaseModel):
    code: str
    subject: str
    teacher: str | None = None
    classroom: str | None = None
    credits: int = Field(default=0, ge=0)
    blocks: list[TimeBlock] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    service: str
