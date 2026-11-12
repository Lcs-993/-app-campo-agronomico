"""Saúde da API, teste da chave do aparelho e parâmetros do PDA."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from .. import auth
from ..db import parametros_para_data
from .deps import conexao

router = APIRouter(prefix="/api/v1", tags=["geral"])
VERSAO_API = "0.1.0"


@router.get("/saude")
def saude(conn=Depends(conexao)):
    conn.execute("SELECT 1")
    return {"ok": True, "versao_api": VERSAO_API}


@router.get("/aparelho")
def quem_sou(nome=Depends(auth.aparelho)):
    """Usado pelo app no botão "Testar conexão": confirma que a chave do aparelho vale."""
    return {"ok": True, "aparelho": nome}


@router.get("/parametros-pda")
def parametros_vigentes(conn=Depends(conexao)):
    versao, documento = parametros_para_data(conn, date.today())
    if documento is None:
        raise HTTPException(404, "Nenhuma versão dos parâmetros do PDA cadastrada.")
    return documento
