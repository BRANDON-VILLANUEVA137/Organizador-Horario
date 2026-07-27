from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.api.routes import router

app = FastAPI(
    title="SmartSchedule API",
    description="API para extracción, normalización y optimización de horarios universitarios.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://crear-horarios.netlify.app",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PrivateNetworkMiddleware(BaseHTTPMiddleware):
    """Agrega header Access-Control-Allow-Private-Network para permitir
    que sitios HTTPS (Netlify) hagan fetch a localhost."""
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        origin = request.headers.get("origin", "")
        # Permitir acceso a red local desde cualquier origen HTTPS
        if origin and (origin.startswith("https://") or origin.startswith("http://localhost") or origin.startswith("http://127.0.0.1")):
            response.headers["Access-Control-Allow-Private-Network"] = "true"
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Vary"] = "Origin"
        return response


app.add_middleware(PrivateNetworkMiddleware)

app.include_router(router, prefix="/api")