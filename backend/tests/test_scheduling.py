from datetime import time

from app.domain.models import CourseGroup, TimeBlock, Weekday
from app.scheduling.generator import generate_schedules


def make_group(
    code: str,
    subject_code: str,
    starts_at: int,
    ends_at: int,
) -> CourseGroup:
    return CourseGroup(
        code=code,
        subject_code=subject_code,
        subject_name=f"Subject {subject_code}",
        blocks=[
            TimeBlock(
                weekday=Weekday.MONDAY,
                starts_at=time(starts_at),
                ends_at=time(ends_at),
            )
        ],
    )


def test_generator_keeps_only_non_conflicting_combinations() -> None:
    groups = [
        make_group("A-1", "A", 8, 10),
        make_group("A-2", "A", 10, 12),
        make_group("B-1", "B", 9, 11),
        make_group("B-2", "B", 12, 14),
    ]

    schedules = generate_schedules(groups)

    assert [[group.code for group in schedule.groups] for schedule in schedules] == [
        ["A-1", "B-2"],
        ["A-2", "B-2"],
    ]


def test_generator_can_limit_results() -> None:
    groups = [
        make_group("A-1", "A", 8, 9),
        make_group("B-1", "B", 9, 10),
        make_group("C-1", "C", 10, 11),
    ]

    schedules = generate_schedules(groups, max_results=1)

    assert len(schedules) == 1
