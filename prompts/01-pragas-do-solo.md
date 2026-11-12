# Prompt 1: Agente Especialista em Pragas do Solo
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
