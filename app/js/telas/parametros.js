// Parâmetros vigentes do PDA, somente leitura no app de campo.

import { h, barraTopo, fmt, fmtData } from '../ui.js';
import { carregarParametros } from '../db.js';
import { nomePraga } from '../regras.js';

export async function telaParametros() {
  const p = await carregarParametros();
  const linha = (rotulo, valor) => h('div', { class: 'indicador' }, h('dt', null, rotulo), h('dd', null, valor));
  return h('div', { class: 'tela' },
    barraTopo({ titulo: 'Parâmetros do PDA', subtitulo: `Versão ${p.versao} · vigente desde ${fmtData(p.vigente_desde)}`, voltar: '#/' }),
    h('main', { class: 'conteudo' },
      h('section', { class: 'cartao' }, h('h2', null, 'Cigarrinha-da-raiz'),
        h('dl', { class: 'indicadores' }, linha('Nível de dano econômico', `${fmt(p.cigarrinha_raiz.nde_ninfas_por_metro)} ninfa/m`))),
      h('section', { class: 'cartao' }, h('h2', null, 'Infestação final da broca'),
        h('dl', { class: 'indicadores' },
          linha('Alerta ao PDA acima de', `${fmt(p.cq_infestacao_final_broca.limite_alerta_pct)}%`),
          linha('Bloqueio de corte acima de', `${fmt(p.cq_infestacao_final_broca.limite_bloqueio_pct)}%`))),
      h('section', { class: 'cartao' }, h('h2', null, 'Pragas do solo'),
        h('dl', { class: 'indicadores' },
          linha('Pragas críticas (alerta imediato)', p.pragas_solo.pragas_criticas.map(nomePraga).join(', ')))),
      h('p', { class: 'nota' }, 'Os parâmetros são definidos pelo Planejamento Agronômico e atualizados na sincronização.'),
    ),
  );
}
