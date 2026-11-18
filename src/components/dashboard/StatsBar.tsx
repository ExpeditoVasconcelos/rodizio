import type { ReactNode } from 'react';
import { Activity, Scissors, Timer, UserCheck, Users } from 'lucide-react';
import type { StatsView } from '../../../shared/types';
import { formatMinutes } from '../../domain/format';

function Tile({ icon, label, value, color }: { icon: ReactNode; label: string; value: ReactNode; color: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-white/[0.04] px-3.5 py-2">
      <span className={color}>{icon}</span>
      <div className="min-w-0 leading-none">
        <div className="tabular font-display text-[1.7rem] font-bold text-white">{value}</div>
        <div className="mt-0.5 truncate text-[0.6rem] font-bold tracking-[0.16em] text-zinc-500">{label}</div>
      </div>
    </div>
  );
}

/** Área de informações: números pequenos, sem sobrecarregar o quadro. */
export function StatsBar({ stats }: { stats: StatsView }) {
  return (
    <div className="grid shrink-0 grid-cols-5 gap-2 portrait:grid-cols-3" data-testid="stats">
      <Tile icon={<Users size={20} />} label="DISPONÍVEIS" value={stats.waiting} color="text-queue" />
      <Tile icon={<Scissors size={20} />} label="EM ATENDIMENTO" value={stats.working} color="text-work" />
      <Tile icon={<UserCheck size={20} />} label="BARBEIROS ATIVOS" value={stats.activeBarbers} color="text-brass-400" />
      <Tile icon={<Timer size={20} />} label="DURAÇÃO MÉDIA" value={formatMinutes(stats.avgDurationSeconds)} color="text-rest" />
      <Tile icon={<Activity size={20} />} label="ATENDIDOS HOJE" value={stats.completedToday} color="text-zinc-300" />
    </div>
  );
}

