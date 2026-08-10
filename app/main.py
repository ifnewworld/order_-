from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv

load_dotenv()

from app.routers import orders, photos


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="발주 관리 시스템",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

app.include_router(orders.router, prefix="/api/orders", tags=["orders"])
app.include_router(photos.router, prefix="/api/photos", tags=["photos"])


@app.get("/")
async def index(request: Request):
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_KEY", "")
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "supabase_url": supabase_url,
            "supabase_key": supabase_key,
        },
    )
