from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_check() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_create_extraction_returns_course_groups_demo() -> None:
    """Para universidades sin extractor específico, debe devolver datos demo."""
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


def test_create_extraction_cundinamarca_sin_sede_y_programa() -> None:
    """
    Para Universidad de Cundinamarca sin campus_code ni program_code,
    debe devolver datos demo (porque no se puede ejecutar el extractor real).
    """
    response = client.post(
        "/api/extractions",
        json={
            "portal_url": "https://plataforma.ucundinamarca.edu.co/aplicacionesB/condicionales/apl_gen_public.jsp?id=ConsultaHorario",
            "university": "Universidad de Cundinamarca",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "demo"


def test_get_catalog() -> None:
    """
    GET /api/catalog intenta ejecutar Playwright.
    Si hay navegador disponible, devuelve 200 con el catálogo.
    Si no, devuelve 500 con mensaje de error.
    """
    response = client.get("/api/catalog")
    if response.status_code == 200:
        body = response.json()
        assert body["university"] == "Universidad de Cundinamarca"
        assert "campuses" in body
        assert "programs_by_campus" in body
    else:
        assert response.status_code == 500
        assert "No se pudo obtener el catálogo" in response.json()["detail"]
