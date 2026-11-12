// Utilitários de interface: criação de elementos, formatação e avisos.

export function h(tag, attrs, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
  return el;
}

export function fmt(n, casas = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function fmtData(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function fmtHora(date) {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

let timerAviso;
export function aviso(mensagem, nivel = 'ok') {
  let el = document.getElementById('aviso');
  if (!el) {
    el = h('div', { id: 'aviso', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = mensagem;
  el.className = `aviso aviso-${nivel} visivel`;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => el.classList.remove('visivel'), 3200);
}

// Ícones no traço do WebGIS (grade 24, traço 1,6). Os que existem no sprite
// do WebGIS (assets/icons/ui/sprite.svg) foram copiados de lá.
const ICONES = {
  voltar: '<path d="M14.5 5.5 L8 12 L14.5 18.5"/>',
  mais: '<path d="M12 5 V19 M5 12 H19"/>',
  menos: '<path d="M5 12 H19"/>',
  gps: '<path d="M19.5 4.5 L4.5 11 L11 13 L13 19.5 Z"/>',
  camera: '<path d="M4 8.5 H7.5 L9.2 6 H14.8 L16.5 8.5 H20 V18.5 H4 Z"/><circle cx="12" cy="13" r="3.2"/>',
  lixeira: '<path d="M5 7 H19 M10 10.5 V16.5 M14 10.5 V16.5 M6.5 7 L7.5 19.5 H16.5 L17.5 7 M9.5 7 V4.5 H14.5 V7"/>',
  alerta: '<path d="M12 4 L20.5 19 H3.5 Z"/><path d="M12 10 V14 M12 16.6 V16.7"/>',
  ok: '<circle cx="12" cy="12" r="8.5"/><path d="M8.3 12.2 L10.9 14.8 L15.8 9.4"/>',
  exportar: '<path d="M12 4 V14 M8 10 L12 14 L16 10"/><path d="M5 15.5 V19 a1 1 0 0 0 1 1 H18 a1 1 0 0 0 1 -1 V15.5"/>',
  ajustes: '<path d="M4 7 H13 M17 7 H20 M4 17 H7 M11 17 H20"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  lapis: '<path d="M4.5 19.5 L5.3 15.7 L15.4 5.6 a1.9 1.9 0 0 1 2.7 0 l.3 .3 a1.9 1.9 0 0 1 0 2.7 L8.3 18.7 Z"/><path d="M13.6 7.4 L16.6 10.4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11 V16.5 M12 7.9 V8"/>',
  atualizar: '<path d="M19 12 a7 7 0 1 1 -2.05 -4.95"/><path d="M19.5 4.5 V8.5 H15.5"/>',
  'tema-claro': '<circle cx="12" cy="12" r="3.8"/><path d="M12 3.5 V5.5 M12 18.5 V20.5 M3.5 12 H5.5 M18.5 12 H20.5 M6 6 L7.4 7.4 M16.6 16.6 L18 18 M6 18 L7.4 16.6 M16.6 7.4 L18 6"/>',
  'tema-escuro': '<path d="M19.5 14.6 A7.8 7.8 0 1 1 9.4 4.5 A6.2 6.2 0 0 0 19.5 14.6 Z"/>',
  talhao: '<path d="M5 7.5 L11 4.5 L19.5 7 L18 17 L9.5 19.5 L4.5 14 Z"/><circle cx="12" cy="11.5" r="1.4"/>',
  solo: '<path d="M3.5 14 H20.5"/><path d="M6 17.5 H8 M11 17.5 H13 M16 17.5 H18 M8.5 20 H10.5 M13.5 20 H15.5"/><path d="M12 14 V6.5 M12 10 C10 8 7.5 8 6.5 9 M12 8 C14 6 16.5 6 17.5 7"/>',
  cigarrinha: '<ellipse cx="12" cy="13" rx="3.8" ry="5.8"/><path d="M12 7.2 V4.5 M8.4 10 L4.5 8 M15.6 10 L19.5 8 M8.4 15 L4.5 17 M15.6 15 L19.5 17"/>',
  broca: '<path d="M9 3.5 V20.5 M15 3.5 V20.5 M9 8.5 H15 M9 14.5 H15"/><circle cx="12" cy="11.5" r="1.1"/>',
};

export function icone(nome, tamanho = 22) {
  const span = h('span', { class: 'icone', 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome] ?? ''}</svg>`;
  return span;
}

// ---------- tema (mesma preferência do WebGIS: chave "webgis-theme") ----------

const CHAVE_TEMA = 'webgis-theme';

export const temaAtual = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

export function alternarTema() {
  const tema = temaAtual() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', tema);
  try { localStorage.setItem(CHAVE_TEMA, tema); } catch { /* sem armazenamento: vale até recarregar */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tema === 'light' ? '#e9e5de' : '#1c1c1e');
  return tema;
}

export function botaoTema() {
  const botao = h('button', { type: 'button', class: 'topo-botao' });
  const desenhar = () => {
    const escuro = temaAtual() === 'dark';
    botao.replaceChildren(icone(escuro ? 'tema-claro' : 'tema-escuro', 18));
    botao.setAttribute('aria-label', escuro ? 'Ativar modo claro' : 'Ativar modo escuro');
    botao.title = 'Alternar tema';
  };
  botao.addEventListener('click', () => { alternarTema(); desenhar(); });
  desenhar();
  return botao;
}

export function marca() {
  return h('div', { class: 'marca' },
    h('img', { class: 'marca-logo', src: 'icones/logo.png', alt: '', width: 28, height: 28 }),
    h('span', { class: 'marca-nome' }, 'Web', h('span', { class: 'marca-destaque' }, 'GIS')),
    h('span', { class: 'marca-sufixo' }, 'Campo'));
}

export function barraTopo({ titulo, subtitulo, voltar, acoes, comMarca }) {
  return h('header', { class: 'topo' },
    voltar ? h('a', { href: voltar, class: 'topo-botao', 'aria-label': 'Voltar' }, icone('voltar', 18)) : null,
    comMarca ? marca() : h('div', { class: 'topo-titulo' },
      h('h1', null, titulo),
      subtitulo ? h('p', { class: 'topo-sub' }, subtitulo) : null),
    h('div', { class: 'topo-acoes' }, acoes ?? null),
  );
}

export function chip(texto, nivel) {
  return h('span', { class: `chip${nivel ? ` chip-${nivel}` : ''}` }, texto);
}

export function caixaAlerta(alerta) {
  if (!alerta) return null;
  return h('div', { class: `alerta alerta-${alerta.nivel}`, role: alerta.nivel === 'perigo' ? 'alert' : 'status' },
    icone(alerta.nivel === 'ok' ? 'ok' : 'alerta', 26),
    h('div', null, h('strong', null, alerta.titulo), h('p', null, alerta.texto)),
  );
}

export function confirmar(mensagem) {
  return window.confirm(mensagem);
}
