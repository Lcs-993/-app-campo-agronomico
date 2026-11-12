"""Autenticação simples por chave (cabeçalho Authorization: Bearer <chave>).

- Envio de fichas e fotos: chaves dos aparelhos (CHAVES_APARELHOS). Sem chaves configuradas, fica aberto
  (apenas para desenvolvimento).
- Leitura de camadas e fotos: CHAVE_LEITURA, se definida (também aceita ?chave= para facilitar o WebGIS/QGIS).

Antes da produção, trocar por login de usuário (ver docs/backend.md).
"""

import secrets

from fastapi import HTTPException, Request


def _chave_da_requisicao(request: Request):
    cab = request.headers.get("authorization", "")
    if cab.lower().startswith("bearer "):
        return cab[7:].strip()
    return request.query_params.get("chave")


def aparelho(request: Request):
    """Dependência dos endpoints de envio. Retorna o nome da chave usada (ou None em modo aberto)."""
    chaves = request.app.state.config.chaves_aparelhos
    if not chaves:
        return None
    recebida = _chave_da_requisicao(request) or ""
    for chave, nome in chaves.items():
        if secrets.compare_digest(recebida, chave):
            return nome
    raise HTTPException(401, "Chave do aparelho ausente ou inválida.")


def leitura(request: Request):
    """Dependência dos endpoints de leitura (camadas e fotos)."""
    chave = request.app.state.config.chave_leitura
    if not chave:
        return
    recebida = _chave_da_requisicao(request) or ""
    if not secrets.compare_digest(recebida, chave):
        raise HTTPException(401, "Chave de leitura ausente ou inválida.")
