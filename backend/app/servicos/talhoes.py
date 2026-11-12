"""Importa a camada pol_talhoes do WebGIS (GeoJSON) para a tabela talhoes."""

import json

from psycopg.types.json import Jsonb


def importar_talhoes(conn, geojson):
    """Insere ou atualiza os talhões pelo fid (mesmos critérios do app). Retorna (gravados, ignorados).

    A área vem do atributo "Área (ha.)"; se estiver vazio, é calculada do polígono.
    """
    gravados = ignorados = 0
    with conn.transaction():
        for feicao in geojson.get("features", []):
            p = feicao.get("properties") or {}
            geom = feicao.get("geometry")
            fid, fazenda, talhao = p.get("fid"), (p.get("Fazenda") or "").strip(), (p.get("Talhão") or "").strip()
            if fid is None or not fazenda or not talhao or not geom or geom.get("type") not in ("Polygon", "MultiPolygon", "GeometryCollection"):
                ignorados += 1
                continue
            area = p.get("Área (ha.)")
            area = area if isinstance(area, (int, float)) and area > 0 else None
            poligono = conn.execute(
                "SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)), 3)) AS g",
                (json.dumps(geom),),
            ).fetchone()["g"]
            if conn.execute("SELECT ST_IsEmpty(%s::geometry) AS vazio", (poligono,)).fetchone()["vazio"]:
                ignorados += 1
                continue
            conn.execute(
                """INSERT INTO talhoes (fid, fazenda, talhao, area_ha, propriedades, geom, atualizado_em)
                   VALUES (%s, %s, %s, coalesce(%s, round((ST_Area(%s::geography) / 10000)::numeric, 2)), %s, %s::geometry, now())
                   ON CONFLICT (fid) DO UPDATE SET fazenda = EXCLUDED.fazenda, talhao = EXCLUDED.talhao,
                       area_ha = EXCLUDED.area_ha, propriedades = EXCLUDED.propriedades, geom = EXCLUDED.geom,
                       atualizado_em = now()""",
                (int(fid), fazenda, talhao, area, poligono, Jsonb(p), poligono),
            )
            gravados += 1
    return gravados, ignorados
