import { BEAR_LOGO_PATH } from './bearLogoPath';
import { cn } from './Button';

/**
 * Logo oficial vetorizada "Barba de Urso".
 * Caso o administrador envie outra imagem customizada, exibe a imagem enviada.
 */
export function Logo({ url, size = 34, className }: { url?: string | null; size?: number; className?: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt="Barba de Urso"
        draggable={false}
        className={cn('shrink-0 rounded-lg border border-zinc-200 object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-lg bg-zinc-900 text-white',
        className,
      )}
      style={{ width: size, height: size }}
      aria-label="Barba de Urso"
    >
      <svg
        viewBox="0 0 512 512"
        style={{ width: Math.round(size * 0.86), height: Math.round(size * 0.86) }}
        fill="none"
        aria-hidden
      >
        <path fill="currentColor" fillRule="evenodd" d={BEAR_LOGO_PATH} />
      </svg>
    </div>
  );
}
