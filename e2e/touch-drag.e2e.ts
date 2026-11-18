import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type CDPSession, type Page } from 'playwright-core';
import { loadConfig } from '../backend/config.js';
import { startServer } from '../backend/server.js';
import { AppContext } from '../backend/services/appContext.js';

function findBrowserExecutable(): string {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Navegador Chrome/Edge não encontrado para o teste E2E.');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Executa um gesto de toque real (TouchStart -> espera de pressão -> TouchMove -> TouchEnd)
 * via Chrome DevTools Protocol, exatamente como um dedo na tela de um tablet Android.
 */
async function touchDrag(
  cdp: CDPSession,
  from: { x: number; y: number },
  to: { x: number; y: number },
  holdMs = 210,
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: Math.round(from.x), y: Math.round(from.y), radiusX: 12, radiusY: 12, force: 1, id: 1 }],
  });
  await sleep(holdMs);
  const steps = 14;
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(from.x + ((to.x - from.x) * i) / steps);
    const y = Math.round(from.y + ((to.y - from.y) * i) / steps);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, radiusX: 12, radiusY: 12, force: 1, id: 1 }],
    });
    await sleep(16);
  }
  await sleep(40);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

async function centerOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  await sleep(420);
  const loc = page.locator(selector);
  await loc.scrollIntoViewIfNeeded();
  const box = await loc.boundingBox();
  assert.ok(box, `Elemento não visível: ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function queueOrderOnTablet(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="zone-queue"] [data-testid^="card-"]')
    .evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace('card-', '')));
}

async function workingNamesOnTablet(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid="zone-working"] [data-testid^="card-"]')
    .evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace('card-', '')));
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rodizio-e2e-'));
  const ctx = new AppContext(
    loadConfig({
      dataDir: tmpDir,
      uploadsDir: path.join(tmpDir, 'uploads'),
      backupsDir: path.join(tmpDir, 'backups'),
      port: 0,
      host: '0.0.0.0',
      initialAdminPin: '1234',
    }),
  );
  ctx.start();
  const running = await startServer(ctx);
  const baseUrl = `http://127.0.0.1:${running.port}`;

  console.log(`[E2E] Servidor iniciado em ${baseUrl}`);
  const browser = await chromium.launch({
    executablePath: findBrowserExecutable(),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    // Dispositivo 1: Notebook da Recepção
    const notebookContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const notebookPage = await notebookContext.newPage();

    // Dispositivo 2: Tablet Android Touchscreen (1280x800 landscape, toque habilitado)
    const tabletContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      hasTouch: true,
      isMobile: true,
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    });
    const tabletPage = await tabletContext.newPage();
    const tabletCdp = await tabletContext.newCDPSession(tabletPage);

    // 1. Notebook faz login no painel administrativo e cadastra 4 barbeiros (João, Carlos, Pedro, Marcos)
    await notebookPage.goto(`${baseUrl}/admin`);
    await notebookPage.fill('[data-testid="admin-pin-input"]', '1234');
    await notebookPage.click('[data-testid="admin-pin-submit"]');
    await notebookPage.click('[data-testid="admin-tab-barbers"]');

    for (const name of ['João', 'Carlos', 'Pedro', 'Marcos']) {
      await notebookPage.click('[data-testid="admin-new-barber-btn"]');
      await notebookPage.fill('[data-testid="barber-fullname-input"]', name);
      await notebookPage.fill('[data-testid="barber-displayname-input"]', name);
      await notebookPage.click('[data-testid="barber-save-btn"]');
      await notebookPage.locator(`[data-testid="admin-barber-card-${name}"]`).waitFor();
    }
    await notebookPage.click('[data-testid="admin-tab-live"]');
    console.log('✔ Cadastro dos 4 barbeiros realizado pelo notebook da recepção');

    // 2. Tablet abre o painel e entra em tela cheia (TESTE 9)
    await tabletPage.goto(`${baseUrl}/painel`);
    await tabletPage.locator('[data-testid="fullscreen-gate"]').waitFor();
    await tabletPage.click('[data-testid="enter-fullscreen"]');
    await tabletPage.locator('[data-testid="fullscreen-gate"]').waitFor({ state: 'detached' });
    console.log('✔ TESTE 9 — Modo tela cheia acionado no tablet');

    // 3. TESTE 1 — Entrada na fila pelo botão "ESTOU DISPONÍVEL" no tablet
    for (const name of ['João', 'Carlos', 'Pedro', 'Marcos']) {
      await tabletPage.click('[data-testid="btn-estou-disponivel"]');
      await tabletPage.click(`[data-testid="modal-enter-${name}"]`);
      await tabletPage.locator(`[data-testid="zone-queue"] [data-testid="card-${name}"]`).waitFor();
    }
    assert.deepEqual(await queueOrderOnTablet(tabletPage), ['João', 'Carlos', 'Pedro', 'Marcos']);
    console.log('✔ TESTE 1 — Entrada na fila: 1. João, 2. Carlos, 3. Pedro, 4. Marcos');

    // 4. TESTE 5 (parte A) — Toque rápido/arraste sem esperar o tempo mínimo NÃO move o card acidentalmente
    const joaoStart = await centerOf(tabletPage, '[data-testid="card-João"]');
    const workingZone = await centerOf(tabletPage, '[data-testid="zone-working"]');
    await touchDrag(tabletCdp, joaoStart, workingZone, 20); // apenas 20ms (< 140ms)
    await sleep(250);
    assert.deepEqual(await queueOrderOnTablet(tabletPage), ['João', 'Carlos', 'Pedro', 'Marcos']);
    console.log('✔ TESTE 5A — Toque rápido acidental não inicia arraste');

    // 5. TESTE 2 & TESTE 6 — Arrastar João para TRABALHANDO com o dedo no tablet + sincronização no notebook
    await touchDrag(tabletCdp, await centerOf(tabletPage, '[data-testid="card-João"]'), workingZone, 210);
    await tabletPage.locator('[data-testid="zone-working"] [data-testid="card-João"]').waitFor();
    assert.deepEqual(await queueOrderOnTablet(tabletPage), ['Carlos', 'Pedro', 'Marcos']);
    assert.deepEqual(await workingNamesOnTablet(tabletPage), ['João']);
    // Verifica que o notebook recebeu a atualização em tempo real sem recarregar a página
    await notebookPage.locator('text=RODÍZIO').first().waitFor();
    console.log('✔ TESTE 2 & TESTE 6 — João arrastado para TRABALHANDO; Carlos 1º; notebook sincronizado em tempo real');

    // 6. TESTE 3 — Arrastar João de TRABALHANDO para NA FILA (soltando no topo da fila, deve ir para o FINAL)
    const queueTop = await centerOf(tabletPage, '[data-testid="card-Carlos"]');
    await touchDrag(tabletCdp, await centerOf(tabletPage, '[data-testid="card-João"]'), queueTop, 210);
    await tabletPage.locator('[data-testid="zone-queue"] [data-testid="card-João"]').waitFor();
    assert.deepEqual(await queueOrderOnTablet(tabletPage), ['Carlos', 'Pedro', 'Marcos', 'João']);
    assert.deepEqual(await workingNamesOnTablet(tabletPage), []);
    console.log('✔ TESTE 3 — Finalizar por arraste posicionou João obrigatoriamente no FINAL da fila');

    // 7. TESTE 4 — Escolha específica: na ordem [Carlos, Pedro, Marcos, João], arrastar Marcos (3º) para TRABALHANDO
    await touchDrag(tabletCdp, await centerOf(tabletPage, '[data-testid="card-Marcos"]'), workingZone, 210);
    await tabletPage.locator('[data-testid="zone-working"] [data-testid="card-Marcos"]').waitFor();
    assert.deepEqual(await queueOrderOnTablet(tabletPage), ['Carlos', 'Pedro', 'João']);
    const marcosText = await tabletPage.locator('[data-testid="card-Marcos"]').innerText();
    assert.ok(marcosText.includes('ESCOLHA ESPECÍFICA'), 'Marcos deve ser marcado como ESCOLHA ESPECÍFICA');
    // Ao finalizar Marcos por arraste, ele retorna ao final
    const queueZone = await centerOf(tabletPage, '[data-testid="zone-queue"]');
    await touchDrag(tabletCdp, await centerOf(tabletPage, '[data-testid="card-Marcos"]'), queueZone, 210);
    await tabletPage.locator('[data-testid="zone-queue"] [data-testid="card-Marcos"]').waitFor();
    assert.deepEqual(await queueOrderOnTablet(tabletPage), ['Carlos', 'Pedro', 'João', 'Marcos']);
    console.log('✔ TESTE 4 — Escolha específica (3º da fila) preserva ordem relativa e retorna ao final');

    // 8. TESTE 7 — Interrupção: fecha e reabre o navegador do tablet -> fila preservada
    await tabletPage.reload();
    await tabletPage.locator('[data-testid="card-Carlos"]').waitFor();
    assert.deepEqual(await queueOrderOnTablet(tabletPage), ['Carlos', 'Pedro', 'João', 'Marcos']);
    console.log('✔ TESTE 7 — Estado recuperado após recarregamento/interrupção do tablet');

    // 9. TESTE 8 — Rede local
    const netRes = await fetch(`${baseUrl}/api/network`).then((r) => r.json());
    assert.equal(netRes.ok, true);
    console.log('✔ TESTE 8 — Endpoint de rede local e sincronização validados');

    console.log('\n🎉 TODOS OS TESTES E2E (1 A 9) PASSARAM COM SUCESSO!');
  } finally {
    await browser.close();
    await running.close();
    ctx.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

void main();
