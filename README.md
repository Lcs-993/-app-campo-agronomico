# App de Campo Agronômico

App para a coleta de ocorrências de campo.

Aplicativo móvel de campo (offline-first) para a cultura da cana-de-açúcar, cobrindo três setores:

- **Planejamento e Desenvolvimento Agronômico (PDA)**: gestão, metas, parâmetros e decisão.
- **Fitossanidade (MIP)**: monitoramento de pragas do solo, cigarrinha-da-raiz e parte aérea.
- **Controle de Qualidade (CQ)**: índice de infestação final da broca, liberação de corte e perdas.

## Estrutura

```
app/       Aplicativo de campo (PWA offline-first)
backend/   API de sincronização e camadas para o WebGIS (FastAPI + PostGIS)
docs/      Documentação de arquitetura e decisões
prompts/   Prompts dos agentes de IA (um arquivo por agente)
schemas/   Schemas JSON das fichas de campo (ver schemas/README.md)
scripts/   Validador das fichas (schema + regras de negócio)
tests/     Testes do validador e teste de ponta a ponta do app
```

```
Aparelho (offline) ──envio──▶ backend/ (API + PostGIS) ──camadas GeoJSON──▶ WebGIS desktop / QGIS
```

## Aplicativo de campo (WebGIS Campo)

Aplicativo web instalável (PWA) que funciona sem internet, com o mesmo visual do [WebGIS](https://github.com/Lcs-993/web_gis): tema escuro por padrão (o claro pode ser escolhido e vale para os dois), verde Bambuí e a marca do WebGIS. Não precisa de compilação: são arquivos HTML, CSS e JavaScript puros.

**Talhão pela localização.** Fazenda e talhão não são digitados: o app usa a camada `pol_talhoes.geojson` do WebGIS (publicada em `lcs-993.github.io/web_gis/geojson/`), guardada no aparelho para uso sem internet. O talhão da ficha é identificado pelo GPS (botão "Identificar talhão pelo GPS" ou o GPS do primeiro ponto), e cada ponto é conferido: ponto em outro talhão ou fora de qualquer talhão impede finalizar. A ficha guarda o `fid`, a fazenda e o talhão do WebGIS; na ficha de CQ, a área vem do atributo "Área (ha.)" (ou é calculada do polígono, se o atributo estiver vazio). Os talhões são atualizados sozinhos ao abrir o app com internet, ou pelo botão "Atualizar" da tela inicial.

**Onde pode coletar.** O ponto precisa estar dentro do talhão e a pelo menos 30 m da borda, e a pelo menos 30 m de qualquer terraço. Os alinhamentos dos terraços vêm da camada `lin_terracos.geojson` do WebGIS, que é opcional enquanto não for publicada. Ponto na faixa proibida aparece em vermelho e impede finalizar. Detalhes em [docs/restricoes-de-coleta.md](docs/restricoes-de-coleta.md).

**GPS.** A captura espera até 1 minuto e fica com a melhor leitura, para funcionar em aparelhos antigos. A tela "Informações do GPS" (ícone de satélite no topo) mostra coordenadas, precisão, altitude, se o local permite coleta e um diagnóstico para quando o aparelho não acha a posição. O número de satélites não aparece porque nenhum navegador fornece esse dado. Detalhes em [docs/gps.md](docs/gps.md).

| Tela | O que faz |
|---|---|
| Início | Situação dos talhões do WebGIS, envio ao servidor, fichas novas, rascunhos, fichas aguardando envio, fichas enviadas e exportação em JSON |
| Pragas do Solo | Talhão pelo GPS; contagem por toco e por estágio; alerta imediato (com vibração) para *Migdolus* e *Sphenophorus levis*; % de tocos brocados ao vivo |
| Cigarrinha-da-Raiz | Talhão pelo GPS; metros, ninfas, adultos e espuma; ninfas/m comparado ao NDE; fase predominante |
| Infestação Final da Broca | Talhão e área pelo GPS; entrenós totais e danificados, fotos com GPS; II ao vivo; liberação, alerta ou bloqueio de corte; parecer do PDA quando bloqueado |
| Informações do GPS | Coordenadas, precisão, altitude, velocidade, situação do local de coleta (borda e terraços) e diagnóstico do GPS |
| Parâmetros do PDA | Limites vigentes, distâncias mínimas de coleta e origem dos talhões e terraços |
| Servidor | Endereço do servidor e chave do aparelho, com teste de conexão |

As fichas são salvas automaticamente no aparelho (IndexedDB) enquanto são preenchidas. Uma ficha só é finalizada quando passa em todas as regras dos schemas; o JSON gerado segue `schemas/`.

**Envio ao servidor.** Com o servidor configurado (tela "Servidor"), as fichas finalizadas são enviadas sozinhas ao abrir o app com internet, ou pelo botão "Enviar". O servidor confere as fichas de novo e pede as fotos que faltam. Cada ficha mostra se foi enviada, se faltam fotos ou se foi recusada (com o motivo). Ficha enviada não pode mais ser alterada. Até o servidor confirmar, tudo continua no aparelho.

## Backend (servidor)

A pasta `backend/` tem a API que recebe as fichas, grava num PostgreSQL com PostGIS e publica camadas GeoJSON para o WebGIS (pontos de cada ficha, fotos e mapas temáticos dos talhões pela última ficha). Ela usa os mesmos schemas e o mesmo validador do app. Para rodar:

```bash
docker compose up -d --build
```

Arquitetura, contrato de sincronização, camadas, variáveis e o que falta para produção estão em [docs/backend.md](docs/backend.md).

Para rodar no computador:

```bash
python3 -m http.server 8000 -d app
```

e abra http://localhost:8000. GPS, câmera e modo offline só funcionam em `localhost` ou em HTTPS. Localmente, os talhões só carregam se a pasta do WebGIS estiver ao lado, como no GitHub Pages (por exemplo, servindo uma pasta com `app` como `-app-campo-agronomico/` e o repositório `web_gis/`); o teste `tests/e2e_app.js` monta isso sozinho com as fixtures `tests/fixtures/pol_talhoes.geojson` e `tests/fixtures/lin_terracos.geojson`.

### Publicação (GitHub Pages)

A cada push no `main`, o workflow `.github/workflows/pages.yml` roda os testes e, se passarem, publica a pasta `app/` em:

**https://lcs-993.github.io/-app-campo-agronomico/**

Para instalar no celular: abra o endereço no Chrome (Android) ou Safari (iPhone) e use "Adicionar à tela inicial". Depois de aberto uma vez, funciona sem internet. Versões novas são baixadas sozinhas e entram em uso na próxima vez que o app for aberto.

Configuração (uma única vez): em Settings → Pages, escolher **Source: GitHub Actions**.

**Ainda não existe:** servidor de sincronização (as fichas ficam no aparelho e saem pelo botão de exportar), login e perfis (qualquer pessoa com o aparelho pode registrar o parecer do PDA) e mapa com imagem de satélite (o app mostra só o contorno do talhão e os pontos). O bloco continua digitado, porque a camada de talhões do WebGIS não tem esse atributo.

## Validar as fichas

```bash
pip install -r requirements.txt
python scripts/validar_fichas.py schemas/exemplos/*.json
python -m unittest discover -s tests
node tests/e2e_app.js   # teste do app no navegador (requer Playwright)
```

## Agentes de IA

| Agente | Função |
|---|---|
| Engenheiro de Dados Agronômicos | Converte fichas em papel em estruturas JSON/SQL offline-first |
| Fitossanidade (MIP) | Valida amostragens e calcula índices de infestação |
| Controle de Qualidade | Audita índices de dano para liberação de corte |

Veja [docs/arquitetura-agentes-e-prompts.md](docs/arquitetura-agentes-e-prompts.md) para a arquitetura completa.

## Próximos passos

1. Validar as variáveis dos prompts com a equipe de campo.
2. Definir a integração GPS e a captura de coordenadas por ponto de amostragem.
3. Testar os prompts na construção das telas e APIs do aplicativo.
