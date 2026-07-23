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
            rows = [
                [cell.strip() for cell in row.locator("th, td").all_text_contents()]
                for row in table.locator("tbody tr").all()
            ]
            if rows:
                tables.append(ExtractedTable(headers=headers, rows=rows))
        return tables
