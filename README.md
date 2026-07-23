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

La primera integración de extracción está disponible en `POST /api/extractions`. Recibe `portal_url` y una universidad opcional, y actualmente devuelve grupos académicos demo con el contrato preparado para Playwright.

Para la Universidad de Cundinamarca usa la entrada pública `https://plataforma.ucundinamarca.edu.co/aplicacionesB/condicionales/apl_gen_public.jsp?id=ConsultaHorario`. La ruta `inicioSeguro.jsp` depende de una navegación previa y puede terminar en `/null` si se abre directamente.

### Frontend

```powershell
cd frontend
pnpm install
pnpm dev
```

El dashboard queda disponible en `http://localhost:5173`.

## Configuración

Copia `.env.example` como `.env` cuando necesites configurar Firebase o una universidad concreta. La primera versión funciona con el repositorio JSON local y datos de demostración.
