import { h } from './ui.js';
import { definirRenderizador } from './rotas.js';
import { telaInicio } from './telas/inicio.js';
import { telaFicha, telaNovaFicha } from './telas/ficha.js';
import { telaParametros } from './telas/parametros.js';

const raiz = document.getElementById('app');
let geracao = 0;

async function desenhar() {
  const minha = ++geracao;
  const [, rota, arg] = (location.hash.slice(1) || '/').split('/');
  let tela;
  try {
    if (rota === 'nova') tela = await telaNovaFicha(arg);
    else if (rota === 'ficha') tela = await telaFicha(arg);
    else if (rota === 'parametros') tela = await telaParametros();
    else tela = await telaInicio();
  } catch (erro) {
    console.error(erro);
    tela = h('main', { class: 'conteudo' }, h('p', { class: 'alerta alerta-perigo' }, `Erro ao abrir a tela: ${erro.message}`));
  }
  if (minha !== geracao || !tela) return;
  raiz.replaceChildren(tela);
  window.scrollTo(0, 0);
}

definirRenderizador(desenhar);
window.addEventListener('hashchange', desenhar);
desenhar();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker não registrado', e));
}
