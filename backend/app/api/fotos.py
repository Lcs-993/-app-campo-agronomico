"""Envio e leitura das fotos. A foto só é aceita se foi citada numa ficha já recebida."""

import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from .. import auth
from .deps import conexao

router = APIRouter(prefix="/api/v1/fotos", tags=["fotos"])
EXTENSOES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}


def _uuid(texto):
    try:
        return uuid.UUID(texto)
    except ValueError:
        raise HTTPException(404, "Foto não encontrada.") from None


@router.put("/{foto_id}")
async def enviar_foto(foto_id: str, request: Request, conn=Depends(conexao), _=Depends(auth.aparelho)):
    """Corpo da requisição = bytes da imagem; Content-Type informa o formato. Reenviar substitui o arquivo."""
    id_foto = _uuid(foto_id)
    if not conn.execute("SELECT 1 FROM fotos WHERE id = %s", (id_foto,)).fetchone():
        raise HTTPException(404, "Foto não citada em nenhuma ficha recebida. Envie a ficha antes das fotos.")
    tipo = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if tipo not in EXTENSOES:
        raise HTTPException(415, f"Formato não aceito: {tipo or 'não informado'}. Use JPEG, PNG, WebP ou HEIC.")

    config = request.app.state.config
    limite = int(config.tamanho_max_foto_mb * 1024 * 1024)
    pasta = config.pasta_fotos
    pasta.mkdir(parents=True, exist_ok=True)
    nome = f"{id_foto}{EXTENSOES[tipo]}"
    temporario = pasta / f".{nome}.parcial"
    tamanho = 0
    try:
        with open(temporario, "wb") as saida:
            async for pedaco in request.stream():
                tamanho += len(pedaco)
                if tamanho > limite:
                    raise HTTPException(413, f"Foto maior que {config.tamanho_max_foto_mb:g} MB.")
                saida.write(pedaco)
        if tamanho == 0:
            raise HTTPException(400, "Foto vazia.")
        os.replace(temporario, pasta / nome)
    finally:
        temporario.unlink(missing_ok=True)

    conn.execute(
        "UPDATE fotos SET arquivo = %s, tipo_conteudo = %s, tamanho_bytes = %s, recebida_em = now() WHERE id = %s",
        (nome, tipo, tamanho, id_foto),
    )
    return {"id": str(id_foto), "recebida": True, "tamanho_bytes": tamanho}


@router.get("/{foto_id}")
def obter_foto(foto_id: str, request: Request, conn=Depends(conexao), _=Depends(auth.leitura)):
    linha = conn.execute(
        "SELECT arquivo, tipo_conteudo FROM fotos WHERE id = %s AND recebida_em IS NOT NULL", (_uuid(foto_id),)
    ).fetchone()
    caminho = linha and request.app.state.config.pasta_fotos / linha["arquivo"]
    if not caminho or not caminho.exists():
        raise HTTPException(404, "Foto não encontrada.")
    return FileResponse(caminho, media_type=linha["tipo_conteudo"])
