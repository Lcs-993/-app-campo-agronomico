// Navegação por hash (#/, #/nova/<tipo>, #/ficha/<id>, #/parametros).

let desenhar = () => {};

export function definirRenderizador(fn) {
  desenhar = fn;
}

export function navegar(hash, { recarregar = false } = {}) {
  if (location.hash === hash || recarregar) {
    if (location.hash !== hash) history.replaceState(null, '', hash);
    desenhar();
  } else {
    location.hash = hash;
  }
}
