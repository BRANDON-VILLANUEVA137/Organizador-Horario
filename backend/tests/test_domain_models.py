from datetime import time

import pytest
from pydantic import ValidationError

from app.domain.models import (
    AcademicProgram,
    Campus,
    CourseGroup,
    Subject,
    TimeBlock,
    University,
    Weekday,
)


def test_academic_entities_can_be_composed() -> None:
    university = University(
        code="uni-demo",
        name="Universidad Demo",
        portal_url="https://example.edu/horarios",
    )
    campus = Campus(code="main", name="Sede principal", university_code=university.code)
    program = AcademicProgram(code="systems", name="Ingenieria de Sistemas", campus_code=campus.code)
    subject = Subject(code="MAT-101", name="Calculo I", program_code=program.code, credits=3)

    group = CourseGroup(
        code="MAT-101-01",
        subject_code=subject.code,
        subject_name=subject.name,
        credits=subject.credits,
        blocks=[
            TimeBlock(
                weekday=Weekday.MONDAY,
                starts_at=time(7, 0),
                ends_at=time(9, 0),
            )
        ],
    )

    assert group.blocks[0].weekday is Weekday.MONDAY
    assert group.subject_code == subject.code


def test_time_block_rejects_empty_or_inverted_intervals() -> None:
    with pytest.raises(ValidationError):
        TimeBlock(weekday=Weekday.TUESDAY, starts_at=time(10), ends_at=time(10))

    with pytest.raises(ValidationError):
        TimeBlock(weekday=Weekday.TUESDAY, starts_at=time(12), ends_at=time(10))
