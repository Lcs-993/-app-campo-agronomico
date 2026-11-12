// Teste de ponta a ponta do app: preenche as três fichas num celular simulado,
// finaliza, exporta o JSON e valida o arquivo com scripts/validar_fichas.py.
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
const PORTA = 8800 + Math.floor(Math.random() * 100);
const URL_APP = `http://localhost:${PORTA}/`;

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

async function testarPragasSolo(page) {
  console.log('Pragas do solo');
  await page.getByRole('link', { name: /Pragas do Solo/ }).click();
  await identificar(page, { Fazenda: 'Fazenda Santa Rita', 'Talhão': 'T-012', Bloco: 'B-03', Amostrador: 'João Silva' });

  const p1 = ponto(page, 1);
  await p1.getByRole('button', { name: 'Capturar GPS' }).click();
  await p1.getByText('-21,178400').waitFor();
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
  await p2.getByRole('button', { name: 'Capturar GPS' }).click();
  await p2.locator('.gps-ok').waitFor();
  await campo(p2, 'Tocos examinados').fill('10');
  await mais(p2, 'Tocos brocados');
  await mais(p2, 'Larva de Metamasius');
  afirmar(await page.locator('.pendencias').isHidden(), 'lista de pendências some quando tudo é corrigido');
  afirmar(!(await p1.locator('.gps-info').textContent()).includes('null'), 'linha do GPS sem texto estranho');

  const pct = await page.locator('.indicador', { hasText: 'Tocos brocados' }).locator('dd').textContent();
  afirmar(pct === '15,0%', `percentual de tocos brocados = ${pct}`);
  await page.screenshot({ path: path.join(SAIDA, 'pragas-solo.png'), fullPage: true });

  await page.getByRole('button', { name: 'Finalizar ficha' }).click();
  await page.getByRole('heading', { name: 'Campo Agronômico' }).waitFor();
}

async function testarCigarrinha(page) {
  console.log('Cigarrinha-da-raiz');
  await page.getByRole('link', { name: /Cigarrinha-da-Raiz/ }).click();
  await identificar(page, { Fazenda: 'Fazenda Santa Rita', 'Talhão': 'T-015', Amostrador: 'Maria Souza' });
  const p1 = ponto(page, 1);
  await p1.getByRole('button', { name: 'Capturar GPS' }).click();
  await p1.locator('.gps-ok').waitFor();
  await campo(p1, 'Metros lineares amostrados').fill('2');
  await campo(p1, 'Ninfas').fill('5');
  await mais(p1, 'Adultos');
  await p1.getByRole('radio', { name: 'Com espuma' }).click();
  await p1.getByRole('radio', { name: '2 · Média' }).click();

  await page.getByRole('button', { name: 'Adicionar ponto' }).click();
  const p2 = ponto(page, 2);
  await p2.getByRole('button', { name: 'Capturar GPS' }).click();
  await p2.locator('.gps-ok').waitFor();
  await campo(p2, 'Metros lineares amostrados').fill('2');
  await mais(p2, 'Ninfas');

  const alerta = page.locator('.cartao-resultados .alerta');
  afirmar((await alerta.textContent()).includes('1,50 ninfas/m, acima do NDE de 1,0'), 'compara ninfas/m com o NDE');
  await page.screenshot({ path: path.join(SAIDA, 'cigarrinha.png'), fullPage: true });
  await page.getByRole('button', { name: 'Finalizar ficha' }).click();
  await page.getByRole('heading', { name: 'Campo Agronômico' }).waitFor();
}

async function testarCQ(page) {
  console.log('CQ: infestação final da broca');
  await page.getByRole('link', { name: /Infestação Final da Broca/ }).click();
  await identificar(page, { Fazenda: 'Fazenda Boa Vista', 'Talhão': 'T-004', Auditor: 'Carlos Pereira', 'Área do talhão': '18,6' });
  const a1 = ponto(page, 1);
  await a1.getByRole('button', { name: 'Capturar GPS' }).click();
  await a1.locator('.gps-ok').waitFor();
  await campo(a1, 'Entrenós totais').fill('120');
  await campo(a1, 'Entrenós danificados').fill('6');
  await a1.locator('input[type=file]').setInputFiles({ name: 'entreno.png', mimeType: 'image/png', buffer: FOTO });
  await a1.locator('.foto img[src^="blob:"]').waitFor();

  const titulo = () => page.locator('.cartao-resultados .alerta strong').textContent();
  afirmar(await titulo() === 'Alerta ao PDA', 'II de 5,00% fica em alerta (bloqueio só acima de 5%)');
  afirmar(await page.locator('.cartao-parecer').isHidden(), 'parecer do PDA escondido fora do bloqueio');

  await page.getByRole('button', { name: 'Adicionar amostra' }).click();
  const a2 = ponto(page, 2);
  await a2.getByRole('button', { name: 'Capturar GPS' }).click();
  await a2.locator('.gps-ok').waitFor();
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
  await page.getByRole('heading', { name: 'Campo Agronômico' }).waitFor();
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
  const saida = execFileSync('python3', [path.join(RAIZ, 'scripts', 'validar_fichas.py'), arquivo], { encoding: 'utf-8' });
  console.log(saida.trimEnd().replace(/^/gm, '      '));
  afirmar(!saida.includes('INVÁLIDO'), 'JSON exportado passa no validador dos schemas');

  const cq = pacote.fichas.find((f) => f.tipo_ficha === 'cq_infestacao_final_broca');
  afirmar(cq.status_liberacao_corte === 'liberado_por_parecer_pda', 'status do CQ exportado = liberado_por_parecer_pda');

  // Reabrir a ficha e conferir que os dados voltam.
  await page.getByRole('link', { name: /Pragas do Solo/ }).last().click();
  await page.getByRole('button', { name: 'Reabrir para edição' }).waitFor();
  afirmar(await campo(page, 'Fazenda').isDisabled(), 'ficha finalizada abre só para leitura');
  afirmar(await campo(page, 'Fazenda').inputValue() === 'Fazenda Santa Rita', 'dados salvos voltam ao reabrir');
  await page.getByRole('link', { name: 'Voltar' }).click();
}

async function main() {
  const servidor = spawn('python3', ['-m', 'http.server', String(PORTA), '-d', path.join(RAIZ, 'app')], { stdio: 'ignore' });
  let navegador;
  try {
    await esperarServidor();
    navegador = await chromium.launch();
    const contexto = await navegador.newContext({
      ...devices['Pixel 7'], deviceScaleFactor: 1, locale: 'pt-BR', acceptDownloads: true,
      permissions: ['geolocation'], geolocation: { latitude: -21.1784, longitude: -47.8102, accuracy: 4.5 },
    });
    const page = await contexto.newPage();
    const errosConsole = [];
    page.on('pageerror', (e) => errosConsole.push(e.message));
    page.on('dialog', (d) => d.accept());
    await page.goto(URL_APP);
    await page.screenshot({ path: path.join(SAIDA, 'inicio-vazio.png') });

    await testarPragasSolo(page);
    await testarCigarrinha(page);
    await testarCQ(page);
    await exportarEValidar(page);
    afirmar(errosConsole.length === 0, `sem erros de JavaScript ${errosConsole.join(' | ')}`);
  } finally {
    await navegador?.close();
    servidor.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
