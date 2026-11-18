import { Download, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AdminBarber, AttendanceRow, AuditRow, BarberSummaryRow } from '../../../shared/types';
import { Button } from '../../components/ui/Button';
import { formatDateTime, formatDuration, formatMinutes, KIND_LABEL } from '../../domain/format';
import { pushToast } from '../../hooks/toasts';
import { adminApi } from '../../services/admin/adminService';
import { ApiError } from '../../services/http';

const STATUS_LABEL: Record<AttendanceRow['status'], string> = {
  FINISHED: 'Finalizado',
  IN_PROGRESS: 'Em atendimento',
  CLOSED_BY_SHIFT: 'Encerrado no turno',
  CANCELLED: 'Cancelado',
};

export function HistoryTab({ initialBarberId }: { initialBarberId?: number }) {
  const [view, setView] = useState<'attendances' | 'audit'>('attendances');
  const [barbers, setBarbers] = useState<AdminBarber[]>([]);
  const [barberId, setBarberId] = useState<number | undefined>(initialBarberId);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [summary, setSummary] = useState<BarberSummaryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (initialBarberId !== undefined) setBarberId(initialBarberId);
  }, [initialBarberId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bList, hist, aud] = await Promise.all([
        adminApi.barbers(),
        adminApi.history({ from: from || undefined, to: to || undefined, barberId, limit: 150, offset: 0 }),
        adminApi.audit(100, 0),
      ]);
      setBarbers(bList);
      setRows(hist.rows);
      setSummary(hist.summary);
      setTotal(hist.total);
      setAuditRows(aud.rows);
      setAuditTotal(aud.total);
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Falha ao carregar histórico.');
    } finally {
      setLoading(false);
    }
  }, [from, to, barberId]);

  useEffect(() => {
    void load();
  }, [load]);

  const colorMap = new Map(barbers.map((b) => [b.id, b.color]));

  const setQuickRange = (days: number | 'all') => {
    if (days === 'all') {
      setFrom('');
      setTo('');
      return;
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    setFrom(fmt(start));
    setTo(fmt(end));
  };

  const exportCsv = () => {
    const header = ['ID', 'Barbeiro', 'Turno', 'Tipo', 'Posicao_Fila', 'Inicio', 'Termino', 'Duracao_Segundos', 'Status'];
    const lines = rows.map((r) =>
      [
        r.id,
        `"${r.barberName.replace(/"/g, '""')}"`,
        r.shiftDate,
        KIND_LABEL[r.kind],
        r.queuePosition ?? '',
        formatDateTime(r.startedAt),
        formatDateTime(r.endedAt),
        r.durationSeconds ?? '',
        STATUS_LABEL[r.status] ?? r.status,
      ].join(';'),
    );
    const csv = '\uFEFF' + [header.join(';'), ...lines].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `historico-rodizio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Histórico e Auditoria</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Consulte os atendimentos realizados e o registro de operações.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
            <button
              type="button"
              onClick={() => setView('attendances')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === 'attendances' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                }`}
            >
              Atendimentos ({total})
            </button>
            <button
              type="button"
              onClick={() => setView('audit')}
              data-testid="tab-audit-btn"
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === 'audit' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-900'
                }`}
            >
              Auditoria ({auditTotal})
            </button>
          </div>

          <Button size="sm" variant="ghost" onClick={load} icon={<RefreshCw size={14} />}>
            Atualizar
          </Button>
          {view === 'attendances' && rows.length > 0 && (
            <Button size="sm" variant="secondary" onClick={exportCsv} icon={<Download size={14} />}>
              CSV
            </Button>
          )}
        </div>
      </div>

      {view === 'attendances' ? (
        <>
          {/* Filtros */}
          <section className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
            <div className="min-w-[180px] flex-1">
              <label className="mb-1 block text-xs font-semibold text-zinc-600">Profissional</label>
              <select
                value={barberId ?? ''}
                onChange={(e) => setBarberId(e.target.value ? Number(e.target.value) : undefined)}
                data-testid="history-barber-filter"
                className="field"
              >
                <option value="">Todos os profissionais</option>
                {barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.displayName} {!b.active ? '(Inativo)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600">De</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600">Até</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field" />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => setQuickRange(1)}>
                Hoje
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setQuickRange(7)}>
                7 dias
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setQuickRange(30)}>
                30 dias
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setQuickRange('all');
                  setBarberId(undefined);
                }}
              >
                Limpar
              </Button>
            </div>
          </section>

          {/* Resumo por profissional */}
          {summary.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-200 px-4 py-3">
                <h2 className="text-xs font-bold tracking-[0.12em] text-zinc-900 uppercase">
                  Resumo por profissional
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50 font-semibold text-zinc-500">
                    <tr>
                      <th className="px-4 py-2.5">Profissional</th>
                      <th className="px-4 py-2.5">Finalizados</th>
                      <th className="px-4 py-2.5">Rodízio (1º)</th>
                      <th className="px-4 py-2.5">Preferência</th>
                      <th className="px-4 py-2.5">Média</th>
                      <th className="px-4 py-2.5">Tempo total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {summary.map((s) => (
                      <tr key={s.barberId}>
                        <td
                          className="px-4 py-2.5 text-sm font-bold"
                          style={{ color: colorMap.get(s.barberId) ?? 'var(--color-zinc-900)' }}
                        >
                          {s.barberName}
                        </td>
                        <td className="tabular px-4 py-2.5 font-semibold text-zinc-900">{s.finished}</td>
                        <td className="tabular px-4 py-2.5 text-zinc-600">{s.rotation}</td>
                        <td className="tabular px-4 py-2.5 text-zinc-600">{s.specific}</td>
                        <td className="tabular px-4 py-2.5 text-zinc-600">{formatMinutes(s.avgDurationSeconds)}</td>
                        <td className="tabular px-4 py-2.5 text-zinc-500">{formatMinutes(s.totalSeconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Lista detalhada */}
          <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-4 py-3">
              <h2 className="text-xs font-bold tracking-[0.12em] text-zinc-900 uppercase">
                Atendimentos registrados
              </h2>
            </div>
            {loading ? (
              <div className="p-8 text-center text-xs text-zinc-400">Carregando…</div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-400">Nenhum atendimento encontrado.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs" data-testid="history-table">
                  <thead className="border-b border-zinc-200 bg-zinc-50 font-semibold text-zinc-500">
                    <tr>
                      <th className="px-4 py-2.5">#</th>
                      <th className="px-4 py-2.5">Profissional</th>
                      <th className="px-4 py-2.5">Tipo</th>
                      <th className="px-4 py-2.5">Pos.</th>
                      <th className="px-4 py-2.5">Início</th>
                      <th className="px-4 py-2.5">Término</th>
                      <th className="px-4 py-2.5">Duração</th>
                      <th className="px-4 py-2.5">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="tabular px-4 py-2.5 text-zinc-400">#{r.id}</td>
                        <td
                          className="px-4 py-2.5 text-sm font-bold"
                          style={{ color: colorMap.get(r.barberId) ?? 'var(--color-zinc-900)' }}
                        >
                          {r.barberName}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-600">{KIND_LABEL[r.kind]}</td>
                        <td className="tabular px-4 py-2.5 text-zinc-500">
                          {r.queuePosition ? `${r.queuePosition}º` : '—'}
                        </td>
                        <td className="tabular px-4 py-2.5 text-zinc-600">{formatDateTime(r.startedAt)}</td>
                        <td className="tabular px-4 py-2.5 text-zinc-600">{formatDateTime(r.endedAt)}</td>
                        <td className="tabular px-4 py-2.5 font-semibold text-zinc-900">
                          {formatDuration(r.durationSeconds)}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-500">{STATUS_LABEL[r.status] ?? r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-4 py-3">
            <h2 className="text-xs font-bold tracking-[0.12em] text-zinc-900 uppercase">Registro de auditoria</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="audit-table">
              <thead className="border-b border-zinc-200 bg-zinc-50 font-semibold text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5">ID</th>
                  <th className="px-4 py-2.5">Data / Hora</th>
                  <th className="px-4 py-2.5">Operação</th>
                  <th className="px-4 py-2.5">Profissional</th>
                  <th className="px-4 py-2.5">Origem</th>
                  <th className="px-4 py-2.5">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {auditRows.map((a) => (
                  <tr key={a.id}>
                    <td className="tabular px-4 py-2 text-zinc-400">#{a.id}</td>
                    <td className="tabular px-4 py-2 text-zinc-600">{formatDateTime(a.createdAt)}</td>
                    <td className="px-4 py-2 font-mono font-semibold text-zinc-800">
                      {a.operation}
                      {a.undone && <span className="ml-1.5 text-[0.65rem] text-zinc-400">(desfeita)</span>}
                    </td>
                    <td
                      className="px-4 py-2 font-bold"
                      style={{ color: (a.barberId ? colorMap.get(a.barberId) : null) ?? 'var(--color-zinc-900)' }}
                    >
                      {a.barberName ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-zinc-500">{a.actor}</td>
                    <td className="px-4 py-2 font-mono text-zinc-400">
                      {a.info ? JSON.stringify(a.info) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
