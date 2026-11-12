// Controles de formulário pensados para uso no campo: botões grandes,
// teclado numérico e captura de GPS e fotos.

import { h, icone, fmt, aviso } from './ui.js';
import { salvarFoto, obterFoto, excluirFoto } from './db.js';
import { novoUuid } from './fichas.js';

let seq = 0;
const novoId = () => `c${++seq}`;

export function campo({ rotulo, obrigatorio, dica, id }, controle) {
  return h('div', { class: 'campo' },
    h('label', { class: 'campo-rotulo', for: id },
      rotulo, obrigatorio ? h('span', { class: 'obrigatorio', 'aria-hidden': 'true' }, ' *') : null),
    dica ? h('p', { class: 'campo-dica' }, dica) : null,
    controle,
  );
}

export function campoTexto({ rotulo, obrigatorio, valor, aoMudar, tipo = 'text', sugestoes, dica }) {
  const id = novoId();
  const listaId = sugestoes?.length ? `${id}-lista` : null;
  const input = h('input', {
    id, type: tipo, class: 'entrada', value: valor ?? '', required: obrigatorio,
    list: listaId, autocomplete: 'off', oninput: (e) => aoMudar(e.target.value),
  });
  return campo({ rotulo, obrigatorio, dica, id }, [
    input,
    listaId ? h('datalist', { id: listaId }, sugestoes.map((s) => h('option', { value: s }))) : null,
  ]);
}

export function campoAreaTexto({ rotulo, valor, aoMudar }) {
  const id = novoId();
  return campo({ rotulo, id },
    h('textarea', { id, class: 'entrada', rows: 2, oninput: (e) => aoMudar(e.target.value) }, valor ?? ''));
}

function lerDecimal(texto) {
  const t = texto.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function campoDecimal({ rotulo, obrigatorio, valor, aoMudar, sufixo, dica }) {
  const id = novoId();
  const input = h('input', {
    id, type: 'text', inputmode: 'decimal', class: 'entrada entrada-numero',
    value: valor == null ? '' : String(valor).replace('.', ','),
    oninput: (e) => {
      const n = lerDecimal(e.target.value);
      e.target.classList.toggle('invalida', Number.isNaN(n));
      aoMudar(Number.isNaN(n) ? null : n);
    },
  });
  return campo({ rotulo, obrigatorio, dica, id },
    h('div', { class: 'com-sufixo' }, input, sufixo ? h('span', { class: 'sufixo' }, sufixo) : null));
}

/** Contador com botões − e + e digitação direta. Aceita vazio (null) quando não há padrão. */
export function contador({ valor, aoMudar, min = 0, rotulo, id = novoId(), compacto }) {
  const input = h('input', {
    id, type: 'text', inputmode: 'numeric', pattern: '[0-9]*', class: 'contador-valor',
    value: valor ?? '', 'aria-label': rotulo,
    oninput: (e) => {
      const limpo = e.target.value.replace(/\D/g, '');
      if (limpo !== e.target.value) e.target.value = limpo;
      definir(limpo === '' ? null : Number(limpo), false);
    },
    onfocus: (e) => e.target.select(),
  });
  function definir(v, escrever = true) {
    valor = v;
    if (escrever) input.value = v ?? '';
    menos.disabled = v == null || v <= min;
    aoMudar(v);
  }
  const menos = h('button', {
    type: 'button', class: 'contador-btn', 'aria-label': `Diminuir ${rotulo}`,
    onclick: () => definir(valor == null ? null : Math.max(min, valor - 1)),
  }, icone('menos', 20));
  const mais = h('button', {
    type: 'button', class: 'contador-btn', 'aria-label': `Aumentar ${rotulo}`,
    onclick: () => definir(valor == null ? Math.max(min, 1) : valor + 1),
  }, icone('mais', 20));
  menos.disabled = valor == null || valor <= min;
  return h('div', { class: `contador${compacto ? ' contador-compacto' : ''}` }, menos, input, mais);
}

export function campoInteiro({ rotulo, obrigatorio, valor, aoMudar, min, dica }) {
  const id = novoId();
  return campo({ rotulo, obrigatorio, dica, id }, contador({ valor, aoMudar, min, rotulo, id }));
}

/** Larva, pupa e adulto de uma praga, lado a lado. */
export function campoEstagios({ rotulo, valor, aoMudar, critica }) {
  const total = h('span', { class: 'estagios-total' });
  const desenharTotal = () => {
    const t = valor.larva + valor.pupa + valor.adulto;
    total.textContent = t ? `${t} encontrado${t > 1 ? 's' : ''}` : '';
    linha.classList.toggle('estagios-presente', t > 0);
    linha.classList.toggle('estagios-critica', !!critica?.() && t > 0);
  };
  const estagio = (chave, nome) => {
    const id = novoId();
    return h('div', { class: 'estagio' },
      h('label', { for: id, class: 'estagio-nome' }, nome),
      contador({
        id, compacto: true, valor: valor[chave], rotulo: `${nome} de ${rotulo}`,
        aoMudar: (v) => { valor[chave] = v ?? 0; desenharTotal(); aoMudar(valor); },
      }),
    );
  };
  const linha = h('fieldset', { class: 'estagios' },
    h('legend', { class: 'estagios-titulo' },
      h('span', { class: 'praga-nome' }, rotulo),
      critica?.() ? h('span', { class: 'tag-critica' }, 'crítica') : null,
      total),
    h('div', { class: 'estagios-grade' }, estagio('larva', 'Larva'), estagio('pupa', 'Pupa'), estagio('adulto', 'Adulto')),
  );
  desenharTotal();
  return linha;
}

export function seletor({ opcoes, valor, aoMudar, rotulo }) {
  const grupo = h('div', { class: 'seletor', role: 'radiogroup', 'aria-label': rotulo });
  const desenhar = () => {
    grupo.replaceChildren(...opcoes.map((o) =>
      h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(o.valor === valor),
        class: `seletor-opcao${o.valor === valor ? ' ativa' : ''}`,
        onclick: () => { valor = o.valor; desenhar(); aoMudar(valor); },
      }, o.rotulo)));
  };
  desenhar();
  return grupo;
}

export function campoEspuma({ rotulo, valor, aoMudar }) {
  const intensidade = h('div', { class: 'espuma-intensidade' });
  const desenharIntensidade = () => {
    intensidade.replaceChildren();
    if (!valor.presente) return;
    intensidade.append(
      h('p', { class: 'campo-dica' }, 'Intensidade (opcional)'),
      seletor({
        rotulo: 'Intensidade da espuma',
        opcoes: [{ valor: 1, rotulo: '1 · Baixa' }, { valor: 2, rotulo: '2 · Média' }, { valor: 3, rotulo: '3 · Alta' }],
        valor: valor.intensidade,
        aoMudar: (v) => { valor.intensidade = v; aoMudar(valor); },
      }),
    );
  };
  desenharIntensidade();
  return h('div', { class: 'campo' },
    h('span', { class: 'campo-rotulo' }, rotulo, h('span', { class: 'obrigatorio', 'aria-hidden': 'true' }, ' *')),
    seletor({
      rotulo,
      opcoes: [{ valor: false, rotulo: 'Sem espuma' }, { valor: true, rotulo: 'Com espuma' }],
      valor: valor.presente,
      aoMudar: (v) => {
        valor.presente = v;
        if (!v) delete valor.intensidade;
        desenharIntensidade();
        aoMudar(valor);
      },
    }),
    intensidade,
  );
}

// ---------- GPS ----------

const PRECISAO_ACEITAVEL_M = 20;

function geoDePosicao(pos) {
  const c = pos.coords;
  const g = {
    latitude: Math.round(c.latitude * 1e6) / 1e6,
    longitude: Math.round(c.longitude * 1e6) / 1e6,
    capturado_em: new Date(pos.timestamp || Date.now()).toISOString(),
  };
  if (c.accuracy != null) g.precisao_m = Math.round(c.accuracy * 10) / 10;
  if (c.altitude != null) g.altitude_m = Math.round(c.altitude * 10) / 10;
  return g;
}

function mensagemErroGps(err) {
  if (!navigator.geolocation) return 'Este aparelho não tem GPS disponível no navegador.';
  if (err?.code === 1) return 'Permissão de localização negada. Libere o acesso nas configurações do navegador.';
  if (err?.code === 3) return 'O GPS demorou para responder. Vá para céu aberto e tente de novo.';
  return 'Não foi possível obter a localização. Tente de novo.';
}

export function capturarGps(timeout = 20000) {
  return new Promise((ok, falha) => {
    if (!navigator.geolocation) return falha(null);
    navigator.geolocation.getCurrentPosition((p) => ok(geoDePosicao(p)), falha,
      { enableHighAccuracy: true, timeout, maximumAge: 0 });
  });
}

export function campoGps({ rotulo, obrigatorio, valor, aoMudar }) {
  const info = h('div', { class: 'gps-info' });
  const botao = h('button', { type: 'button', class: 'btn btn-secundario btn-gps' });
  function desenhar(estado, mensagem) {
    botao.disabled = estado === 'capturando';
    botao.replaceChildren(icone('gps', 20),
      estado === 'capturando' ? 'Capturando…' : valor ? 'Capturar de novo' : 'Capturar GPS');
    info.className = 'gps-info';
    if (estado === 'erro') {
      info.classList.add('gps-erro');
      info.textContent = mensagem;
    } else if (valor) {
      const fraca = valor.precisao_m > PRECISAO_ACEITAVEL_M;
      info.classList.add(fraca ? 'gps-fraco' : 'gps-ok');
      info.replaceChildren(...[
        h('span', { class: 'gps-coord' }, `${fmt(valor.latitude, 6)}, ${fmt(valor.longitude, 6)}`),
        valor.precisao_m != null ? h('span', null, ` · ±${fmt(valor.precisao_m, 0)} m`) : null,
        fraca ? h('span', { class: 'gps-aviso' }, 'Precisão baixa. Aguarde o sinal melhorar e capture de novo.') : null,
      ].filter(Boolean));
    } else {
      info.textContent = 'Localização ainda não capturada.';
    }
  }
  botao.addEventListener('click', async () => {
    desenhar('capturando');
    try {
      valor = await capturarGps();
      aoMudar(valor);
      desenhar();
    } catch (err) {
      desenhar('erro', mensagemErroGps(err));
    }
  });
  desenhar();
  return h('div', { class: 'campo' },
    h('span', { class: 'campo-rotulo' }, rotulo, obrigatorio ? h('span', { class: 'obrigatorio', 'aria-hidden': 'true' }, ' *') : null),
    h('div', { class: 'gps' }, botao, info),
  );
}

// ---------- Fotos ----------

export function campoFotos({ rotulo, valor, aoMudar, exigirGps, gpsDoItem }) {
  const galeria = h('div', { class: 'fotos-galeria' });
  const urls = [];

  async function miniatura(foto) {
    const img = h('img', { alt: `Foto ${foto.legenda ?? ''}`.trim(), loading: 'lazy' });
    obterFoto(foto.id).then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      img.src = url;
    });
    return h('figure', { class: 'foto' }, img,
      h('button', {
        type: 'button', class: 'foto-remover', 'aria-label': 'Remover foto',
        onclick: async () => {
          if (!window.confirm('Remover esta foto?')) return;
          valor.splice(valor.indexOf(foto), 1);
          await excluirFoto(foto.id);
          aoMudar(valor);
          desenhar();
        },
      }, icone('lixeira', 18)),
      foto.geolocalizacao ? null : h('figcaption', { class: 'foto-sem-gps' }, 'sem GPS'),
    );
  }

  async function desenhar() {
    galeria.replaceChildren(...(await Promise.all(valor.map(miniatura))));
  }

  const entrada = h('input', {
    type: 'file', accept: 'image/*', capture: 'environment', multiple: true, class: 'visualmente-oculto',
    onchange: async (e) => {
      const arquivos = [...e.target.files];
      e.target.value = '';
      if (!arquivos.length) return;
      let geo = null;
      try { geo = await capturarGps(10000); } catch { geo = gpsDoItem?.() ?? null; }
      if (exigirGps && !geo) {
        aviso('Não foi possível obter o GPS. Capture a localização da amostra e tente de novo.', 'perigo');
        return;
      }
      for (const arquivo of arquivos) {
        const id = novoUuid();
        await salvarFoto(id, arquivo);
        const foto = { id, arquivo: `local:${id}`, capturado_em: new Date().toISOString() };
        if (geo) foto.geolocalizacao = geo;
        valor.push(foto);
      }
      aoMudar(valor);
      desenhar();
    },
  });

  desenhar();
  return h('div', { class: 'campo' },
    h('span', { class: 'campo-rotulo' }, rotulo),
    galeria,
    h('label', { class: 'btn btn-secundario btn-foto' }, icone('camera', 20), 'Tirar foto', entrada),
  );
}
