# SmartSchedule

Plataforma modular para extraer, normalizar y optimizar horarios universitarios.

## Estructura

- `backend/`: API FastAPI y dominio Python.
- `frontend/`: dashboard con HTML, CSS y JavaScript.
- `data/`: caché local JSON generada por los repositorios.
- `Hoja_de_ruta.txt`: arquitectura y roadmap del producto.

## Inicio rápido

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

La API queda disponible en `http://localhost:8000` y su documentación en `http://localhost:8000/docs`.

### Frontend

```powershell
cd frontend
pnpm install
pnpm dev
```

El dashboard queda disponible en `http://localhost:5173`.

## Configuración

Copia `.env.example` como `.env` cuando necesites configurar Firebase o una universidad concreta. La primera versión funciona con el repositorio JSON local y datos de demostración.
