import {
  Activity,
  History,
  Home,
  LogOut,
  Menu,
  Settings,
  Smartphone,
  Users,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConnectionBadge } from '../../components/ui/ConnectionBadge';
import { Logo } from '../../components/ui/Logo';
import { Sheet } from '../../components/ui/Sheet';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { Toasts } from '../../components/ui/Toasts';
import { useRodizio } from '../../hooks/useRodizio';
import { adminSession, useAdminToken } from '../../services/admin/adminService';
import { BarbersTab } from './BarbersTab';
import { HistoryTab } from './HistoryTab';
import { PinLoginView } from './PinLoginView';
import { ReceptionLiveTab } from './ReceptionLiveTab';
import { SystemTab } from './SystemTab';

type Tab = 'live' | 'barbers' | 'history' | 'system';

export default function AdminPage() {
  const navigate = useNavigate();
  const token = useAdminToken();
  const { snapshot, status } = useRodizio();
  const [tab, setTab] = useState<Tab>('live');
  const [historyBarberId, setHistoryBarberId] = useState<number | undefined>(undefined);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  if (!token) {
    return <PinLoginView onSuccess={() => setTab('live')} />;
  }

  const selectTab = (next: Tab) => {
    if (next !== 'history') setHistoryBarberId(undefined);
    setTab(next);
    mainRef.current?.scrollTo({ top: 0 });
  };

  const inspectBarberHistory = (barberId: number) => {
    setHistoryBarberId(barberId);
    setTab('history');
    mainRef.current?.scrollTo({ top: 0 });
  };

  const tabs: { id: Tab; label: string; shortLabel: string; icon: typeof Activity }[] = [
    { id: 'live', label: 'Rodízio ao vivo', shortLabel: 'Rodízio', icon: Activity },
    { id: 'barbers', label: 'Profissionais', shortLabel: 'Equipe', icon: Users },
    { id: 'history', label: 'Histórico', shortLabel: 'Histórico', icon: History },
    { id: 'system', label: 'Sistema e rede', shortLabel: 'Sistema', icon: Settings },
  ];

  const queueCount = snapshot?.barbers.filter((b) => b.state === 'APTO').length ?? 0;
  const workingCount = snapshot?.barbers.filter((b) => b.state === 'TRABALHANDO').length ?? 0;

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-white text-zinc-900 md:flex-row">
      {/* Cabeçalho compacto no Mobile (< md) */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/95 px-3.5 backdrop-blur-md md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo url={snapshot?.shop.logoUrl} size={30} />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-tight text-zinc-900">
              {snapshot?.shop.name ?? 'Barba de Urso'}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[0.65rem] font-medium text-zinc-400">Admin</span>
              <span className="text-zinc-300">·</span>
              <ConnectionBadge status={status} />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu"
            data-testid="admin-mobile-menu-btn"
            className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* Navbar vertical à esquerda no Desktop (>= md) */}
      <aside
        className="hidden w-60 shrink-0 flex-col justify-between border-r border-zinc-200 bg-zinc-50/80 p-4 md:flex"
        aria-label="Navegação principal"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2 pt-1">
            <Logo url={snapshot?.shop.logoUrl} size={34} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold tracking-tight text-zinc-900">
                {snapshot?.shop.name ?? 'Barba de Urso'}
              </div>
              <div className="text-[0.68rem] font-medium text-zinc-400">Recepção</div>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTab(t.id)}
                  data-testid={`admin-tab-${t.id}`}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900'
                  }`}
                >
                  <Icon size={15} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-1.5 border-t border-zinc-200 pt-3">
          <div className="px-2 py-1">
            <ConnectionBadge status={status} />
          </div>
          <ThemeToggle showLabel className="w-full justify-start" />
          <button
            type="button"
            onClick={() => navigate('/painel')}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900"
          >
            <Smartphone size={15} />
            <span>Painel móvel</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900"
          >
            <Home size={15} />
            <span>Tela inicial</span>
          </button>
          <button
            type="button"
            onClick={() => adminSession.clear()}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-900"
          >
            <LogOut size={15} />
            <span>Encerrar sessão</span>
          </button>
        </div>
      </aside>

      {/* Área de conteúdo responsiva */}
      <main
        ref={mainRef}
        className="scroll-y min-w-0 flex-1 bg-white px-4 pt-4 pb-24 sm:px-6 sm:pt-6 md:p-6 lg:p-8"
      >
        <div className="mx-auto max-w-5xl">
          {tab === 'live' && <ReceptionLiveTab snapshot={snapshot} />}
          {tab === 'barbers' && (
            <BarbersTab
              onInspectHistory={inspectBarberHistory}
              snapshotVersion={snapshot?.version}
            />
          )}
          {tab === 'history' && <HistoryTab initialBarberId={historyBarberId} />}
          {tab === 'system' && <SystemTab />}
        </div>
      </main>

      {/* Barra de navegação inferior no Mobile (< md) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-zinc-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        aria-label="Navegação móvel"
      >
        <div className="grid grid-cols-4">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                data-testid={`admin-mobile-tab-${t.id}`}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 py-2 text-[0.68rem] font-semibold transition-colors ${
                  active ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-700'
                }`}
              >
                {active && (
                  <span className="absolute top-0 h-[2px] w-10 rounded-full bg-zinc-900" />
                )}
                <div className="relative">
                  <Icon size={18} strokeWidth={active ? 2.4 : 1.9} />
                  {t.id === 'live' && (queueCount > 0 || workingCount > 0) && (
                    <span className="tabular absolute -top-1.5 -right-2.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-zinc-900 px-1 text-[0.58rem] font-bold text-white">
                      {queueCount + workingCount}
                    </span>
                  )}
                </div>
                <span className="truncate">{t.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Sheet do Menu Mobile (atalhos e sessão) */}
      <Sheet
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        placement="bottom"
        title={
          <div className="flex items-center gap-2.5">
            <Logo url={snapshot?.shop.logoUrl} size={30} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-zinc-900">
                {snapshot?.shop.name ?? 'Barba de Urso'}
              </div>
              <div className="text-[0.7rem] text-zinc-400">Opções da recepção</div>
            </div>
          </div>
        }
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5">
            <span className="text-xs font-medium text-zinc-500">Status em tempo real</span>
            <ConnectionBadge status={status} />
          </div>

          <div className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="px-1 py-1">
              <ThemeToggle showLabel className="h-11 w-full justify-start px-3 text-sm" />
            </div>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                navigate('/painel');
              }}
              className="flex h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              <Smartphone size={17} className="text-zinc-500" />
              <span>Abrir Painel móvel (Tablet)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                navigate('/');
              }}
              className="flex h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              <Home size={17} className="text-zinc-500" />
              <span>Ir para Tela inicial</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              adminSession.clear();
            }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <LogOut size={16} />
            <span>Encerrar sessão administrativa</span>
          </button>
        </div>
      </Sheet>

      <Toasts />
    </div>
  );
}
