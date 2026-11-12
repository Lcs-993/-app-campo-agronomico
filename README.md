# App de Campo Agronômico

App para a coleta de ocorrências de campo.

Aplicativo móvel de campo (offline-first) para a cultura da cana-de-açúcar, cobrindo três setores:

- **Planejamento e Desenvolvimento Agronômico (PDA)**: gestão, metas, parâmetros e decisão.
- **Fitossanidade (MIP)**: monitoramento de pragas do solo, cigarrinha-da-raiz e parte aérea.
- **Controle de Qualidade (CQ)**: índice de infestação final da broca, liberação de corte e perdas.

## Estrutura

```
app/       Aplicativo de campo (PWA offline-first)
docs/      Documentação de arquitetura e decisões
prompts/   Prompts dos agentes de IA (um arquivo por agente)
schemas/   Schemas JSON das fichas de campo (ver schemas/README.md)
scripts/   Validador das fichas (schema + regras de negócio)
tests/     Testes do validador e teste de ponta a ponta do app
```

## Aplicativo de campo

Aplicativo web instalável (PWA) que funciona sem internet. Roda no navegador de qualquer celular ou tablet e pode ser adicionado à tela inicial. Não precisa de compilação: são arquivos HTML, CSS e JavaScript puros.

| Tela | O que faz |
|---|---|
| Início | Cria fichas novas, lista rascunhos e fichas finalizadas, exporta as finalizadas em JSON |
| Pragas do Solo | Contagem por toco e por estágio; alerta imediato (com vibração) para *Migdolus* e *Sphenophorus levis*; % de tocos brocados ao vivo |
| Cigarrinha-da-Raiz | Metros, ninfas, adultos e espuma; ninfas/m comparado ao NDE; fase predominante |
| Infestação Final da Broca | Entrenós totais e danificados, fotos com GPS; II ao vivo; liberação, alerta ou bloqueio de corte; parecer do PDA quando bloqueado |
| Parâmetros do PDA | Limites vigentes (NDE, % de alerta e de bloqueio, pragas críticas) |

Cada ponto ou amostra captura o GPS do aparelho. As fichas são salvas automaticamente no aparelho (IndexedDB) enquanto são preenchidas. Uma ficha só é finalizada quando passa em todas as regras dos schemas; o JSON gerado segue `schemas/`.

Para rodar no computador:

```bash
python3 -m http.server 8000 -d app
```

e abra http://localhost:8000. GPS, câmera e modo offline só funcionam em `localhost` ou em HTTPS, então para usar no celular o app precisa estar publicado num endereço HTTPS (por exemplo, GitHub Pages).

**Ainda não existe:** servidor de sincronização (as fichas ficam no aparelho e saem pelo botão de exportar), login e perfis (qualquer pessoa com o aparelho pode registrar o parecer do PDA) e cadastro de fazendas e talhões (os nomes são digitados, com sugestão dos já usados).

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
