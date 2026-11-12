-- Tabelas do backend do app de campo.
-- Cada ficha guarda o JSON original completo (payload) e algumas colunas
-- extraídas para filtrar e montar as camadas do WebGIS.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Talhões importados da camada pol_talhoes do WebGIS.
CREATE TABLE talhoes (
    fid           integer PRIMARY KEY,
    fazenda       text NOT NULL,
    talhao        text NOT NULL,
    area_ha       numeric(12, 4),
    propriedades  jsonb NOT NULL DEFAULT '{}'::jsonb,
    geom          geometry(MultiPolygon, 4326) NOT NULL,
    atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX talhoes_geom_idx ON talhoes USING gist (geom);

-- Parâmetros do PDA, versionados. A ficha é conferida com a versão vigente na data da coleta.
CREATE TABLE parametros_pda (
    versao        integer PRIMARY KEY,
    vigente_desde date NOT NULL,
    documento     jsonb NOT NULL,
    recebido_em   timestamptz NOT NULL DEFAULT now()
);

-- Uma linha por ficha finalizada recebida dos aparelhos.
CREATE TABLE fichas (
    id                     uuid PRIMARY KEY,               -- metadados.id, gerado no aparelho
    tipo_ficha             text NOT NULL,
    versao_schema          text NOT NULL,
    data                   date NOT NULL,
    fazenda                text NOT NULL,
    talhao                 text NOT NULL,
    talhao_fid             integer NOT NULL,
    bloco                  text,
    amostrador             text,
    dispositivo_id         text NOT NULL,
    enviado_por            text,                           -- nome da chave usada no envio
    criado_em              timestamptz NOT NULL,
    recebido_em            timestamptz NOT NULL DEFAULT now(),
    versao_parametros      integer,
    status_liberacao_corte text,                           -- só CQ
    resultados             jsonb NOT NULL,
    avisos                 jsonb NOT NULL DEFAULT '[]'::jsonb,
    payload                jsonb NOT NULL,
    payload_hash           text NOT NULL
);
CREATE INDEX fichas_tipo_data_idx ON fichas (tipo_ficha, data);
CREATE INDEX fichas_talhao_idx ON fichas (talhao_fid, data);

-- Pontos (pragas do solo, cigarrinha) ou amostras (CQ) de cada ficha.
CREATE TABLE pontos (
    ficha_id     uuid NOT NULL REFERENCES fichas (id) ON DELETE CASCADE,
    numero       integer NOT NULL,
    dados        jsonb NOT NULL,                           -- o item como veio, sem as fotos
    precisao_m   numeric(10, 2),
    capturado_em timestamptz,
    geom         geometry(Point, 4326) NOT NULL,
    PRIMARY KEY (ficha_id, numero)
);
CREATE INDEX pontos_geom_idx ON pontos USING gist (geom);

-- Fotos citadas nas fichas. A linha nasce quando a ficha chega; o arquivo chega depois.
CREATE TABLE fotos (
    id            uuid PRIMARY KEY,
    ficha_id      uuid NOT NULL REFERENCES fichas (id) ON DELETE CASCADE,
    ponto_numero  integer NOT NULL,
    legenda       text,
    capturado_em  timestamptz,
    geom          geometry(Point, 4326),
    arquivo       text,                                    -- nome do arquivo em PASTA_FOTOS
    tipo_conteudo text,
    tamanho_bytes integer,
    recebida_em   timestamptz
);
CREATE INDEX fotos_ficha_idx ON fotos (ficha_id);
CREATE INDEX fotos_geom_idx ON fotos USING gist (geom);
