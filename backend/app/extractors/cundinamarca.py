from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Frame, Page, sync_playwright

from app.extractors.playwright_extractor import ExtractedTable, PlaywrightPortalExtractor


PUBLIC_SCHEDULE_URL = (
    "https://plataforma.ucundinamarca.edu.co/aplicacionesB/condicionales/"
    "apl_gen_public.jsp?id=ConsultaHorario"
)

# Selectores del formulario público de horarios.
SEDE_SELECTOR = "#sede_sel"
PROGRAMA_SELECTOR = "#programa_sel"
FORM_SELECTOR = "#formHorarios"
FRAME_URL_MARKER = "pub_rep_val.jsp"


@dataclass(frozen=True)
class PortalOption:
    value: str
    label: str


@dataclass(frozen=True)
class CundinamarcaCatalog:
    campuses: list[PortalOption]
    programs_by_campus: dict[str, list[PortalOption]]


def normalize_cundinamarca_portal_url(portal_url: str | None) -> str:
    """
    El formulario solo carga dentro del frameset de apl_gen_public.jsp.
    Cualquier otra URL del portal (inicioSeguro, pub_rep_val directo, etc.)
    deja el frame vacío y provoca "schedule form frame was not found".
    """
    if not portal_url:
        return PUBLIC_SCHEDULE_URL

    raw = str(portal_url).strip()
    try:
        parsed = urlparse(raw)
    except Exception:
        return PUBLIC_SCHEDULE_URL

    host = (parsed.netloc or "").lower()
    path = parsed.path or ""

    if "ucundinamarca.edu.co" not in host:
        return raw

    # Si ya apunta al entrypoint correcto, conservar query id=ConsultaHorario.
    if path.endswith("/apl_gen_public.jsp"):
        query = parse_qs(parsed.query or "")
        if query.get("id") == ["ConsultaHorario"] or not query:
            return PUBLIC_SCHEDULE_URL
        return PUBLIC_SCHEDULE_URL

    # Cualquier otra ruta del módulo de condicionales debe redirigirse al entrypoint.
    if "/aplicacionesB/condicionales" in path or "ucundinamarca.edu.co" in host:
        return PUBLIC_SCHEDULE_URL

    return raw


class CundinamarcaExtractor:
    """Discovers the public campus and program selectors used by the portal."""

    def discover_catalog(self, portal_url: str = PUBLIC_SCHEDULE_URL) -> CundinamarcaCatalog:
        portal_url = normalize_cundinamarca_portal_url(portal_url)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                self._open_portal(page, portal_url)
                frame = self._schedule_frame(page)
                campuses = self._read_options(frame, SEDE_SELECTOR)

                # Para cada sede, abrimos una página NUEVA para evitar
                # que el portal entremezcle programas de distintas sedes.
                programs_by_campus: dict[str, list[PortalOption]] = {}
                for campus in campuses:
                    campus_page = browser.new_page()
                    try:
                        self._open_portal(campus_page, portal_url)
                        campus_frame = self._schedule_frame(campus_page)
                        campus_frame.locator(SEDE_SELECTOR).select_option(campus.value)
                        campus_frame.wait_for_function(
                            """() => document.querySelectorAll('#programa_sel option').length > 1""",
                            timeout=20_000,
                        )
                        campus_page.wait_for_timeout(400)
                        programs_by_campus[campus.value] = self._read_options(
                            campus_frame, PROGRAMA_SELECTOR
                        )
                    finally:
                        campus_page.close()

                return CundinamarcaCatalog(campuses, programs_by_campus)
            finally:
                browser.close()

    def query_schedule(
        self,
        campus_value: str,
        program_value: str,
        portal_url: str = PUBLIC_SCHEDULE_URL,
    ) -> list[ExtractedTable]:
        portal_url = normalize_cundinamarca_portal_url(portal_url)
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                self._open_portal(page, portal_url)
                frame = self._schedule_frame(page)

                frame.locator(SEDE_SELECTOR).select_option(campus_value)
                frame.wait_for_function(
                    """() => document.querySelectorAll('#programa_sel option').length > 1""",
                    timeout=20_000,
                )
                page.wait_for_timeout(400)
                frame.locator(PROGRAMA_SELECTOR).select_option(program_value)
                frame.locator(FORM_SELECTOR).evaluate(
                    """(form) => {
                        form.action = 'pub_rep_ctr.jsp?op=1';
                        form.submit();
                    }"""
                )

                # Tras el submit el mainFrame navega al reporte con tablas.
                self._wait_for_schedule_tables(page, timeout_ms=30_000)

                all_tables: list[ExtractedTable] = []
                for current_frame in page.frames:
                    try:
                        tables = PlaywrightPortalExtractor._read_tables(current_frame)
                        if tables:
                            all_tables.extend(tables)
                    except Exception:
                        continue

                return all_tables
            finally:
                browser.close()

    @staticmethod
    def _open_portal(page: Page, portal_url: str) -> None:
        page.goto(portal_url, wait_until="domcontentloaded", timeout=45_000)
        # El frameset redirige a inicioSeguro.jsp y carga mainFrame de forma asíncrona.
        page.wait_for_load_state("domcontentloaded")

    @staticmethod
    def _schedule_frame(page: Page, timeout_ms: int = 25_000) -> Frame:
        """
        Espera activamente el frame del formulario.
        El portal usa un frameset: mainFrame -> pub_rep_val.jsp con #sede_sel.
        """
        deadline_steps = max(timeout_ms // 250, 1)
        last_urls: list[str] = []

        for _ in range(deadline_steps):
            last_urls = [frame.url for frame in page.frames]

            # 1) Frame por URL conocida del formulario.
            for frame in page.frames:
                if FRAME_URL_MARKER in (frame.url or ""):
                    try:
                        if frame.locator(SEDE_SELECTOR).count() > 0:
                            frame.wait_for_selector(SEDE_SELECTOR, state="attached", timeout=5_000)
                            return frame
                    except Exception:
                        pass

            # 2) Frame por nombre del frameset.
            named = page.frame(name="mainFrame")
            if named is not None:
                try:
                    if named.locator(SEDE_SELECTOR).count() > 0:
                        named.wait_for_selector(SEDE_SELECTOR, state="attached", timeout=5_000)
                        return named
                except Exception:
                    pass

            # 3) Cualquier frame que ya tenga el select de sede.
            for frame in page.frames:
                try:
                    if frame.locator(SEDE_SELECTOR).count() > 0:
                        frame.wait_for_selector(SEDE_SELECTOR, state="attached", timeout=5_000)
                        return frame
                except Exception:
                    continue

            page.wait_for_timeout(250)

        print(f"[DEBUG] Frames disponibles al fallar: {last_urls}")
        raise RuntimeError(
            "The schedule form frame was not found. "
            "Verifica que la URL sea el portal público de consulta de horarios "
            f"(apl_gen_public.jsp?id=ConsultaHorario). Frames: {last_urls}"
        )

    @staticmethod
    def _wait_for_schedule_tables(page: Page, timeout_ms: int = 30_000) -> None:
        """Espera a que el reporte con tablas aparezca en algún frame."""
        steps = max(timeout_ms // 500, 1)
        for _ in range(steps):
            for frame in page.frames:
                try:
                    # El reporte suele tener varias filas de horarios.
                    rows = frame.locator("table tbody tr").count()
                    if rows > 0:
                        page.wait_for_timeout(500)
                        return
                except Exception:
                    continue
            page.wait_for_timeout(500)

    @staticmethod
    def _read_options(frame: Frame, selector: str) -> list[PortalOption]:
        return [
            PortalOption(value=value, label=label.strip())
            for value, label in frame.locator(f"{selector} option").evaluate_all(
                "(options) => options.slice(1).map((option) => [option.value, option.textContent])"
            )
            if value and label.strip()
        ]
