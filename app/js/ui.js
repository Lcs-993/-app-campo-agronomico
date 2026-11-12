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

const ICONES = {
  voltar: '<path d="M15 5l-7 7 7 7"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  menos: '<path d="M5 12h14"/>',
  gps: '<circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  lixeira: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  alerta: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  exportar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  ajustes: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  lapis: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  solo: '<path d="M3 14h18M5 18h2M11 18h2M17 18h2M12 14V6M12 9c-2-2-4-2-5-1M12 7c2-2 4-2 5-1"/>',
  cigarrinha: '<ellipse cx="12" cy="13" rx="4" ry="6"/><path d="M12 7V4M8 10L4 8M16 10l4-2M8 15l-4 2M16 15l4 2"/>',
  broca: '<path d="M9 3v18M15 3v18M9 8h6M9 14h6"/><circle cx="12" cy="11" r="1.2"/>',
};

export function icone(nome, tamanho = 22) {
  const span = h('span', { class: 'icone', 'aria-hidden': 'true' });
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONES[nome] ?? ''}</svg>`;
  return span;
}

export function barraTopo({ titulo, subtitulo, voltar, acoes }) {
  return h('header', { class: 'topo' },
    voltar ? h('a', { href: voltar, class: 'btn-icone', 'aria-label': 'Voltar' }, icone('voltar')) : null,
    h('div', { class: 'topo-titulo' },
      h('h1', null, titulo),
      subtitulo ? h('p', { class: 'topo-sub' }, subtitulo) : null,
    ),
    acoes ?? null,
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
