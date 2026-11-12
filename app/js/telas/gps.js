// Informações do GPS: posição ao vivo, precisão, situação do local de coleta e
// um diagnóstico para quando o aparelho não consegue a localização.
//
// Satélites: a API de geolocalização dos navegadores (a única disponível para
// um app web/PWA) entrega só coordenadas, precisão, altitude, velocidade e
// direção. Número de satélites, sinal (SNR) e constelações não são expostos
// por nenhum navegador; a tela explica isso e indica como ver no aparelho.

import { h, icone, barraTopo, chip, aviso, fmt, fmtHora } from '../ui.js';
import { seletor, PRECISAO_ACEITAVEL_M, mensagemErroGps } from '../componentes.js';
import { carregarTalhoes, localizarTalhao, talhaoDoPonto, nomeCurto } from '../talhoes.js';
import { carregarTerracos } from '../terracos.js';
import { restricoesDoPonto, DISTANCIA_MINIMA_BORDA_M, DISTANCIA_MINIMA_TERRACO_M } from '../restricoes.js';

const NOMES_ERRO = { 1: 'permissão negada', 2: 'posição indisponível', 3: 'tempo esgotado' };
const RUMOS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];

function qualidade(acc) {
  if (acc == null) return null;
  if (acc <= 5) return { texto: 'Ótima', nivel: 'ok' };
  if (acc <= 10) return { texto: 'Boa', nivel: 'ok' };
  if (acc <= PRECISAO_ACEITAVEL_M) return { texto: 'Aceitável', nivel: 'info' };
  if (acc <= 50) return { texto: 'Fraca', nivel: 'atencao' };
  return { texto: 'Muito fraca (rede, não GPS)', nivel: 'perigo' };
}

function segundos(ms) {
  if (ms == null) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** Nome do navegador, para as dicas de permissão apontarem para o lugar certo. */
function nomeNavegador() {
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Firefox|FxiOS/i.test(ua)) return 'Firefox';
  if (/EdgA?\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  return 'Chrome';
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Navegadores antigos: copia por uma área de texto temporária.
    const area = h('textarea', { readonly: true, style: 'position:fixed;opacity:0' });
    area.value = texto;
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    area.remove();
    return ok;
  }
}

export async function telaGps() {
  const [talhoes, terracos] = await Promise.all([carregarTalhoes(), carregarTerracos()]);
  const geo = navigator.geolocation;

  let modo = 'alta';
  let vigia = null;
  let inicio = 0;
  let ultima = null;
  let melhorAcc = null;
  let primeiroFixMs = null;
  let leituras = 0;
  let ultimoErro = null;
  let permissao = 'desconhecida';
  const eventos = [];
  const navegador = nomeNavegador();

  // ---------- elementos ----------
  const estado = h('div', { class: 'gps-estado', role: 'status', 'aria-live': 'polite' });
  const coordenadas = h('p', { class: 'gps-coordenadas' });
  const indicadoresPosicao = h('dl', { class: 'indicadores' });
  const indicadoresLocal = h('div', { class: 'grade-campos' });
  const indicadoresAparelho = h('dl', { class: 'indicadores' });
  const registro = h('pre', { class: 'gps-log', 'aria-label': 'Registro de eventos do GPS' });
  const botaoPausar = h('button', { type: 'button', class: 'btn btn-secundario' });
  const navegadorTexto = h('p', { class: 'campo-dica endereco' });

  const linha = (rotulo, valor, extra) => h('div', { class: 'indicador' },
    h('dt', null, rotulo), h('dd', null, valor), extra ?? null);

  function anotar(texto) {
    eventos.unshift(`${new Date().toLocaleTimeString('pt-BR')}  ${texto}`);
    eventos.length = Math.min(eventos.length, 40);
    registro.textContent = eventos.join('\n');
  }

  // ---------- desenho ----------
  function desenhar() {
    const c = ultima?.coords;
    const agora = Date.now();
    const idade = ultima ? agora - ultima.timestamp : null;

    if (!geo) {
      estado.replaceChildren(chip('Sem GPS', 'perigo'), h('strong', null, 'Este navegador não oferece localização.'));
    } else if (!vigia) {
      estado.replaceChildren(chip('Pausado'), h('strong', null, 'Leitura do GPS pausada.'));
    } else if (!ultima) {
      const texto = ultimoErro ? `Sem sinal ainda (${NOMES_ERRO[ultimoErro.code] ?? 'erro'}).` : 'Procurando sinal…';
      estado.replaceChildren(chip(`${segundos(agora - inicio)}`, ultimoErro ? 'atencao' : 'info'), h('strong', null, texto));
    } else {
      const q = qualidade(c.accuracy);
      const parado = idade > 15000;
      estado.replaceChildren(
        chip(parado ? 'Sem leitura nova' : 'Com sinal', parado ? 'atencao' : 'ok'),
        h('strong', null, parado ? `Última leitura há ${segundos(idade)}.` : `Precisão ${q.texto.toLowerCase()}.`));
    }

    coordenadas.replaceChildren(c
      ? `${fmt(c.latitude, 6)}, ${fmt(c.longitude, 6)}`
      : h('span', { class: 'gps-sem-dado' }, 'Aguardando a primeira leitura…'));

    const q = qualidade(c?.accuracy);
    indicadoresPosicao.replaceChildren(
      linha('Precisão', c?.accuracy != null ? `±${fmt(c.accuracy, c.accuracy < 10 ? 1 : 0)} m` : '—', q ? chip(q.texto, q.nivel) : null),
      linha('Satélites', h('span', { class: 'gps-sem-dado' }, 'Não informado'),
        h('span', { class: 'campo-dica' }, 'O navegador não dá acesso a esse dado. Veja abaixo.')),
      linha('Altitude', c?.altitude != null
        ? `${fmt(c.altitude, 0)} m${c.altitudeAccuracy != null ? ` ±${fmt(c.altitudeAccuracy, 0)}` : ''}` : '—'),
      linha('Velocidade', c?.speed != null ? `${fmt(c.speed * 3.6, 1)} km/h` : '—'),
      linha('Direção', c?.heading != null && !Number.isNaN(c.heading)
        ? `${fmt(c.heading, 0)}° ${RUMOS[Math.round(c.heading / 45) % 8]}` : '—'),
      linha('Última leitura', ultima ? `há ${segundos(idade)}` : '—'),
      linha('Leituras recebidas', String(leituras)),
      linha('Primeiro sinal em', primeiroFixMs != null ? segundos(primeiroFixMs) : '—'),
      linha('Melhor precisão', melhorAcc != null ? `±${fmt(melhorAcc, melhorAcc < 10 ? 1 : 0)} m` : '—'),
    );

    desenharLocal(c);
  }

  function desenharLocal(c) {
    if (!talhoes) {
      indicadoresLocal.replaceChildren(h('p', { class: 'campo-dica' },
        'Os talhões do WebGIS ainda não foram baixados neste aparelho. Baixe na tela inicial, com internet.'));
      return;
    }
    if (!c) {
      indicadoresLocal.replaceChildren(h('p', { class: 'campo-dica' }, 'Aparece aqui assim que houver a primeira leitura.'));
      return;
    }
    const r = localizarTalhao(c.longitude, c.latitude);
    const tp = talhaoDoPonto({ latitude: c.latitude, longitude: c.longitude });
    const motivos = r.talhao ? restricoesDoPonto(tp) : ['você não está dentro de nenhum talhão cadastrado.'];
    const terraco = tp?.distancia_terraco_m;
    indicadoresLocal.replaceChildren(...[
      h('div', { class: 'gps-estado' },
        motivos.length ? chip('Não colete aqui', 'perigo') : chip('Pode coletar aqui', 'ok'),
        h('strong', null, r.talhao ? nomeCurto(r.talhao) : 'Fora dos talhões')),
      motivos.length ? h('ul', { class: 'gps-dicas' }, motivos.map((m) => h('li', null, m[0].toUpperCase() + m.slice(1)))) : null,
      h('dl', { class: 'indicadores' },
        linha('Distância da borda', r.talhao
          ? (r.dentro ? `${fmt(Math.floor(r.distancia_borda_m), 0)} m para dentro` : `${fmt(r.distancia_m, 0)} m para fora`)
          : (r.maisProximo ? `${fmt(r.distancia_m, 0)} m de ${nomeCurto(r.maisProximo)}` : '—')),
        linha('Distância do terraço', !terracos ? h('span', { class: 'gps-sem-dado' }, 'Não conferida')
          : terraco != null ? `${fmt(Math.floor(terraco), 0)} m` : 'Nenhum por perto',
        !terracos ? h('span', { class: 'campo-dica' }, 'A camada de terraços ainda não está no aparelho.') : null)),
      h('p', { class: 'campo-dica' }, `Mínimo exigido: ${DISTANCIA_MINIMA_BORDA_M} m para dentro da borda e ${DISTANCIA_MINIMA_TERRACO_M} m dos terraços.`),
      c.accuracy > PRECISAO_ACEITAVEL_M
        ? h('p', { class: 'campo-dica' }, `Com precisão de ±${fmt(c.accuracy, 0)} m, as distâncias acima podem variar nessa mesma medida. Aguarde o sinal melhorar.`)
        : null,
    ].filter(Boolean));
  }

  // A Permissions API informa só a permissão guardada. Se o navegador liberou a
  // localização apenas para esta visita (o Firefox faz isso quando "Lembrar
  // decisão" fica desmarcado), ela continua "prompt" mesmo com leituras chegando.
  function situacaoPermissao() {
    if (permissao === 'granted') return 'liberada';
    if (permissao === 'denied') return 'negada';
    if (leituras > 0) return 'liberada nesta visita';
    if (permissao === 'prompt') return 'ainda não perguntada';
    return 'não informada';
  }

  function desenharAparelho() {
    const sit = situacaoPermissao();
    indicadoresAparelho.replaceChildren(
      linha('Permissão de localização', sit[0].toUpperCase() + sit.slice(1),
        sit === 'negada' ? chip('Libere nas configurações', 'perigo')
          : sit === 'liberada nesta visita'
            ? h('span', { class: 'campo-dica' }, `O ${navegador} pode pedir de novo da próxima vez. Para liberar de vez, toque no cadeado ao lado do endereço → Permissões → Localização → Permitir${navegador === 'Firefox' ? ' (ou marque "Lembrar decisão" quando ele perguntar)' : ''}.`)
            : null),
      linha('Conexão segura (HTTPS)', window.isSecureContext ? 'Sim' : 'Não',
        window.isSecureContext ? null : chip('O GPS só funciona em HTTPS', 'perigo')),
      linha('Internet', navigator.onLine ? 'Conectado' : 'Sem conexão',
        navigator.onLine ? null : h('span', { class: 'campo-dica' }, 'Sem internet o primeiro sinal demora mais (sem A-GPS).')),
      linha('Modo de leitura', modo === 'alta' ? 'Alta precisão (GPS)' : 'Baixa precisão (rede)'),
    );
    navegadorTexto.textContent = `Navegador: ${navigator.userAgent}`;
  }

  // ---------- leitura do GPS ----------
  function aoLer(p) {
    leituras++;
    if (primeiroFixMs == null) {
      primeiroFixMs = Date.now() - inicio;
      anotar(`primeiro sinal em ${segundos(primeiroFixMs)}, ±${fmt(p.coords.accuracy, 0)} m`);
      if (leituras === 1) desenharAparelho();
    } else if (ultima && Math.abs((ultima.coords.accuracy ?? 0) - (p.coords.accuracy ?? 0)) >= 5) {
      anotar(`precisão mudou para ±${fmt(p.coords.accuracy, 0)} m`);
    }
    if (p.coords.accuracy != null && (melhorAcc == null || p.coords.accuracy < melhorAcc)) melhorAcc = p.coords.accuracy;
    ultima = p;
    ultimoErro = null;
    desenhar();
  }

  function aoErrar(e) {
    ultimoErro = e;
    anotar(`erro ${e.code} (${NOMES_ERRO[e.code] ?? 'desconhecido'}): ${e.message || mensagemErroGps(e)}`);
    if (e.code === 1) permissao = 'denied';
    desenhar();
    desenharAparelho();
  }

  function parar() {
    if (vigia != null) geo.clearWatch(vigia);
    vigia = null;
  }

  function iniciar() {
    if (!geo) return desenhar();
    parar();
    inicio = Date.now();
    primeiroFixMs = null;
    ultimoErro = null;
    anotar(`iniciando leitura em ${modo === 'alta' ? 'alta precisão' : 'baixa precisão'}`);
    try {
      vigia = geo.watchPosition(aoLer, aoErrar, { enableHighAccuracy: modo === 'alta', maximumAge: 0, timeout: 30000 });
    } catch (e) {
      anotar(`falha ao iniciar: ${e.message}`);
    }
    desenharPausar();
    desenhar();
    desenharAparelho();
  }

  function desenharPausar() {
    botaoPausar.replaceChildren(icone(vigia != null ? 'menos' : 'atualizar', 18), vigia != null ? 'Pausar' : 'Retomar');
  }
  botaoPausar.addEventListener('click', () => {
    if (vigia != null) { parar(); anotar('leitura pausada'); desenharPausar(); desenhar(); } else iniciar();
  });

  const botaoReiniciar = h('button', { type: 'button', class: 'btn btn-secundario', onclick: () => {
    ultima = null; melhorAcc = null; leituras = 0; anotar('reiniciado (partida do zero)'); iniciar();
  } }, icone('atualizar', 18), 'Reiniciar');

  function textoDiagnostico() {
    const c = ultima?.coords;
    return [
      'Diagnóstico do GPS · App de Campo',
      `Data: ${new Date().toLocaleString('pt-BR')}`,
      `Navegador: ${navigator.userAgent}`,
      `Permissão: ${situacaoPermissao()} (navegador informa: ${permissao}) · HTTPS: ${window.isSecureContext ? 'sim' : 'não'} · Internet: ${navigator.onLine ? 'sim' : 'não'}`,
      `Modo: ${modo === 'alta' ? 'alta precisão' : 'baixa precisão'} · Leituras: ${leituras} · Primeiro sinal: ${primeiroFixMs != null ? segundos(primeiroFixMs) : 'nenhum'}`,
      c ? `Última posição: ${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)} ±${Math.round(c.accuracy)} m` : 'Última posição: nenhuma',
      `Melhor precisão: ${melhorAcc != null ? `±${Math.round(melhorAcc)} m` : '—'}`,
      '', 'Eventos:', ...eventos,
    ].join('\n');
  }

  const botaoCopiar = h('button', { type: 'button', class: 'btn btn-secundario', onclick: async () => {
    const ok = await copiar(textoDiagnostico());
    aviso(ok ? 'Diagnóstico copiado. Cole na conversa com o suporte.' : 'Não foi possível copiar.', ok ? 'ok' : 'atencao');
  } }, icone('exportar', 18), 'Copiar diagnóstico');

  // ---------- permissão ----------
  try {
    const st = await navigator.permissions?.query({ name: 'geolocation' });
    if (st) {
      permissao = st.state;
      st.onchange = () => { permissao = st.state; anotar(`permissão mudou para ${st.state}`); desenharAparelho(); };
    }
  } catch { /* navegadores antigos não têm a Permissions API */ }

  // ---------- ciclo de vida ----------
  const relogio = setInterval(() => { if (document.contains(estado)) desenhar(); }, 1000);
  window.addEventListener('hashchange', () => { parar(); clearInterval(relogio); }, { once: true });
  setTimeout(iniciar, 0);
  desenharPausar();
  desenharAparelho();
  desenhar();

  return h('div', { class: 'tela' },
    barraTopo({ titulo: 'Informações do GPS', subtitulo: 'Posição ao vivo e diagnóstico', voltar: '#/' }),
    h('main', { class: 'conteudo' },
      h('section', { class: 'cartao' },
        h('h2', { class: 'cartao-titulo' }, icone('satelite', 20), 'Situação'),
        estado,
        h('div', { class: 'campo' },
          h('span', { class: 'campo-rotulo' }, 'Modo de leitura'),
          seletor({
            rotulo: 'Modo de leitura do GPS', valor: modo,
            opcoes: [{ valor: 'alta', rotulo: 'Alta precisão (GPS)' }, { valor: 'baixa', rotulo: 'Baixa precisão (rede)' }],
            aoMudar: (v) => { modo = v; ultima = null; melhorAcc = null; iniciar(); },
          }),
          h('span', { class: 'campo-dica' }, 'Use "Baixa precisão" só para testar: se ela funciona e a alta não, o aparelho não está recebendo o sinal dos satélites.')),
        h('div', { class: 'gps-acoes' }, botaoPausar, botaoReiniciar)),
      h('section', { class: 'cartao' },
        h('h2', null, 'Coordenadas (latitude, longitude)'),
        coordenadas,
        indicadoresPosicao),
      h('section', { class: 'cartao' },
        h('h2', { class: 'cartao-titulo' }, icone('talhao', 20), 'Local de coleta'),
        indicadoresLocal),
      h('section', { class: 'cartao' },
        h('h2', null, 'Número de satélites'),
        h('p', { class: 'campo-dica' },
          'Aplicativos que rodam no navegador, como este, não têm acesso ao número de satélites, ao sinal de cada um nem às constelações (GPS, GLONASS, Galileo). Nenhum navegador oferece esse dado. A precisão em metros acima já resume a qualidade do sinal.'),
        h('p', { class: 'campo-dica' },
          'Para ver os satélites no aparelho, instale um aplicativo de teste de GPS (por exemplo, o GPSTest, gratuito na Play Store). Se ele mostrar satélites "em uso" e este app não receber posição, o problema está na permissão ou nas configurações do navegador.')),
      h('section', { class: 'cartao' },
        h('h2', null, 'Aparelho e navegador'),
        indicadoresAparelho, navegadorTexto),
      h('section', { class: 'cartao' },
        h('h2', null, 'Se o GPS não responder'),
        h('ol', { class: 'gps-dicas' },
          h('li', null, 'Ligue a localização do aparelho e, se existir a opção, o modo "Alta precisão" ou "Melhorar precisão" (Configurações → Localização).'),
          h('li', null, `Confira se o navegador (${navegador}) tem permissão de localização no Android: Configurações → Apps → ${navegador} → Permissões → Localização → "Permitir".`),
          h('li', null, `No ${navegador}, toque no cadeado ao lado do endereço e libere a localização para este site${navegador === 'Firefox' ? '. Quando ele perguntar, marque "Lembrar decisão"' : ''}.`),
          h('li', null, 'Desligue a economia de bateria, que em aparelhos antigos desliga o GPS do navegador.'),
          h('li', null, 'Fique parado a céu aberto por 1 a 2 minutos. Sem internet o primeiro sinal demora mais.'),
          h('li', null, `Atualize o ${navegador} pela Play Store. Versões antigas do navegador têm falhas de GPS.`),
          h('li', null, 'Se nada resolver, toque em "Copiar diagnóstico" e envie ao suporte.'))),
      h('section', { class: 'cartao' },
        h('h2', null, 'Registro de eventos'),
        registro,
        h('div', { class: 'gps-acoes' }, botaoCopiar)),
      h('p', { class: 'nota' }, `Leitura iniciada às ${fmtHora(new Date())}. O GPS para ao sair desta tela.`),
    ),
  );
}
