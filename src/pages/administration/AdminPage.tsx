import {
  Activity,
  History,
  Home,
  LogOut,
  Settings,
  Smartphone,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConnectionBadge } from '../../components/ui/ConnectionBadge';
import { Logo } from '../../components/ui/Logo';
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

  if (!token) {
    return <PinLoginView onSuccess={() => setTab('live')} />;
  }

  const inspectBarberHistory = (barberId: number) => {
    setHistoryBarberId(barberId);
    setTab('history');
  };

  const tabs: { id: Tab; label: string; icon: typeof Activity }[] = [
    { id: 'live', label: 'Rodízio ao vivo', icon: Activity },
    { id: 'barbers', label: 'Profissionais', icon: Users },
    { id: 'history', label: 'Histórico', icon: History },
    { id: 'system', label: 'Sistema e rede', icon: Settings },
  ];

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-white text-zinc-900">
      {/* Navbar vertical simples à esquerda */}
      <aside
        className="flex w-60 shrink-0 flex-col justify-between border-r border-zinc-200 bg-zinc-50/80 p-4"
        aria-label="Navegação principal"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2 pt-1">
            <Logo url={snapshot?.shop.logoUrl} size={34} />
            <div className="min-w-0">
              <div className="truncate text-sm font-bold tracking-tight text-zinc-900">
                {snapshot?.shop.name ?? 'Barba de Urso'}
              </div>
              <div className="text-[0.68rem] font-medium text-zinc-400">
                Recepção
              </div>
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
                  onClick={() => {
                    if (t.id !== 'history') setHistoryBarberId(undefined);
                    setTab(t.id);
                  }}
                  data-testid={`admin-tab-${t.id}`}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${active
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

      {/* Área de conteúdo dividida e minimalista */}
      <main className="min-w-0 flex-1 overflow-y-auto bg-white p-6 lg:p-8">
        <div className="mx-auto max-w-5xl">
          {tab === 'live' && <ReceptionLiveTab snapshot={snapshot} />}
          {tab === 'barbers' && <BarbersTab onInspectHistory={inspectBarberHistory} />}
          {tab === 'history' && <HistoryTab initialBarberId={historyBarberId} />}
          {tab === 'system' && <SystemTab />}
        </div>
      </main>

      <Toasts />
    </div>
  );
}
