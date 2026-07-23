const apiUrl = 'http://localhost:8000/api/health'
const extractionUrl = 'http://localhost:8000/api/extractions'
const statusText = document.querySelector('.status')
const connectForm = document.querySelector('#connect-form')
const hero = document.querySelector('.hero')
const roadmap = document.querySelector('.roadmap')
const connectionPanel = document.querySelector('#connection-panel')
const connectionUrl = document.querySelector('#connection-url')
const formMessage = document.querySelector('#form-message')
const panels = ['connection-panel', 'subjects-panel', 'preferences-panel', 'results-panel', 'export-panel'].map((id) => document.querySelector(`#${id}`))

function updateApiStatus(state, label) {
  statusText.innerHTML = `<span class="status-dot ${state}"></span> API ${label}`
}

fetch(apiUrl)
  .then((response) => {
    if (!response.ok) throw new Error('API unavailable')
    updateApiStatus('online', 'conectada')
  })
  .catch(() => updateApiStatus('offline', 'desconectada'))

connectForm.addEventListener('submit', (event) => {
  event.preventDefault()
  const portalUrl = normalizePortalUrl(document.querySelector('#portal-url').value)
  const university = document.querySelector('#university').value || null
  connectionUrl.textContent = portalUrl
  hero.hidden = true
  roadmap.hidden = true
  connectionPanel.hidden = false
  connectionPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
  runProgress({ portal_url: portalUrl, university })
})

function normalizePortalUrl(value) {
  const url = new URL(value)
  if (url.pathname.endsWith('/condicionales/inicioSeguro.jsp')) {
    url.pathname = url.pathname.replace('inicioSeguro.jsp', 'apl_gen_public.jsp')
    url.search = '?id=ConsultaHorario'
  }
  return url.toString()
}

function showPanel(panel) {
  panels.forEach((currentPanel) => { currentPanel.hidden = currentPanel !== panel })
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

document.querySelector('#to-subjects').addEventListener('click', () => showPanel(document.querySelector('#subjects-panel')))
document.querySelector('#to-preferences').addEventListener('click', () => showPanel(document.querySelector('#preferences-panel')))
document.querySelector('#to-results').addEventListener('click', () => showPanel(document.querySelector('#results-panel')))
document.querySelector('#to-export').addEventListener('click', () => showPanel(document.querySelector('#export-panel')))

async function runProgress(payload) {
  const steps = [...document.querySelectorAll('[data-step]')]
  try {
    const response = await fetch(extractionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) throw new Error('No se pudo completar la extracción')

    const extraction = await response.json()
    extraction.groups.forEach((group) => {
      const subject = document.querySelector(`[value="${group.subject_code}"]`)
      if (subject) subject.closest('.subject-option').querySelector('small').textContent = `${group.subject_code} · ${group.credits} créditos`
    })
    for (const step of steps) {
      await new Promise((resolve) => setTimeout(resolve, 350))
      step.classList.add('done')
      step.querySelector('.progress-icon').textContent = '✓'
    }
    formMessage.textContent = `${extraction.groups.length} grupos encontrados. Ya puedes escoger tus materias.`
    document.querySelector('#to-subjects').hidden = false
  } catch (error) {
    formMessage.textContent = 'No pudimos conectar con el backend. Comprueba que FastAPI esté ejecutándose en el puerto 8000.'
  }
}
