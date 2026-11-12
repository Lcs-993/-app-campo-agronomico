// Restrições de onde as coletas podem ser feitas (ver docs/restricoes-de-coleta.md).
//
// A borda do talhão e as linhas de terraço têm comportamento diferente do
// restante da área (bordadura, carreador, acúmulo de água e solo no terraço),
// então pontos de amostragem perto delas não representam o talhão.

/** O ponto precisa estar dentro do talhão e a pelo menos esta distância da borda. */
export const DISTANCIA_MINIMA_BORDA_M = 30;

/** O ponto precisa estar a pelo menos esta distância de qualquer linha de terraço. */
export const DISTANCIA_MINIMA_TERRACO_M = 30;

/**
 * Motivos que impedem coletar no ponto, a partir do resumo `talhao_ponto`
 * (ver talhaoDoPonto em talhoes.js). Lista vazia = pode coletar.
 * Não confere se o talhão é o da ficha; isso fica em errosTalhaoItem.
 */
export function restricoesDoPonto(tp) {
  if (!tp || tp.fid == null) return [];
  const motivos = [];
  // Resumos gravados antes desta regra não têm `dentro`; são recalculados ao abrir a ficha.
  if (tp.dentro === false) {
    motivos.push(`a localização está fora do talhão, a ${arred(tp.distancia_m)} m da borda. Entre pelo menos ${DISTANCIA_MINIMA_BORDA_M} m no talhão para coletar.`);
  } else if (tp.distancia_borda_m != null && tp.distancia_borda_m < DISTANCIA_MINIMA_BORDA_M) {
    motivos.push(`a localização está a ${arred(tp.distancia_borda_m)} m da borda do talhão. Colete a pelo menos ${DISTANCIA_MINIMA_BORDA_M} m da borda.`);
  }
  if (tp.distancia_terraco_m != null && tp.distancia_terraco_m < DISTANCIA_MINIMA_TERRACO_M) {
    motivos.push(`a localização está a ${arred(tp.distancia_terraco_m)} m de um terraço. Colete a pelo menos ${DISTANCIA_MINIMA_TERRACO_M} m dos terraços.`);
  }
  return motivos;
}

// Arredonda para baixo: 29,8 m aparece como 29 m, e não como 30 m, que passaria a regra.
const arred = (m) => Math.floor(m);
