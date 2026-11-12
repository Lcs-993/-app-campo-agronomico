# Schemas JSON das fichas de campo

Schemas no padrão [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/schema). Cada registro é criado no dispositivo (offline) com um UUID próprio e sincronizado depois.

| Arquivo | Ficha | Setor |
|---|---|---|
| `comum.schema.json` | Blocos reutilizados: metadados, identificação, GPS, foto, contagem por estágio | — |
| `pragas-solo.schema.json` | Monitoramento de Pragas do Solo | Fitossanidade |
| `cigarrinha-raiz.schema.json` | Monitoramento de Cigarrinha-da-Raiz (*Mahanarva fimbriolata*) | Fitossanidade |
| `cq-infestacao-final-broca.schema.json` | Índice de Infestação Final da Broca (*Diatraea saccharalis*) | Controle de Qualidade |
| `parametros-pda.schema.json` | Limites definidos pelo PDA (NDE, % de alerta e de bloqueio, pragas críticas) | PDA |

A pasta `exemplos/` tem um registro válido de cada ficha.

## Estrutura de uma ficha

```
tipo_ficha       identifica a ficha (pragas_solo, cigarrinha_raiz, cq_infestacao_final_broca)
metadados        id (UUID), versão do schema, datas, dispositivo, status de sincronização
identificacao    data, fazenda, talhão, bloco, amostrador
pontos/amostras  uma entrada por ponto de amostragem, cada uma com GPS
resultados       calculado pelo app (readOnly), nunca digitado
```

Os limites (NDE de 1,0 ninfa/m; alerta acima de 3%; bloqueio acima de 5%) **não estão fixos nos schemas**: vêm de `parametros-pda.json`, para que o PDA possa alterá-los sem nova versão do app. Cada ficha guarda em `resultados` o limite usado no cálculo.

## Regras que o JSON Schema não cobre

O JSON Schema não compara um campo com outro nem refaz cálculos. Estas regras estão implementadas em `scripts/validar_fichas.py` e precisam ser replicadas no app:

| Ficha | Regra |
|---|---|
| Pragas do solo | `tocos_brocados` ≤ `tocos_examinados` em cada ponto |
| Pragas do solo | `percentual_tocos_brocados` = Σ brocados / Σ examinados × 100 |
| Pragas do solo | `alerta_pragas_criticas` = presença de qualquer praga crítica (padrão: *Migdolus* e *Sphenophorus levis*) em qualquer estágio |
| Cigarrinha | `ninfas_por_metro` = Σ ninfas / Σ metros; `acima_nde` = ninfas/m > NDE |
| Cigarrinha | `fase_predominante` = ninfa, adulto, empate ou sem_ocorrencia |
| CQ broca | `entrenos_danificados` ≤ `entrenos_totais` em cada amostra |
| CQ broca | II (%) = Σ danificados / Σ totais × 100 |
| CQ broca | II ≤ 3% → `liberado`; 3% < II ≤ 5% → `alerta`; II > 5% → `bloqueado` |
| CQ broca | `liberado_por_parecer_pda` / `reprovado_por_parecer_pda` só para talhão bloqueado, com `parecer_pda` coerente |
| Todas | Números de ponto/amostra não se repetem |

Regras que o próprio schema garante: campos obrigatórios, contagens inteiras ≥ 0, intensidade de espuma de 1 a 3 (e ausente quando não há espuma), fotos do CQ sempre com GPS, `parecer_pda` obrigatório nos status por parecer, formatos de data, data-hora e UUID.

## Pendente de definição com o PDA

- Critérios de `urgencia_aplicacao` da cigarrinha (nenhuma, baixa, média, alta). O campo existe, mas a regra ainda não foi definida, por isso o validador não o confere.
- Se o limite é "maior que" ou "maior ou igual" a 3% e 5%. Foi usado "maior que", como no documento de arquitetura.
- Número mínimo de pontos/amostras por talhão ou por hectare.

## Validar

```bash
pip install -r requirements.txt
python scripts/validar_fichas.py schemas/exemplos/*.json
python -m unittest discover -s tests
```
