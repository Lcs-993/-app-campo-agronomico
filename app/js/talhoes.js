// Talhões do WebGIS: baixa a camada pol_talhoes.geojson publicada pelo WebGIS,
// guarda no aparelho para uso offline e descobre em qual talhão uma
// coordenada está.

import { obterCache, salvarCache } from './db.js';

// O WebGIS e este app ficam no mesmo domínio do GitHub Pages
// (lcs-993.github.io/web_gis/ e lcs-993.github.io/-app-campo-agronomico/).
export const URL_TALHOES = new URL('../web_gis/geojson/pol_talhoes.geojson', document.baseURI).href;

/** Distância máxima até a borda de um talhão para ainda considerá-lo (erro do GPS). */
export const TOLERANCIA_BORDA_M = 30;

const CHAVE_CACHE = 'talhoes';
let indice = null;

// ---------- geometria ----------

const RAIO_TERRA_M = 6371008.8;
const rad = (g) => (g * Math.PI) / 180;

/** Poligonos (lista de anéis [lon, lat]) de Polygon, MultiPolygon ou GeometryCollection. */
function poligonosDe(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  if (geom.type === 'GeometryCollection') return (geom.geometries ?? []).flatMap(poligonosDe);
  return [];
}

function caixa(poligonos) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const pol of poligonos) for (const [x, y] of pol[0]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function dentroDoAnel(x, y, anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function dentroDoPoligono(x, y, pol) {
  if (!dentroDoAnel(x, y, pol[0])) return false;
  for (let k = 1; k < pol.length; k++) if (dentroDoAnel(x, y, pol[k])) return false;
  return true;
}

/** Distância em metros de um ponto à borda mais próxima (projeção local, boa para curtas distâncias). */
function distanciaBordaM(lon, lat, poligonos) {
  const kx = Math.cos(rad(lat)) * rad(1) * RAIO_TERRA_M;
  const ky = rad(1) * RAIO_TERRA_M;
  let melhor = Infinity;
  for (const pol of poligonos) for (const anel of pol) {
    for (let i = 1; i < anel.length; i++) {
      const ax = (anel[i - 1][0] - lon) * kx; const ay = (anel[i - 1][1] - lat) * ky;
      const bx = (anel[i][0] - lon) * kx; const by = (anel[i][1] - lat) * ky;
      const dx = bx - ax; const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < melhor) melhor = d;
    }
  }
  return melhor;
}

/** Área geodésica aproximada (esfera), em hectares. */
function areaHa(poligonos) {
  const anelM2 = (anel) => {
    let s = 0;
    for (let i = 0; i < anel.length - 1; i++) {
      const [x1, y1] = anel[i]; const [x2, y2] = anel[i + 1];
      s += rad(x2 - x1) * (2 + Math.sin(rad(y1)) + Math.sin(rad(y2)));
    }
    return Math.abs((s * RAIO_TERRA_M * RAIO_TERRA_M) / 2);
  };
  let total = 0;
  for (const pol of poligonos) total += anelM2(pol[0]) - pol.slice(1).reduce((t, a) => t + anelM2(a), 0);
  return Math.round((total / 10000) * 100) / 100;
}

// ---------- preparo e cache ----------

const texto = (v) => (v == null ? '' : String(v).trim());

/** Converte o GeoJSON do WebGIS no formato compacto guardado no aparelho. */
export function prepararTalhoes(geojson) {
  const talhoes = [];
  for (const f of geojson.features ?? []) {
    const p = f.properties ?? {};
    const poligonos = poligonosDe(f.geometry);
    if (!poligonos.length || !texto(p['Talhão']) || !texto(p.Fazenda)) continue;
    const areaAtributo = Number(p['Área (ha.)']);
    talhoes.push({
      fid: p.fid,
      fazenda: texto(p.Fazenda),
      talhao: texto(p['Talhão']),
      variedade: texto(p.Variedade) || null,
      area_ha: Number.isFinite(areaAtributo) && areaAtributo > 0 ? areaAtributo : areaHa(poligonos),
      caixa: caixa(poligonos),
      poligonos,
    });
  }
  return talhoes;
}

function criarIndice(registro) {
  const porFid = new Map(registro.talhoes.map((t) => [t.fid, t]));
  return { ...registro, porFid };
}

/** Talhões guardados no aparelho (null se ainda não foram baixados). */
export async function carregarTalhoes() {
  if (!indice) {
    const registro = await obterCache(CHAVE_CACHE);
    if (registro) indice = criarIndice(registro);
  }
  return indice;
}

/**
 * Baixa a camada do WebGIS se houver versão nova. Retorna
 * { atualizado: boolean, quantidade, erro? }.
 */
export async function atualizarTalhoes() {
  const atual = await carregarTalhoes();
  let resp;
  try {
    resp = await fetch(URL_TALHOES, { cache: 'no-cache' });
  } catch {
    return { atualizado: false, erro: 'Sem conexão com o WebGIS.' };
  }
  if (!resp.ok) return { atualizado: false, erro: `O WebGIS respondeu ${resp.status}.` };
  const versao = resp.headers.get('etag') || resp.headers.get('last-modified') || null;
  if (atual && versao && atual.versao === versao) {
    return { atualizado: false, quantidade: atual.talhoes.length };
  }
  const talhoes = prepararTalhoes(await resp.json());
  if (!talhoes.length) return { atualizado: false, erro: 'A camada de talhões veio vazia.' };
  const registro = { versao, baixado_em: new Date().toISOString(), origem: URL_TALHOES, talhoes };
  await salvarCache(CHAVE_CACHE, registro);
  indice = criarIndice(registro);
  return { atualizado: true, quantidade: talhoes.length };
}

// ---------- consulta ----------

export function talhaoPorFid(fid) {
  return indice?.porFid.get(fid) ?? null;
}

/**
 * Em qual talhão está a coordenada. Retorna
 * { talhao, dentro: true } quando está dentro,
 * { talhao, dentro: false, distancia_m } quando está a até TOLERANCIA_BORDA_M da borda,
 * { talhao: null, maisProximo, distancia_m } quando não está em nenhum.
 */
export function localizarTalhao(lon, lat) {
  if (!indice) return null;
  const margemGrau = TOLERANCIA_BORDA_M / 100000;
  const margemPerto = 2000 / 100000;
  let melhor = null;
  for (const t of indice.talhoes) {
    const [x0, y0, x1, y1] = t.caixa;
    if (lon < x0 - margemPerto || lon > x1 + margemPerto || lat < y0 - margemPerto || lat > y1 + margemPerto) continue;
    const naCaixa = lon >= x0 - margemGrau && lon <= x1 + margemGrau && lat >= y0 - margemGrau && lat <= y1 + margemGrau;
    if (naCaixa && t.poligonos.some((pol) => dentroDoPoligono(lon, lat, pol))) return { talhao: t, dentro: true, distancia_m: 0 };
    const d = distanciaBordaM(lon, lat, t.poligonos);
    if (!melhor || d < melhor.distancia_m) melhor = { talhao: t, distancia_m: d };
  }
  if (melhor && melhor.distancia_m <= TOLERANCIA_BORDA_M) return { talhao: melhor.talhao, dentro: false, distancia_m: Math.round(melhor.distancia_m) };
  return { talhao: null, maisProximo: melhor?.talhao ?? null, distancia_m: melhor ? Math.round(melhor.distancia_m) : null };
}

/** Resumo do talhão guardado junto do ponto, para conferir se o ponto é do talhão da ficha. */
export function talhaoDoPonto(geo) {
  if (!geo || !indice) return null;
  const r = localizarTalhao(geo.longitude, geo.latitude);
  if (!r?.talhao) return { fid: null, distancia_m: r?.distancia_m ?? null, mais_proximo: r?.maisProximo ? nomeCurto(r.maisProximo) : null };
  return { fid: r.talhao.fid, nome: nomeCurto(r.talhao), distancia_m: r.distancia_m };
}

export const nomeCurto = (t) => `${t.talhao} · ${t.fazenda}`;
