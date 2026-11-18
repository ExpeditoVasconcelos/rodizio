import { Loader2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { UndoInfo } from '../../../shared/types';
import { operationPhrase } from '../../domain/format';
import { pushToast } from '../../hooks/toasts';
import { ApiError } from '../../services/http';
import { queueService } from '../../services/queue/queueService';

/** Aviso discreto de "Desfazer última ação". */
export function UndoPill({ undo, now }: { undo: UndoInfo | null; now: number }) {
  const [busy, setBusy] = useState(false);
  if (!undo || undo.expiresAt <= now) return null;
  const left = Math.max(0, Math.ceil((undo.expiresAt - now) / 1000));

  const doUndo = async () => {
    setBusy(true);
    try {
      await queueService.undo(undo.auditId);
      pushToast('success', 'Ação desfeita.');
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Não foi possível desfazer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-1.5 text-xs"
      data-testid="undo-pill"
    >
      <div className="truncate text-zinc-600">
        Última ação: <span className="font-semibold text-zinc-900">{undo.barberName}</span>{' '}
        {operationPhrase(undo.operation)}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={doUndo}
        className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-300 bg-white px-2.5 py-0.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 disabled:opacity-40"
      >
        {busy ? <Loader2 className="animate-spin" size={12} /> : <Undo2 size={12} />}
        Desfazer <span className="tabular text-zinc-400">{left}s</span>
      </button>
    </div>
  );
}
