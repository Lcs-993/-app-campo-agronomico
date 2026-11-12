# Restrições de coleta: borda do talhão e terraços

O app só aceita pontos de amostragem em locais que representam o talhão. Dois
tipos de faixa são proibidos:

| Faixa proibida | Distância mínima | Por quê |
| --- | --- | --- |
| Borda do talhão | 30 m **para dentro** do polígono do talhão | Bordadura, carreador e talhão vizinho alteram a infestação e o desenvolvimento da cana perto da divisa. |
| Terraços | 30 m de qualquer alinhamento de terraço, para os dois lados | O terraço concentra água, solo e palha, e a cana sobre e junto dele não representa a área. |

Os valores ficam em [`app/js/restricoes.js`](../app/js/restricoes.js)
(`DISTANCIA_MINIMA_BORDA_M` e `DISTANCIA_MINIMA_TERRACO_M`) e aparecem para o
usuário na tela **Parâmetros do PDA → Onde coletar**. Para mudar uma distância,
altere a constante e suba a versão do cache em `app/sw.js` (`VERSAO`), para os
aparelhos baixarem o código novo.

## Como o app aplica a regra

1. Ao capturar o GPS de um ponto, o app calcula, sem internet, a partir das
   camadas guardadas no aparelho:
   - em qual talhão o ponto está e se está dentro do polígono;
   - a distância até a borda mais próxima do talhão (contorno externo e buracos);
   - a distância até o terraço mais próximo.
2. O resultado fica no rascunho do ponto (`talhao_ponto`):
   `{ fid, nome, dentro, distancia_m, distancia_borda_m, distancia_terraco_m }`.
   Esse campo é interno e não vai para o JSON exportado. O schema das fichas não
   mudou.
3. Se o ponto estiver na faixa proibida, aparece uma mensagem logo abaixo dele.
   Ele também fica vermelho no mini mapa e a ficha **não pode ser finalizada**
   até o GPS ser capturado de novo num local permitido. Exemplos:
   - "a localização está a 18 m da borda do talhão. Colete a pelo menos 30 m da borda."
   - "a localização está fora do talhão, a 12 m da borda. Entre pelo menos 30 m no talhão para coletar."
   - "a localização está a 22 m de um terraço. Colete a pelo menos 30 m dos terraços."
4. Ao abrir um rascunho, todos os pontos são conferidos de novo. Assim valem as
   camadas mais novas (por exemplo, terraços publicados depois da coleta) e
   rascunhos antigos passam a seguir a regra. Fichas já finalizadas não são
   alteradas.
5. A tela **Informações do GPS** mostra ao vivo se o local atual permite coleta
   ("Pode coletar aqui" / "Não colete aqui") e as duas distâncias. Assim o
   amostrador acha o ponto certo antes de capturar.

### Identificar o talhão × coletar

O botão "Identificar talhão pelo GPS" ainda reconhece o talhão quando o usuário
está até 30 m **fora** da borda (`TOLERANCIA_BORDA_M` em `talhoes.js`), por
causa do erro do GPS. Isso só define o talhão da ficha. Se o local não permitir
coleta, o app avisa logo após identificar ("Talhão identificado, mas não colete
aqui: …").

### Detalhes de cálculo

- As distâncias são medidas do ponto até o segmento de reta mais próximo, numa
  projeção local em torno do ponto
  ([`app/js/geometria.js`](../app/js/geometria.js)). O erro é desprezível para
  distâncias de metros a poucos quilômetros.
- Os valores são arredondados **para baixo** (29,8 m vira 29 m), para nunca
  aprovar um ponto que está a menos de 30 m.
- A regra usa a coordenada capturada e não desconta a precisão do GPS. Com
  precisão ruim (por exemplo, ±25 m), o ponto real pode estar mais perto da
  borda do que o app calcula. Por isso o app pede para aguardar o sinal melhorar
  quando a precisão passa de 20 m.

## Camada de terraços (`lin_terracos.geojson`)

Os alinhamentos dos terraços vêm do WebGIS, como os talhões:

```
https://lcs-993.github.io/web_gis/geojson/lin_terracos.geojson
```

Para publicar, coloque o arquivo em `web_gis/geojson/lin_terracos.geojson` no
repositório do WebGIS. O nome segue o padrão do WebGIS: `pol_` para polígonos,
`lin_` para linhas. Requisitos:

- `FeatureCollection` em WGS84 (CRS84 / EPSG:4326), como as demais camadas;
- geometrias `LineString` ou `MultiLineString`. `Polygon`, `MultiPolygon` e
  `GeometryCollection` também são aceitos (o contorno conta como linha);
- nenhum atributo é obrigatório. Se houver `fid`, ele é guardado;
- vale otimizar como as outras camadas
  (`python tools/otimizar_geojson.py origem.geojson geojson/lin_terracos.geojson 6`).

Comportamento no app:

- A camada é **opcional**. Enquanto não existir no WebGIS (resposta 404), o app
  funciona normalmente e só não confere a distância dos terraços. A tela de GPS
  mostra "Não conferida".
- É baixada junto com os talhões: ao abrir o app com internet, pelo botão
  "Atualizar" da tela inicial, ou ao identificar o talhão pela primeira vez. Fica
  guardada no aparelho (IndexedDB, chave `terracos`) e funciona sem internet. Só
  é baixada de novo quando o arquivo muda (ETag / Last-Modified).
- A tela inicial mostra a quantidade: "3.386 talhões · 1.250 terraços do WebGIS".
- No mini mapa da ficha, os terraços aparecem como linhas tracejadas.
- Só os terraços a até 300 m do ponto entram no cálculo, para ser rápido mesmo
  com milhares de linhas.

**Atenção ao espaçamento:** com terraços a cada 40 a 60 m, uma faixa de 30 m de
cada lado cobre quase todo o talhão. Se, ao publicar a camada, a tela de GPS
mostrar "Não colete aqui" em quase todo lugar, revise `DISTANCIA_MINIMA_TERRACO_M`
com o PDA.

## Testes

O teste de ponta a ponta ([`tests/e2e_app.js`](../tests/e2e_app.js)) usa
[`tests/fixtures/lin_terracos.geojson`](../tests/fixtures/lin_terracos.geojson)
e confere que:

- um ponto a mais de 30 m da borda e dos terraços é aceito;
- um ponto ~15 m fora e outro ~15 m dentro da borda são recusados;
- um ponto a ~22 m de um terraço é recusado e impede finalizar;
- a tela de GPS troca de "Pode coletar aqui" para "Não colete aqui" ao entrar na
  faixa do terraço.
