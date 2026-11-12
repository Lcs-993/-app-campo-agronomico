// Tela inicial: criar ficha nova e ver as fichas guardadas no aparelho.

import { h, icone, barraTopo, botaoTema, chip, fmtData, fmtHora, aviso } from '../ui.js';
import { FICHAS } from '../fichas.js';
import { listarFichas, carregarParametros, idDispositivo } from '../db.js';
import { carregarTalhoes, atualizarTalhoes } from '../talhoes.js';
import { carregarTerracos, atualizarTerracos } from '../terracos.js';

/** Situação dos talhões do WebGIS no aparelho, com botão para atualizar. */
function cartaoTalhoes() {
  const texto = h('div', { class: 'talhoes-texto' });
  const botao = h('button', { type: 'button', class: 'btn btn-secundario btn-pequeno' }, icone('atualizar', 18), 'Atualizar');
  const cartao = h('section', { class: 'cartao cartao-talhoes' },
    h('span', { class: 'linha-icone' }, icone('talhao', 22)), texto, botao);

  async function desenhar(mensagem) {
    const t = await carregarTalhoes();
    cartao.classList.toggle('cartao-talhoes-pendente', !t);
    if (!t) {
      texto.replaceChildren(h('strong', null, 'Talhões do WebGIS não baixados'),
        h('span', null, mensagem ?? 'Necessários para identificar o talhão pelo GPS. Baixe com internet antes de ir a campo.'));
      return;
    }
    const quando = new Date(t.baixado_em);
    const terracos = await carregarTerracos();
    const n = terracos?.terracos.length;
    const qtdTerracos = terracos ? ` · ${n.toLocaleString('pt-BR')} terraço${n === 1 ? '' : 's'}` : '';
    texto.replaceChildren(h('strong', null, `${t.talhoes.length.toLocaleString('pt-BR')} talhões${qtdTerracos} do WebGIS`),
      h('span', null, mensagem ?? `Atualizados em ${fmtData(t.baixado_em)} às ${fmtHora(quando)}. Funcionam sem internet.`));
  }

  async function atualizar(silencioso) {
    botao.disabled = true;
    if (!silencioso) texto.lastChild && (texto.lastChild.textContent = 'Buscando a versão mais nova no WebGIS…');
    // Os terraços são opcionais: se a camada ainda não existe no WebGIS, segue sem eles.
    const [r, rt] = await Promise.all([atualizarTalhoes(), atualizarTerracos()]);
    if (rt.erro) console.warn('Terraços:', rt.erro);
    botao.disabled = false;
    if (r.erro) {
      await desenhar(silencioso ? undefined : `${r.erro} Os talhões já baixados continuam valendo.`);
      if (!silencioso) aviso(r.erro, 'atencao');
    } else {
      await desenhar();
      if (!silencioso) {
        const novos = [r.atualizado && `${r.quantidade.toLocaleString('pt-BR')} talhões`, rt.atualizado && `${rt.quantidade.toLocaleString('pt-BR')} terraços`].filter(Boolean);
        aviso(novos.length ? `Atualizados: ${novos.join(' e ')}.` : 'Os talhões já estão na versão mais nova.');
      }
    }
  }

  botao.addEventListener('click', () => atualizar(false));
  desenhar().then(() => { if (navigator.onLine) atualizar(true); });
  return cartao;
}

function cartaoNovaFicha(tipo, cfg) {
  return h('a', { href: `#/nova/${tipo}`, class: `cartao-nova cartao-nova-${cfg.icone}` },
    h('span', { class: 'cartao-nova-icone' }, icone(cfg.icone, 30)),
    h('span', { class: 'cartao-nova-texto' },
      h('span', { class: 'cartao-nova-setor' }, cfg.setor),
      h('strong', null, cfg.titulo),
      h('span', { class: 'cartao-nova-desc' }, cfg.descricao)),
    h('span', { class: 'cartao-nova-mais' }, icone('mais', 22)),
  );
}

function linhaFicha(registro, parametros) {
  const cfg = FICHAS[registro.tipo];
  const f = registro.ficha;
  const id = f.identificacao;
  const local = [id.talhao, id.fazenda].filter(Boolean).join(' · ') || 'Talhão ainda não identificado';
  const itens = f[cfg.colecao].length;
  return h('li', null,
    h('a', { href: `#/ficha/${registro.id}`, class: 'linha-ficha' },
      h('span', { class: `linha-icone linha-icone-${cfg.icone}` }, icone(cfg.icone, 22)),
      h('span', { class: 'linha-texto' },
        h('strong', null, cfg.titulo),
        h('span', null, local),
        h('span', { class: 'linha-meta' },
          `${fmtData(id.data)} · ${itens} ${cfg.nomeItem.toLowerCase()}${itens === 1 ? '' : 's'}`),
        h('span', { class: 'linha-chips' },
          registro.finalizada ? chip('Aguardando envio', 'info') : chip('Rascunho'),
          cfg.resumoLista(f, parametros).map((r) => chip(r.texto, r.nivel)))),
    ),
  );
}

function baixarJson(nome, dados) {
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function telaInicio() {
  const [registros, parametros] = await Promise.all([listarFichas(), carregarParametros()]);
  registros.sort((a, b) => (b.salvo_em ?? '').localeCompare(a.salvo_em ?? ''));
  const finalizadas = registros.filter((r) => r.finalizada);
  const rascunhos = registros.filter((r) => !r.finalizada);

  function exportar() {
    if (!finalizadas.length) return aviso('Nenhuma ficha finalizada para exportar.', 'atencao');
    const agora = new Date();
    baixarJson(`fichas-${agora.toISOString().slice(0, 10)}.json`, {
      exportado_em: agora.toISOString(),
      dispositivo_id: idDispositivo(),
      versao_parametros_pda: parametros.versao,
      fichas: finalizadas.map((r) => r.documento),
    });
  }

  const lista = (titulo, itens, vazio) => h('section', { class: 'bloco-lista' },
    h('h2', { class: 'titulo-secao' }, titulo, h('span', { class: 'contagem' }, String(itens.length))),
    itens.length ? h('ul', { class: 'lista-fichas' }, itens.map((r) => linhaFicha(r, parametros)))
      : h('p', { class: 'vazio' }, vazio));

  return h('div', { class: 'tela' },
    barraTopo({
      comMarca: true,
      acoes: [
        h('a', { href: '#/gps', class: 'topo-botao', 'aria-label': 'Informações do GPS', title: 'Informações do GPS' }, icone('satelite', 18)),
        botaoTema(),
        h('a', { href: '#/parametros', class: 'topo-botao', 'aria-label': 'Parâmetros do PDA', title: 'Parâmetros do PDA' }, icone('ajustes', 18)),
      ],
    }),
    h('main', { class: 'conteudo' },
      cartaoTalhoes(),
      h('section', null,
        h('h2', { class: 'titulo-secao' }, 'Nova ficha'),
        h('div', { class: 'grade-novas' }, Object.entries(FICHAS).map(([tipo, cfg]) => cartaoNovaFicha(tipo, cfg)))),
      lista('Em preenchimento', rascunhos, 'Nenhum rascunho. Escolha uma ficha acima para começar.'),
      lista('Finalizadas, aguardando envio', finalizadas, 'Nenhuma ficha finalizada.'),
      h('button', { type: 'button', class: 'btn btn-secundario btn-largo', onclick: exportar, disabled: !finalizadas.length },
        icone('exportar', 20), 'Exportar fichas finalizadas (JSON)'),
      h('p', { class: 'nota' }, 'Tudo fica salvo neste aparelho e funciona sem internet.'),
    ),
  );
}
