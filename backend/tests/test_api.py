from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_create_extraction_returns_course_groups() -> None:
    response = client.post(
        "/api/extractions",
        json={
            "portal_url": "https://example.edu/horarios",
            "university": "Universidad Demo",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "demo"
    assert body["portal_url"] == "https://example.edu/horarios"
    assert {group["subject_code"] for group in body["groups"]} == {"MAT-101", "PRO-101"}


def test_create_extraction_rejects_invalid_portal_url() -> None:
    response = client.post(
        "/api/extractions",
        json={"portal_url": "not-a-url"},
    )

    assert response.status_code == 422
