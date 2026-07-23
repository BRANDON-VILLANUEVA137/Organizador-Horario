"""Tests para el normalizador de la Universidad de Cundinamarca."""

import pytest
from datetime import time

from app.normalizers.cundinamarca_normalizer import (
    _parse_time,
    _parse_weekday,
    _infer_headers,
    normalize_table,
)
from app.domain.models import Weekday


class TestParseTime:
    def test_1600_returns_time_16_00(self) -> None:
        assert _parse_time("1600") == time(16, 0)

    def test_07_30_returns_time_7_30(self) -> None:
        assert _parse_time("07:30") == time(7, 30)

    def test_600_returns_time_6_00(self) -> None:
        assert _parse_time("600") == time(6, 0)

    def test_invalid_format_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            _parse_time("abc")


class TestParseWeekday:
    def test_miercoles_returns_wednesday(self) -> None:
        assert _parse_weekday("MIERCOLES") == Weekday.WEDNESDAY

    def test_lunes_returns_monday(self) -> None:
        assert _parse_weekday("LUNES") == Weekday.MONDAY

    def test_jueves_returns_thursday(self) -> None:
        assert _parse_weekday("JUEVES") == Weekday.THURSDAY

    def test_case_insensitive(self) -> None:
        assert _parse_weekday("viernes") == Weekday.FRIDAY

    def test_invalid_weekday_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            _parse_weekday("INVALIDO")


class TestInferHeaders:
    def test_typical_headers(self) -> None:
        headers = [
            "Código",
            "Materia",
            "Grupo",
            "Día",
            "Hora Inicio",
            "Hora Fin",
            "Aula",
            "Profesor",
            "Créditos",
        ]
        col = _infer_headers(headers)
        assert col["code"] == 0
        assert col["subject"] == 1
        assert col["group"] == 2
        assert col["day"] == 3
        assert col["start"] == 4
        assert col["end"] == 5
        assert col["classroom"] == 6
        assert col["teacher"] == 7
        assert col["credits"] == 8

    def test_minimal_headers(self) -> None:
        headers = ["COD", "ASIGNATURA", "GRUPO", "DIA", "INICIO", "FIN"]
        col = _infer_headers(headers)
        assert col["code"] == 0
        assert col["subject"] == 1
        assert col["group"] == 2
        assert col["day"] == 3
        assert col["start"] == 4
        assert col["end"] == 5

    def test_missing_required_header_raises_error(self) -> None:
        headers = ["Código", "Nombre"]
        with pytest.raises(ValueError, match="No se encontraron las columnas requeridas"):
            normalize_table(headers, [["A", "B"]])


class TestNormalizeTable:
    def test_simple_rows(self) -> None:
        headers = ["Código", "Materia", "Grupo", "Día", "Hora Inicio", "Hora Fin"]
        rows = [
            ["MAT101", "Matematicas", "01", "LUNES", "0700", "0859"],
            ["MAT101", "", "", "MIERCOLES", "0900", "1059"],
            ["FIS101", "Fisica", "01", "MARTES", "1400", "1559"],
        ]
        groups = normalize_table(headers, rows)
        assert len(groups) == 2

        # Primer grupo: MAT101-01 con 2 bloques
        mat_group = [g for g in groups if g.subject_code == "MAT101"][0]
        assert mat_group.subject_name == "Matematicas"
        assert len(mat_group.blocks) == 2
        assert mat_group.blocks[0].weekday == Weekday.MONDAY
        assert mat_group.blocks[0].starts_at == time(7, 0)
        assert mat_group.blocks[1].weekday == Weekday.WEDNESDAY

        # Segundo grupo: FIS101-01 con 1 bloque
        fis_group = [g for g in groups if g.subject_code == "FIS101"][0]
        assert fis_group.subject_name == "Fisica"
        assert len(fis_group.blocks) == 1
        assert fis_group.blocks[0].weekday == Weekday.TUESDAY

    def test_rowspan_handling(self) -> None:
        """Simula el caso real donde una materia se repite en varias filas."""
        headers = ["Código", "Materia", "Grupo", "Día", "Hora Inicio", "Hora Fin"]
        rows = [
            ["CAD102020104", "CONTABILIDAD GENERAL", "101T", "MIERCOLES", "1600", "1759"],
            ["", "", "", "JUEVES", "1400", "1559"],
        ]
        groups = normalize_table(headers, rows)
        assert len(groups) == 1
        group = groups[0]
        assert group.subject_code == "CAD102020104"
        assert group.subject_name == "CONTABILIDAD GENERAL"
        assert group.code == "CAD102020104-101T"
        assert len(group.blocks) == 2
        assert group.blocks[0].weekday == Weekday.WEDNESDAY
        assert group.blocks[1].weekday == Weekday.THURSDAY

    def test_groups_with_same_code_different_group_number(self) -> None:
        headers = ["Código", "Materia", "Grupo", "Día", "Hora Inicio", "Hora Fin"]
        rows = [
            ["MAT101", "Matematicas", "01", "LUNES", "0700", "0859"],
            ["MAT101", "Matematicas", "02", "LUNES", "0900", "1059"],
        ]
        groups = normalize_table(headers, rows)
        assert len(groups) == 2
        codes = {g.code for g in groups}
        assert codes == {"MAT101-01", "MAT101-02"}

    def test_realistic_table(self) -> None:
        """Ejemplo con datos similares a los reales del portal."""
        headers = ["Código", "Materia", "Grupo", "Día", "Hora Inicio", "Hora Fin", "Aula"]
        rows = [
            ["CAD102020104", "CONTABILIDAD GENERAL", "101T", "MIERCOLES", "1600", "1759", "A-101"],
            ["", "", "", "JUEVES", "1400", "1559", ""],
            ["CAD102020201", "MATEMATICAS FINANCIERAS", "101T", "LUNES", "0700", "0859", "B-202"],
            ["", "", "", "MIERCOLES", "0700", "0859", ""],
            ["CAD102020309", "PRESUPUESTO PUBLICO", "101A", "MARTES", "0900", "1059", "A-101"],
        ]
        groups = normalize_table(headers, rows)
        assert len(groups) == 3

        # Verificar CONTABILIDAD GENERAL
        contabilidad = [g for g in groups if g.subject_code == "CAD102020104"][0]
        assert len(contabilidad.blocks) == 2
        assert contabilidad.classroom == "A-101"

        # Verificar MATEMATICAS FINANCIERAS
        matematicas = [g for g in groups if g.subject_code == "CAD102020201"][0]
        assert len(matematicas.blocks) == 2

        # Verificar PRESUPUESTO PUBLICO
        presupuesto = [g for g in groups if g.subject_code == "CAD102020309"][0]
        assert len(presupuesto.blocks) == 1