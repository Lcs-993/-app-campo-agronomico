# App de Campo Agronômico

App para a coleta de ocorrências de campo.

Aplicativo móvel de campo (offline-first) para a cultura da cana-de-açúcar, cobrindo três setores:

- **Planejamento e Desenvolvimento Agronômico (PDA)**: gestão, metas, parâmetros e decisão.
- **Fitossanidade (MIP)**: monitoramento de pragas do solo, cigarrinha-da-raiz e parte aérea.
- **Controle de Qualidade (CQ)**: índice de infestação final da broca, liberação de corte e perdas.

## Estrutura

```
docs/      Documentação de arquitetura e decisões
prompts/   Prompts dos agentes de IA (um arquivo por agente)
schemas/   Schemas JSON das fichas de campo (ver schemas/README.md)
scripts/   Validador das fichas (schema + regras de negócio)
tests/     Testes do validador
```

## Validar as fichas

```bash
pip install -r requirements.txt
python scripts/validar_fichas.py schemas/exemplos/*.json
python -m unittest discover -s tests
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
