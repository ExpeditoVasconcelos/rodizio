import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { WebSocket } from 'ws';
import type { ApiResponse, StateSnapshot } from '../../shared/types.js';
import { loadConfig } from '../config.js';
import { startServer, type RunningServer } from '../server.js';
import { AppContext } from '../services/appContext.js';
import { makeService, queueNames, seedBarbers, workingNames } from './helpers.js';

const tmpDirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'rodizio-test-'));
  tmpDirs.push(d);
  return d;
}
after(() => {
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* arquivos ainda abertos (simulação de queda) — o SO limpa a pasta temporária */
    }
  }
});

describe('TESTE 7 — interrupção e recuperação', () => {
  it('fila e atendimentos sobrevivem a reinício; parada abrupta é recuperada', () => {
    const file = path.join(tmp(), 'rodizio.db');
    const clock = { t: new Date(2026, 10, 16, 9, 0, 0).getTime() };
    const first = makeService({ file, clock });
    const ids = seedBarbers(first.svc, 4);
    for (const id of ids) first.svc.enter(id, { actor: 'tablet' });
    first.svc.start(ids[0], { actor: 'tablet' });
    first.svc.start(ids[2], { actor: 'tablet' });
    const before = first.svc.snapshot();
    // Simula queda de energia: o banco é aberto novamente SEM fechar o anterior corretamente.
    const second = makeService({ file, clock });
    const report = second.svc.recover();
    assert.equal(report.integrity, 'ok');
    assert.deepEqual(queueNames(second.svc), ['Carlos', 'Marcos']);
    assert.deepEqual(workingNames(second.svc).sort(), ['João', 'Pedro']);
    const after = second.svc.snapshot();
    assert.equal(after.stream, before.stream);
    assert.equal(after.version, before.version);
    // A operação continua funcionando após o "reinício".
    second.svc.finish(ids[0], { actor: 'tablet' });
    assert.deepEqual(queueNames(second.svc), ['Carlos', 'Marcos', 'João']);
  });

  it('recuperação corrige profissional simultaneamente na fila e em atendimento', () => {
    const file = path.join(tmp(), 'rodizio.db');
    const { svc } = makeService({ file });
    const [a, b] = seedBarbers(svc, 2);
    svc.enter(a, { actor: 't' });
    svc.enter(b, { actor: 't' });
    svc.start(a, { actor: 't' });
    // Corrompe de propósito: coloca A novamente como WAITING (impossível pelas regras).
    svc.db.exec('DROP INDEX one_waiting_per_barber');
    svc.queue.pushBack(a, svc.shifts.getOpen()!.id, Date.now());
    const report = svc.recover();
    assert.ok(report.fixes.length >= 1);
    assert.deepEqual(queueNames(svc), ['Carlos']);
  });
});

describe('Contexto de produção e cabeçalhos de segurança', () => {
  it('inicializa com nome Barba de Urso e os 13 colaboradores pré-cadastrados', () => {
    const dir = tmp();
    const ctx = new AppContext(
      loadConfig({
        dataDir: dir,
        uploadsDir: path.join(dir, 'u'),
        backupsDir: path.join(dir, 'b'),
        clientDir: path.join(dir, 'c'),
      }),
    );
    ctx.start();
    assert.equal(ctx.currentMode(), 'real');
    assert.equal(ctx.settings().shopName, 'Barba de Urso');
    const names = ctx.current().barbers.list().map((b) => b.display_name);
    assert.equal(names.length, 13);
    assert.ok(names.includes('Severino'));
    assert.ok(names.includes('Diogo'));
    ctx.close();
  });
});

describe('API HTTP + WebSocket (testes 6 e 8)', () => {
  const dir = tmp();
  const ctx = new AppContext(
    loadConfig({
      dataDir: dir,
      uploadsDir: path.join(dir, 'uploads'),
      backupsDir: path.join(dir, 'backups'),
      clientDir: path.join(dir, 'client'),
      port: 0,
      host: '0.0.0.0',
      initialAdminPin: '4321',
    }),
  );
  ctx.start();
  let server: RunningServer;
  let base = '';

  const call = async (method: string, url: string, body?: unknown, token?: string) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as ApiResponse & Record<string, any> };
  };

  it('inicia, aceita conexões pela interface de rede e exige PIN nas rotas administrativas', async () => {
    server = await startServer(ctx);
    // O servidor escuta em todas as interfaces (e não apenas em localhost)...
    const bound = server.server.address();
    assert.ok(typeof bound === 'object' && bound && ['0.0.0.0', '::'].includes(bound.address));
    // ...portanto responde também pelo IP da rede local (verificação opcional: TEST_LAN=1).
    const lan = Object.values(os.networkInterfaces())
      .flat()
      .find((n) => n && n.family === 'IPv4' && !n.internal);
    base = `http://${process.env.TEST_LAN && lan ? lan.address : '127.0.0.1'}:${server.port}`;

    assert.equal((await call('GET', '/api/health')).status, 200);
    assert.equal((await call('GET', '/api/admin/barbers')).status, 401);
    assert.equal((await call('POST', '/api/admin/barbers', { fullName: 'X' })).status, 401);
    assert.equal((await call('POST', '/api/admin/login', { pin: '0000' })).status, 401);
    // Banco SQLite não é exposto.
    assert.notEqual((await fetch(`${base}/data/rodizio.db`)).headers.get('content-type'), 'application/octet-stream');
    assert.equal((await fetch(`${base}/uploads/../rodizio.db`)).status === 200, false);
  });

  it('bloqueia tentativas excessivas de PIN', async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await call('POST', '/api/admin/login', { pin: '9999' })).status;
    assert.equal(last, 429);
    // limpa a trava para os próximos testes (o bloqueio é por IP, em memória)
    (ctx.auth as unknown as { attempts: Map<string, unknown> }).attempts.clear();
  });

  it('cadastra barbeiros (admin), opera pelo tablet e sincroniza em tempo real', async () => {
    const login = await call('POST', '/api/admin/login', { pin: '4321' });
    const token = login.json.token as string;
    assert.ok(token);
    const ids: number[] = [];
    for (const n of ['João', 'Carlos', 'Pedro', 'Marcos']) {
      const r = await call('POST', '/api/admin/barbers', { fullName: n, displayName: n, color: '#aabbcc' }, token);
      assert.equal(r.status, 200);
      ids.push(r.json.id as number);
    }

    // "Notebook" conectado por WebSocket
    const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
    const snapshots: StateSnapshot[] = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'snapshot') snapshots.push(msg.snapshot);
    });
    await new Promise<void>((res, rej) => {
      ws.once('open', () => res());
      ws.once('error', rej);
    });
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(snapshots.length >= 1, 'recebe o estado ao conectar');

    for (const id of ids) {
      const r = await call('POST', '/api/ops/enter', { barberId: id, opId: `enter-${id}-abcdef`, source: 'tablet' });
      assert.equal(r.status, 200);
    }
    // Movimento feito no "tablet": João -> trabalhando
    const move = await call('POST', '/api/ops/start', { barberId: ids[0], opId: 'start-joao-abcdef', source: 'tablet' });
    assert.equal(move.json.ok, true);
    await new Promise((r) => setTimeout(r, 150));
    const last = snapshots.at(-1)!;
    assert.equal(last.version, (move.json as { snapshot: StateSnapshot }).snapshot.version);
    assert.deepEqual(
      last.barbers.filter((b) => b.state === 'APTO').map((b) => b.displayName),
      ['Carlos', 'Pedro', 'Marcos'],
    );
    assert.equal(last.barbers.find((b) => b.displayName === 'João')!.state, 'TRABALHANDO');

    // Conflito: tentar iniciar quem já está trabalhando devolve erro + estado atual
    const dup = await call('POST', '/api/ops/start', { barberId: ids[0], opId: 'start-joao-zzzzzz', source: 'tablet' });
    assert.equal(dup.status, 409);
    assert.equal((dup.json as { error: { message: string } }).error.message, 'ESTE PROFISSIONAL JÁ ESTÁ TRABALHANDO.');
    assert.ok((dup.json as { snapshot?: StateSnapshot }).snapshot);

    // Histórico e auditoria (admin)
    const fin = await call('POST', '/api/ops/finish', { barberId: ids[0], source: 'tablet' });
    assert.equal(fin.json.ok, true);
    const hist = await call('GET', '/api/admin/history', undefined, token);
    assert.equal(hist.json.total, 1);
    assert.equal(hist.json.rows[0].status, 'FINISHED');
    const audit = await call('GET', '/api/admin/audit', undefined, token);
    assert.ok(audit.json.total >= 10);

    // Backup consistente
    const bk = await call('POST', '/api/admin/backups', {}, token);
    assert.equal(bk.status, 200);
    assert.ok(bk.json.backups.length >= 1);
    const dl = await fetch(`${base}/api/admin/backups/${bk.json.name}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(dl.status, 200);
    assert.equal(dl.headers.get('x-frame-options'), 'DENY');
    assert.ok(dl.headers.get('content-security-policy')?.includes("default-src 'self'"));
    assert.equal(Buffer.from(await dl.arrayBuffer()).subarray(0, 15).toString(), 'SQLite format 3');

    ws.close();
  });

  it('encerra com segurança', async () => {
    await server.close();
    ctx.close();
    assert.ok(fs.readdirSync(path.join(dir, 'backups')).some((f) => f.includes('encerramento')));
  });
});
