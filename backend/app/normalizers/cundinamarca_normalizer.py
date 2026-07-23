"""
Normalizador para la tabla de horarios de la Universidad de Cundinamarca.

El portal devuelve tablas HTML donde cada grupo puede ocupar varias filas
(una por día) usando rowspan. Este módulo reconstruye los grupos completos
con todos sus bloques horarios y los convierte en CourseGroup.
"""

import re
from datetime import time

from app.domain.models import CourseGroup, TimeBlock, Weekday

# Mapeo de nombres de días en español a enum Weekday
SPANISH_WEEKDAYS: dict[str, Weekday] = {
    "LUNES": Weekday.MONDAY,
    "MARTES": Weekday.TUESDAY,
    "MIERCOLES": Weekday.WEDNESDAY,
    "JUEVES": Weekday.THURSDAY,
    "VIERNES": Weekday.FRIDAY,
    "SABADO": Weekday.SATURDAY,
    "DOMINGO": Weekday.SUNDAY,
}


def _parse_time(value: str) -> time:
    """Convierte '1600', '600', '07:30' a objeto time."""
    cleaned = value.strip()
    if ":" in cleaned:
        parts = cleaned.split(":")
        return time(hour=int(parts[0]), minute=int(parts[1]))
    if cleaned.isdigit():
        # Manejar formatos de 3 o 4 dígitos: "600" -> 06:00, "1600" -> 16:00
        padded = cleaned.zfill(4)
        return time(hour=int(padded[:2]), minute=int(padded[2:]))
    raise ValueError(f"No se pudo interpretar la hora: {value!r}")


def _parse_weekday(value: str) -> Weekday:
    """Convierte 'MIERCOLES' a Weekday.WEDNESDAY."""
    key = value.strip().upper()
    if key not in SPANISH_WEEKDAYS:
        raise ValueError(f"Día de semana no reconocido: {value!r}")
    return SPANISH_WEEKDAYS[key]


def _clean_cell(text: str) -> str:
    """Limpia un texto de celda (espacios, saltos de línea)."""
    return re.sub(r"\s+", " ", text.strip())


def _infer_headers(headers: list[str]) -> dict[str, int]:
    """
    Infiere el índice de cada columna según el nombre del encabezado.
    Retorna un dict: {nombre_columna: índice}.
    """
    h_lower = [h.strip().upper() for h in headers]
    mapping: dict[str, int] = {}
    for i, h in enumerate(h_lower):
        if "CODIGO" in h or "CÓDIGO" in h or "COD" in h:
            mapping["code"] = i
        elif "MATERIA" in h or "ASIGNATURA" in h or "NOMBRE" in h:
            mapping["subject"] = i
        elif "GRUPO" in h:
            mapping["group"] = i
        elif "DIA" in h or "DÍA" in h:
            mapping["day"] = i
        elif "HORA INICIO" in h or "INICIO" in h or "HORA I" in h:
            mapping["start"] = i
        elif "HORA FIN" in h or "FIN" in h or "HORA F" in h:
            mapping["end"] = i
        elif "AULA" in h or "SALON" in h or "SALÓN" in h:
            mapping["classroom"] = i
        elif "PROFESOR" in h or "DOCENTE" in h:
            mapping["teacher"] = i
        elif "CREDITO" in h or "CRÉDITO" in h or "CRED" in h:
            mapping["credits"] = i
    return mapping


def normalize_table(headers: list[str], rows: list[list[str]]) -> list[CourseGroup]:
    """
    Convierte las filas extraídas del portal en una lista de CourseGroup.

    Maneja rowspan: si una fila no tiene código/materia/grupo, esos valores
    se heredan de la fila anterior (mismo grupo, día diferente).
    """
    col = _infer_headers(headers)

    # Verificar columnas mínimas requeridas
    required = {"code", "subject", "group", "day", "start", "end"}
    missing = required - set(col.keys())
    if missing:
        raise ValueError(
            f"No se encontraron las columnas requeridas en los encabezados: "
            f"{missing}. Encabezados disponibles: {headers}"
        )

    # Agrupar filas por grupo: cada grupo puede tener múltiples filas (días)
    # Estructura: dict[(code, group_number)] -> dict con datos acumulados
    raw_groups: dict[tuple[str, str], dict] = {}

    current_code = ""
    current_subject = ""
    current_group = ""

    for row in rows:
        if len(row) <= max(col.values()):
            continue  # Fila mal formada, saltar

        # Leer valores de la fila actual
        code_cell = _clean_cell(row[col["code"]])
        subject_cell = _clean_cell(row[col["subject"]])
        group_cell = _clean_cell(row[col["group"]])

        # Si la celda está vacía, heredar del grupo anterior (rowspan)
        if code_cell:
            current_code = code_cell
        if subject_cell:
            current_subject = subject_cell
        if group_cell:
            current_group = group_cell

        if not current_code or not current_subject or not current_group:
            continue

        day = _parse_weekday(_clean_cell(row[col["day"]]))
        start = _parse_time(_clean_cell(row[col["start"]]))
        end = _parse_time(_clean_cell(row[col["end"]]))

        # Datos opcionales
        classroom = (
            _clean_cell(row[col["classroom"]])
            if "classroom" in col and len(row) > col["classroom"]
            else ""
        )
        teacher = (
            _clean_cell(row[col["teacher"]])
            if "teacher" in col and len(row) > col["teacher"]
            else ""
        )
        credits_str = (
            _clean_cell(row[col["credits"]])
            if "credits" in col and len(row) > col["credits"]
            else "0"
        )

        key = (current_code, current_group)
        if key not in raw_groups:
            raw_groups[key] = {
                "code": current_code,
                "subject": current_subject,
                "group": current_group,
                "classroom": classroom,
                "teacher": teacher,
                "credits": credits_str,
                "blocks": [],
            }

        raw_groups[key]["blocks"].append((day, start, end))

        # Actualizar aula/profesor si la fila actual los especifica
        if classroom:
            raw_groups[key]["classroom"] = classroom
        if teacher:
            raw_groups[key]["teacher"] = teacher

    # Convertir a CourseGroup
    course_groups: list[CourseGroup] = []
    seen_codes: set[str] = set()

    for (code, group_num), data in raw_groups.items():
        # Generar un code único para el CourseGroup
        group_code = f"{code}-{group_num}"

        # Evitar duplicados
        if group_code in seen_codes:
            continue
        seen_codes.add(group_code)

        try:
            credits = int(data["credits"]) if data["credits"].isdigit() else 0
        except ValueError:
            credits = 0

        time_blocks = [TimeBlock(weekday=d, starts_at=s, ends_at=e) for d, s, e in data["blocks"]]

        course_groups.append(
            CourseGroup(
                code=group_code,
                subject_code=code,
                subject_name=data["subject"],
                teacher=data["teacher"] or None,
                classroom=data["classroom"] or None,
                credits=credits,
                blocks=time_blocks,
            )
        )

    return course_groups