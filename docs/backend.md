# Backend: sincronização das fichas e camadas para o WebGIS

O app de campo coleta offline e guarda as fichas no aparelho. O backend recebe as fichas finalizadas, confere tudo de novo, grava num banco geográfico e publica os dados como camadas GeoJSON para o WebGIS (e para o QGIS).

```
 Aparelho (PWA)                      Servidor (backend/)                         Escritório
┌───────────────────┐  POST fichas  ┌──────────────────────────────┐  GeoJSON   ┌──────────────┐
│ IndexedDB         │ ────────────▶ │ FastAPI                       │ ─────────▶ │ WebGIS       │
│ fichas + fotos    │  PUT fotos    │  · valida (schemas + regras)  │            │ (desktop)    │
│ status do envio   │ ────────────▶ │  · grava                      │            └──────────────┘
└───────────────────┘               │ PostgreSQL + PostGIS          │  conexão   ┌──────────────┐
                                    │  tabelas + views (camadas)    │ ─────────▶ │ QGIS         │
                                    │ pasta de fotos                │            └──────────────┘
                                    └──────────────────────────────┘
```

## Escolhas

| Camada | Escolha | Motivo |
|---|---|---|
| API | FastAPI (Python) | Reaproveita os mesmos schemas (`schemas/`) e o mesmo validador (`scripts/validar_fichas.py`) usados pelo app e pelos testes. As regras ficam num lugar só. |
| Banco | PostgreSQL + PostGIS | Consultas espaciais (ponto dentro do talhão, distância) e conexão direta pelo QGIS. |
| Migrações | Arquivos SQL numerados (`backend/migracoes/NNN_*.sql`) | O modelo é pequeno e as camadas são views SQL. Um ORM com Alembic não compensa por enquanto. A tabela `migracoes` registra o que já foi aplicado. |
| Fotos | Pasta no disco (volume Docker) | Simples para começar. A troca por S3/MinIO fica isolada em `api/fotos.py`. |
| Execução | Docker Compose (`docker-compose.yml`) | A mesma configuração serve para o computador e para a homologação. |

## Estrutura

```
docker-compose.yml          API + banco PostGIS
backend/
  Dockerfile                imagem da API (construída da raiz do repositório)
  requirements.txt
  .env.exemplo              variáveis de ambiente (copiar para backend/.env)
  app/
    main.py                 cria a API, CORS, aplica migrações ao iniciar
    config.py               configuração pelas variáveis de ambiente
    db.py                   pool de conexões, migrações, parâmetros do PDA
    auth.py                 chaves dos aparelhos e chave de leitura
    cli.py                  migrar, importar talhões/parâmetros/fichas
    api/
      geral.py              /saude, /aparelho, /parametros-pda
      sync.py               POST /sync/fichas
      fotos.py              PUT e GET /fotos/{id}
      camadas.py            GET /camadas/{nome}.geojson
    servicos/
      validacao.py          usa scripts/validar_fichas.py
      ingestao.py           regras de recebimento e gravação das fichas
      talhoes.py            importa pol_talhoes do WebGIS
  migracoes/
    001_tabelas.sql         talhoes, parametros_pda, fichas, pontos, fotos
    002_camadas.sql         views das camadas do WebGIS
  sql/criar_banco_teste.sql cria o banco descartável dos testes (Docker)
  tests/test_api.py         testes da API contra PostGIS real
```

## Modelo de dados

| Tabela | Conteúdo |
|---|---|
| `fichas` | Uma linha por ficha. `id` é o `metadados.id` gerado no aparelho. Guarda colunas para filtrar (tipo, data, fazenda, talhão, `talhao_fid`, status do CQ), os `resultados`, os `avisos` do servidor e o **JSON original completo** (`payload`) com o seu hash. |
| `pontos` | Pontos (pragas do solo, cigarrinha) ou amostras (CQ) de cada ficha, com a geometria (`Point`, WGS 84) e os dados do item em `jsonb`. |
| `fotos` | Fotos citadas nas fichas. A linha nasce quando a ficha chega e é completada quando o arquivo chega. |
| `talhoes` | Camada `pol_talhoes` do WebGIS (`fid`, fazenda, talhão, área, polígono). |
| `parametros_pda` | Versões dos parâmetros do PDA (`versao`, `vigente_desde`, documento). |

Guardar o `payload` inteiro permite evoluir os schemas sem perder nada: uma coluna nova pode ser preenchida depois a partir do JSON já recebido.

## Sincronização (contrato entre app e API)

1. O app envia as fichas finalizadas em lotes de até 50 (a API aceita até 200) com `POST /api/v1/sync/fichas`, no mesmo formato do arquivo exportado: `{"dispositivo_id": "...", "fichas": [...]}`.
2. Para cada ficha, o servidor:
   - procura o `metadados.id`. Se a mesma ficha já foi recebida, responde `ja_recebida` e não duplica. Se o id existe com conteúdo diferente, responde `conflito`, porque ficha recebida não muda;
   - escolhe os parâmetros do PDA **vigentes na data da coleta** e confere schema e regras de negócio, refazendo os cálculos (`invalida` se algo não bate). O servidor não confia nos cálculos do aparelho;
   - grava ficha, pontos e fotos numa transação (`gravada`);
   - confere a localização com os talhões do servidor. Ponto a mais de 30 m fora do talhão, ou talhão desconhecido, vira **aviso** e não erro, porque a camada do servidor pode estar desatualizada em relação à do aparelho.
3. A resposta traz, para cada ficha, `situacao`, `erros`, `avisos` e `fotos_pendentes` (fotos que o servidor ainda não tem).
4. O app envia cada foto pendente com `PUT /api/v1/fotos/{id}` (corpo = bytes da imagem, `Content-Type` = formato). Reenviar substitui o arquivo, sem efeito colateral.
5. No aparelho, cada ficha passa a ter a situação do envio:
   - **Enviada**: o servidor tem a ficha e todas as fotos. A ficha não pode mais ser reaberta.
   - **Fotos por enviar**: a ficha chegou, faltam fotos. Elas vão na próxima sincronização.
   - **Recusada pelo servidor**: mostra os erros. A ficha pode ser reaberta, corrigida e finalizada de novo.

O envio começa sozinho ao abrir o app com internet (uma vez por abertura) e também pelo botão **Enviar** da tela inicial. O endereço do servidor e a chave do aparelho são configurados na tela **Servidor** (`#/servidor`). A exportação em JSON continua disponível como cópia de segurança, e o arquivo exportado pode ser carregado no servidor com `python -m app.cli importar-fichas`.

## Endpoints

| Método | Caminho | Autenticação | Uso |
|---|---|---|---|
| GET | `/api/v1/saude` | — | Verifica se a API e o banco respondem |
| GET | `/api/v1/aparelho` | chave do aparelho | Botão "Testar conexão" do app |
| GET | `/api/v1/parametros-pda` | — | Parâmetros do PDA vigentes hoje |
| POST | `/api/v1/sync/fichas` | chave do aparelho | Recebe um lote de fichas |
| PUT | `/api/v1/fotos/{id}` | chave do aparelho | Recebe uma foto (JPEG, PNG, WebP ou HEIC; até `TAMANHO_MAX_FOTO_MB`) |
| GET | `/api/v1/fotos/{id}` | chave de leitura | Imagem da foto |
| GET | `/api/v1/camadas` | — | Lista das camadas com o endereço de cada uma |
| GET | `/api/v1/camadas/{nome}.geojson` | chave de leitura | Camada em GeoJSON |

Documentação interativa (Swagger): `http://localhost:8080/docs`.

As chaves vão no cabeçalho `Authorization: Bearer <chave>`. Nas leituras também vale `?chave=<chave>`, para o WebGIS, o QGIS e a tag `<img>`.

## Camadas para o WebGIS

| Camada | Geometria | Atributos principais |
|---|---|---|
| `pontos_pragas_solo` | ponto | tocos examinados/brocados, % brocados, contagem por praga, alerta da ficha |
| `pontos_cigarrinha` | ponto | metros, ninfas, adultos, ninfas/m, espuma e intensidade |
| `amostras_cq_broca` | ponto | entrenós totais/danificados, II % da amostra, status de corte da ficha |
| `fotos` | ponto | legenda, data, `url` da imagem |
| `talhoes_cq_broca` | polígono | última ficha de CQ do talhão: II %, status de liberação de corte |
| `talhoes_cigarrinha` | polígono | última ficha de cigarrinha: ninfas/m, NDE, acima do NDE, fase predominante |
| `talhoes_pragas_solo` | polígono | última ficha de pragas do solo: % brocados, pragas críticas |

Filtros (todos opcionais): `de` e `ate` (data da coleta, `AAAA-MM-DD`), `fazenda` (como no WebGIS, `40002-ALTO PORTO REAL`, ou só o código, `40002`), `talhao_fid` e `limite` (padrão 10.000, máximo 50.000). Nas camadas de talhões, o filtro de data vale para a data da última ficha de cada talhão.

O nome do amostrador e o aparelho **não** aparecem nas camadas (LGPD). Eles ficam só na tabela `fichas`.

Exemplo de uso no WebGIS (Leaflet):

```js
const API = 'https://campo.suaempresa.com.br';
const resp = await fetch(`${API}/api/v1/camadas/talhoes_cq_broca.geojson?de=2026-11-01`);
const cores = { liberado: '#2e7d32', alerta: '#f9a825', bloqueado: '#c62828',
                liberado_por_parecer_pda: '#1565c0', reprovado_por_parecer_pda: '#6a1b9a' };
L.geoJSON(await resp.json(), {
  style: (f) => ({ color: cores[f.properties.status_liberacao_corte], weight: 1, fillOpacity: 0.5 }),
  onEachFeature: (f, l) => l.bindPopup(`${f.properties.talhao}: II ${f.properties.indice_infestacao_pct}%`),
}).addTo(mapa);
```

No QGIS, também é possível conectar direto no PostGIS (as views `vw_*` aparecem como camadas), de preferência com um usuário somente leitura.

## Rodar no computador

Pré-requisito: Docker.

```bash
cp backend/.env.exemplo backend/.env
```

```bash
docker compose up -d --build
```

A API sobe em http://localhost:8080 e aplica as migrações sozinha. Na primeira vez, cadastra os parâmetros do PDA a partir de `app/parametros-pda.json`.

Importar os talhões do WebGIS:

```bash
docker compose exec api python -m app.cli importar-talhoes https://lcs-993.github.io/web_gis/geojson/pol_talhoes.geojson
```

No app (`python3 -m http.server 8000 -d app`), abra a tela **Servidor** pelo cartão da tela inicial e informe `http://localhost:8080` e uma chave de `CHAVES_APARELHOS`.

Outras tarefas:

```bash
docker compose exec api python -m app.cli importar-parametros /caminho/parametros-pda.json
```

```bash
docker compose exec api python -m app.cli importar-fichas /caminho/fichas-2026-11-12.json
```

### Testes

Os testes usam um PostGIS de verdade e **apagam** o banco informado em `TEST_DATABASE_URL`. O `docker compose` cria o banco descartável `campo_teste` na primeira subida.

```bash
pip install -r backend/requirements.txt
```

```bash
cd backend && TEST_DATABASE_URL=postgresql://campo:campo@localhost:5432/campo_teste python -m unittest discover -s tests -v
```

No GitHub, o workflow `.github/workflows/backend.yml` roda esses testes e constrói a imagem Docker a cada pull request que mexa no backend. O teste de ponta a ponta do app (`tests/e2e_app.js`) cobre o lado do aparelho com um servidor simulado que segue o mesmo contrato.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `DATABASE_URL` | `postgresql://campo:campo@localhost:5432/campo` | Banco PostGIS |
| `PASTA_FOTOS` | `./dados/fotos` (`/dados/fotos` no Docker) | Onde as fotos são gravadas |
| `CHAVES_APARELHOS` | vazio | `nome:chave,nome2:chave2`. **Vazio deixa o envio aberto**: use só no computador |
| `CHAVE_LEITURA` | vazio | Exigida nas camadas e fotos, se definida |
| `CORS_ORIGENS` | `http://localhost:8000,https://lcs-993.github.io` | Origens que podem chamar a API pelo navegador |
| `TAMANHO_MAX_FOTO_MB` | `15` | Limite por foto |
| `SENHA_BANCO` | `campo` | Senha do banco no `docker-compose.yml` |

## Fases até a produção

### Agora (feito neste passo)

- API, banco, camadas e envio pelo app funcionando localmente, com testes automáticos.

### Homologação

- Subir num servidor pequeno (VPS com Docker Compose) ou num serviço gerenciado (Render, Railway, Fly) com Postgres gerenciado que tenha PostGIS.
- Colocar a API **atrás de HTTPS** (Caddy ou Nginx com Let's Encrypt). O app publicado no GitHub Pages é HTTPS e o navegador bloqueia chamadas dele para um servidor HTTP.
- Definir `CHAVES_APARELHOS` (uma chave por aparelho), `SENHA_BANCO` forte e `CORS_ORIGENS` só com os endereços reais.
- Importar os talhões e testar com um ou dois amostradores de verdade.
- Ligar o WebGIS às camadas.

### Antes da produção

- [ ] Login por usuário (JWT/OAuth) no lugar das chaves por aparelho. O amostrador passa a vir do login, não da digitação.
- [ ] Chave de leitura ou login também no WebGIS, se os dados não puderem ser públicos.
- [ ] Backup diário do banco (`pg_dump`) e das fotos, com teste de restauração.
- [ ] Fotos em armazenamento de objetos (S3/MinIO) e compressão das fotos no app antes do envio.
- [ ] Logs centralizados e alerta de erro (por exemplo, Sentry), e limite de requisições por aparelho.
- [ ] Atualização automática dos talhões no servidor (agendada a partir do WebGIS).
- [ ] App buscando os parâmetros do PDA em `/api/v1/parametros-pda`, para o PDA mudar limites sem nova publicação do app.
- [ ] Política de LGPD para os nomes de amostradores e responsáveis.
- [ ] Definir com o PDA as pendências listadas em `schemas/README.md` (urgência da cigarrinha, "maior que" ou "maior ou igual", número mínimo de pontos).
- [ ] Usuário de banco somente leitura para o QGIS e para as views.
- [ ] Camadas grandes: trocar o GeoJSON por OGC API Features (`pg_featureserv`) ou vector tiles (`martin`), que leem as mesmas views.
