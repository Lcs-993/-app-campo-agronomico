// Tela de preenchimento de qualquer ficha. Os campos vêm da configuração em fichas.js.

import { h, icone, barraTopo, caixaAlerta, chip, aviso, fmt, fmtHora, fmtData } from '../ui.js';
import {
  campoTexto, campoAreaTexto, campoDecimal, campoInteiro, campoEstagios, campoEspuma, campoGps, campoFotos, seletor,
  capturarGps, mensagemErroGps,
} from '../componentes.js';
import {
  FICHAS, novoRegistro, pendencias, documentoFinal, hojeLocal, definirTalhao, errosTalhaoItem,
} from '../fichas.js';
import {
  carregarTalhoes, atualizarTalhoes, localizarTalhao, talhaoDoPonto, talhaoPorFid,
} from '../talhoes.js';
import { calcularCQ } from '../regras.js';
import { obterFicha, salvarFicha, excluirFicha, excluirFoto, listarFichas, idDispositivo, carregarParametros } from '../db.js';
import { navegar } from '../rotas.js';

async function sugestoesIdentificacao() {
  const valores = {};
  for (const r of await listarFichas()) {
    for (const [k, v] of Object.entries(r.ficha.identificacao ?? {})) {
      if (typeof v === 'string' && v.trim()) (valores[k] ??= new Set()).add(v.trim());
    }
  }
  return Object.fromEntries(Object.entries(valores).map(([k, s]) => [k, [...s].sort()]));
}

export async function telaNovaFicha(tipo) {
  if (!FICHAS[tipo]) return navegar('#/');
  const registro = novoRegistro(tipo, idDispositivo());
  await salvarFicha(registro);
  history.replaceState(null, '', `#/ficha/${registro.id}`);
  return telaFicha(registro.id);
}

export async function telaFicha(id) {
  const [registro, parametros, sugestoes] = await Promise.all([obterFicha(id), carregarParametros(), sugestoesIdentificacao()]);
  let talhoes = await carregarTalhoes();
  if (!registro) {
    return h('div', { class: 'tela' }, barraTopo({ titulo: 'Ficha não encontrada', voltar: '#/' }),
      h('main', { class: 'conteudo' }, h('p', null, 'Esta ficha não existe mais neste aparelho.')));
  }
  const cfg = FICHAS[registro.tipo];
  const f = registro.ficha;
  const somenteLeitura = registro.finalizada;

  // Pontos capturados antes de os talhões estarem no aparelho: confere agora.
  if (talhoes && !somenteLeitura) {
    for (const item of f[cfg.colecao]) {
      if (item.geolocalizacao && !item.talhao_ponto) item.talhao_ponto = talhaoDoPonto(item.geolocalizacao);
    }
  }

  // ---------- salvamento automático ----------
  const estadoSalvo = h('span', { class: 'estado-salvo' }, somenteLeitura ? '' : 'Rascunho');
  let timerSalvar;
  function agendarSalvar() {
    clearTimeout(timerSalvar);
    estadoSalvo.textContent = 'Salvando…';
    timerSalvar = setTimeout(async () => {
      f.metadados.atualizado_em = new Date().toISOString();
      await salvarFicha(registro);
      estadoSalvo.textContent = `Rascunho salvo às ${fmtHora(new Date())}`;
    }, 400);
  }

  // ---------- resultados e alertas ao vivo ----------
  const painelAlerta = h('div', { class: 'painel-alerta' });
  const painelIndicadores = h('dl', { class: 'indicadores' });
  const errosPorItem = new Map();
  const resumosPorItem = new Map();
  let ultimoNivel = null;

  function atualizarResultados() {
    const alerta = cfg.alerta(f, parametros);
    painelAlerta.replaceChildren(caixaAlerta(alerta) ?? '');
    if (alerta?.vibrar && alerta.nivel === 'perigo' && ultimoNivel !== 'perigo' && !somenteLeitura) {
      navigator.vibrate?.([200, 100, 200]);
    }
    ultimoNivel = alerta?.nivel ?? null;
    painelIndicadores.replaceChildren(...cfg.indicadores(f, parametros).flatMap((i) => [
      h('div', { class: 'indicador' }, h('dt', null, i.rotulo), h('dd', null, i.valor)),
    ]));
    for (const item of f[cfg.colecao]) {
      const caixa = errosPorItem.get(item);
      if (caixa) {
        const erros = [...cfg.errosItem(item), ...errosTalhaoItem(f, item)];
        caixa.replaceChildren(...erros.map((e) => h('p', null, icone('alerta', 18), e)));
        caixa.hidden = !erros.length;
      }
      resumosPorItem.get(item)?.replaceChildren(cfg.resumoItem(item));
    }
    atualizarParecer?.();
    desenharTalhao?.();
  }

  function mudou() {
    atualizarResultados();
    if (!painelPendencias.hidden) mostrarPendencias(pendencias(registro, parametros), false);
    if (!somenteLeitura) agendarSalvar();
  }

  // ---------- campos ----------
  function controle(c, alvo) {
    const comum = {
      rotulo: c.rotulo, obrigatorio: c.obrigatorio, dica: c.dica, valor: alvo[c.chave],
      aoMudar: (v) => { alvo[c.chave] = v; mudou(); },
    };
    switch (c.tipo) {
      case 'data': return campoTexto({ ...comum, tipo: 'date' });
      case 'decimal': return campoDecimal({ ...comum, sufixo: c.sufixo });
      case 'inteiro': return campoInteiro({ ...comum, min: c.min });
      case 'estagios': return campoEstagios({
        ...comum, critica: () => parametros.pragas_solo.pragas_criticas.includes(c.chave),
      });
      case 'espuma': return campoEspuma(comum);
      case 'gps': return campoGps({
        ...comum,
        aoMudar: (geo) => {
          alvo[c.chave] = geo;
          alvo.talhao_ponto = talhaoDoPonto(geo);
          // O primeiro ponto dentro de um talhão define o talhão da ficha.
          if (f.identificacao.talhao_fid == null && alvo.talhao_ponto?.fid != null) {
            definirTalhao(f, talhaoPorFid(alvo.talhao_ponto.fid), geo);
            aviso(`Talhão identificado: ${f.identificacao.talhao} · ${f.identificacao.fazenda}`);
          }
          mudou();
        },
      });
      case 'fotos': return campoFotos({ ...comum, exigirGps: c.exigirGps, gpsDoItem: () => alvo.geolocalizacao });
      case 'texto': return campoAreaTexto(comum);
      default: return campoTexto({ ...comum, sugestoes: c.sugestoes ? sugestoes[c.chave] : null });
    }
  }

  // ---------- talhão (identificado pelo GPS, com os talhões do WebGIS) ----------
  const conteudoTalhao = h('div', { class: 'talhao-conteudo' });
  const statusTalhao = h('p', { class: 'talhao-status', role: 'status' });
  let desenharTalhao = null;

  async function identificarTalhao(botao) {
    if (!talhoes) {
      statusTalhao.textContent = 'Baixando os talhões do WebGIS…';
      const r = await atualizarTalhoes();
      talhoes = await carregarTalhoes();
      if (!talhoes) {
        statusTalhao.textContent = `${r.erro ?? 'Não foi possível baixar os talhões.'} Conecte-se à internet e tente de novo.`;
        statusTalhao.className = 'talhao-status erro';
        return;
      }
    }
    botao.disabled = true;
    statusTalhao.className = 'talhao-status';
    statusTalhao.textContent = 'Obtendo a localização…';
    try {
      const geo = await capturarGps();
      const r = localizarTalhao(geo.longitude, geo.latitude);
      if (!r.talhao) {
        statusTalhao.className = 'talhao-status erro';
        statusTalhao.textContent = r.maisProximo
          ? `Você não está dentro de nenhum talhão cadastrado. O mais próximo é ${r.maisProximo.talhao} · ${r.maisProximo.fazenda}, a ${fmt(r.distancia_m, 0)} m.`
          : 'Você não está dentro de nenhum talhão cadastrado no WebGIS.';
        return;
      }
      definirTalhao(f, r.talhao, geo);
      for (const item of f[cfg.colecao]) if (item.geolocalizacao) item.talhao_ponto = talhaoDoPonto(item.geolocalizacao);
      statusTalhao.textContent = r.dentro ? '' : `Você está a ${fmt(r.distancia_m, 0)} m da borda deste talhão.`;
      mudou();
    } catch (err) {
      statusTalhao.className = 'talhao-status erro';
      statusTalhao.textContent = mensagemErroGps(err);
    } finally {
      botao.disabled = false;
    }
  }

  desenharTalhao = () => {
    const id = f.identificacao;
    const botao = h('button', { type: 'button', class: id.talhao_fid == null ? 'btn btn-primario' : 'btn btn-secundario' });
    botao.append(icone('gps', 20), id.talhao_fid == null ? 'Identificar talhão pelo GPS' : 'Identificar de novo');
    botao.addEventListener('click', () => identificarTalhao(botao));
    const talhao = id.talhao_fid != null ? talhaoPorFid(id.talhao_fid) : null;
    if (id.talhao_fid == null) {
      conteudoTalhao.replaceChildren(
        h('p', { class: 'campo-dica' }, talhoes
          ? `Fazenda e talhão vêm da sua localização, pelos ${talhoes.talhoes.length.toLocaleString('pt-BR')} talhões do WebGIS. Fique dentro do talhão e toque no botão, ou capture o GPS do primeiro ponto.`
          : 'Os talhões do WebGIS ainda não foram baixados neste aparelho. Com internet, o botão abaixo baixa e identifica o talhão.'),
        somenteLeitura ? null : botao);
      return;
    }
    const info = f.talhao_info ?? {};
    conteudoTalhao.replaceChildren(
      h('dl', { class: 'talhao-dados' },
        h('div', { class: 'talhao-dado talhao-dado-largo' }, h('dt', null, 'Fazenda'), h('dd', null, id.fazenda)),
        h('div', { class: 'talhao-dado' }, h('dt', null, 'Talhão'), h('dd', { class: 'talhao-nome' }, id.talhao)),
        h('div', { class: 'talhao-dado' }, h('dt', null, 'Área'), h('dd', null, info.area_ha != null ? `${fmt(info.area_ha, 2)} ha` : '—')),
        h('div', { class: 'talhao-dado talhao-dado-largo' }, h('dt', null, 'Variedade'), h('dd', null, info.variedade || '—')),
      ),
      talhao ? miniMapa(talhao, f[cfg.colecao], f) : null,
      somenteLeitura ? null : botao,
    );
  };

  const secaoTalhao = h('section', { class: 'cartao cartao-talhao' },
    h('h2', { class: 'cartao-titulo' }, icone('talhao', 20), 'Talhão'),
    conteudoTalhao, statusTalhao);

  const secaoIdentificacao = h('section', { class: 'cartao' },
    h('h2', { class: 'cartao-titulo' }, 'Identificação'),
    h('div', { class: 'grade-campos' },
      cfg.identificacao.map((c) => controle(c, f.identificacao)),
    ),
  );

  const listaItens = h('div', { class: 'itens' });

  function cartaoItem(item) {
    const caixaErros = h('div', { class: 'erros-item', role: 'alert', hidden: true });
    const resumo = h('span', { class: 'item-resumo' });
    errosPorItem.set(item, caixaErros);
    resumosPorItem.set(item, resumo);
    const camposSimples = cfg.camposItem.filter((c) => c.tipo !== 'estagios');
    const camposEstagios = cfg.camposItem.filter((c) => c.tipo === 'estagios');
    const antesDosEstagios = camposSimples.filter((c) => !['fotos', 'texto'].includes(c.tipo));
    const depoisDosEstagios = camposSimples.filter((c) => ['fotos', 'texto'].includes(c.tipo));
    return h('section', { class: 'cartao item', 'data-item': item.numero },
      h('div', { class: 'item-cabecalho' },
        h('h3', null, `${cfg.nomeItem} ${item.numero}`),
        resumo,
        somenteLeitura ? null : h('button', {
          type: 'button', class: 'btn-icone btn-remover', 'aria-label': `Remover ${cfg.nomeItem.toLowerCase()} ${item.numero}`,
          onclick: () => removerItem(item),
        }, icone('lixeira', 20)),
      ),
      h('div', { class: 'grade-campos' }, antesDosEstagios.map((c) => controle(c, item))),
      caixaErros,
      camposEstagios.length ? h('div', { class: 'grupo-estagios' },
        h('h4', null, 'Pragas encontradas (indivíduos por estágio)'),
        camposEstagios.map((c) => controle(c, item))) : null,
      depoisDosEstagios.map((c) => controle(c, item)),
    );
  }

  function desenharItens() {
    errosPorItem.clear();
    resumosPorItem.clear();
    listaItens.replaceChildren(...f[cfg.colecao].map(cartaoItem));
  }

  function adicionarItem() {
    const itens = f[cfg.colecao];
    const numero = itens.reduce((m, i) => Math.max(m, i.numero), 0) + 1;
    const item = cfg.novoItem(numero);
    itens.push(item);
    const cartao = cartaoItem(item);
    listaItens.append(cartao);
    mudou();
    cartao.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function removerItem(item) {
    const nome = `${cfg.nomeItem.toLowerCase()} ${item.numero}`;
    if (!window.confirm(`Remover ${nome}? Os dados e fotos dele serão apagados.`)) return;
    const itens = f[cfg.colecao];
    itens.splice(itens.indexOf(item), 1);
    for (const foto of item.fotos ?? []) await excluirFoto(foto.id);
    desenharItens();
    mudou();
  }

  // ---------- parecer do PDA (somente CQ) ----------
  let atualizarParecer = null;
  let secaoParecer = null;
  if (cfg.temParecer) {
    f.parecer_pda ??= { responsavel: '', data: '', decisao: '', justificativa: '' };
    const p = f.parecer_pda;
    const conteudoParecer = h('div', { class: 'grade-campos' },
      campoTexto({ rotulo: 'Responsável técnico', valor: p.responsavel, aoMudar: (v) => { p.responsavel = v; mudou(); } }),
      campoTexto({ rotulo: 'Data do parecer', tipo: 'date', valor: p.data, aoMudar: (v) => { p.data = v; mudou(); } }),
      h('div', { class: 'campo campo-largo' },
        h('span', { class: 'campo-rotulo' }, 'Decisão'),
        seletor({
          rotulo: 'Decisão do PDA', valor: p.decisao,
          opcoes: [{ valor: 'liberar', rotulo: 'Liberar corte' }, { valor: 'reprovar', rotulo: 'Manter bloqueado' }],
          aoMudar: (v) => { p.decisao = v; if (!p.data) p.data = hojeLocal(); mudou(); },
        })),
      h('div', { class: 'campo-largo' }, campoAreaTexto({ rotulo: 'Justificativa', valor: p.justificativa, aoMudar: (v) => { p.justificativa = v; mudou(); } })),
    );
    secaoParecer = h('section', { class: 'cartao cartao-parecer', hidden: true },
      h('h2', null, 'Parecer técnico do PDA'),
      h('p', { class: 'campo-dica' }, 'O talhão passou do limite de bloqueio. O corte só é liberado com o parecer completo.'),
      conteudoParecer);
    atualizarParecer = () => {
      secaoParecer.hidden = calcularCQ(f, parametros).status_calculado !== 'bloqueado';
    };
  }

  // ---------- finalizar ----------
  const painelPendencias = h('div', { class: 'pendencias', role: 'alert', hidden: true });

  /** Mostra o que falta para finalizar; a lista se atualiza enquanto o usuário corrige. */
  function mostrarPendencias(lista, rolar) {
    painelPendencias.hidden = !lista.length;
    if (!lista.length) return;
    painelPendencias.replaceChildren(
      h('strong', null, `Falta${lista.length > 1 ? 'm' : ''} ${lista.length} ite${lista.length > 1 ? 'ns' : 'm'} para finalizar:`),
      h('ul', null, lista.map((e) => h('li', null, e))));
    if (rolar) painelPendencias.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function finalizar() {
    const lista = pendencias(registro, parametros);
    if (lista.length) return mostrarPendencias(lista, true);
    clearTimeout(timerSalvar);
    f.metadados.atualizado_em = new Date().toISOString();
    registro.finalizada = true;
    registro.documento = documentoFinal(registro, parametros);
    await salvarFicha(registro);
    aviso('Ficha finalizada. Ela será enviada na próxima sincronização.');
    navegar('#/');
  }

  async function reabrir() {
    registro.finalizada = false;
    delete registro.documento;
    await salvarFicha(registro);
    navegar(`#/ficha/${registro.id}`, { recarregar: true });
  }

  async function excluir() {
    if (!window.confirm('Excluir esta ficha e todas as fotos dela? Não dá para desfazer.')) return;
    clearTimeout(timerSalvar);
    for (const item of f[cfg.colecao]) for (const foto of item.fotos ?? []) await excluirFoto(foto.id);
    await excluirFicha(registro.id);
    aviso('Ficha excluída.');
    navegar('#/');
  }

  const rodape = somenteLeitura
    ? h('div', { class: 'rodape-acoes' },
      h('button', { type: 'button', class: 'btn btn-secundario', onclick: reabrir }, icone('lapis', 20), 'Reabrir para edição'))
    : h('div', { class: 'rodape-acoes' },
      h('button', { type: 'button', class: 'btn btn-primario', onclick: finalizar }, icone('ok', 20), 'Finalizar ficha'),
      h('button', { type: 'button', class: 'btn btn-perigo-texto', onclick: excluir }, icone('lixeira', 20), 'Excluir ficha'));

  desenharItens();
  atualizarResultados();

  const formulario = h('fieldset', { class: 'formulario', disabled: somenteLeitura },
    secaoTalhao,
    secaoIdentificacao,
    h('section', { class: 'cartao cartao-resultados', 'aria-live': 'polite' },
      h('h2', null, 'Resultado do talhão'), painelAlerta, painelIndicadores),
    secaoParecer,
    h('h2', { class: 'titulo-secao' }, cfg.colecao === 'pontos' ? 'Pontos de amostragem' : 'Amostras'),
    listaItens,
    somenteLeitura ? null : h('button', { type: 'button', class: 'btn btn-adicionar', onclick: adicionarItem },
      icone('mais', 22), `Adicionar ${cfg.nomeItem.toLowerCase()}`),
    h('section', { class: 'cartao' }, campoAreaTexto({
      rotulo: 'Observações gerais', valor: f.observacoes, aoMudar: (v) => { f.observacoes = v; mudou(); },
    })),
  );

  const subtitulo = [cfg.setor, f.identificacao.talhao && `Talhão ${f.identificacao.talhao}`, fmtData(f.identificacao.data)]
    .filter(Boolean).join(' · ');

  return h('div', { class: 'tela' },
    barraTopo({
      titulo: cfg.titulo, subtitulo, voltar: '#/',
      acoes: somenteLeitura ? chip('Finalizada', 'ok') : estadoSalvo,
    }),
    h('main', { class: 'conteudo' },
      somenteLeitura ? h('p', { class: 'nota' }, 'Ficha finalizada, aguardando sincronização. Para alterar, reabra para edição.') : null,
      formulario, painelPendencias, rodape),
  );
}

// ---------- mini mapa do talhão (SVG, funciona sem internet) ----------

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

function miniMapa(talhao, itens, ficha) {
  const pontos = itens.filter((i) => i.geolocalizacao);
  const [x0, y0, x1, y1] = talhao.caixa;
  let [minX, minY, maxX, maxY] = [x0, y0, x1, y1];
  for (const p of pontos) {
    minX = Math.min(minX, p.geolocalizacao.longitude); maxX = Math.max(maxX, p.geolocalizacao.longitude);
    minY = Math.min(minY, p.geolocalizacao.latitude); maxY = Math.max(maxY, p.geolocalizacao.latitude);
  }
  const kx = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const larg = Math.max((maxX - minX) * kx, 1e-6);
  const alt = Math.max(maxY - minY, 1e-6);
  const W = 320; const M = 18;
  const escala = Math.min((W - 2 * M) / larg, (200 - 2 * M) / alt);
  const H = Math.round(alt * escala + 2 * M);
  const px = (lon) => M + ((lon - minX) * kx) * escala + ((W - 2 * M) - larg * escala) / 2;
  const py = (lat) => M + (maxY - lat) * escala;

  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'mini-mapa', role: 'img',
    'aria-label': `Contorno do talhão ${talhao.talhao} com ${pontos.length} ponto(s) capturado(s)` });
  const d = talhao.poligonos.map((pol) => pol.map((anel) =>
    `M${anel.map(([x, y]) => `${px(x).toFixed(1)} ${py(y).toFixed(1)}`).join('L')}Z`).join('')).join('');
  el.append(svg('path', { d, class: 'mini-mapa-talhao', 'fill-rule': 'evenodd' }));
  for (const p of pontos) {
    const fora = errosTalhaoItem(ficha, p).length > 0;
    const g = svg('g', { class: `mini-mapa-ponto${fora ? ' fora' : ''}` });
    const cx = px(p.geolocalizacao.longitude); const cy = py(p.geolocalizacao.latitude);
    g.append(svg('circle', { cx, cy, r: 9 }));
    const t = svg('text', { x: cx, y: cy + 3.5, 'text-anchor': 'middle' });
    t.textContent = String(p.numero);
    g.append(t);
    el.append(g);
  }
  return h('figure', { class: 'mini-mapa-quadro' }, el,
    h('figcaption', null, pontos.length
      ? `Contorno do talhão no WebGIS e ${pontos.length} ponto${pontos.length > 1 ? 's' : ''} capturado${pontos.length > 1 ? 's' : ''}.`
      : 'Contorno do talhão no WebGIS. Os pontos aparecem aqui ao capturar o GPS.'));
}
