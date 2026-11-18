import { Maximize2 } from 'lucide-react';
import { Button } from '../ui/Button';

interface Props {
  supported: boolean;
  logoUrl?: string | null;
  onEnter: () => void;
  onSkip: () => void;
}

/** Abertura limpa em fundo branco para ativar tela cheia no dispositivo móvel. */
export function FullscreenGate({ supported, onEnter, onSkip }: Props) {
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-white p-6" data-testid="fullscreen-gate">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Painel de Rodízio</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Ative a tela cheia para exibir exclusivamente as duas tabelas de operação.
          </p>
        </div>

        {supported ? (
          <>
            <Button
              size="lg"
              variant="primary"
              icon={<Maximize2 size={18} />}
              onClick={onEnter}
              className="w-full"
              data-testid="enter-fullscreen"
            >
              Entrar em tela cheia
            </Button>
            <Button size="sm" variant="ghost" onClick={onSkip} data-testid="skip-fullscreen">
              Continuar sem tela cheia
            </Button>
          </>
        ) : (
          <Button size="lg" variant="primary" onClick={onSkip} className="w-full" data-testid="skip-fullscreen">
            Abrir painel
          </Button>
        )}
      </div>
    </div>
  );
}
