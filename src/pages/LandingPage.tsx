import { ArrowRight, Maximize2, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { ConnectionBadge } from '../components/ui/ConnectionBadge';
import { Logo } from '../components/ui/Logo';
import { Sheet } from '../components/ui/Sheet';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { Toasts } from '../components/ui/Toasts';
import { formatClock } from '../domain/format';
import { useFullscreen } from '../hooks/useFullscreen';
import { useNow } from '../hooks/useNow';
import { useRodizio } from '../hooks/useRodizio';
import { demoService, type NetworkInfo } from '../services/demo/demoService';

export default function LandingPage() {
  const navigate = useNavigate();
  const { snapshot, status } = useRodizio();
  const now = useNow();
  const fs = useFullscreen();
  const [qrOpen, setQrOpen] = useState(false);
  const [net, setNet] = useState<NetworkInfo | null>(null);

  useEffect(() => {
    void demoService
      .network()
      .then(setNet)
      .catch(() => null);
  }, []);

  const enterPanel = () => navigate('/painel');

  const enterPanelFullscreen = async () => {
    await fs.enter();
    sessionStorage.setItem('rodizio.gate.ok', '1');
    navigate('/painel');
  };

  const primaryLan = net?.addresses[0];
  const tabletUrl = primaryLan ? `${primaryLan.url}/painel` : `${location.origin}/painel`;
  const nextBarber = snapshot?.barbers.find((b) => b.state === 'APTO' && b.position === 1);

  return (
    <div className="flex min-h-dvh w-full flex-col justify-between bg-white text-zinc-900">
      {/* Barra superior limpa */}
      <header className="border-b border-zinc-200 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo url={snapshot?.shop.logoUrl} size={36} />
            <div>
              <div className="text-sm font-bold tracking-tight text-zinc-900">
                {snapshot?.shop.name ?? 'Barba de Urso'}
              </div>
              <div className="text-[0.68rem] font-medium text-zinc-400">
                Sistema de Rodízio {snapshot?.mode === 'demo' ? '· Demonstração' : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ConnectionBadge status={status} />
            <span className="tabular text-xs font-semibold text-zinc-500">{formatClock(now)}</span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Conteúdo central minimalista */}
      <main className="mx-auto my-auto w-full max-w-4xl px-6 py-10">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Painel móvel (Tablet / Celular) */}
          <div className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 md:col-span-7">
            <div>
              <div className="text-[0.68rem] font-bold tracking-[0.14em] text-zinc-400 uppercase">
                Tablet / Celular
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
                Quadro de Rodízio
              </h1>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                Duas tabelas em tela cheia: <b>Na Fila</b> e <b>Trabalhando</b>. Arraste o colaborador entre as duas
                tabelas para iniciar ou encerrar o corte.
              </p>

              {snapshot && (
                <div className="mt-5 grid grid-cols-3 divide-x divide-zinc-200 rounded-xl border border-zinc-200 bg-zinc-50/70 py-3 text-center">
                  <div className="px-2">
                    <div className="text-[0.65rem] font-semibold text-zinc-400 uppercase">Na fila</div>
                    <div className="tabular mt-0.5 text-xl font-bold text-zinc-900">{snapshot.stats.waiting}</div>
                  </div>
                  <div className="px-2">
                    <div className="text-[0.65rem] font-semibold text-zinc-400 uppercase">Trabalhando</div>
                    <div className="tabular mt-0.5 text-xl font-bold text-zinc-900">{snapshot.stats.working}</div>
                  </div>
                  <div className="px-2">
                    <div className="text-[0.65rem] font-semibold text-zinc-400 uppercase">Próximo</div>
                    <div
                      className="mt-0.5 truncate text-base font-bold"
                      style={{ color: nextBarber?.color ?? 'var(--color-zinc-900)' }}
                    >
                      {nextBarber?.displayName ?? '—'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <Button
                size="lg"
                variant="primary"
                onClick={enterPanel}
                icon={<ArrowRight size={16} />}
                data-testid="landing-enter-panel"
                className="flex-1"
              >
                Entrar no painel
              </Button>
              {fs.isSupported && (
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={enterPanelFullscreen}
                  icon={<Maximize2 size={16} />}
                  data-testid="landing-enter-fullscreen"
                >
                  Tela cheia
                </Button>
              )}
            </div>
          </div>

          {/* Recepção e Demonstração */}
          <div className="flex flex-col gap-4 md:col-span-5">
            <div className="flex flex-1 flex-col justify-between rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5">
              <div>
                <div className="text-[0.68rem] font-bold tracking-[0.14em] text-zinc-400 uppercase">
                  Computador
                </div>
                <h2 className="mt-1 text-base font-bold text-zinc-900">Recepção e Administração</h2>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  Gerencie colaboradores, direcione clientes, consulte o histórico e faça backups locais.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => navigate('/admin')}
                  data-testid="landing-enter-admin"
                  className="flex-1"
                >
                  Abrir administração
                </Button>
                <Button
                  size="md"
                  variant="ghost"
                  onClick={() => setQrOpen(true)}
                  icon={<QrCode size={15} />}
                  className="border border-zinc-200 bg-white"
                >
                  QR Code
                </Button>
              </div>
            </div>

            <div className="flex flex-1 flex-col justify-between rounded-2xl border border-zinc-200 bg-zinc-50/60 p-5">
              <div>
                <div className="text-[0.68rem] font-bold tracking-[0.14em] text-zinc-400 uppercase">
                  Simulação
                </div>
                <h2 className="mt-1 text-base font-bold text-zinc-900">Modo Demonstração</h2>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  Ambiente separado com 6 barbeiros fictícios para testar o funcionamento sem afetar dados reais.
                </p>
              </div>

              <div className="mt-4">
                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => navigate('/demo')}
                  data-testid="landing-enter-demo"
                  className="w-full"
                >
                  Abrir demonstração
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-zinc-200 px-6 py-4 text-xs text-zinc-400">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
          <span>Operação local em SQLite · Sincronização em tempo real</span>
          <span className="font-mono text-zinc-500">{tabletUrl}</span>
        </div>
      </footer>

      <Sheet
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        placement="center"
        title={<div className="text-base font-bold text-zinc-900">Acesso pelo celular / tablet</div>}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="qr-surface rounded-xl border border-zinc-200 p-3">
            <QRCodeSVG value={tabletUrl} size={170} level="M" />
          </div>
          <div className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-[0.65rem] font-semibold text-zinc-400 uppercase">Endereço na rede Wi-Fi</div>
            <div className="mt-1 select-all font-mono text-sm font-bold text-zinc-900">{tabletUrl}</div>
          </div>
        </div>
      </Sheet>

      <Toasts />
    </div>
  );
}
