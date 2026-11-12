// Teste de ponta a ponta do app: preenche as três fichas num celular simulado,
// finaliza, exporta o JSON e valida o arquivo com scripts/validar_fichas.py.
//
// Os talhões vêm de tests/fixtures/pol_talhoes.geojson (mesmo formato do WebGIS),
// servido em /web_gis/geojson/, como no GitHub Pages, assim como os terraços de
// tests/fixtures/lin_terracos.geojson (um terraço atravessa o TH-1 em lat −21,1790
// e outro passa pelo TH-2 em lat −21,1795).
//
// Uso: node tests/e2e_app.js [pasta-de-saida]
// Requer Playwright com Chromium e Python com as dependências de requirements.txt.

const { chromium, devices } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const RAIZ = path.resolve(__dirname, '..');
const SAIDA = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-campo-')));
// No Windows o Python costuma ser "python"; defina PYTHON para trocar.
const PYTHON = process.env.PYTHON || 'python3';
const PORTA = 8800 + Math.floor(Math.random() * 100);
const URL_APP = `http://localhost:${PORTA}/-app-campo-agronomico/`;

// Coordenadas dentro dos talhões da fixture.
const LOCAL = {
  th1: { latitude: -21.1784, longitude: -47.8102, accuracy: 4.5 },
  th1b: { latitude: -21.1771, longitude: -47.8091, accuracy: 5 },
  th2: { latitude: -21.1780, longitude: -47.8060, accuracy: 4 },
  th3: { latitude: -21.1820, longitude: -47.8100, accuracy: 4 },
  borda: { latitude: -21.1784, longitude: -47.81215, accuracy: 6 }, // ~15 m fora do TH-1
  bordaDentro: { latitude: -21.1784, longitude: -47.81185, accuracy: 5 }, // ~15 m dentro do TH-1, na faixa proibida
  terraco: { latitude: -21.1792, longitude: -47.8100, accuracy: 4 }, // TH-1, ~22 m do terraço, ~89 m da borda
  fora: { latitude: -21.2500, longitude: -47.7000, accuracy: 4 },
};

/** Monta o site como no GitHub Pages: o app e o WebGIS lado a lado no mesmo domínio. */
function montarSite() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'site-campo-'));
  fs.symlinkSync(path.join(RAIZ, 'app'), path.join(raiz, '-app-campo-agronomico'), 'junction');
  fs.mkdirSync(path.join(raiz, 'web_gis', 'geojson'), { recursive: true });
  for (const nome of ['pol_talhoes.geojson', 'lin_terracos.geojson']) {
    fs.copyFileSync(path.join(RAIZ, 'tests', 'fixtures', nome), path.join(raiz, 'web_gis', 'geojson', nome));
  }
  return raiz;
}

// PNG 1x1 para simular a câmera.
const FOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

function afirmar(condicao, mensagem) {
  if (!condicao) throw new Error(`Falhou: ${mensagem}`);
  console.log(`  ok  ${mensagem}`);
}

async function esperarServidor() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(URL_APP)).ok) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Servidor não respondeu');
}

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// O asterisco de campo obrigatório faz parte do rótulo visível.
const campo = (page, rotulo) => page.getByLabel(new RegExp(`^${escapar(rotulo)}( \\*)?$`));
const mais = (page, rotulo, vezes = 1) => clicar(page.getByRole('button', { name: `Aumentar ${rotulo}`, exact: true }), vezes);
async function clicar(loc, vezes) { for (let i = 0; i < vezes; i++) await loc.click(); }
const ponto = (page, n) => page.locator(`[data-item="${n}"]`);

async function identificar(page, dados) {
  for (const [rotulo, valor] of Object.entries(dados)) await campo(page, rotulo).fill(valor);
}

async function capturar(local, contexto, alvo) {
  await contexto.setGeolocation(LOCAL[local]);
  await alvo.getByRole('button', { name: /Capturar GPS|Capturar de novo/ }).click();
  const f6 = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  const { latitude, longitude } = LOCAL[local];
  await alvo.locator('.gps-coord', { hasText: `${f6(latitude)}, ${f6(longitude)}` }).waitFor();
}

async function testarPragasSolo(page, contexto) {
  console.log('Pragas do solo');
  await page.getByRole('link', { name: /Pragas do Solo/ }).click();
  await page.getByRole('button', { name: 'Identificar talhão pelo GPS' }).waitFor();
  afirmar(true, 'ficha nova pede o talhão pelo GPS');
  afirmar(await campo(page, 'Fazenda').count() === 0, 'fazenda e talhão não são digitados');
  await identificar(page, { Bloco: 'B-03', Amostrador: 'João Silva' });

  const p1 = ponto(page, 1);
  await capturar('th1', contexto, p1);
  const talhao = page.locator('.cartao-talhao');
  await talhao.locator('.talhao-nome').waitFor();
  afirmar(await talhao.locator('.talhao-nome').textContent() === 'TH-1', 'GPS do primeiro ponto identifica o talhão TH-1');
  afirmar((await talhao.textContent()).includes('9001-FAZENDA TESTE') && (await talhao.textContent()).includes('RB86-7515'),
    'mostra fazenda e variedade vindas do WebGIS');
  afirmar(await talhao.locator('.mini-mapa .mini-mapa-ponto').count() === 1, 'mini mapa mostra o ponto capturado');
  afirmar(await talhao.locator('.mini-mapa .mini-mapa-terraco').count() === 1, 'mini mapa desenha os terraços do talhão');
  afirmar(await p1.locator('.erros-item').isHidden(), 'ponto a mais de 30 m da borda e dos terraços é aceito');

  await campo(p1, 'Tocos examinados').fill('10');
  await campo(p1, 'Tocos brocados').fill('12');
  afirmar(await p1.getByText('Tocos brocados (12) maior que tocos examinados (10).').isVisible(), 'avisa brocados > examinados');
  await campo(p1, 'Tocos brocados').fill('2');
  afirmar(await p1.locator('.erros-item').isHidden(), 'aviso some ao corrigir');

  await mais(p1, 'Larva de Sphenophorus levis', 3);
  await mais(p1, 'Adulto de Sphenophorus levis');
  afirmar(await page.getByRole('alert').filter({ hasText: 'Praga crítica detectada' }).isVisible(), 'alerta imediato de Sphenophorus');
  await mais(p1, 'Larva de Pão-de-galinha', 2);
  await p1.locator('input[type=file]').setInputFiles({ name: 'toco.png', mimeType: 'image/png', buffer: FOTO });
  await p1.locator('.foto img[src^="blob:"]').waitFor();

  await page.getByRole('button', { name: 'Adicionar ponto' }).click();
  const p2 = ponto(page, 2);
  await page.getByRole('button', { name: 'Finalizar ficha' }).click();
  const pend = page.locator('.pendencias');
  afirmar(await pend.getByText('Ponto 2 · Localização do ponto: capture a localização (GPS)').isVisible(), 'bloqueia finalizar sem GPS');

  await capturar('th2', contexto, p2);
  afirmar(await p2.getByText('a localização fica no talhão TH-2 · 9001-FAZENDA TESTE, não no talhão desta ficha.').isVisible(),
    'ponto em outro talhão é recusado');
  afirmar(await talhao.locator('.mini-mapa-ponto.fora').count() === 1, 'mini mapa marca o ponto fora do talhão');
  await capturar('borda', contexto, p2);
  afirmar(await p2.getByText(/a localização está fora do talhão, a 1\d m da borda\. Entre pelo menos 30 m no talhão/).isVisible(),
    'ponto ~15 m fora da borda é recusado');
  await capturar('bordaDentro', contexto, p2);
  afirmar(await p2.getByText(/a localização está a 1\d m da borda do talhão\. Colete a pelo menos 30 m da borda/).isVisible(),
    'ponto dentro do talhão, mas a ~15 m da borda, é recusado');
  await capturar('terraco', contexto, p2);
  afirmar(await p2.getByText(/a localização está a 2\d m de um terraço\. Colete a pelo menos 30 m dos terraços/).isVisible(),
    'ponto a ~22 m de um terraço é recusado');
  await page.getByRole('button', { name: 'Finalizar ficha' }).click();
  afirmar(await page.locator('.pendencias').getByText(/Ponto 2: a localização está a 2\d m de um terraço/).isVisible(),
    'ponto perto do terraço impede finalizar');
  await capturar('th1b', contexto, p2);
  await campo(p2, 'Tocos examinados').fill('10');
  await mais(p2, 'Tocos brocados');
  await mais(p2, 'Larva de Metamasius');
  afirmar(await page.locator('.pendencias').isHidden(), 'lista de pendências some quando tudo é corrigido');
  afirmar(!(await p1.locator('.gps-info').textContent()).includes('null'), 'linha do GPS sem texto estranho');

  const pct = await page.locator('.indicador', { hasText: 'Tocos brocados' }).locator('dd').textContent();
  afirmar(pct === '15,0%', `percentual de tocos brocados = ${pct}`);
  await page.screenshot({ path: path.join(SAIDA, 'pragas-solo.png'), fullPage: true });

  await page.getByRole('button', { name: 'Finalizar ficha' }).click();
  await page.getByText('Nova ficha').waitFor();
}

async function testarCigarrinha(page, contexto) {
  console.log('Cigarrinha-da-raiz');
  await page.getByRole('link', { name: /Cigarrinha-da-Raiz/ }).click();
  await page.getByRole('button', { name: 'Identificar talhão pelo GPS' }).waitFor();
  await identificar(page, { Amostrador: 'Maria Souza' });
  const talhao = page.locator('.cartao-talhao');

  await contexto.setGeolocation(LOCAL.fora);
  await page.getByRole('button', { name: 'Identificar talhão pelo GPS' }).click();
  await talhao.getByText(/não está dentro de nenhum talhão cadastrado/).waitFor();
  afirmar(await talhao.locator('.talhao-nome').count() === 0, 'fora de qualquer talhão: avisa e não identifica');

  await contexto.setGeolocation(LOCAL.th2);
  await page.getByRole('button', { name: 'Identificar talhão pelo GPS' }).click();
  await talhao.locator('.talhao-nome').waitFor();
  afirmar(await talhao.locator('.talhao-nome').textContent() === 'TH-2', 'botão identifica o talhão TH-2');

  const p1 = ponto(page, 1);
  await capturar('th2', contexto, p1);
  await campo(p1, 'Metros lineares amostrados').fill('2');
  await campo(p1, 'Ninfas').fill('5');
  await mais(p1, 'Adultos');
  await p1.getByRole('radio', { name: 'Com espuma' }).click();
  await p1.getByRole('radio', { name: '2 · Média' }).click();

  await page.getByRole('button', { name: 'Adicionar ponto' }).click();
  const p2 = ponto(page, 2);
  await capturar('th2', contexto, p2);
  await campo(p2, 'Metros lineares amostrados').fill('2');
  await mais(p2, 'Ninfas');

  const alerta = page.locator('.cartao-resultados .alerta');
  afirmar((await alerta.textContent()).includes('1,50 ninfas/m, acima do NDE de 1,0'), 'compara ninfas/m com o NDE');
  await page.screenshot({ path: path.join(SAIDA, 'cigarrinha.png'), fullPage: true });
  await page.getByRole('button', { name: 'Finalizar ficha' }).click();
  await page.getByText('Nova ficha').waitFor();
}

async function testarCQ(page, contexto) {
  console.log('CQ: infestação final da broca');
  await page.getByRole('link', { name: /Infestação Final da Broca/ }).click();
  await identificar(page, { Auditor: 'Carlos Pereira' });
  const a1 = ponto(page, 1);
  await capturar('th3', contexto, a1);
  const talhao = page.locator('.cartao-talhao');
  await talhao.locator('.talhao-nome').waitFor();
  afirmar(await talhao.locator('.talhao-nome').textContent() === 'TH-3', 'talhão TH-3 (geometria GeometryCollection) identificado');
  afirmar(/Área\s*18,\d\d ha/.test(await talhao.textContent()), 'área calculada do polígono quando o WebGIS não tem o atributo');
  await campo(a1, 'Entrenós totais').fill('120');
  await campo(a1, 'Entrenós danificados').fill('6');
  await a1.locator('input[type=file]').setInputFiles({ name: 'entreno.png', mimeType: 'image/png', buffer: FOTO });
  await a1.locator('.foto img[src^="blob:"]').waitFor();

  const titulo = () => page.locator('.cartao-resultados .alerta strong').textContent();
  afirmar(await titulo() === 'Alerta ao PDA', 'II de 5,00% fica em alerta (bloqueio só acima de 5%)');
  afirmar(await page.locator('.cartao-parecer').isHidden(), 'parecer do PDA escondido fora do bloqueio');

  await page.getByRole('button', { name: 'Adicionar amostra' }).click();
  const a2 = ponto(page, 2);
  await capturar('th3', contexto, a2);
  await campo(a2, 'Entrenós totais').fill('130');
  await campo(a2, 'Entrenós danificados').fill('10');
  afirmar(await titulo() === 'Corte bloqueado', 'II de 6,40% bloqueia o corte');
  afirmar(await page.locator('.cartao-parecer').isVisible(), 'mostra o parecer do PDA quando bloqueado');
  await page.screenshot({ path: path.join(SAIDA, 'cq-bloqueado.png'), fullPage: true });

  const parecer = page.locator('.cartao-parecer');
  await campo(parecer, 'Responsável técnico').fill('Eng. Agr. Ana Lima');
  await page.getByRole('button', { name: 'Finalizar ficha' }).click();
  afirmar(await page.locator('.pendencias').getByText(/Parecer do PDA incompleto/).isVisible(), 'não aceita parecer incompleto');
  await parecer.getByRole('radio', { name: 'Liberar corte' }).click();
  await campo(parecer, 'Justificativa').fill('Corte antecipado para reduzir perdas.');
  afirmar(await titulo() === 'Liberado por parecer do PDA', 'parecer completo libera o corte');
  await page.getByRole('button', { name: 'Finalizar ficha' }).click();
  await page.getByText('Nova ficha').waitFor();
}

async function testarTelaGps(page, contexto) {
  console.log('Informações do GPS');
  await contexto.setGeolocation(LOCAL.th1);
  await page.getByRole('link', { name: 'Informações do GPS' }).click();
  await page.getByText('-21,178400, -47,810200').waitFor();
  const local = page.locator('.cartao', { hasText: 'Local de coleta' });
  afirmar(await local.getByText('Pode coletar aqui').isVisible(), 'mostra coordenadas e libera a coleta dentro do talhão');
  afirmar((await page.locator('.indicador', { hasText: 'Precisão' }).first().textContent()).includes('±4,5 m'), 'mostra a precisão');
  afirmar(await page.locator('.indicador', { hasText: 'Satélites' }).getByText('Não informado').isVisible(),
    'explica que o navegador não informa os satélites');
  await contexto.setGeolocation(LOCAL.terraco);
  await local.getByText('Não colete aqui').waitFor();
  afirmar(await local.getByText(/de um terraço/).isVisible(), 'avisa ao vivo quando entra na faixa do terraço');
  await page.screenshot({ path: path.join(SAIDA, 'gps.png'), fullPage: true });
  await page.getByRole('link', { name: 'Voltar' }).click();
  await page.getByText('Nova ficha').waitFor();
  await contexto.setGeolocation(LOCAL.th1);
}

async function exportarEValidar(page) {
  console.log('Exportação');
  await page.screenshot({ path: path.join(SAIDA, 'inicio.png'), fullPage: true });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar fichas finalizadas (JSON)' }).click(),
  ]);
  const arquivo = path.join(SAIDA, 'exportacao.json');
  await download.saveAs(arquivo);
  const pacote = JSON.parse(fs.readFileSync(arquivo, 'utf-8'));
  afirmar(pacote.fichas.length === 3, 'exporta as 3 fichas finalizadas');
  const saida = execFileSync(PYTHON, [path.join(RAIZ, 'scripts', 'validar_fichas.py'), arquivo], { encoding: 'utf-8' });
  console.log(saida.trimEnd().replace(/^/gm, '      '));
  afirmar(!saida.includes('INVÁLIDO'), 'JSON exportado passa no validador dos schemas');

  const cq = pacote.fichas.find((f) => f.tipo_ficha === 'cq_infestacao_final_broca');
  afirmar(cq.status_liberacao_corte === 'liberado_por_parecer_pda', 'status do CQ exportado = liberado_por_parecer_pda');
  afirmar(cq.identificacao.talhao_fid === 103 && cq.identificacao.fazenda === '9002-FAZENDA VIZINHA', 'exporta fid e fazenda do WebGIS');
  afirmar(cq.area_ha > 18 && cq.area_ha < 18.8, `área do CQ vem do talhão (${cq.area_ha} ha)`);
  const solo = pacote.fichas.find((f) => f.tipo_ficha === 'pragas_solo');
  afirmar(solo.identificacao.talhao === 'TH-1' && solo.identificacao.talhao_fid === 101, 'pragas do solo exporta o talhão TH-1');

  // Reabrir a ficha e conferir que os dados voltam.
  await page.getByRole('link', { name: /Pragas do Solo/ }).last().click();
  await page.getByRole('button', { name: 'Reabrir para edição' }).waitFor();
  afirmar(await campo(page, 'Bloco').isDisabled(), 'ficha finalizada abre só para leitura');
  afirmar(await campo(page, 'Bloco').inputValue() === 'B-03', 'dados salvos voltam ao reabrir');
  afirmar(await page.getByRole('button', { name: 'Identificar de novo' }).count() === 0, 'talhão não pode ser trocado na ficha finalizada');
  await page.getByRole('link', { name: 'Voltar' }).click();
  await page.getByText('Nova ficha').waitFor();
}

async function testarOffline(page, contexto) {
  console.log('Sem internet');
  await contexto.setOffline(true);
  await page.reload();
  await page.getByText('Nova ficha').waitFor();
  afirmar((await page.locator('.cartao-talhoes').textContent()).includes('3 talhões · 2 terraços do WebGIS'), 'talhões e terraços continuam no aparelho sem internet');
  await page.locator('a[href="#/nova/cigarrinha_raiz"]').click();
  await page.getByRole('button', { name: 'Identificar talhão pelo GPS' }).waitFor();
  await contexto.setGeolocation(LOCAL.th1);
  await page.getByRole('button', { name: 'Identificar talhão pelo GPS' }).click();
  await page.locator('.cartao-talhao .talhao-nome').waitFor();
  afirmar(await page.locator('.cartao-talhao .talhao-nome').textContent() === 'TH-1', 'identifica o talhão sem internet');
  await contexto.setOffline(false);
}

async function main() {
  const site = montarSite();
  const servidor = spawn(PYTHON, ['-m', 'http.server', String(PORTA), '-d', site], { stdio: 'ignore' });
  let navegador;
  try {
    await esperarServidor();
    navegador = await chromium.launch();
    const contexto = await navegador.newContext({
      ...devices['Pixel 7'], deviceScaleFactor: 1, locale: 'pt-BR', acceptDownloads: true,
      permissions: ['geolocation'], geolocation: LOCAL.th1,
    });
    const page = await contexto.newPage();
    const errosConsole = [];
    page.on('pageerror', (e) => errosConsole.push(e.message));
    page.on('dialog', (d) => d.accept());
    await page.goto(URL_APP);
    await page.locator('.cartao-talhoes').getByText(/terraços do WebGIS$/).waitFor();
    afirmar((await page.locator('.cartao-talhoes').textContent()).includes('3 talhões · 2 terraços do WebGIS'),
      'baixa os talhões e os terraços do WebGIS ao abrir (ignora feição sem nome de talhão)');
    await page.screenshot({ path: path.join(SAIDA, 'inicio-vazio.png') });

    await testarPragasSolo(page, contexto);
    await testarCigarrinha(page, contexto);
    await testarCQ(page, contexto);
    await testarTelaGps(page, contexto);
    await exportarEValidar(page);
    await testarOffline(page, contexto);
    afirmar(errosConsole.length === 0, `sem erros de JavaScript ${errosConsole.join(' | ')}`);
  } finally {
    await navegador?.close();
    servidor.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
