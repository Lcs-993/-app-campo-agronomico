"""Recebe uma ficha finalizada do aparelho e grava nas tabelas.

Regras:
- A ficha é identificada pelo metadados.id (UUID gerado no aparelho). Reenviar a mesma ficha
  não cria duplicata (situação "ja_recebida").
- Mesma id com conteúdo diferente é recusada ("conflito"): ficha finalizada não muda no servidor.
- Schema e regras de negócio são conferidos de novo no servidor, com os parâmetros do PDA
  vigentes na data da coleta. O aparelho não é a fonte da verdade dos cálculos.
- Problemas de localização (ponto longe do talhão, talhão desconhecido) viram avisos, não erros:
  a camada de talhões do servidor pode estar desatualizada em relação à do aparelho.
"""

import hashlib
import json
import uuid
from datetime import date

from psycopg.types.json import Jsonb

from ..db import parametros_para_data
from .validacao import validar

COLECAO = {"pragas_solo": "pontos", "cigarrinha_raiz": "pontos", "cq_infestacao_final_broca": "amostras"}
TOLERANCIA_FORA_DO_TALHAO_M = 30


def hash_payload(doc):
    texto = json.dumps(doc, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def _resposta(id_ficha, situacao, erros=(), avisos=(), fotos_pendentes=()):
    return {
        "id": id_ficha,
        "situacao": situacao,
        "erros": list(erros),
        "avisos": list(avisos),
        "fotos_pendentes": [str(f) for f in fotos_pendentes],
    }


def _fotos_pendentes(conn, id_ficha):
    return [r["id"] for r in conn.execute(
        "SELECT id FROM fotos WHERE ficha_id = %s AND recebida_em IS NULL ORDER BY ponto_numero, id", (id_ficha,))]


def _data_da_ficha(doc):
    try:
        return date.fromisoformat(doc["identificacao"]["data"])
    except (KeyError, TypeError, ValueError):
        return date.today()


def _ponto_geom(geo):
    return f"SRID=4326;POINT({float(geo['longitude'])} {float(geo['latitude'])})"


def _avisos_localizacao(conn, id_ficha, talhao_fid):
    if not conn.execute("SELECT 1 FROM talhoes LIMIT 1").fetchone():
        return []  # talhões ainda não importados no servidor: nada a conferir
    if not conn.execute("SELECT 1 FROM talhoes WHERE fid = %s", (talhao_fid,)).fetchone():
        return [f"talhão fid {talhao_fid} não existe nos talhões do servidor (importe a camada pol_talhoes atualizada)"]
    avisos = []
    for r in conn.execute(
        """SELECT p.numero, ST_Covers(t.geom, p.geom) AS dentro,
                  ST_Distance(t.geom::geography, p.geom::geography) AS distancia_m
           FROM pontos p JOIN talhoes t ON t.fid = %s
           WHERE p.ficha_id = %s ORDER BY p.numero""",
        (talhao_fid, id_ficha),
    ):
        if not r["dentro"] and r["distancia_m"] > TOLERANCIA_FORA_DO_TALHAO_M:
            avisos.append(f"ponto {r['numero']}: {r['distancia_m']:.0f} m fora do talhão {talhao_fid}")
    return avisos


def receber_ficha(conn, doc, enviado_por=None):
    """Valida e grava uma ficha. Retorna a situação para o aparelho (nunca levanta erro de validação)."""
    if not isinstance(doc, dict):
        return _resposta(None, "invalida", ["a ficha precisa ser um objeto JSON"])
    id_texto = (doc.get("metadados") or {}).get("id")
    try:
        id_ficha = uuid.UUID(str(id_texto))
    except ValueError:
        return _resposta(id_texto, "invalida", ["metadados/id ausente ou não é um UUID"])

    hash_novo = hash_payload(doc)
    existente = conn.execute("SELECT payload_hash FROM fichas WHERE id = %s", (id_ficha,)).fetchone()
    if existente:
        if existente["payload_hash"] == hash_novo:
            return _resposta(str(id_ficha), "ja_recebida", fotos_pendentes=_fotos_pendentes(conn, id_ficha))
        return _resposta(str(id_ficha), "conflito", [
            "já existe no servidor uma ficha com este id e conteúdo diferente; ficha recebida não pode ser alterada"])

    versao_param, parametros = parametros_para_data(conn, _data_da_ficha(doc))
    erros = validar(doc, parametros)
    if erros:
        return _resposta(str(id_ficha), "invalida", erros)

    ident, meta = doc["identificacao"], doc["metadados"]
    tipo = doc["tipo_ficha"]
    with conn.transaction():
        gravou = conn.execute(
            """INSERT INTO fichas (id, tipo_ficha, versao_schema, data, fazenda, talhao, talhao_fid, bloco, amostrador,
                                   dispositivo_id, enviado_por, criado_em, versao_parametros, status_liberacao_corte,
                                   resultados, payload, payload_hash)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (id) DO NOTHING RETURNING id""",
            (id_ficha, tipo, meta["versao_schema"], ident["data"], ident["fazenda"], ident["talhao"], ident["talhao_fid"],
             ident.get("bloco"), ident.get("amostrador"), meta["dispositivo_id"], enviado_por, meta["criado_em"],
             versao_param, doc.get("status_liberacao_corte"), Jsonb(doc["resultados"]), Jsonb(doc), hash_novo),
        ).fetchone()
        if gravou:
            avisos = _gravar_itens(conn, id_ficha, doc)
    if not gravou:  # outro envio da mesma ficha chegou ao mesmo tempo: responde como reenvio
        return receber_ficha(conn, doc, enviado_por)
    return _resposta(str(id_ficha), "gravada", avisos=avisos, fotos_pendentes=_fotos_pendentes(conn, id_ficha))


def _gravar_itens(conn, id_ficha, doc):
    """Grava pontos/amostras e fotos da ficha e devolve os avisos de localização."""
    ident = doc["identificacao"]
    for item in doc[COLECAO[doc["tipo_ficha"]]]:
        geo = item["geolocalizacao"]
        dados = {k: v for k, v in item.items() if k not in ("fotos", "geolocalizacao")}
        conn.execute(
            """INSERT INTO pontos (ficha_id, numero, dados, precisao_m, capturado_em, geom)
               VALUES (%s, %s, %s, %s, %s, ST_GeomFromEWKT(%s))""",
            (id_ficha, item["numero"], Jsonb(dados), geo.get("precisao_m"), geo.get("capturado_em"), _ponto_geom(geo)),
        )
        for foto in item.get("fotos", []):
            fgeo = foto.get("geolocalizacao")
            conn.execute(
                """INSERT INTO fotos (id, ficha_id, ponto_numero, legenda, capturado_em, geom)
                   VALUES (%s, %s, %s, %s, %s, ST_GeomFromEWKT(%s)) ON CONFLICT (id) DO NOTHING""",
                (foto["id"], id_ficha, item["numero"], foto.get("legenda"), foto["capturado_em"],
                 _ponto_geom(fgeo) if fgeo else None),
            )

    avisos = _avisos_localizacao(conn, id_ficha, ident["talhao_fid"])
    if avisos:
        conn.execute("UPDATE fichas SET avisos = %s WHERE id = %s", (Jsonb(avisos), id_ficha))
    return avisos
