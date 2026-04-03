from fastapi import APIRouter

from app.api.routes import admin, auth, health, qa, repositories, search

api_router = APIRouter()
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(repositories.router, prefix="/repositories", tags=["repositories"])
api_router.include_router(search.router, prefix="/search", tags=["search"])
api_router.include_router(qa.router, prefix="/qa", tags=["qa"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
