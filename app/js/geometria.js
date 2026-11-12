// Geometria em coordenadas geográficas (lon, lat em graus, WGS84), usada pelos
// talhões e pelos terraços. As distâncias usam uma projeção local em torno do
// ponto, precisa para as distâncias curtas que interessam aqui (metros a poucos km).

export const RAIO_TERRA_M = 6371008.8;
export const rad = (g) => (g * Math.PI) / 180;

/** Metros por grau de longitude e de latitude na latitude dada. */
export function metrosPorGrau(lat) {
  return [Math.cos(rad(lat)) * rad(1) * RAIO_TERRA_M, rad(1) * RAIO_TERRA_M];
}

/** Caixa [x0, y0, x1, y1] de uma lista de linhas (cada linha é uma lista de [lon, lat]). */
export function caixaDeLinhas(linhas) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const linha of linhas) for (const [x, y] of linha) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** Menor distância em metros do ponto a qualquer segmento das linhas. */
export function distanciaLinhasM(lon, lat, linhas) {
  const [kx, ky] = metrosPorGrau(lat);
  let melhor = Infinity;
  for (const linha of linhas) {
    if (linha.length === 1) {
      const d = Math.hypot((linha[0][0] - lon) * kx, (linha[0][1] - lat) * ky);
      if (d < melhor) melhor = d;
      continue;
    }
    for (let i = 1; i < linha.length; i++) {
      const ax = (linha[i - 1][0] - lon) * kx; const ay = (linha[i - 1][1] - lat) * ky;
      const bx = (linha[i][0] - lon) * kx; const by = (linha[i][1] - lat) * ky;
      const dx = bx - ax; const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < melhor) melhor = d;
    }
  }
  return melhor;
}

/** O ponto está a até `metros` da caixa? (filtro rápido antes do cálculo exato) */
export function pertoDaCaixa(lon, lat, [x0, y0, x1, y1], metros) {
  const [kx, ky] = metrosPorGrau(lat);
  const mx = metros / kx; const my = metros / ky;
  return lon >= x0 - mx && lon <= x1 + mx && lat >= y0 - my && lat <= y1 + my;
}
