// Tela inicial: criar ficha nova e ver as fichas guardadas no aparelho.

import { h, icone, barraTopo, chip, fmtData, aviso } from '../ui.js';
import { FICHAS } from '../fichas.js';
import { listarFichas, carregarParametros, idDispositivo } from '../db.js';

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
  const local = [id.fazenda, id.talhao && `Talhão ${id.talhao}`].filter(Boolean).join(' · ') || 'Sem identificação';
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
      titulo: 'Campo Agronômico',
      subtitulo: 'Fitossanidade · Controle de Qualidade',
      acoes: h('a', { href: '#/parametros', class: 'btn-icone', 'aria-label': 'Parâmetros do PDA' }, icone('ajustes')),
    }),
    h('main', { class: 'conteudo' },
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
