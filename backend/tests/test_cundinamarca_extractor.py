from app.extractors.cundinamarca import (
    PUBLIC_SCHEDULE_URL,
    normalize_cundinamarca_portal_url,
)


def test_normalize_keeps_canonical_entrypoint() -> None:
    assert normalize_cundinamarca_portal_url(PUBLIC_SCHEDULE_URL) == PUBLIC_SCHEDULE_URL


def test_normalize_rewrites_inicio_seguro() -> None:
    raw = (
        "https://plataforma.ucundinamarca.edu.co/aplicacionesB/condicionales/"
        "inicioSeguro.jsp"
    )
    assert normalize_cundinamarca_portal_url(raw) == PUBLIC_SCHEDULE_URL


def test_normalize_rewrites_pub_rep_val_direct() -> None:
    raw = (
        "https://plataforma.ucundinamarca.edu.co/aplicacionesB/condicionales/"
        "pub_rep_val.jsp"
    )
    assert normalize_cundinamarca_portal_url(raw) == PUBLIC_SCHEDULE_URL


def test_normalize_rewrites_portal_root() -> None:
    raw = "https://plataforma.ucundinamarca.edu.co/"
    assert normalize_cundinamarca_portal_url(raw) == PUBLIC_SCHEDULE_URL


def test_normalize_none_defaults_to_public_url() -> None:
    assert normalize_cundinamarca_portal_url(None) == PUBLIC_SCHEDULE_URL


def test_normalize_leaves_unrelated_urls() -> None:
    raw = "https://example.edu/horarios"
    assert normalize_cundinamarca_portal_url(raw) == raw
