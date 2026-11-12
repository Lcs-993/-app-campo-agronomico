# GPS no app de campo

## Como a posição é obtida

O app é um PWA e usa a API de geolocalização do navegador
(`navigator.geolocation`). A captura fica em `capturarGps` em
[`app/js/componentes.js`](../app/js/componentes.js):

- Usa `watchPosition` em vez de uma única chamada `getCurrentPosition`. Em
  aparelhos antigos, o primeiro sinal pode levar de 30 a 60 s (partida a frio,
  sem A-GPS no campo). Alguns modelos também nunca respondem a
  `getCurrentPosition` em alta precisão.
- Guarda a melhor leitura recebida. Termina assim que ela atinge a precisão
  desejada ou, ao fim do prazo, devolve a melhor que houver.
- Se em 15 s não chegar nenhuma leitura de alta precisão, também pede uma leitura
  de baixa precisão (rede).
- Os erros "posição indisponível" e "tempo esgotado" não interrompem a busca, porque
  em aparelhos antigos costumam passar sozinhos. Só "permissão negada" encerra na
  hora.
- Enquanto busca, mostra a precisão já obtida ("Sinal encontrado (±45 m).
  Melhorando a precisão…").

| Uso | Prazo | Precisão desejada |
| --- | --- | --- |
| Identificar o talhão | 60 s | 30 m |
| Localização do ponto/amostra | 60 s | 20 m |
| GPS das fotos | 15 s | 30 m |

## Tela "Informações do GPS"

Acesso: ícone de satélite no topo da tela inicial, ou o link "Informações do
GPS" no cartão do talhão de qualquer ficha. Rota `#/gps`, código em
[`app/js/telas/gps.js`](../app/js/telas/gps.js).

Mostra, ao vivo, enquanto a tela estiver aberta:

- **Situação:** procurando sinal, com sinal, sem leitura nova, pausado ou erro.
- **Coordenadas** (latitude e longitude, 6 casas decimais).
- **Precisão** em metros, com classificação: ótima ≤ 5 m, boa ≤ 10 m, aceitável
  ≤ 20 m, fraca ≤ 50 m, muito fraca acima disso (normalmente posição pela rede,
  não pelo GPS).
- **Altitude** (com a precisão vertical, quando o aparelho informa),
  **velocidade** e **direção**.
- **Última leitura**, **leituras recebidas**, **tempo até o primeiro sinal** e
  **melhor precisão**.
- **Satélites:** "Não informado" (ver abaixo).
- **Local de coleta:** talhão atual, distância da borda, distância do terraço e
  se o local permite coleta (ver [restricoes-de-coleta.md](restricoes-de-coleta.md)).
- **Aparelho e navegador:** permissão de localização, HTTPS, internet, modo de
  leitura e versão do navegador.
- **Registro de eventos:** primeiro sinal, mudanças de precisão e cada erro, com
  código e mensagem.

Ações:

- **Modo de leitura** alta precisão (GPS) ou baixa precisão (rede). Se a baixa
  funciona e a alta não, o aparelho não recebe o sinal dos satélites no
  navegador.
- **Pausar / Retomar** e **Reiniciar** (recomeça a contagem do primeiro sinal).
- **Copiar diagnóstico:** copia um texto com aparelho, navegador, permissão,
  leituras e o registro de eventos, para mandar ao suporte por mensagem.

O GPS para ao sair da tela, para não gastar bateria.

### Por que o número de satélites não aparece

A API de geolocalização dos navegadores, a única disponível para um app web/PWA,
entrega só coordenadas, precisão, altitude, velocidade e direção. Nenhum
navegador (Chrome, Firefox, Safari, Samsung Internet) dá acesso ao número de
satélites, ao sinal (SNR) de cada um ou às constelações (GPS, GLONASS, Galileo,
BeiDou). Esses dados existem só para aplicativos nativos (no Android,
`GnssStatus`).

A tela deixa isso claro e orienta o usuário a instalar um app de teste de GPS
(por exemplo, o GPSTest, gratuito). Se esse app mostrar satélites em uso e o app
de campo não receber posição, o problema está na permissão ou nas configurações
do navegador, não no receptor de GPS.

Se o número de satélites se tornar indispensável, o caminho é empacotar o app
como aplicativo Android (por exemplo, com Capacitor) e ler `GnssStatus` por um
plugin nativo.

## Aparelhos antigos que não obtêm posição

Causas mais comuns, todas listadas na tela de GPS:

1. Localização do Android em modo "economia de bateria" / "somente rede", ou
   "Melhorar precisão" desligado.
2. Chrome sem permissão de localização no Android (Configurações → Apps → Chrome
   → Permissões → Localização), mesmo com o site liberado.
3. Site bloqueado no Chrome (cadeado ao lado do endereço → Localização).
4. Economia de bateria ativa, que em alguns modelos corta o GPS do navegador.
5. Primeiro sinal sem internet (sem A-GPS) em local coberto: fique parado a céu
   aberto por 1 a 2 minutos.
6. Chrome desatualizado.

O registro de eventos mostra qual é o caso: erro 1 = permissão, erro 2 = posição
indisponível (localização desligada ou sem sinal), erro 3 = tempo esgotado sem
nenhuma leitura.
