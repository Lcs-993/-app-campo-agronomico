-- Camada "coletas" no formato do cartão de coleta do WebGIS (template "coleta" em js/config.js
-- do repositório web_gis): uma feição por ficha, com os atributos em português que o cartão usa.
-- Fazenda e Talhão iguais aos de pol_talhoes ligam a coleta ao talhão no WebGIS.
-- As colunas data, fazenda e talhao_fid servem só aos filtros e são retiradas pela API;
-- foto_ids vira o atributo "Fotos" (endereços separados por ";").

-- to_char usa ponto ou vírgula conforme lc_numeric; troca para o padrão brasileiro.
CREATE FUNCTION campo_num(valor numeric, casas int DEFAULT 2) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
    SELECT replace(replace(replace(
        to_char(valor, 'FM999,999,990' || CASE WHEN casas > 0 THEN '.' || repeat('0', casas) ELSE '' END),
        ',', '#'), '.', ','), '#', '.')
$$;

CREATE VIEW vw_coletas AS
WITH base AS (
    SELECT f.*,
           (SELECT ST_PointOnSurface(ST_Collect(p.geom)) FROM pontos p WHERE p.ficha_id = f.id) AS geom,
           (SELECT count(*) FROM pontos p WHERE p.ficha_id = f.id) AS n_itens,
           (SELECT string_agg(ft.id::text, ';' ORDER BY ft.ponto_numero, ft.capturado_em)
              FROM fotos ft WHERE ft.ficha_id = f.id AND ft.recebida_em IS NOT NULL) AS foto_ids
    FROM fichas f
)
SELECT
    upper(CASE b.tipo_ficha WHEN 'pragas_solo' THEN 'PS' WHEN 'cigarrinha_raiz' THEN 'CG' ELSE 'CQ' END)
        || '-' || to_char(b.data, 'YYYY') || '-' || left(b.id::text, 8)                       AS "Código",
    CASE b.tipo_ficha
        WHEN 'pragas_solo' THEN 'Pragas do solo'
        WHEN 'cigarrinha_raiz' THEN 'Pragas · Cigarrinha'
        ELSE 'Qualidade · Broca' END                                       AS "Tipo",
    CASE b.tipo_ficha
        WHEN 'pragas_solo' THEN coalesce(
            nullif(array_to_string(ARRAY(
                SELECT CASE x WHEN 'migdolus' THEN 'Migdolus' WHEN 'sphenophorus_levis' THEN 'Sphenophorus levis'
                              WHEN 'metamasius' THEN 'Metamasius' WHEN 'broca_da_cana' THEN 'Broca-da-cana'
                              WHEN 'pao_de_galinha' THEN 'Pão-de-galinha' ELSE x END
                FROM jsonb_array_elements_text(b.resultados -> 'pragas_criticas_detectadas') AS x), ', '), ''),
            'Pragas de solo')
        WHEN 'cigarrinha_raiz' THEN 'Mahanarva fimbriolata'
        ELSE 'Diatraea saccharalis' END                                                       AS "Alvo",
    CASE b.tipo_ficha
        WHEN 'pragas_solo' THEN CASE WHEN (b.resultados ->> 'alerta_pragas_criticas')::boolean THEN 'Alto' END
        WHEN 'cigarrinha_raiz' THEN CASE WHEN (b.resultados ->> 'acima_nde')::boolean THEN 'Alto' ELSE 'Baixo' END
        ELSE CASE
            WHEN (b.resultados ->> 'indice_infestacao_pct')::numeric > (b.resultados ->> 'limite_bloqueio_pct')::numeric THEN 'Alto'
            WHEN (b.resultados ->> 'indice_infestacao_pct')::numeric > (b.resultados ->> 'limite_alerta_pct')::numeric THEN 'Moderado'
            ELSE 'Baixo' END
    END                                                                                       AS "Nível",
    CASE b.tipo_ficha
        WHEN 'pragas_solo' THEN campo_num((b.resultados ->> 'percentual_tocos_brocados')::numeric, 1) || '% de tocos brocados ('
            || (b.resultados ->> 'total_tocos_brocados') || ' de ' || (b.resultados ->> 'total_tocos_examinados') || ')'
        WHEN 'cigarrinha_raiz' THEN campo_num((b.resultados ->> 'ninfas_por_metro')::numeric) || ' ninfas/m (NDE '
            || campo_num((b.resultados ->> 'nde_referencia')::numeric, 1) || ') · ' || (b.resultados ->> 'total_adultos') || ' adultos'
        ELSE 'II ' || campo_num((b.resultados ->> 'indice_infestacao_pct')::numeric) || '% ('
            || (b.resultados ->> 'total_entrenos_danificados') || ' de ' || (b.resultados ->> 'total_entrenos') || ' entrenós)'
    END                                                                                       AS "Resultado",
    CASE b.status_liberacao_corte
        WHEN 'liberado' THEN 'Corte liberado'
        WHEN 'alerta' THEN 'Alerta ao PDA'
        WHEN 'bloqueado' THEN 'Corte bloqueado'
        WHEN 'liberado_por_parecer_pda' THEN 'Liberado por parecer do PDA'
        WHEN 'reprovado_por_parecer_pda' THEN 'Reprovado por parecer do PDA'
        ELSE 'Concluído' END                                                                  AS "Status",
    b.criado_em                                                                               AS "Data da coleta",
    b.amostrador                                                                              AS "Responsável",
    b.fazenda                                                                                 AS "Fazenda",
    b.talhao                                                                                  AS "Talhão",
    CASE WHEN b.tipo_ficha = 'cq_infestacao_final_broca' THEN 'Controle de Qualidade' ELSE 'Fitossanidade (MIP)' END
        || ' · App de campo'                                                                  AS "Campanha",
    b.n_itens || CASE WHEN b.tipo_ficha = 'cq_infestacao_final_broca' THEN ' amostra' ELSE ' ponto' END
        || CASE WHEN b.n_itens = 1 THEN '' ELSE 's' END                                       AS "Pontos",
    b.payload ->> 'observacoes'                                                               AS "Observações",
    b.recebido_em                                                                             AS "Atualizado em",
    'Servidor do app de campo'                                                                AS "Atualizado por",
    b.id                                                                                      AS ficha_id,
    b.foto_ids, b.data, b.fazenda, b.talhao_fid, b.geom
FROM base b
WHERE b.geom IS NOT NULL;
