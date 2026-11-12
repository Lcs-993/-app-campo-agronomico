"""Recebimento das fichas finalizadas enviadas pelo app."""

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from .. import auth
from ..servicos.ingestao import receber_ficha
from .deps import conexao

router = APIRouter(prefix="/api/v1/sync", tags=["sincronização"])
MAX_FICHAS_POR_LOTE = 200


class Lote(BaseModel):
    """Mesmo formato do arquivo exportado pelo app: {"dispositivo_id": ..., "fichas": [...]}."""

    model_config = ConfigDict(extra="allow")
    fichas: list[Any] = Field(max_length=MAX_FICHAS_POR_LOTE)


@router.post("/fichas")
def receber_lote(lote: Lote, conn=Depends(conexao), enviado_por=Depends(auth.aparelho)):
    """Cada ficha é tratada isoladamente: uma ficha inválida não impede as outras.

    situacao: gravada | ja_recebida | invalida | conflito.
    fotos_pendentes: ids das fotos da ficha que o servidor ainda não recebeu (enviar com PUT /api/v1/fotos/{id}).
    """
    resultados = [receber_ficha(conn, ficha, enviado_por) for ficha in lote.fichas]
    resumo = {}
    for r in resultados:
        resumo[r["situacao"]] = resumo.get(r["situacao"], 0) + 1
    return {"resumo": resumo, "resultados": resultados}
