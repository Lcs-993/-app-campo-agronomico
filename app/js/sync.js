// Envio das fichas finalizadas ao servidor (pasta backend/ do repositório; ver docs/backend.md).
//
// Fluxo: as fichas finalizadas vão em lote para POST /api/v1/sync/fichas. Para cada ficha aceita,
// o servidor devolve as fotos que ainda não tem, e o app envia cada uma com PUT /api/v1/fotos/{id}.
// A ficha só conta como "enviada" quando o servidor tem a ficha e todas as fotos. Reenviar é seguro:
// o servidor reconhece a ficha pelo id e não duplica.

import { listarFichas, salvarFicha, obterFoto, idDispositivo } from './db.js';

const CHAVE_CONFIG = 'servidor';
const FICHAS_POR_LOTE = 50;

export function configServidor() {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE_CONFIG) ?? 'null');
    return { url: c?.url ?? '', chave: c?.chave ?? '' };
  } catch {
    return { url: '', chave: '' };
  }
}

export function normalizarUrl(url) {
  return (url ?? '').trim().replace(/\/+$/, '');
}

export function salvarConfigServidor({ url, chave }) {
  localStorage.setItem(CHAVE_CONFIG, JSON.stringify({ url: normalizarUrl(url), chave: (chave ?? '').trim() }));
}

export const servidorConfigurado = () => Boolean(configServidor().url);

/** Fichas finalizadas que o servidor ainda não tem por completo (inclui as recusadas, para reenvio após correção). */
export const aguardandoEnvio = (r) => r.finalizada && r.envio?.situacao !== 'enviada';
export const enviada = (r) => r.finalizada && r.envio?.situacao === 'enviada';
/** Depois que o servidor aceitou a ficha, ela não pode mais ser alterada no aparelho. */
export const aceitaPeloServidor = (r) => ['enviada', 'fotos_pendentes'].includes(r.envio?.situacao);

function chamar(cfg, caminho, opcoes = {}) {
  const headers = { ...(cfg.chave ? { Authorization: `Bearer ${cfg.chave}` } : {}), ...opcoes.headers };
  return fetch(`${cfg.url}${caminho}`, { ...opcoes, headers, cache: 'no-store' });
}

function mensagemFalha(erro) {
  return erro instanceof TypeError
    ? 'Não foi possível falar com o servidor. Confira a internet e o endereço do servidor.'
    : erro.message;
}

/** Confere o endereço e a chave (botão "Testar conexão"). */
export async function testarConexao(cfg) {
  const alvo = { url: normalizarUrl(cfg.url), chave: (cfg.chave ?? '').trim() };
  if (!alvo.url) return { ok: false, mensagem: 'Informe o endereço do servidor.' };
  try {
    const saude = await chamar(alvo, '/api/v1/saude');
    if (!saude.ok) return { ok: false, mensagem: `O servidor respondeu com erro (${saude.status}).` };
    const aparelho = await chamar(alvo, '/api/v1/aparelho');
    if (aparelho.status === 401) return { ok: false, mensagem: 'Servidor encontrado, mas a chave do aparelho foi recusada.' };
    if (!aparelho.ok) return { ok: false, mensagem: `O servidor respondeu com erro (${aparelho.status}).` };
    const { aparelho: nome } = await aparelho.json();
    return { ok: true, mensagem: nome ? `Conectado como "${nome}".` : 'Conectado (servidor sem chave, modo de desenvolvimento).' };
  } catch (erro) {
    return { ok: false, mensagem: mensagemFalha(erro) };
  }
}

async function enviarFotos(cfg, ids) {
  const faltando = [];
  for (const id of ids) {
    const blob = await obterFoto(id);
    if (!blob) { faltando.push(id); continue; }
    const resp = await chamar(cfg, `/api/v1/fotos/${id}`, {
      method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg' },
    });
    if (!resp.ok) faltando.push(id);
  }
  return faltando;
}

/**
 * Envia as fichas finalizadas que faltam. Retorna
 * { enviadas, recusadas, comFotosPendentes, erro } (erro = problema geral, como falta de internet).
 */
export async function sincronizar() {
  const resumo = { enviadas: 0, recusadas: 0, comFotosPendentes: 0, erro: null };
  const cfg = configServidor();
  if (!cfg.url) return { ...resumo, erro: 'Configure o endereço do servidor.' };
  if (navigator.onLine === false) return { ...resumo, erro: 'Sem internet. As fichas continuam guardadas no aparelho.' };

  const pendentes = (await listarFichas()).filter(aguardandoEnvio);
  try {
    for (let i = 0; i < pendentes.length; i += FICHAS_POR_LOTE) {
      const lote = pendentes.slice(i, i + FICHAS_POR_LOTE);
      const resp = await chamar(cfg, '/api/v1/sync/fichas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispositivo_id: idDispositivo(), enviado_em: new Date().toISOString(), fichas: lote.map((r) => r.documento) }),
      });
      if (resp.status === 401) throw new Error('A chave do aparelho foi recusada pelo servidor.');
      if (!resp.ok) throw new Error(`O servidor respondeu com erro (${resp.status}). Tente de novo mais tarde.`);
      const { resultados } = await resp.json();
      const porId = new Map(lote.map((r) => [r.id, r]));

      for (const r of resultados) {
        const registro = porId.get(r.id);
        if (!registro) continue;
        const em = new Date().toISOString();
        if (r.situacao === 'gravada' || r.situacao === 'ja_recebida') {
          const faltando = await enviarFotos(cfg, r.fotos_pendentes ?? []);
          registro.envio = faltando.length
            ? { situacao: 'fotos_pendentes', em, fotos_pendentes: faltando, avisos: r.avisos ?? [] }
            : { situacao: 'enviada', em, avisos: r.avisos ?? [] };
          if (faltando.length) resumo.comFotosPendentes++; else resumo.enviadas++;
        } else {
          registro.envio = { situacao: 'erro', em, motivo: r.situacao, erros: r.erros ?? [] };
          resumo.recusadas++;
        }
        await salvarFicha(registro);
      }
    }
  } catch (erro) {
    resumo.erro = mensagemFalha(erro);
  }
  return resumo;
}

/** Texto curto para o aviso depois da sincronização. */
export function textoResumo(r) {
  if (r.erro) return r.erro;
  const partes = [];
  if (r.enviadas) partes.push(`${r.enviadas} ficha${r.enviadas === 1 ? '' : 's'} enviada${r.enviadas === 1 ? '' : 's'}`);
  if (r.comFotosPendentes) partes.push(`${r.comFotosPendentes} com fotos ainda por enviar`);
  if (r.recusadas) partes.push(`${r.recusadas} recusada${r.recusadas === 1 ? '' : 's'} pelo servidor`);
  return partes.length ? `${partes.join(', ')}.` : 'Nenhuma ficha para enviar.';
}
