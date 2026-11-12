// Armazenamento local (IndexedDB): as fichas e as fotos ficam no aparelho
// até a sincronização com o servidor.

const NOME = 'app-campo-agronomico';
const VERSAO = 2;
let conexao;

function abrir() {
  if (conexao) return conexao;
  conexao = new Promise((ok, falha) => {
    const req = indexedDB.open(NOME, VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('fichas')) db.createObjectStore('fichas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('fotos')) db.createObjectStore('fotos', { keyPath: 'id' });
      // Dados de apoio baixados (talhões do WebGIS).
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
  return conexao;
}

async function operar(loja, modo, fn) {
  const db = await abrir();
  return new Promise((ok, falha) => {
    const tx = db.transaction(loja, modo);
    const req = fn(tx.objectStore(loja));
    tx.oncomplete = () => ok(req?.result);
    tx.onerror = () => falha(tx.error);
    tx.onabort = () => falha(tx.error);
  });
}

export const listarFichas = () => operar('fichas', 'readonly', (s) => s.getAll());
export const obterFicha = (id) => operar('fichas', 'readonly', (s) => s.get(id));
export const salvarFicha = (registro) =>
  operar('fichas', 'readwrite', (s) => s.put({ ...registro, salvo_em: new Date().toISOString() }));
export const excluirFicha = (id) => operar('fichas', 'readwrite', (s) => s.delete(id));

export const salvarFoto = (id, blob) => operar('fotos', 'readwrite', (s) => s.put({ id, blob }));
export const obterFoto = async (id) => (await operar('fotos', 'readonly', (s) => s.get(id)))?.blob;
export const excluirFoto = (id) => operar('fotos', 'readwrite', (s) => s.delete(id));

export const obterCache = (chave) => operar('cache', 'readonly', (s) => s.get(chave));
export const salvarCache = (chave, valor) => operar('cache', 'readwrite', (s) => s.put(valor, chave));

export function idDispositivo() {
  try {
    let id = localStorage.getItem('dispositivo_id');
    if (!id) {
      id = `aparelho-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('dispositivo_id', id);
    }
    return id;
  } catch {
    return 'aparelho-desconhecido';
  }
}

let parametros;
export async function carregarParametros() {
  if (!parametros) {
    const resp = await fetch('parametros-pda.json', { cache: 'no-cache' });
    parametros = await resp.json();
  }
  return parametros;
}
