"""
Normalizador para la tabla de horarios de la Universidad de Cundinamarca.

El portal devuelve tablas HTML donde cada grupo puede ocupar varias filas
(una por dia) usando rowspan. Este modulo reconstruye los grupos completos
con todos sus bloques horarios y los convierte en CourseGroup.
"""

import re
from datetime import time

from app.domain.models import CourseGroup, TimeBlock, Weekday

# Mapeo de nombres de dias en espanol a enum Weekday
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
        # Manejar formatos de 3 o 4 digitos: "600" -> 06:00, "1600" -> 16:00
        padded = cleaned.zfill(4)
        return time(hour=int(padded[:2]), minute=int(padded[2:]))
    raise ValueError(f"No se pudo interpretar la hora: {value!r}")


def _parse_weekday(value: str) -> Weekday:
    """Convierte 'MIERCOLES' a Weekday.WEDNESDAY."""
    key = value.strip().upper()
    if key not in SPANISH_WEEKDAYS:
        raise ValueError(f"Dia de semana no reconocido: {value!r}")
    return SPANISH_WEEKDAYS[key]


def _clean_cell(text: str) -> str:
    """Limpia un texto de celda (espacios, saltos de linea)."""
    return re.sub(r"\s+", " ", text.strip())


def _infer_semester_from_code(subject_code: str) -> str | None:
    """
    Infiere el semestre a partir del codigo de la materia.

    En la Universidad de Cundinamarca, el codigo de la materia contiene el
    numero de semestre en una posicion especifica:

    - CAD612021{X}... -> el digito en la posicion 9 (0-based) es el semestre
    - CAI1002020{X}... -> el digito en la posicion 10 (0-based) es el semestre

    Retorna el semestre como string, o None si no se pudo inferir.
    """
    code = subject_code.strip().upper()

    # Patron: CAD612021{X}... (ej: CAD612021626 -> semestre 6)
    if len(code) >= 10 and code.startswith("CAD612021"):
        digit = code[9]
        if digit.isdigit() and digit != "0":
            return digit

    # Patron: CAI1002020{X}... (ej: CAI1002020608 -> semestre 6)
    if len(code) >= 11 and code.startswith("CAI1002020"):
        digit = code[10]
        if digit.isdigit() and digit != "0":
            return digit

    return None


def _infer_headers(headers: list[str]) -> dict[str, int]:
    """
    Infiere el indice de cada columna segun el nombre del encabezado.
    Retorna un dict: {nombre_columna: indice}.
    """
    h_lower = [h.strip().upper() for h in headers]
    mapping: dict[str, int] = {}
    for i, h in enumerate(h_lower):
        # Note: .upper() converts accented chars like 'codigo' -> 'CODIGO', 'codigo' -> 'CODIGO'
        # We need to check both accented and unaccented versions of the headers
        if "CODIGO" in h or "C" + chr(211) + "DIGO" in h or "COD" in h:
            mapping["code"] = i
        elif "MATERIA" in h or "ASIGNATURA" in h or "NOMBRE" in h or "CAMPO" in h or "NUCLEO" in h or ("N" + chr(218) + "CLEO") in h:
            mapping["subject"] = i
        elif "GRUPO" in h:
            mapping["group"] = i
        elif "DIA" in h or ("D" + chr(205) + "A") in h:
            mapping["day"] = i
        elif "HORA INICIO" in h or "INICIO" in h or "HORA I" in h:
            mapping["start"] = i
        elif "HORA FIN" in h or "FIN" in h or "HORA F" in h:
            mapping["end"] = i
        elif "AULA" in h or "SALON" in h or ("SAL" + chr(211) + "N") in h:
            mapping["classroom"] = i
        elif "PROFESOR" in h or "DOCENTE" in h:
            mapping["teacher"] = i
        elif "CREDITO" in h or ("CR" + chr(201) + "DITO") in h or "CRED" in h:
            mapping["credits"] = i
        elif "SEMESTRE" in h:
            mapping["semester"] = i
    return mapping


def normalize_table(headers: list[str], rows: list[list[str]]) -> list[CourseGroup]:
    """
    Convierte las filas extraidas del portal en una lista de CourseGroup.

    Maneja rowspan: si una fila no tiene codigo/materia/grupo, esos valores
    se heredan de la fila anterior (mismo grupo, dia diferente).
    """
    col = _infer_headers(headers)

    # Verificar columnas minimas requeridas
    required = {"code", "subject", "group", "day", "start", "end"}
    missing = required - set(col.keys())
    if missing:
        raise ValueError(
            f"No se encontraron las columnas requeridas en los encabezados: "
            f"{missing}. Encabezados disponibles: {headers}"
        )

    # Agrupar filas por grupo: cada grupo puede tener multiples filas (dias)
    # Estructura: dict[(code, group_number)] -> dict con datos acumulados
    raw_groups: dict[tuple[str, str], dict] = {}

    current_code = ""
    current_subject = ""
    current_group = ""
    current_semester = ""

    rows_processed = 0
    rows_skipped = 0

    for row_idx, row in enumerate(rows):
        if len(row) <= max(col.values()):
            rows_skipped += 1
            continue  # Fila mal formada, saltar

        # Leer valores de la fila actual
        code_cell = _clean_cell(row[col["code"]])
        subject_cell = _clean_cell(row[col["subject"]])
        group_cell = _clean_cell(row[col["group"]])

        # Si la celda esta vacia, heredar del grupo anterior (rowspan)
        if code_cell:
            current_code = code_cell
            # Inferir semestre desde el codigo cuando aparece un codigo nuevo.
            # El portal agrupa semestres 5 y 6 en la misma tabla, y la columna
            # SEMESTRE puede quedar vacia o incorrecta para el semestre 6.
            inferred = _infer_semester_from_code(current_code)
            if inferred and inferred != current_semester:
                print(f"[DEBUG] Fila {row_idx}: Corrigiendo semestre '{current_semester}' -> '{inferred}' para codigo '{current_code}'")
                current_semester = inferred
        if subject_cell:
            current_subject = subject_cell
        if group_cell:
            current_group = group_cell

        if not current_code or not current_subject or not current_group:
            rows_skipped += 1
            if row_idx < 20:  # Log primeras 20 filas
                print(f"[DEBUG] Fila {row_idx}: SKIP - code='{current_code}', subject='{current_subject}', group='{current_group}'")
            continue

        rows_processed += 1
        if row_idx < 20:  # Log primeras 20 filas
            print(f"[DEBUG] Fila {row_idx}: OK - code='{code_cell}', subject='{subject_cell}', group='{group_cell}'")

        # Validar que la fila tenga datos de horario validos
        day_raw = _clean_cell(row[col["day"]])
        start_raw = _clean_cell(row[col["start"]])
        end_raw = _clean_cell(row[col["end"]])

        # Si el dia no es un dia de semana valido, saltar esta fila
        try:
            day = _parse_weekday(day_raw)
        except ValueError:
            rows_skipped += 1
            if row_idx < 20:
                print(f"[DEBUG] Fila {row_idx}: SKIP - dia invalido: '{day_raw}'")
            continue

        # Validar horas
        try:
            start = _parse_time(start_raw)
            end = _parse_time(end_raw)
        except ValueError:
            rows_skipped += 1
            if row_idx < 20:
                print(f"[DEBUG] Fila {row_idx}: SKIP - hora invalida: '{start_raw}' - '{end_raw}'")
            continue

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
        semester_str = (
            _clean_cell(row[col["semester"]])
            if "semester" in col and len(row) > col["semester"]
            else ""
        )
        # Si la tabla especifica un semestre, usarlo solo si no tenemos
        # un semestre mas confiable inferido desde el codigo.
        # El portal agrupa semestres 5 y 6 en la misma tabla y a veces
        # la columna SEMESTRE dice "5" para materias que son de semestre 6.
        if semester_str:
            inferred = _infer_semester_from_code(current_code)
            if not inferred or inferred == semester_str:
                current_semester = semester_str
            else:
                # La inferencia del codigo es mas confiable que la tabla
                if semester_str != inferred:
                    print(f"[DEBUG] Fila {row_idx}: Ignorando semestre de tabla '{semester_str}' -> manteniendo '{inferred}' (inferido de codigo '{current_code}')")

        key = (current_code, current_group)
        if key not in raw_groups:
            raw_groups[key] = {
                "code": current_code,
                "subject": current_subject,
                "group": current_group,
                "classroom": classroom,
                "teacher": teacher,
                "credits": credits_str,
                "semester": current_semester,
                "blocks": [],
            }

        raw_groups[key]["blocks"].append((day, start, end))

        # Actualizar aula/profesor si la fila actual los especifica
        if classroom:
            raw_groups[key]["classroom"] = classroom
        if teacher:
            raw_groups[key]["teacher"] = teacher
        if semester_str:
            inferred = _infer_semester_from_code(current_code)
            if not inferred or inferred == semester_str:
                raw_groups[key]["semester"] = semester_str
            # Si hay conflicto, no actualizar: mantener el semestre inferido del codigo

    # Convertir a CourseGroup
    course_groups: list[CourseGroup] = []
    seen_codes: set[str] = set()

    for (code, group_num), data in raw_groups.items():
        # Generar un code unico para el CourseGroup
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
                semester=data.get("semester") or None,
                blocks=time_blocks,
            )
        )

    # Logging de diagnostico
    print(f"[DEBUG] Grupos unicos creados: {len(course_groups)}")
    for cg in course_groups[:10]:  # Mostrar primeros 10
        print(f"[DEBUG]   - {cg.subject_code}: {cg.subject_name} (semestre: {cg.semester}, bloques: {len(cg.blocks)})")

    return course_groups
