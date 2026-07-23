from itertools import product

from app.domain.models import CourseGroup, GeneratedSchedule, SchedulePreferences
from app.scheduling.conflicts import schedule_has_conflicts


def generate_schedules(
    groups: list[CourseGroup],
    preferences: SchedulePreferences | None = None,
    max_results: int | None = None,
) -> list[GeneratedSchedule]:
    groups_by_subject: dict[str, list[CourseGroup]] = {}
    for group in groups:
        groups_by_subject.setdefault(group.subject_code, []).append(group)

    if not groups_by_subject:
        return []

    selected_preferences = preferences or SchedulePreferences()
    schedules: list[GeneratedSchedule] = []

    for combination in product(*groups_by_subject.values()):
        selected_groups = list(combination)
        if schedule_has_conflicts(selected_groups):
            continue

        schedules.append(
            GeneratedSchedule(
                groups=selected_groups,
                preferences=selected_preferences,
            )
        )
        if max_results is not None and len(schedules) >= max_results:
            break

    return schedules
