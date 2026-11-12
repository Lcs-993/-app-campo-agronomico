// Configuração do servidor que recebe as fichas (endereço e chave do aparelho).

import { h, icone, barraTopo, aviso } from '../ui.js';
import { campoTexto } from '../componentes.js';
import { configServidor, salvarConfigServidor, testarConexao } from '../sync.js';
import { navegar } from '../rotas.js';

export async function telaServidor() {
  const cfg = configServidor();
  const resultado = h('p', { class: 'campo-dica', role: 'status', 'aria-live': 'polite' });

  async function testar() {
    resultado.textContent = 'Testando…';
    const r = await testarConexao(cfg);
    resultado.textContent = r.mensagem;
    resultado.className = `alerta alerta-${r.ok ? 'ok' : 'perigo'}`;
  }

  function salvar() {
    salvarConfigServidor(cfg);
    aviso(cfg.url ? 'Servidor salvo.' : 'Envio ao servidor desligado.');
    navegar('#/');
  }

  return h('div', { class: 'tela' },
    barraTopo({ titulo: 'Servidor', subtitulo: 'Envio das fichas finalizadas', voltar: '#/' }),
    h('main', { class: 'conteudo' },
      h('section', { class: 'cartao' },
        campoTexto({
          rotulo: 'Endereço do servidor', tipo: 'url', valor: cfg.url,
          dica: 'Ex.: https://campo.suaempresa.com.br (fornecido pelo administrador).',
          aoMudar: (v) => { cfg.url = v; },
        }),
        campoTexto({
          rotulo: 'Chave do aparelho', tipo: 'password', valor: cfg.chave,
          dica: 'Cada aparelho tem a sua chave. Não compartilhe.',
          aoMudar: (v) => { cfg.chave = v; },
        }),
        resultado,
        h('div', { class: 'rodape-acoes' },
          h('button', { type: 'button', class: 'btn btn-secundario', onclick: testar }, icone('atualizar', 20), 'Testar conexão'),
          h('button', { type: 'button', class: 'btn btn-primario', onclick: salvar }, icone('ok', 20), 'Salvar'))),
      h('p', { class: 'nota' }, 'As fichas continuam guardadas no aparelho até o servidor confirmar o recebimento.'),
    ),
  );
}
