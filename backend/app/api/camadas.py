"""Camadas em GeoJSON para o WebGIS: cada camada é uma view do banco (migracoes/002_camadas.sql)."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from .. import auth
from .deps import conexao

router = APIRouter(prefix="/api/v1/camadas", tags=["camadas do WebGIS"])

CAMADAS = {
    "pontos_pragas_solo": ("vw_pontos_pragas_solo", "Pontos de pragas do solo (tocos, % brocados, contagem por praga)"),
    "pontos_cigarrinha": ("vw_pontos_cigarrinha", "Pontos de cigarrinha-da-raiz (ninfas/m, adultos, espuma)"),
    "amostras_cq_broca": ("vw_amostras_cq_broca", "Amostras do CQ de infestação final da broca (II por amostra)"),
    "fotos": ("vw_fotos", "Fotos de campo já recebidas, com endereço da imagem"),
    "talhoes_cq_broca": ("vw_talhoes_cq_broca", "Talhões pela última ficha de CQ: II % e liberação de corte"),
    "talhoes_cigarrinha": ("vw_talhoes_cigarrinha", "Talhões pela última ficha de cigarrinha: ninfas/m e NDE"),
    "talhoes_pragas_solo": ("vw_talhoes_pragas_solo", "Talhões pela última ficha de pragas do solo: % brocados e pragas críticas"),
}
LIMITE_MAXIMO = 50000


@router.get("")
def listar_camadas(request: Request):
    base = str(request.base_url).rstrip("/")
    return [
        {"nome": nome, "descricao": desc, "url": f"{base}/api/v1/camadas/{nome}.geojson"}
        for nome, (_, desc) in CAMADAS.items()
    ]


@router.get("/{nome}.geojson")
def camada(
    nome: str,
    request: Request,
    de: date | None = Query(None, description="Data da coleta a partir de (AAAA-MM-DD)"),
    ate: date | None = Query(None, description="Data da coleta até (AAAA-MM-DD)"),
    fazenda: str | None = Query(None, description="Fazenda exatamente como no WebGIS (código-nome) ou só o código"),
    talhao_fid: int | None = Query(None),
    limite: int = Query(10000, ge=1, le=LIMITE_MAXIMO),
    conn=Depends(conexao),
    _=Depends(auth.leitura),
):
    if nome not in CAMADAS:
        raise HTTPException(404, f"Camada desconhecida. Disponíveis: {', '.join(CAMADAS)}")
    view = CAMADAS[nome][0]  # nome vem da lista acima, nunca do usuário
    filtros, valores = [], []
    if de:
        filtros.append("data >= %s"); valores.append(de)
    if ate:
        filtros.append("data <= %s"); valores.append(ate)
    if fazenda:
        filtros.append("(fazenda = %s OR split_part(fazenda, '-', 1) = %s)"); valores += [fazenda, fazenda]
    if talhao_fid is not None:
        filtros.append("talhao_fid = %s"); valores.append(talhao_fid)
    onde = f"WHERE {' AND '.join(filtros)}" if filtros else ""
    linhas = conn.execute(
        f"""SELECT ST_AsGeoJSON(v.geom, 7)::jsonb AS geometry, to_jsonb(v) - 'geom' AS properties
            FROM {view} v {onde} ORDER BY data DESC LIMIT %s""",
        (*valores, limite),
    ).fetchall()

    base = str(request.base_url).rstrip("/")
    feicoes = []
    for linha in linhas:
        props = linha["properties"]
        if "foto_id" in props:
            props["url"] = f"{base}/api/v1/fotos/{props['foto_id']}"
        feicoes.append({"type": "Feature", "geometry": linha["geometry"], "properties": props})
    return {"type": "FeatureCollection", "name": nome, "features": feicoes}
