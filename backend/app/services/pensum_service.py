"""
Servicio para cargar y gestionar la malla curricular (pensum).

Carga el archivo PENSUM_2020_SISTEMAS.json al iniciar el servidor y lo
mantiene en memoria para acceso rápido desde los endpoints.
"""

import json
from pathlib import Path

from app.domain.models import (
    Pensum,
    PensumSubject,
    Diagnostico,
    AcademicPlan,
    PrerequisiteSubject,
    DiagnosticRequirement,
)


class PensumService:
    """
    Servicio singleton que carga y provee acceso al pensum.

    El pensum se carga una sola vez desde el archivo JSON y se
    mantiene en memoria durante toda la vida del servidor.
    """

    _instance: "PensumService | None" = None
    _pensum: Pensum | None = None
    _academic_plan: AcademicPlan | None = None

    def __new__(cls) -> "PensumService":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if self._pensum is None:
            self._pensum, self._academic_plan = self._cargar_pensum()

    @staticmethod
    def _get_data_path() -> Path:
        """
        Obtiene la ruta al archivo PENSUM_2020_SISTEMAS.json.

        Returns:
            Path absoluto al archivo de datos.
        """
        return Path(__file__).parent.parent / "data" / "PENSUM_2020_SISTEMAS.json"

    def _cargar_pensum(self):
        """
        Carga el pensum desde el archivo JSON.

        Returns:
            Tupla (Pensum, AcademicPlan) con los datos cargados.

        Raises:
            FileNotFoundError: Si no se encuentra el archivo JSON.
            json.JSONDecodeError: Si el archivo JSON es inválido.
        """
        data_path = self._get_data_path()

        if not data_path.exists():
            raise FileNotFoundError(
                f"Archivo de pensum no encontrado: {data_path}. "
                "Asegúrate de que backend/app/data/PENSUM_2020_SISTEMAS.json existe."
            )

        with open(data_path, "r", encoding="utf-8") as f:
            raw = json.load(f)

        # ── Pensum (modelo legacy) ──
        materias = [PensumSubject(**m) for m in raw["materias"]]
        diagnosticos = [Diagnostico(**d) for d in raw.get("diagnosticos", [])]

        pensum = Pensum(
            carrera=raw["carrera"],
            codigo_carrera=raw["codigo_carrera"],
            version_pensum=raw["version_pensum"],
            total_creditos=raw["total_creditos"],
            materias=materias,
            diagnosticos=diagnosticos,
        )

        # ── AcademicPlan (nuevo modelo) ──
        subjects = [PrerequisiteSubject(**m) for m in raw["materias"]]
        diagnostics = [DiagnosticRequirement(**d) for d in raw.get("diagnosticos", [])]

        academic_plan = AcademicPlan(
            carrera=raw["carrera"],
            codigo_carrera=raw["codigo_carrera"],
            version_pensum=raw["version_pensum"],
            total_creditos=raw["total_creditos"],
            subjects=subjects,
            diagnostics=diagnostics,
        )

        return pensum, academic_plan

    def get_pensum(self) -> Pensum:
        """Obtiene la malla curricular (modelo legacy Pensum)."""
        if self._pensum is None:
            self._pensum, self._academic_plan = self._cargar_pensum()
        return self._pensum

    def get_academic_plan(self) -> AcademicPlan:
        """Obtiene el plan académico (modelo AcademicPlan)."""
        if self._academic_plan is None:
            self._pensum, self._academic_plan = self._cargar_pensum()
        return self._academic_plan

    def recargar(self):
        """Recarga el pensum desde el archivo JSON."""
        self._pensum, self._academic_plan = self._cargar_pensum()
        return self._pensum