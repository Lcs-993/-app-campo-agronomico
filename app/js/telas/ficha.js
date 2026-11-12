// Tela de preenchimento de qualquer ficha. Os campos vêm da configuração em fichas.js.

import { h, icone, barraTopo, caixaAlerta, chip, aviso, fmtHora, fmtData } from '../ui.js';
import {
  campoTexto, campoAreaTexto, campoDecimal, campoInteiro, campoEstagios, campoEspuma, campoGps, campoFotos, seletor,
} from '../componentes.js';
import { FICHAS, novoRegistro, pendencias, documentoFinal, hojeLocal } from '../fichas.js';
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
  if (!registro) {
    return h('div', { class: 'tela' }, barraTopo({ titulo: 'Ficha não encontrada', voltar: '#/' }),
      h('main', { class: 'conteudo' }, h('p', null, 'Esta ficha não existe mais neste aparelho.')));
  }
  const cfg = FICHAS[registro.tipo];
  const f = registro.ficha;
  const somenteLeitura = registro.finalizada;

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
        const erros = cfg.errosItem(item);
        caixa.replaceChildren(...erros.map((e) => h('p', null, icone('alerta', 18), e)));
        caixa.hidden = !erros.length;
      }
      resumosPorItem.get(item)?.replaceChildren(cfg.resumoItem(item));
    }
    atualizarParecer?.();
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
      case 'gps': return campoGps(comum);
      case 'fotos': return campoFotos({ ...comum, exigirGps: c.exigirGps, gpsDoItem: () => alvo.geolocalizacao });
      case 'texto': return campoAreaTexto(comum);
      default: return campoTexto({ ...comum, sugestoes: c.sugestoes ? sugestoes[c.chave] : null });
    }
  }

  const secaoIdentificacao = h('section', { class: 'cartao' },
    h('h2', null, 'Identificação'),
    h('div', { class: 'grade-campos' },
      cfg.identificacao.map((c) => controle(c, f.identificacao)),
      (cfg.camposFicha ?? []).map((c) => controle(c, f)),
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
