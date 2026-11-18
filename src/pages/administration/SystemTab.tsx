import {
  Camera,
  Copy,
  Database,
  Download,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import type { BackupInfo, SystemInfo } from '../../../shared/types';
import { Button } from '../../components/ui/Button';
import { Logo } from '../../components/ui/Logo';
import { formatDateTime } from '../../domain/format';
import { pushToast } from '../../hooks/toasts';
import { adminApi, imageToDataUrl } from '../../services/admin/adminService';
import { ApiError } from '../../services/http';

export function SystemTab() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [shopName, setShopName] = useState('');
  const [undoWindow, setUndoWindow] = useState(90);
  const [savingSettings, setSavingSettings] = useState(false);

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sys, bks] = await Promise.all([adminApi.system(), adminApi.backups()]);
      setInfo(sys);
      setShopName(sys.settings.shopName);
      setUndoWindow(sys.settings.undoWindowSeconds);
      setBackups(bks);
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Falha ao carregar configurações.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await adminApi.saveSettings({ shopName, undoWindowSeconds: undoWindow });
      pushToast('success', 'Configurações salvas.');
      await load();
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Falha ao salvar.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleLogoPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await imageToDataUrl(file, 256);
      await adminApi.setLogo(dataUrl);
      pushToast('success', 'Logotipo atualizado.');
      await load();
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Falha ao enviar logotipo.');
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await adminApi.setLogo(null);
      await load();
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Falha ao remover logotipo.');
    }
  };

  const handleChangePin = async (e: FormEvent) => {
    e.preventDefault();
    setSavingPin(true);
    try {
      await adminApi.changePin(currentPin, newPin);
      setCurrentPin('');
      setNewPin('');
      pushToast('success', 'PIN atualizado.');
      await load();
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Falha ao alterar o PIN.');
    } finally {
      setSavingPin(false);
    }
  };

  const handleCreateBackup = async () => {
    setBackupBusy(true);
    try {
      setBackups(await adminApi.createBackup());
      pushToast('success', 'Backup criado.');
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Falha ao criar backup.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleSwitchMode = async (mode: 'real' | 'demo') => {
    try {
      await adminApi.setMode(mode);
      await load();
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Falha ao alterar modo.');
    }
  };

  const handleResetDemo = async () => {
    try {
      await adminApi.resetDemo();
      pushToast('success', 'Demonstração reiniciada.');
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Falha ao reiniciar demonstração.');
    }
  };

  const primaryLan = info?.addresses[0];
  const tabletUrl = primaryLan ? `${primaryLan.url}/painel` : `${location.origin}/painel`;

  const copyUrl = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast('info', 'Endereço copiado.');
    } catch {
      pushToast('info', text);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200 pb-5">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">Sistema, Rede e Backup</h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Conecte o dispositivo móvel na rede Wi-Fi, configure o estabelecimento e gerencie backups locais.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Acesso pelo dispositivo móvel */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-xs font-bold tracking-[0.12em] text-zinc-900 uppercase">
            Acesso pelo tablet / celular na rede local
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Conecte o dispositivo ao mesmo Wi-Fi deste computador (porta {info?.port ?? 3000}).
          </p>

          <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
            <div className="shrink-0 rounded-xl border border-zinc-200 bg-white p-3">
              <QRCodeSVG value={tabletUrl} size={124} level="M" />
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-[0.65rem] font-semibold text-zinc-400 uppercase">Endereço do painel</div>
                <div className="mt-0.5 break-all font-mono text-sm font-bold text-zinc-900" data-testid="lan-tablet-url">
                  {tabletUrl}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void copyUrl(tabletUrl)}
                  icon={<Copy size={13} />}
                  className="mt-2"
                >
                  Copiar endereço
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Configurações do estabelecimento */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-xs font-bold tracking-[0.12em] text-zinc-900 uppercase">Estabelecimento</h2>

          <div className="mt-3 flex items-center gap-3">
            <Logo url={info?.settings.logoUrl} size={40} />
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50">
              <Camera size={14} /> Logotipo
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoPick} className="hidden" />
            </label>
            {info?.settings.logoUrl && (
              <Button size="sm" variant="ghost" onClick={handleRemoveLogo} icon={<Trash2 size={13} />}>
                Remover
              </Button>
            )}
          </div>

          <form onSubmit={handleSaveSettings} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600">Nome da barbearia</label>
              <input
                type="text"
                required
                maxLength={60}
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                data-testid="settings-shopname-input"
                className="field"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-zinc-600">
                Tempo para desfazer ação (segundos)
              </label>
              <input
                type="number"
                min={5}
                max={600}
                value={undoWindow}
                onChange={(e) => setUndoWindow(Number(e.target.value))}
                className="field"
              />
            </div>

            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={savingSettings}
              icon={<Save size={14} />}
              data-testid="settings-save-btn"
            >
              {savingSettings ? 'Salvando…' : 'Salvar'}
            </Button>
          </form>
        </section>

        {/* Modo de operação e PIN */}
        <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-5">
          <div>
            <h2 className="text-xs font-bold tracking-[0.12em] text-zinc-900 uppercase">
              Modo de operação
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              alterne entre o banco oficial e o banco de demonstração.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={info?.mode === 'real' ? 'primary' : 'secondary'}
                onClick={() => void handleSwitchMode('real')}
              >
                Operação real
              </Button>
              <Button
                size="sm"
                variant={info?.mode === 'demo' ? 'primary' : 'secondary'}
                onClick={() => void handleSwitchMode('demo')}
              >
                Demonstração
              </Button>
              <Button size="sm" variant="ghost" onClick={handleResetDemo} icon={<RotateCcw size={13} />}>
                Reiniciar demo
              </Button>
            </div>
          </div>

          <hr className="border-zinc-200" />

          <form onSubmit={handleChangePin} className="space-y-3">
            <h2 className="text-xs font-bold tracking-[0.12em] text-zinc-900 uppercase">Alterar PIN da recepção</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600">PIN atual</label>
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  placeholder="••••"
                  className="field font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-600">Novo PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                  placeholder="••••"
                  className="field font-mono"
                />
              </div>
            </div>
            <Button type="submit" size="sm" variant="secondary" disabled={savingPin || newPin.length < 4}>
              {savingPin ? 'Alterando…' : 'Atualizar PIN'}
            </Button>
          </form>
        </section>

        {/* Backups */}
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-[0.12em] text-zinc-900 uppercase">Backups (SQLite)</h2>
            <Button
              size="sm"
              variant="primary"
              disabled={backupBusy}
              onClick={handleCreateBackup}
              icon={<Database size={14} />}
              data-testid="create-backup-btn"
            >
              {backupBusy ? 'Gerando…' : 'Criar backup'}
            </Button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Cópias locais salvas automaticamente em <code className="text-zinc-700">data/backups</code>.
          </p>

          <div className="mt-3 max-h-56 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200">
            {backups.length === 0 ? (
              <div className="p-5 text-center text-xs text-zinc-400">Nenhum backup listado.</div>
            ) : (
              backups.map((b) => (
                <div key={b.name} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-mono font-medium text-zinc-800">{b.name}</div>
                    <div className="text-zinc-400">
                      {formatDateTime(b.createdAt)} · {(b.sizeBytes / 1024).toFixed(0)} KB
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void adminApi.downloadBackup(b.name)}
                    icon={<Download size={13} />}
                  >
                    Baixar
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
