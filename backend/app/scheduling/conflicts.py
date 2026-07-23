from app.domain.models import CourseGroup, TimeBlock


def blocks_overlap(first: TimeBlock, second: TimeBlock) -> bool:
    if first.weekday != second.weekday:
        return False

    return first.starts_at < second.ends_at and second.starts_at < first.ends_at


def groups_conflict(first: CourseGroup, second: CourseGroup) -> bool:
    return any(
        blocks_overlap(first_block, second_block)
        for first_block in first.blocks
        for second_block in second.blocks
    )


def schedule_has_conflicts(groups: list[CourseGroup]) -> bool:
    return any(
        groups_conflict(first, second)
        for index, first in enumerate(groups)
        for second in groups[index + 1 :]
    )
