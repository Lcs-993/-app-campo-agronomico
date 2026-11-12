// Alinhamentos dos terraços do WebGIS: baixa a camada lin_terracos.geojson,
// guarda no aparelho para uso offline e mede a distância de um ponto ao
// terraço mais próximo (ver docs/restricoes-de-coleta.md).
//
// A camada é opcional: enquanto não estiver publicada no WebGIS, o app segue
// funcionando e só não confere a distância dos terraços.

import { obterCache, salvarCache } from './db.js';
import { caixaDeLinhas, distanciaLinhasM, pertoDaCaixa } from './geometria.js';

export const URL_TERRACOS = new URL('../web_gis/geojson/lin_terracos.geojson', document.baseURI).href;

const CHAVE_CACHE = 'terracos';
/** Só mede terraços cuja caixa está a até esta distância do ponto. */
const RAIO_BUSCA_M = 300;
let indice = null;

/** Linhas (listas de [lon, lat]) de qualquer geometria. Polígonos contam pelos anéis. */
function linhasDe(geom) {
  if (!geom) return [];
  switch (geom.type) {
    case 'LineString': return [geom.coordinates];
    case 'MultiLineString': return geom.coordinates;
    case 'Polygon': return geom.coordinates;
    case 'MultiPolygon': return geom.coordinates.flat(1);
    case 'GeometryCollection': return (geom.geometries ?? []).flatMap(linhasDe);
    default: return [];
  }
}

/** Converte o GeoJSON do WebGIS no formato compacto guardado no aparelho. */
export function prepararTerracos(geojson) {
  const terracos = [];
  (geojson.features ?? []).forEach((f, i) => {
    const linhas = linhasDe(f.geometry).filter((l) => Array.isArray(l) && l.length);
    if (!linhas.length) return;
    terracos.push({ fid: f.properties?.fid ?? i, caixa: caixaDeLinhas(linhas), linhas });
  });
  return terracos;
}

/** Terraços guardados no aparelho (null se ainda não foram baixados). */
export async function carregarTerracos() {
  if (!indice) indice = (await obterCache(CHAVE_CACHE)) ?? null;
  return indice;
}

/**
 * Baixa a camada do WebGIS se houver versão nova. Retorna
 * { atualizado, quantidade?, ausente?, erro? }. `ausente` = a camada ainda não
 * foi publicada no WebGIS (não é erro).
 */
export async function atualizarTerracos() {
  const atual = await carregarTerracos();
  let resp;
  try {
    resp = await fetch(URL_TERRACOS, { cache: 'no-cache' });
  } catch {
    return { atualizado: false, erro: 'Sem conexão com o WebGIS.' };
  }
  if (resp.status === 404) return { atualizado: false, ausente: true };
  if (!resp.ok) return { atualizado: false, erro: `O WebGIS respondeu ${resp.status} para os terraços.` };
  const versao = resp.headers.get('etag') || resp.headers.get('last-modified') || null;
  if (atual && versao && atual.versao === versao) return { atualizado: false, quantidade: atual.terracos.length };
  let terracos;
  try {
    terracos = prepararTerracos(await resp.json());
  } catch {
    return { atualizado: false, erro: 'A camada de terraços não é um GeoJSON válido.' };
  }
  const registro = { versao, baixado_em: new Date().toISOString(), origem: URL_TERRACOS, terracos };
  await salvarCache(CHAVE_CACHE, registro);
  indice = registro;
  return { atualizado: true, quantidade: terracos.length };
}

/**
 * Distância em metros do ponto ao terraço mais próximo.
 * null quando os terraços não estão no aparelho ou nenhum está a até RAIO_BUSCA_M.
 */
export function distanciaTerracoM(lon, lat) {
  if (!indice) return null;
  let melhor = Infinity;
  for (const t of indice.terracos) {
    if (!pertoDaCaixa(lon, lat, t.caixa, RAIO_BUSCA_M)) continue;
    const d = distanciaLinhasM(lon, lat, t.linhas);
    if (d < melhor) melhor = d;
  }
  return melhor === Infinity ? null : melhor;
}

/** Terraços que cruzam a caixa dada (para desenhar no mini mapa). */
export function terracosNaCaixa([x0, y0, x1, y1]) {
  if (!indice) return [];
  return indice.terracos.filter(({ caixa: [a0, b0, a1, b1] }) => a1 >= x0 && a0 <= x1 && b1 >= y0 && b0 <= y1);
}
