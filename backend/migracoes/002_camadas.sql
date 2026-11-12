-- Views que viram camadas do WebGIS (GET /api/v1/camadas/<nome>.geojson)
-- e podem ser abertas direto no QGIS.
-- Todas têm as colunas data, fazenda, talhao_fid e geom, usadas nos filtros.
-- Nome do amostrador e do aparelho ficam de fora das camadas (LGPD).

CREATE FUNCTION campo_soma_estagios(j jsonb) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce((j ->> 'larva')::int, 0) + coalesce((j ->> 'pupa')::int, 0) + coalesce((j ->> 'adulto')::int, 0)
$$;

-- Pontos de pragas do solo.
CREATE VIEW vw_pontos_pragas_solo AS
SELECT f.id AS ficha_id, p.numero, f.data, f.fazenda, f.talhao, f.talhao_fid, f.bloco,
       (p.dados ->> 'tocos_examinados')::int AS tocos_examinados,
       (p.dados ->> 'tocos_brocados')::int AS tocos_brocados,
       round(100.0 * (p.dados ->> 'tocos_brocados')::int / nullif((p.dados ->> 'tocos_examinados')::int, 0), 2) AS pct_tocos_brocados,
       campo_soma_estagios(p.dados -> 'migdolus') AS migdolus,
       campo_soma_estagios(p.dados -> 'sphenophorus_levis') AS sphenophorus_levis,
       campo_soma_estagios(p.dados -> 'metamasius') AS metamasius,
       campo_soma_estagios(p.dados -> 'broca_da_cana') AS broca_da_cana,
       campo_soma_estagios(p.dados -> 'pao_de_galinha') AS pao_de_galinha,
       (f.resultados ->> 'alerta_pragas_criticas')::boolean AS alerta_ficha,
       p.precisao_m, p.capturado_em, p.geom
FROM pontos p JOIN fichas f ON f.id = p.ficha_id
WHERE f.tipo_ficha = 'pragas_solo';

-- Pontos de cigarrinha-da-raiz.
CREATE VIEW vw_pontos_cigarrinha AS
SELECT f.id AS ficha_id, p.numero, f.data, f.fazenda, f.talhao, f.talhao_fid,
       (p.dados ->> 'metros_lineares')::numeric AS metros_lineares,
       (p.dados ->> 'ninfas')::int AS ninfas,
       (p.dados ->> 'adultos')::int AS adultos,
       round((p.dados ->> 'ninfas')::numeric / nullif((p.dados ->> 'metros_lineares')::numeric, 0), 2) AS ninfas_por_metro,
       (p.dados -> 'espuma' ->> 'presente')::boolean AS espuma,
       (p.dados -> 'espuma' ->> 'intensidade')::int AS intensidade_espuma,
       p.precisao_m, p.capturado_em, p.geom
FROM pontos p JOIN fichas f ON f.id = p.ficha_id
WHERE f.tipo_ficha = 'cigarrinha_raiz';

-- Amostras do CQ de infestação final da broca.
CREATE VIEW vw_amostras_cq_broca AS
SELECT f.id AS ficha_id, p.numero, f.data, f.fazenda, f.talhao, f.talhao_fid,
       (p.dados ->> 'entrenos_totais')::int AS entrenos_totais,
       (p.dados ->> 'entrenos_danificados')::int AS entrenos_danificados,
       round(100.0 * (p.dados ->> 'entrenos_danificados')::int / nullif((p.dados ->> 'entrenos_totais')::int, 0), 2) AS indice_infestacao_pct,
       f.status_liberacao_corte,
       p.precisao_m, p.capturado_em, p.geom
FROM pontos p JOIN fichas f ON f.id = p.ficha_id
WHERE f.tipo_ficha = 'cq_infestacao_final_broca';

-- Fotos já recebidas (o endereço da imagem é acrescentado pela API).
CREATE VIEW vw_fotos AS
SELECT ft.id AS foto_id, f.id AS ficha_id, f.tipo_ficha, ft.ponto_numero, f.data, f.fazenda, f.talhao, f.talhao_fid,
       ft.legenda, ft.capturado_em, coalesce(ft.geom, p.geom) AS geom
FROM fotos ft
JOIN fichas f ON f.id = ft.ficha_id
LEFT JOIN pontos p ON p.ficha_id = ft.ficha_id AND p.numero = ft.ponto_numero
WHERE ft.recebida_em IS NOT NULL;

-- Situação de cada talhão pela ficha mais recente de cada tipo (mapa temático).
CREATE VIEW vw_talhoes_cq_broca AS
SELECT DISTINCT ON (f.talhao_fid)
       f.talhao_fid, t.fazenda, t.talhao, t.area_ha, f.data, f.id AS ficha_id,
       (f.resultados ->> 'indice_infestacao_pct')::numeric AS indice_infestacao_pct,
       f.status_liberacao_corte, t.geom
FROM fichas f JOIN talhoes t ON t.fid = f.talhao_fid
WHERE f.tipo_ficha = 'cq_infestacao_final_broca'
ORDER BY f.talhao_fid, f.data DESC, f.recebido_em DESC;

CREATE VIEW vw_talhoes_cigarrinha AS
SELECT DISTINCT ON (f.talhao_fid)
       f.talhao_fid, t.fazenda, t.talhao, t.area_ha, f.data, f.id AS ficha_id,
       (f.resultados ->> 'ninfas_por_metro')::numeric AS ninfas_por_metro,
       (f.resultados ->> 'nde_referencia')::numeric AS nde_referencia,
       (f.resultados ->> 'acima_nde')::boolean AS acima_nde,
       f.resultados ->> 'fase_predominante' AS fase_predominante,
       t.geom
FROM fichas f JOIN talhoes t ON t.fid = f.talhao_fid
WHERE f.tipo_ficha = 'cigarrinha_raiz'
ORDER BY f.talhao_fid, f.data DESC, f.recebido_em DESC;

CREATE VIEW vw_talhoes_pragas_solo AS
SELECT DISTINCT ON (f.talhao_fid)
       f.talhao_fid, t.fazenda, t.talhao, t.area_ha, f.data, f.id AS ficha_id,
       (f.resultados ->> 'percentual_tocos_brocados')::numeric AS pct_tocos_brocados,
       (f.resultados ->> 'alerta_pragas_criticas')::boolean AS alerta_pragas_criticas,
       f.resultados -> 'pragas_criticas_detectadas' AS pragas_criticas_detectadas,
       t.geom
FROM fichas f JOIN talhoes t ON t.fid = f.talhao_fid
WHERE f.tipo_ficha = 'pragas_solo'
ORDER BY f.talhao_fid, f.data DESC, f.recebido_em DESC;
