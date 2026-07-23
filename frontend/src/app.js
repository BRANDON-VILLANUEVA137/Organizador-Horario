const apiUrl = 'http://localhost:8000/api/health'
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
  const portalUrl = document.querySelector('#portal-url').value
  connectionUrl.textContent = portalUrl
  hero.hidden = true
  roadmap.hidden = true
  connectionPanel.hidden = false
  connectionPanel.scrollIntoView({ behavior: 'smooth', block: 'start' })
  runProgress()
})

function showPanel(panel) {
  panels.forEach((currentPanel) => { currentPanel.hidden = currentPanel !== panel })
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

document.querySelector('#to-subjects').addEventListener('click', () => showPanel(document.querySelector('#subjects-panel')))
document.querySelector('#to-preferences').addEventListener('click', () => showPanel(document.querySelector('#preferences-panel')))
document.querySelector('#to-results').addEventListener('click', () => showPanel(document.querySelector('#results-panel')))
document.querySelector('#to-export').addEventListener('click', () => showPanel(document.querySelector('#export-panel')))

async function runProgress() {
  const steps = [...document.querySelectorAll('[data-step]')]
  for (const step of steps) {
    await new Promise((resolve) => setTimeout(resolve, 650))
    step.classList.add('done')
    step.querySelector('.progress-icon').textContent = '✓'
  }
  formMessage.textContent = 'Materias organizadas. Pronto podrás escoger las que deseas cursar.'
  document.querySelector('#to-subjects').hidden = false
}
