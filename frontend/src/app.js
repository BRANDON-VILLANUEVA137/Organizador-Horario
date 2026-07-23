const apiUrl = 'http://localhost:8000/api/health'
const statusText = document.querySelector('.status')
const statusDot = document.querySelector('.status-dot')
const startButton = document.querySelector('#start-button')

function updateApiStatus(state, label) {
  statusDot.className = `status-dot ${state}`
  statusText.innerHTML = `<span class="status-dot ${state}"></span> API ${label}`
}

fetch(apiUrl)
  .then((response) => {
    if (!response.ok) throw new Error('API unavailable')
    updateApiStatus('online', 'conectada')
  })
  .catch(() => updateApiStatus('offline', 'desconectada'))

startButton.addEventListener('click', () => {
  document.querySelector('.roadmap').scrollIntoView({ behavior: 'smooth' })
})
