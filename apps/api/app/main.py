from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.policy_rates import router as policy_rate_router

app = FastAPI(
    title="Personal_Macro API",
    version="0.1.0",
    description="Local-first macro analysis API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(policy_rate_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
