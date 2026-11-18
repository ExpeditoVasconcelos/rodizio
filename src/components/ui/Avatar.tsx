import { initials } from '../../domain/format';
import { cn } from './Button';

interface Props {
  name: string;
  photoUrl?: string | null;
  color?: string | null;
  size?: number;
  className?: string;
}

/** Avatar monocromático minimalista (foto ou iniciais em escala de cinza). */
export function Avatar({ name, photoUrl, size = 40, className }: Props) {
  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-zinc-700',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <span
          className="grid h-full w-full place-items-center font-sans font-semibold tracking-tight text-zinc-700"
          style={{ fontSize: Math.max(11, Math.round(size * 0.36)) }}
        >
          {initials(name)}
        </span>
      )}
    </div>
  );
}
