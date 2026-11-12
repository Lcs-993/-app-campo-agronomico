"""Camadas em GeoJSON para o WebGIS: cada camada é uma view do banco (migracoes/002_camadas.sql)."""

from datetime import date
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from .. import auth
from .deps import conexao

router = APIRouter(prefix="/api/v1/camadas", tags=["camadas do WebGIS"])

CAMADAS = {
    "coletas": ("vw_coletas", "Uma feição por ficha, no formato do cartão de coleta do WebGIS (template \"coleta\")"),
    "pontos_pragas_solo": ("vw_pontos_pragas_solo", "Pontos de pragas do solo (tocos, % brocados, contagem por praga)"),
    "pontos_cigarrinha": ("vw_pontos_cigarrinha", "Pontos de cigarrinha-da-raiz (ninfas/m, adultos, espuma)"),
    "amostras_cq_broca": ("vw_amostras_cq_broca", "Amostras do CQ de infestação final da broca (II por amostra)"),
    "fotos": ("vw_fotos", "Fotos de campo já recebidas, com endereço da imagem"),
    "talhoes_cq_broca": ("vw_talhoes_cq_broca", "Talhões pela última ficha de CQ: II % e liberação de corte"),
    "talhoes_cigarrinha": ("vw_talhoes_cigarrinha", "Talhões pela última ficha de cigarrinha: ninfas/m e NDE"),
    "talhoes_pragas_solo": ("vw_talhoes_pragas_solo", "Talhões pela última ficha de pragas do solo: % brocados e pragas críticas"),
}
LIMITE_MAXIMO = 50000
# Colunas que só servem aos filtros ou à montagem dos endereços e não vão para os atributos.
SO_PARA_FILTRO = {"coletas": ("data", "fazenda", "talhao_fid", "foto_ids")}

# ?rotulos=pt: nomes e valores legíveis para quem vê a camada (WebGIS). Sem ele, nomes técnicos.
ROTULOS = {
    "ficha_id": "Ficha", "numero": "Ponto", "data": "Data da coleta", "fazenda": "Fazenda", "talhao": "Talhão",
    "talhao_fid": "fid do talhão", "bloco": "Bloco", "area_ha": "Área (ha.)",
    "tocos_examinados": "Tocos examinados", "tocos_brocados": "Tocos brocados", "pct_tocos_brocados": "Tocos brocados (%)",
    "migdolus": "Migdolus", "sphenophorus_levis": "Sphenophorus levis", "metamasius": "Metamasius",
    "broca_da_cana": "Broca-da-cana", "pao_de_galinha": "Pão-de-galinha", "alerta_ficha": "Alerta de praga crítica",
    "alerta_pragas_criticas": "Alerta de praga crítica", "pragas_criticas_detectadas": "Pragas críticas",
    "metros_lineares": "Metros lineares", "ninfas": "Ninfas", "adultos": "Adultos", "ninfas_por_metro": "Ninfas/m",
    "nde_referencia": "NDE (ninfas/m)", "acima_nde": "Acima do NDE", "fase_predominante": "Fase predominante",
    "espuma": "Espuma", "intensidade_espuma": "Intensidade da espuma",
    "entrenos_totais": "Entrenós totais", "entrenos_danificados": "Entrenós danificados",
    "indice_infestacao_pct": "II (%)", "status_liberacao_corte": "Liberação de corte",
    "precisao_m": "Precisão do GPS (m)", "capturado_em": "Capturado em", "foto_id": "Foto", "tipo_ficha": "Ficha de",
    "ponto_numero": "Ponto", "legenda": "Legenda", "url": "Endereço da foto",
}
VALORES = {
    "status_liberacao_corte": {
        "liberado": "Corte liberado", "alerta": "Alerta ao PDA", "bloqueado": "Corte bloqueado",
        "liberado_por_parecer_pda": "Liberado por parecer do PDA", "reprovado_por_parecer_pda": "Reprovado por parecer do PDA"},
    "fase_predominante": {"ninfa": "Ninfa", "adulto": "Adulto", "empate": "Empate", "sem_ocorrencia": "Sem ocorrência"},
    "tipo_ficha": {"pragas_solo": "Pragas do solo", "cigarrinha_raiz": "Cigarrinha-da-raiz",
                   "cq_infestacao_final_broca": "Infestação final da broca"},
}
NOMES_PRAGAS = {"migdolus": "Migdolus", "sphenophorus_levis": "Sphenophorus levis", "metamasius": "Metamasius",
                "broca_da_cana": "Broca-da-cana", "pao_de_galinha": "Pão-de-galinha"}


def _rotular(props):
    saida = {}
    for chave, valor in props.items():
        if isinstance(valor, bool):
            valor = "Sim" if valor else "Não"
        elif chave in VALORES and valor is not None:
            valor = VALORES[chave].get(valor, valor)
        elif chave == "pragas_criticas_detectadas" and isinstance(valor, list):
            valor = ", ".join(NOMES_PRAGAS.get(v, v) for v in valor) or "Nenhuma"
        saida[ROTULOS.get(chave, chave)] = valor
    return saida


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
    rotulos: str | None = Query(None, description="pt = nomes e valores legíveis (para o WebGIS)"),
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
    # Se a leitura veio com ?chave=, as imagens precisam dela também (a tag <img> não manda cabeçalho).
    chave = request.query_params.get("chave")
    sufixo = f"?chave={quote(chave)}" if chave else ""
    url_foto = lambda id_foto: f"{base}/api/v1/fotos/{id_foto}{sufixo}"  # noqa: E731
    feicoes = []
    for linha in linhas:
        props = linha["properties"]
        if "foto_id" in props:
            props["url"] = url_foto(props["foto_id"])
        if "foto_ids" in props:
            ids = (props["foto_ids"] or "").split(";")
            props["Fotos"] = ";".join(url_foto(i) for i in ids if i) or None
        for coluna in SO_PARA_FILTRO.get(nome, ()):
            props.pop(coluna, None)
        if rotulos == "pt":
            props = _rotular(props)
        feicoes.append({"type": "Feature", "geometry": linha["geometry"], "properties": props})
    return {"type": "FeatureCollection", "name": nome, "features": feicoes}
