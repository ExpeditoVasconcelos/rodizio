import { ArrowLeft, Delete, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Toasts } from '../../components/ui/Toasts';
import { pushToast } from '../../hooks/toasts';
import { adminApi } from '../../services/admin/adminService';
import { ApiError } from '../../services/http';

export function PinLoginView({ onSuccess }: { onSuccess: (mustChangePin: boolean) => void }) {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!pin.trim() || busy) return;
    setBusy(true);
    try {
      const res = await adminApi.login(pin.trim());
      onSuccess(res.mustChangePin);
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Não foi possível autenticar.');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const appendDigit = (d: string) => {
    if (pin.length < 12) setPin((p) => p + d);
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-zinc-50 p-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={() => navigate('/')} icon={<ArrowLeft size={14} />}>
            Início
          </Button>
          <span className="text-xs font-medium text-zinc-400">Recepção</span>
        </div>

        <div className="mt-4 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-zinc-100 text-zinc-700">
            <Lock size={18} />
          </div>
          <h1 className="mt-3 text-lg font-bold text-zinc-900">Acesso Administrativo</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Informe o PIN da recepção (padrão inicial: <code className="font-semibold text-zinc-800">1234</code>).
          </p>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
            placeholder="••••"
            data-testid="admin-pin-input"
            className="field text-center font-mono text-lg tracking-[0.35em]"
          />

          <div className="grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => appendDigit(d)}
                className="h-10 rounded-lg border border-zinc-200 bg-white text-sm font-semibold text-zinc-900 hover:bg-zinc-50 active:bg-zinc-100"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin('')}
              className="h-10 rounded-lg border border-zinc-200 bg-white text-[0.7rem] font-semibold text-zinc-500 hover:bg-zinc-50"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => appendDigit('0')}
              className="h-10 rounded-lg border border-zinc-200 bg-white text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPin((p) => p.slice(0, -1))}
              aria-label="Apagar"
              className="grid h-10 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            >
              <Delete size={16} />
            </button>
          </div>

          <Button
            type="submit"
            size="md"
            variant="primary"
            disabled={busy || pin.length < 4}
            data-testid="admin-pin-submit"
            className="w-full"
          >
            {busy ? 'Verificando…' : 'Entrar'}
          </Button>
        </form>
      </div>
      <Toasts />
    </div>
  );
}
