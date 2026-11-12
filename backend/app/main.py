"""API do app de campo: recebe as fichas dos aparelhos e publica camadas para o WebGIS.

Rodar no computador:  uvicorn app.main:app --reload   (dentro de backend/)
Documentação interativa: http://localhost:8080/docs
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import camadas, fotos, geral, sync
from .config import Config
from .db import criar_pool, migrar, semear_parametros

log = logging.getLogger("campo")


def criar_app(config: Config | None = None) -> FastAPI:
    config = config or Config.do_ambiente()

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI):
        app.state.pool = criar_pool(config.database_url)
        with app.state.pool.connection() as conn:
            migrar(conn)
            semear_parametros(conn, config.parametros_iniciais)
        config.pasta_fotos.mkdir(parents=True, exist_ok=True)
        if not config.chaves_aparelhos:
            log.warning("CHAVES_APARELHOS vazio: envio de fichas sem autenticação (use só em desenvolvimento).")
        yield
        app.state.pool.close()

    app = FastAPI(title="API do App de Campo Agronômico", version=geral.VERSAO_API, lifespan=ciclo_de_vida)
    app.state.config = config
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origens,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=3600,
    )
    for modulo in (geral, sync, fotos, camadas):
        app.include_router(modulo.router)
    return app


logging.basicConfig(level=logging.INFO)
app = criar_app()
