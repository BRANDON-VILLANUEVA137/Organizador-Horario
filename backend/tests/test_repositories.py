from datetime import time

from app.domain.models import CourseGroup, ExtractionResponse, TimeBlock, Weekday
from app.repositories.extractions import (
    list_extraction_ids,
    load_extraction_response,
    save_extraction_response,
)


def _sample_response(extraction_id: str = "extract-001") -> ExtractionResponse:
    return ExtractionResponse(
        extraction_id=extraction_id,
        portal_url="https://example.edu/horarios",
        university="Universidad Demo",
        source="demo",
        groups=[
            CourseGroup(
                code="MAT-101-01",
                subject_code="MAT-101",
                subject_name="Calculo I",
                credits=3,
                semester="1",
                blocks=[
                    TimeBlock(
                        weekday=Weekday.MONDAY,
                        starts_at=time(7, 0),
                        ends_at=time(9, 0),
                    )
                ],
            )
        ],
    )


def test_save_extraction_response_writes_json_file(tmp_path) -> None:
    response = _sample_response()

    saved_path = save_extraction_response(response, base_dir=tmp_path)

    assert saved_path.exists()
    assert saved_path.name == "extract-001.json"
    assert saved_path.read_text(encoding="utf-8").startswith("{")


def test_load_extraction_response_roundtrip(tmp_path) -> None:
    response = _sample_response("roundtrip-001")
    save_extraction_response(response, base_dir=tmp_path)

    loaded = load_extraction_response("roundtrip-001", base_dir=tmp_path)

    assert loaded is not None
    assert loaded.extraction_id == "roundtrip-001"
    assert loaded.groups[0].subject_code == "MAT-101"
    assert loaded.groups[0].semester == "1"


def test_load_extraction_response_missing_returns_none(tmp_path) -> None:
    assert load_extraction_response("no-existe", base_dir=tmp_path) is None


def test_list_extraction_ids_returns_sorted_stems(tmp_path) -> None:
    save_extraction_response(_sample_response("b-id"), base_dir=tmp_path)
    save_extraction_response(_sample_response("a-id"), base_dir=tmp_path)

    ids = list_extraction_ids(base_dir=tmp_path)

    assert ids == ["a-id", "b-id"]
