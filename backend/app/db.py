"""Conexão com o PostgreSQL/PostGIS e aplicação das migrações SQL."""

import json
import logging
from pathlib import Path

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

PASTA_MIGRACOES = Path(__file__).resolve().parent.parent / "migracoes"
log = logging.getLogger("campo.db")


def criar_pool(database_url):
    return ConnectionPool(database_url, kwargs={"row_factory": dict_row, "autocommit": True}, min_size=1, max_size=10, open=True)


def migrar(conn):
    """Aplica, em ordem, os arquivos migracoes/NNN_*.sql ainda não aplicados."""
    conn.execute("CREATE TABLE IF NOT EXISTS migracoes (nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now())")
    feitas = {r["nome"] for r in conn.execute("SELECT nome FROM migracoes")}
    for arquivo in sorted(PASTA_MIGRACOES.glob("*.sql")):
        if arquivo.name in feitas:
            continue
        log.info("Aplicando migração %s", arquivo.name)
        with conn.transaction():
            conn.execute(arquivo.read_text(encoding="utf-8"))
            conn.execute("INSERT INTO migracoes (nome) VALUES (%s)", (arquivo.name,))


def gravar_parametros(conn, documento):
    """Insere uma versão dos parâmetros do PDA (ignora se a versão já existe)."""
    conn.execute(
        """INSERT INTO parametros_pda (versao, vigente_desde, documento) VALUES (%s, %s, %s)
           ON CONFLICT (versao) DO NOTHING""",
        (documento["versao"], documento["vigente_desde"], Jsonb(documento)),
    )


def semear_parametros(conn, caminho):
    """Garante ao menos uma versão dos parâmetros: usa app/parametros-pda.json na primeira vez."""
    if conn.execute("SELECT 1 FROM parametros_pda LIMIT 1").fetchone():
        return
    if Path(caminho).exists():
        gravar_parametros(conn, json.loads(Path(caminho).read_text(encoding="utf-8")))
        log.info("Parâmetros do PDA iniciais carregados de %s", caminho)


def parametros_para_data(conn, data):
    """Versão dos parâmetros vigente na data da coleta (ou a mais antiga, se a data for anterior a todas)."""
    linha = conn.execute(
        "SELECT versao, documento FROM parametros_pda WHERE vigente_desde <= %s ORDER BY vigente_desde DESC, versao DESC LIMIT 1",
        (data,),
    ).fetchone() or conn.execute(
        "SELECT versao, documento FROM parametros_pda ORDER BY vigente_desde, versao LIMIT 1"
    ).fetchone()
    return (linha["versao"], linha["documento"]) if linha else (None, None)
