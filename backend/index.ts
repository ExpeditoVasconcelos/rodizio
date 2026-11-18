import os from 'node:os';
import { loadConfig } from './config.js';
import { startServer } from './server.js';
import { AppContext } from './services/appContext.js';

const INITIAL_COLLABORATORS = [
  'Severino',
  'Bruno',
  'Felipe',
  'Calvinho',
  'Israel',
  'Mateus',
  'Izaiane',
  'Daniel',
  'Gerson',
  'Tainãn',
  'Carlos',
  'Raul',
  'Diogo',
];

const INITIAL_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#f43f5e',
  '#8b5cf6',
  '#22c55e',
  '#06b6d4',
  '#f97316',
  '#6366f1',
  '#ec4899',
];

async function main(): Promise<void> {
  const config = loadConfig();
  const ctx = new AppContext(config);
  const realSvc = ctx.realService();
  if (realSvc.barbers.list().length === 0) {
    INITIAL_COLLABORATORS.forEach((name, idx) => {
      realSvc.createBarber(
        { fullName: name, displayName: name, color: INITIAL_COLORS[idx % INITIAL_COLORS.length] },
        'sistema',
      );
    });
  }
  const report = ctx.start();
  if (report.integrity !== 'ok') {
    console.error(`\n[ATENÇÃO] Verificação de integridade do banco: ${report.integrity}`);
    console.error('Restaure um backup de data/backups (veja o README).\n');
  }
  if (report.fixes.length) console.log('[recuperação] Ajustes após parada inesperada:', report.fixes.join('; '));

  let running;
  try {
    running = await startServer(ctx);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE') {
      console.error(`\nA porta ${config.port} já está em uso. Feche a outra instância ou altere PORT no arquivo .env.\n`);
    } else {
      console.error('Falha ao iniciar o servidor:', err);
    }
    ctx.close();
    process.exit(1);
  }

  const line = '─'.repeat(62);
  console.log(`\n${line}`);
  console.log('  RODÍZIO DIGITAL — servidor iniciado');
  console.log(line);
  console.log(`  Neste notebook : http://localhost:${running.port}`);
  const nets = Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
    (list ?? []).filter((n) => n.family === 'IPv4' && !n.internal).map((n) => ({ name, ip: n.address })),
  );
  if (nets.length === 0) console.log('  Tablet         : (nenhuma rede detectada — conecte-se ao Wi-Fi)');
  for (const n of nets) console.log(`  Tablet (${n.name.slice(0, 12).padEnd(12)}): http://${n.ip}:${running.port}`);
  console.log(`  Estabelecimento: ${ctx.settings().shopName}`);
  if (ctx.auth.mustChangePin) console.log('  PIN da recepção: 1234 (padrão) — troque em Administração › Sistema');
  console.log(`${line}\n  Para encerrar com segurança: Ctrl+C\n`);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n[${signal}] Encerrando com segurança...`);
    const force = setTimeout(() => process.exit(1), 8000);
    force.unref();
    await running.close();
    ctx.close();
    console.log('Banco de dados fechado e backup criado. Até logo!');
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGBREAK', () => void shutdown('SIGBREAK'));
  process.on('uncaughtException', (err) => {
    console.error('[erro fatal]', err);
    void shutdown('uncaughtException');
  });
}

void main();

