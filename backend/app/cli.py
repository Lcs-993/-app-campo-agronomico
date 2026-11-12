"""Tarefas de administração pela linha de comando (rodar dentro de backend/).

    python -m app.cli migrar
    python -m app.cli importar-talhoes https://lcs-993.github.io/web_gis/geojson/pol_talhoes.geojson
    python -m app.cli importar-parametros ../app/parametros-pda.json
    python -m app.cli importar-fichas fichas-2026-11-12.json     # arquivo exportado pelo app
"""

import argparse
import json
import sys
from pathlib import Path

import httpx
import psycopg
from psycopg.rows import dict_row

from .config import Config
from .db import gravar_parametros, migrar, semear_parametros
from .servicos.ingestao import receber_ficha
from .servicos.talhoes import importar_talhoes
from .servicos.validacao import validar


def _ler_json(origem):
    if origem.startswith(("http://", "https://")):
        resp = httpx.get(origem, timeout=120, follow_redirects=True)
        resp.raise_for_status()
        return resp.json()
    return json.loads(Path(origem).read_text(encoding="utf-8"))


def main(argv=None):
    parser = argparse.ArgumentParser(prog="python -m app.cli", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="comando", required=True)
    sub.add_parser("migrar", help="aplica as migrações do banco")
    p = sub.add_parser("importar-talhoes", help="importa a camada pol_talhoes (arquivo ou URL)")
    p.add_argument("origem")
    p = sub.add_parser("importar-parametros", help="cadastra uma versão dos parâmetros do PDA")
    p.add_argument("arquivo")
    p = sub.add_parser("importar-fichas", help="importa fichas de um arquivo exportado pelo app")
    p.add_argument("arquivo")
    args = parser.parse_args(argv)

    config = Config.do_ambiente()
    with psycopg.connect(config.database_url, row_factory=dict_row, autocommit=True) as conn:
        migrar(conn)
        semear_parametros(conn, config.parametros_iniciais)
        if args.comando == "migrar":
            print("Migrações aplicadas.")
        elif args.comando == "importar-talhoes":
            gravados, ignorados = importar_talhoes(conn, _ler_json(args.origem))
            print(f"Talhões gravados: {gravados}; ignorados (sem fid, fazenda, talhão ou polígono): {ignorados}")
        elif args.comando == "importar-parametros":
            doc = _ler_json(args.arquivo)
            erros = validar(doc)
            if erros:
                print("Parâmetros inválidos:", *erros, sep="\n  - ")
                return 1
            gravar_parametros(conn, doc)
            print(f"Parâmetros versão {doc['versao']} (vigente desde {doc['vigente_desde']}) cadastrados.")
        elif args.comando == "importar-fichas":
            doc = _ler_json(args.arquivo)
            fichas = doc["fichas"] if isinstance(doc.get("fichas"), list) else [doc]
            falhou = False
            for ficha in fichas:
                r = receber_ficha(conn, ficha, enviado_por="importacao")
                print(f"{r['situacao']:<12} {r['id']}")
                for msg in r["erros"] + r["avisos"]:
                    print(f"    - {msg}")
                falhou |= r["situacao"] in ("invalida", "conflito")
            return 1 if falhou else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
