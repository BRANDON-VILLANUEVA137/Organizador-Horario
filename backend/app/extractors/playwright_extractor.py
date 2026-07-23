from dataclasses import dataclass

from playwright.sync_api import sync_playwright


@dataclass(frozen=True)
class ExtractedTable:
    headers: list[str]
    rows: list[list[str]]


class PlaywrightPortalExtractor:
    """Reads generic HTML tables while university-specific selectors are configured."""

    def extract_tables(self, portal_url: str) -> list[ExtractedTable]:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page()
                page.goto(portal_url, wait_until="domcontentloaded", timeout=30_000)
                return self._read_tables(page)
            finally:
                browser.close()

    @staticmethod
    def _read_tables(page) -> list[ExtractedTable]:
        tables: list[ExtractedTable] = []
        for table in page.locator("table").all():
            headers = [cell.strip() for cell in table.locator("thead th").all_text_contents()]
            
            # Leer filas con manejo de rowspan
            rows = []
            for row in table.locator("tbody tr").all():
                cells = row.locator("th, td").all()
                row_data = []
                for cell in cells:
                    row_data.append(cell.inner_text().strip())
                rows.append(row_data)
            
            # Normalizar filas con rowspan: expandir celdas faltantes
            if rows:
                max_cols = len(headers)
                normalized_rows = []
                for row in rows:
                    if len(row) < max_cols:
                        # Esta fila tiene menos columnas que los headers
                        # Probablemente es un rowspan, agregar celdas vacías al inicio
                        row = [''] * (max_cols - len(row)) + row
                    normalized_rows.append(row)
                rows = normalized_rows
            
            if rows:
                tables.append(ExtractedTable(headers=headers, rows=rows))
        
        # Logging de diagnóstico
        print(f"[DEBUG] Tablas encontradas: {len(tables)}")
        for idx, table in enumerate(tables):
            print(f"[DEBUG]   Tabla {idx}: {len(table.headers)} columnas, {len(table.rows)} filas")
            print(f"[DEBUG]     Headers: {table.headers}")
            if idx == 0 and table.rows:
                print(f"[DEBUG]     Primeras 3 filas:")
                for row_idx, row in enumerate(table.rows[:3]):
                    print(f"[DEBUG]       Fila {row_idx}: {row[:8]}")  # Primeras 8 columnas
        
        return tables
