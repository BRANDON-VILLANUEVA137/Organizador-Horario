"""
Motor de Grafo Acíclico Dirigido (DAG) para validar prerrequisitos.

Construye un grafo donde cada nodo es una materia y las aristas
representan relaciones de prerrequisito. Permite determinar qué
materias están habilitadas para cursar según el avance del estudiante.
"""

from app.domain.models import (
    Pensum,
    PensumSubject,
    Diagnostico,
    AcademicPlan,
    PrerequisiteSubject,
    SubjectEligibility,
)


class DAGEngine:
    """
    Motor de Grafo Acíclico Dirigido para validar prerrequisitos académicos.

    Recibe un pensum (malla curricular) y construye internamente un grafo
    de dependencias para calcular materias habilitadas, progreso y
    diagnósticos pendientes.
    """

    def __init__(self, pensum: Pensum | AcademicPlan):
        """
        Inicializa el motor con un pensum.

        Args:
            pensum: Malla curricular completa (Pensum o AcademicPlan).
        """
        self.pensum = pensum
        self.grafo = self._construir_grafo()

    def _construir_grafo(self) -> dict[str, set[str]]:
        """
        Construye el grafo de dependencias a partir del pensum.

        Returns:
            Diccionario donde cada clave es un código de materia
            y su valor es un conjunto de códigos de materias requisito.
        """
        grafo: dict[str, set[str]] = {}
        subjects = self._get_subjects()
        for materia in subjects:
            grafo[materia.codigo] = set(materia.requisitos)
        return grafo

    def _get_subjects(self) -> list:
        """Obtiene la lista de materias del pensum (compatible Pensum | AcademicPlan)."""
        if isinstance(self.pensum, AcademicPlan):
            return self.pensum.subjects
        return self.pensum.materias

    def _get_diagnostics(self) -> list:
        """Obtiene la lista de diagnósticos (compatible Pensum | AcademicPlan)."""
        if isinstance(self.pensum, AcademicPlan):
            return self.pensum.diagnostics
        return self.pensum.diagnosticos

    def _get_total_creditos(self) -> int:
        """Obtiene el total de créditos."""
        return self.pensum.total_creditos

    def calcular_habilitadas(
        self,
        aprobadas: list[str],
        diagnosticos_aprobados: list[str] | None = None,
    ) -> list[PensumSubject]:
        """
        Determina qué materias están habilitadas para cursar.

        Una materia está habilitada si:
        - No ha sido cursada aún.
        - Todos sus requisitos regulares están aprobados.
        - Todos sus diagnósticos requeridos están aprobados.

        Args:
            aprobadas: Lista de códigos de materias aprobadas.
            diagnosticos_aprobados: Lista de códigos de diagnósticos aprobados.

        Returns:
            Lista de materias (PensumSubject) habilitadas para cursar.
        """
        habilitadas: list[PensumSubject] = []
        set_aprobadas = set(aprobadas)
        set_diag = set(diagnosticos_aprobados or [])

        for materia in self._get_subjects():
            if materia.codigo in set_aprobadas:
                continue  # Ya cursada

            # Verificar requisitos regulares
            reqs_cumplidos = all(r in set_aprobadas for r in materia.requisitos)

            # Verificar diagnósticos
            diag_cumplidos = all(d in set_diag for d in materia.diagnosticos)

            if reqs_cumplidos and diag_cumplidos:
                # Convertir a PensumSubject si es PrerequisiteSubject
                if isinstance(materia, PrerequisiteSubject):
                    habilitadas.append(PensumSubject(
                        codigo=materia.codigo,
                        nombre=materia.nombre,
                        creditos=materia.creditos,
                        periodo=materia.periodo,
                        requisitos=materia.requisitos,
                        diagnosticos=materia.diagnosticos,
                        correquisitos=materia.correquisitos,
                        tipo=materia.tipo,
                    ))
                else:
                    habilitadas.append(materia)

        return habilitadas

    def calcular_progreso(self, aprobadas: list[str]) -> float:
        """
        Calcula el porcentaje de progreso en la carrera.

        Args:
            aprobadas: Lista de códigos de materias aprobadas.

        Returns:
            Porcentaje de créditos aprobados (0.0 - 100.0).
        """
        set_aprobadas = set(aprobadas)
        creditos_aprobados = sum(
            m.creditos
            for m in self._get_subjects()
            if m.codigo in set_aprobadas
        )
        total = self._get_total_creditos()
        if total == 0:
            return 0.0
        return round((creditos_aprobados / total) * 100, 1)

    def diagnosticos_pendientes(
        self,
        aprobadas: list[str],
        diagnosticos_aprobados: list[str] | None = None,
    ) -> list[Diagnostico]:
        """
        Identifica diagnósticos que el estudiante aún debe cursar
        y que afectan materias que podría querer tomar.

        Args:
            aprobadas: Lista de códigos de materias aprobadas.
            diagnosticos_aprobados: Lista de códigos de diagnósticos aprobados.

        Returns:
            Lista de diagnósticos pendientes que bloquean materias futuras.
        """
        set_diag_aprobados = set(diagnosticos_aprobados or [])
        pendientes: list[Diagnostico] = []

        for diag in self._get_diagnostics():
            if diag.codigo in set_diag_aprobados:
                continue  # Ya aprobado

            # Verificar si afecta alguna materia futura (no cursada aún)
            afecta_materias_futuras = any(
                m.codigo not in aprobadas
                for m in self._get_subjects()
                if diag.codigo in m.diagnosticos
            )
            if afecta_materias_futuras:
                pendientes.append(Diagnostico(
                    codigo=diag.codigo,
                    nombre=diag.nombre,
                    obligatorio_para=diag.obligatorio_para,
                ))

        return pendientes

    def creditos_aprobados(self, aprobadas: list[str]) -> int:
        """
        Calcula el total de créditos aprobados.

        Args:
            aprobadas: Lista de códigos de materias aprobadas.

        Returns:
            Suma de créditos de las materias aprobadas.
        """
        set_aprobadas = set(aprobadas)
        return sum(
            m.creditos
            for m in self._get_subjects()
            if m.codigo in set_aprobadas
        )

    def creditos_restantes(self, aprobadas: list[str]) -> int:
        """
        Calcula los créditos que faltan por cursar.

        Args:
            aprobadas: Lista de códigos de materias aprobadas.

        Returns:
            Créditos totales del pensum menos créditos aprobados.
        """
        return self._get_total_creditos() - self.creditos_aprobados(aprobadas)

    # ──────────────────────────────────────────────
    # Método de Elegibilidad (para AcademicPlan)
    # ──────────────────────────────────────────────

    def calcular_elegibilidad(
        self,
        completed_subjects: list[str],
        completed_diagnostics: list[str] | None = None,
    ) -> tuple[list[SubjectEligibility], list[SubjectEligibility]]:
        """
        Evalúa la elegibilidad de TODAS las materias del pensum.

        Para cada materia determina si es elegible o bloqueada, y en caso
        de estar bloqueada, especifica el motivo y qué requisitos faltan.

        Args:
            completed_subjects: Códigos de materias ya aprobadas.
            completed_diagnostics: Códigos de diagnósticos ya aprobados.

        Returns:
            Tupla (eligible_subjects, blocked_subjects) con el detalle
            de cada materia.
        """
        set_aprobadas = set(completed_subjects)
        set_diag = set(completed_diagnostics or [])

        # Construir mapa de nombres de materias para mensajes claros
        nombres_materias: dict[str, str] = {
            m.codigo: m.nombre for m in self._get_subjects()
        }
        nombres_diag: dict[str, str] = {
            d.codigo: d.nombre for d in self._get_diagnostics()
        }

        eligible: list[SubjectEligibility] = []
        blocked: list[SubjectEligibility] = []

        for materia in self._get_subjects():
            # Verificar si ya está cursada
            if materia.codigo in set_aprobadas:
                continue  # No la incluimos en ninguna lista

            missing_reqs: list[str] = []
            missing_diags: list[str] = []
            reasons: list[str] = []

            # Verificar requisitos regulares
            for req in materia.requisitos:
                if req not in set_aprobadas:
                    nombre_req = nombres_materias.get(req, req)
                    missing_reqs.append(req)
                    reasons.append(f"Falta: {nombre_req} ({req})")

            # Verificar diagnósticos
            for diag in materia.diagnosticos:
                if diag not in set_diag:
                    nombre_diag = nombres_diag.get(diag, diag)
                    missing_diags.append(diag)
                    reasons.append(f"Falta diagnóstico: {nombre_diag} ({diag})")

            is_eligible = len(missing_reqs) == 0 and len(missing_diags) == 0
            reason = "; ".join(reasons) if reasons else None

            eligibility = SubjectEligibility(
                codigo=materia.codigo,
                nombre=materia.nombre,
                creditos=materia.creditos,
                periodo=materia.periodo,
                tipo=materia.tipo,
                eligible=is_eligible,
                reason=reason,
                missing_requirements=missing_reqs,
                missing_diagnostics=missing_diags,
            )

            if is_eligible:
                eligible.append(eligibility)
            else:
                blocked.append(eligibility)

        return eligible, blocked