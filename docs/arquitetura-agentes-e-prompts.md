# Arquitetura de Agentes e Prompts para App de Campo Agronômico

Este documento serve como guia prático para a parametrização e treinamento de Agentes de Inteligência Artificial voltados ao desenvolvimento do aplicativo de campo, focado nos setores de **Fitossanidade**, **Controle de Qualidade** e **Planejamento e Desenvolvimento Agronômico (PDA)**.

---

## 1. Estrutura de Subordinação e Fluxo de Dados

```
               +---------------------------------------+
               |  Planejamento e Des. Agronômico (PDA) |
               | (Gestão, Metas, Parâmetros e Decisão) |
               +-------------------+-------------------+
                                   |
         +-------------------------+-------------------------+
         |                                                   |
+--------v---------------+                         +---------v---------------+
|    Fitossanidade       |                         |  Controle de Qualidade  |
|  (Monitoramento de     |                         |  (Liberação de Corte,   |
|   Pragas e Doenças)    |                         |   Danoventos e Perdas)  |
+------------------------+                         +-------------------------+
```

---

## 2. Agentes de IA a Treinar

1. **Agente Engenheiro de Dados Agronômicos (Data Schema Agent):**
   - **Função:** Traduzir fichas em papel e rotinas de campo em estruturas de dados JSON/SQL otimizadas para aplicativos móveis (offline-first).
2. **Agente de Fitossanidade (Manejo Integrado de Pragas - MIP):**
   - **Função:** Validar parâmetros de entrada de amostragem de pragas (Solo e Parte Aérea) e calcular índices de infestação em tempo real.
3. **Agente de Controle de Qualidade (CQ Agronômico):**
   - **Função:** Auditar índices de dano (como Infestação Final da Broca por entrenós) para liberação de colheita/corte.

---

## 3. Prompts Prontos para Treinamento dos Agentes

### Prompt 1: Agente Especialista em Pragas do Solo
> **Instrução para a IA:**
> "Atue como um Engenheiro Agrônomo especialista em amostragem de pragas de solo na cultura da cana-de-açúcar. Com base no formulário de Monitoramento de Pragas do Solo, crie as regras de validação e a estrutura de dados JSON para coleta em aplicativo de campo.
> 
> **Campos Obrigatórios:**
> - Identificação: Data, Fazenda, Talhão, Bloco, Amostrador.
> - Contagem por Toco (Ponto de Amostragem):
>   - Número de Tocos examinados.
>   - Número de Tocos Brocados.
>   - Estágios de *Migdolus* (Larva, Pupa, Adulto).
>   - Estágios de *Sphenophorus levis* (Larva, Pupa, Adulto).
>   - Estágios de *Metamasius* (Larva, Pupa, Adulto).
>   - Estágios de Broca-da-Cana no solo/toco (Larva, Pupa, Adulto).
>   - Estágios de Pão-de-Galinha / *Melolonthidae* (Larva, Pupa, Adulto).
> 
> **Regras de Negócio:**
> 1. O número de tocos brocados jamais pode exceder o número total de tocos avaliados no ponto.
> 2. Disparar alerta visual imediato no app se houver presença de *Sphenophorus levis* ou *Migdolus* em qualquer estágio.
> 3. Calcular automaticamente a % de tocos brocados por talhão."

---

### Prompt 2: Agente Especialista em Cigarrinha-da-Raiz
> **Instrução para a IA:**
> "Atue como um especialista em entomologia agrícola focado no monitoramento de *Mahanarva fimbriolata* (Cigarrinha-da-raiz).
> 
> **Estrutura de Entrada de Dados:**
> - Metros lineares amostrados por ponto.
> - Contagem de Ninfas.
> - Contagem de Adultos.
> - Presença de Espuma (Sim/Não ou Intensidade 1 a 3).
> 
> **Cálculos e Ações do Agente:**
> 1. Calcular o Índice Médio de Ninfas por Metro Linear ($\text{Ninfas/m} = \frac{\text{Total Ninfas}}{\text{Total Metros}}$).
> 2. Comparar o valor obtido com o Nível de Dano Econômico (NDE) definido pelo Planejamento Agronômico (ex: $> 1{,}0$ ninfa/metro).
> 3. Sugerir a urgência de aplicação biológica/química conforme o ciclo de vida predominante (se maioria Adultos ou Ninfas)."

---

### Prompt 3: Agente de Controle de Qualidade (Índice de Infestação Final da Broca)
> **Instrução para a IA:**
> "Atue como Auditor de Controle de Qualidade Agronômica em usina sucroenergética. Seu objetivo é estruturar o formulário de Índice de Infestação Final (*Diatraea saccharalis*) pré-colheita.
> 
> **Parâmetros do Formulário:**
> - Data, Fazenda, Talhão, Área (ha), Status de Liberação de Corte.
> - Contagem por colmo/amostra:
>   - Entrenós Totais.
>   - Entrenós Danificados (brocados/com podridão associada).
> 
> **Fórmulas de Validação:**
> $$\text{Índice de Infestação (\%)} = \left( \frac{\sum \text{Entrenós Danificados}}{\sum \text{Entrenós Totais}} \right) \times 100$$
> 
> **Diretrizes de Auditoria:**
> 1. Se $\text{II (\%)} > 3{,}0\%$, marcar o talhão com alerta amarelo para o Planejamento.
> 2. Se $\text{II (\%)} > 5{,}0\%$, bloquear automaticamente o status de liberação de corte até parecer técnico do PDA.
> 3. Garantir suporte a fotos georreferenciadas dos entrenós danificados."

---

## 4. Próximos Passos
1. Validar as variáveis dos prompts acima com a equipe de campo.
2. Definir a integração GPS e captura de coordenadas para cada ponto de amostragem.
3. Testar os prompts na construção das telas e APIs do aplicativo móvel.