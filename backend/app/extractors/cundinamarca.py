from dataclasses import dataclass

from playwright.sync_api import Frame, sync_playwright

from app.extractors.playwright_extractor import ExtractedTable, PlaywrightPortalExtractor


PUBLIC_SCHEDULE_URL = (
    "https://plataforma.ucundinamarca.edu.co/aplicacionesB/condicionales/"
    "apl_gen_public.jsp?id=ConsultaHorario"
)


@dataclass(frozen=True)
class PortalOption:
    value: str
    label: str


@dataclass(frozen=True)
class CundinamarcaCatalog:
    campuses: list[PortalOption]
    programs_by_campus: dict[str, list[PortalOption]]


class CundinamarcaExtractor:
    """Discovers the public campus and program selectors used by the portal."""

    def discover_catalog(self, portal_url: str = PUBLIC_SCHEDULE_URL) -> CundinamarcaCatalog:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                page.goto(portal_url, wait_until="domcontentloaded", timeout=30_000)
                page.wait_for_timeout(1_500)
                frame = self._schedule_frame(page)
                campuses = self._read_options(frame, "#sede_sel")

                # Para cada sede, abrimos una página NUEVA para evitar
                # que el portal entremezcle programas de distintas sedes.
                programs_by_campus: dict[str, list[PortalOption]] = {}
                for campus in campuses:
                    campus_page = browser.new_page()
                    try:
                        campus_page.goto(portal_url, wait_until="domcontentloaded", timeout=30_000)
                        campus_page.wait_for_timeout(1_500)
                        campus_frame = self._schedule_frame(campus_page)
                        campus_frame.locator("#sede_sel").select_option(campus.value)
                        campus_frame.wait_for_function(
                            """() => document.querySelectorAll('#programa_sel option').length > 1""",
                            timeout=15_000,
                        )
                        campus_page.wait_for_timeout(500)
                        programs_by_campus[campus.value] = self._read_options(
                            campus_frame, "#programa_sel"
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
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                page.goto(portal_url, wait_until="domcontentloaded", timeout=30_000)
                page.wait_for_timeout(1_500)

                # Intentar encontrar el frame del formulario
                frame = None
                for attempt in range(3):
                    try:
                        frame = self._schedule_frame(page)
                        break
                    except RuntimeError:
                        if attempt < 2:
                            page.wait_for_timeout(1_000)
                        else:
                            raise

                frame.locator("#sede_sel").select_option(campus_value)
                frame.wait_for_function(
                    """() => document.querySelectorAll('#programa_sel option').length > 1""",
                    timeout=15_000,
                )
                page.wait_for_timeout(500)
                frame.locator("#programa_sel").select_option(program_value)
                frame.locator("#formHorarios").evaluate(
                    """(form) => {
                        form.action = 'pub_rep_ctr.jsp?op=1';
                        form.submit();
                    }"""
                )
                page.wait_for_timeout(3_000)

                # Buscar tablas en todos los frames disponibles
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
    def _schedule_frame(page) -> Frame:
        # Buscar el frame del formulario con mayor tolerancia
        for frame in page.frames:
            if frame.url.endswith("/pub_rep_val.jsp"):
                return frame
        # Fallback: buscar cualquier frame que contenga el select de sede
        for frame in page.frames:
            try:
                if frame.locator("#sede_sel").count() > 0:
                    return frame
            except Exception:
                continue
        # Logging de diagnóstico
        print(f"[DEBUG] Frames disponibles: {[f.url for f in page.frames]}")
        raise RuntimeError("The schedule form frame was not found")

    @staticmethod
    def _read_options(frame: Frame, selector: str) -> list[PortalOption]:
        return [
            PortalOption(value=value, label=label.strip())
            for value, label in frame.locator(f"{selector} option").evaluate_all(
                "(options) => options.slice(1).map((option) => [option.value, option.textContent])"
            )
            if value and label.strip()
        ]