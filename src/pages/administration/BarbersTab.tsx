import { Camera, Check, Edit3, History, Plus, Power, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import type { AdminBarber } from '../../../shared/types';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { BARBER_COLORS, STATE_LABEL } from '../../domain/format';
import { pushToast } from '../../hooks/toasts';
import { adminApi, imageToDataUrl } from '../../services/admin/adminService';
import { ApiError } from '../../services/http';

export function BarbersTab({
  onInspectHistory,
  snapshotVersion,
}: {
  onInspectHistory: (barberId: number) => void;
  snapshotVersion?: number;
}) {
  const [barbers, setBarbers] = useState<AdminBarber[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBarber | null>(null);

  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [color, setColor] = useState<string | null>(BARBER_COLORS[0]);
  const [active, setActive] = useState(true);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setBarbers(await adminApi.barbers());
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Falha ao carregar barbeiros.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, snapshotVersion]);

  const openNew = () => {
    setEditing(null);
    setFullName('');
    setDisplayName('');
    setColor(BARBER_COLORS[barbers.length % BARBER_COLORS.length]);
    setActive(true);
    setPhotoPreview(null);
    setPhotoDataUrl(null);
    setRemovePhoto(false);
    setModalOpen(true);
  };

  const openEdit = (b: AdminBarber) => {
    setEditing(b);
    setFullName(b.fullName);
    setDisplayName(b.displayName);
    setColor(b.color);
    setActive(b.active);
    setPhotoPreview(b.photoUrl);
    setPhotoDataUrl(null);
    setRemovePhoto(false);
    setModalOpen(true);
  };

  const onPickPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await imageToDataUrl(file, 320);
      setPhotoDataUrl(dataUrl);
      setPhotoPreview(dataUrl);
      setRemovePhoto(false);
    } catch {
      pushToast('error', 'Não foi possível processar a imagem.');
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      pushToast('error', 'Informe o nome completo.');
      return;
    }
    const disp = (displayName.trim() || fullName.trim().split(/\s+/)[0]).slice(0, 30);
    setSaving(true);
    try {
      if (editing) {
        await adminApi.updateBarber(editing.id, {
          fullName: fullName.trim(),
          displayName: disp,
          color,
          active,
          photoDataUrl,
          removePhoto,
        });
        pushToast('success', 'Cadastro atualizado.');
      } else {
        await adminApi.createBarber({
          fullName: fullName.trim(),
          displayName: disp,
          color,
          photoDataUrl,
        });
        pushToast('success', 'Profissional cadastrado.');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Falha ao salvar cadastro.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActiveQuick = async (b: AdminBarber) => {
    try {
      await adminApi.updateBarber(b.id, {
        fullName: b.fullName,
        displayName: b.displayName,
        color: b.color,
        active: !b.active,
      });
      await load();
    } catch (err) {
      pushToast('error', err instanceof ApiError ? err.message : 'Falha ao alterar situação.');
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-zinc-900 sm:text-xl">Profissionais</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Cadastre os colaboradores e defina a cor individual do nome de cada barbeiro.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void load()}
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            title="Atualizar lista"
            className="h-10 border border-zinc-200 sm:h-8 sm:border-0"
          >
            Atualizar
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={openNew}
            icon={<Plus size={15} />}
            data-testid="admin-new-barber-btn"
            className="h-10 flex-1 sm:h-8 sm:flex-initial"
          >
            Novo profissional
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-zinc-400">Carregando…</div>
      ) : barbers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center sm:p-10">
          <p className="text-sm font-semibold text-zinc-700">Nenhum profissional cadastrado.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void load()} icon={<RefreshCw size={14} />}>
              Atualizar lista
            </Button>
            <Button size="sm" variant="primary" onClick={openNew} icon={<Plus size={15} />}>
              Cadastrar profissional
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="divide-y divide-zinc-200">
            {barbers.map((b) => (
              <div
                key={b.id}
                data-testid={`admin-barber-card-${b.displayName}`}
                className={`flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 ${
                  b.active ? 'bg-white' : 'bg-zinc-50 opacity-60'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3 sm:gap-3.5">
                  <Avatar name={b.displayName} photoUrl={b.photoUrl} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {b.color && (
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                      )}
                      <span
                        className="truncate text-base font-bold"
                        style={{ color: b.color ?? 'var(--color-zinc-900)' }}
                      >
                        {b.displayName}
                      </span>
                      <span className="shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-[0.65rem] font-semibold text-zinc-600 uppercase">
                        {STATE_LABEL[b.state]}
                      </span>
                    </div>
                    <div className="truncate text-xs text-zinc-400">
                      {b.fullName} · {b.totalAttendances} atendimento{b.totalAttendances === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 sm:flex sm:shrink-0 sm:items-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onInspectHistory(b.id)}
                    icon={<History size={14} />}
                    className="h-9 border border-zinc-200 px-2 sm:h-8 sm:border-0 sm:px-3"
                  >
                    Histórico
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleActiveQuick(b)}
                    icon={<Power size={14} />}
                    data-testid={`toggle-active-${b.displayName}`}
                    className="h-9 border border-zinc-200 px-2 sm:h-8 sm:border-0 sm:px-3"
                  >
                    {b.active ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openEdit(b)}
                    icon={<Edit3 size={14} />}
                    data-testid={`edit-barber-${b.displayName}`}
                    className="h-9 px-2 sm:h-8 sm:px-3"
                  >
                    Editar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de cadastro/edição */}
      <Sheet
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        placement="center"
        title={
          <div className="text-base font-bold text-zinc-900">
            {editing ? `Editar: ${editing.displayName}` : 'Novo profissional'}
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <Avatar name={displayName || fullName || 'B'} photoUrl={photoPreview} size={48} />
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50">
                <Camera size={14} /> Foto
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onPickPhoto} className="hidden" />
              </label>
              {photoPreview && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPhotoPreview(null);
                    setPhotoDataUrl(null);
                    setRemovePhoto(true);
                  }}
                  icon={<Trash2 size={13} />}
                >
                  Remover
                </Button>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600">Nome completo *</label>
            <input
              type="text"
              required
              maxLength={120}
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (!editing && !displayName) {
                  setDisplayName(e.target.value.trim().split(/\s+/)[0] ?? '');
                }
              }}
              placeholder="Ex.: João Paulo Silva"
              data-testid="barber-fullname-input"
              className="field"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-zinc-600">Nome de exibição *</label>
            <input
              type="text"
              required
              maxLength={30}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex.: João"
              data-testid="barber-displayname-input"
              className="field"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-600">
              Cor do nome do colaborador
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {BARBER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="grid h-7 w-7 place-items-center rounded-full transition"
                  style={{
                    backgroundColor: c,
                    outline: color === c ? '2px solid #09090b' : 'none',
                    outlineOffset: '2px',
                  }}
                >
                  {color === c && <Check size={13} className="text-white" />}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setColor(null)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                  color === null ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 text-zinc-600'
                }`}
              >
                Preto padrão
              </button>
            </div>
          </div>

          {editing && (
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs font-medium text-zinc-700">Situação no rodízio</div>
              <button
                type="button"
                onClick={() => setActive((a) => !a)}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${
                  active ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-600'
                }`}
              >
                {active ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" variant="primary" disabled={saving} data-testid="barber-save-btn">
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
