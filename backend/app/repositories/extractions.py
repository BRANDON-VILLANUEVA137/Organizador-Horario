from __future__ import annotations

import json
from pathlib import Path

from app.domain.models import ExtractionResponse


DEFAULT_EXTRACTIONS_DIR = Path(__file__).resolve().parents[3] / "data" / "extractions"


def save_extraction_response(
    response: ExtractionResponse,
    base_dir: Path | None = None,
) -> Path:
    """Guarda la extracción como JSON local en data/extractions/{id}.json."""
    target_dir = base_dir or DEFAULT_EXTRACTIONS_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    target_path = target_dir / f"{response.extraction_id}.json"
    payload = response.model_dump(mode="json")
    target_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return target_path


def load_extraction_response(
    extraction_id: str,
    base_dir: Path | None = None,
) -> ExtractionResponse | None:
    """Carga una extracción guardada por su id. Devuelve None si no existe."""
    target_dir = base_dir or DEFAULT_EXTRACTIONS_DIR
    target_path = target_dir / f"{extraction_id}.json"
    if not target_path.exists():
        return None
    payload = json.loads(target_path.read_text(encoding="utf-8"))
    return ExtractionResponse.model_validate(payload)


def list_extraction_ids(base_dir: Path | None = None) -> list[str]:
    """Lista los ids de todas las extracciones guardadas (sin extensión)."""
    target_dir = base_dir or DEFAULT_EXTRACTIONS_DIR
    if not target_dir.exists():
        return []
    return sorted(
        p.stem for p in target_dir.glob("*.json") if p.is_file()
    )
