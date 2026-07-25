// ── Panel navigation ─────────────────────────────────────────────
export function showPanel(panels, panel) {
  panels.forEach((currentPanel) => {
    currentPanel.hidden = currentPanel !== panel
  })
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function navigateTo(panels, panelId) {
  const panel = document.querySelector(`#${panelId}`)
  if (panel) showPanel(panels, panel)
}