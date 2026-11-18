import { Scissors } from 'lucide-react';
import { cn } from './Button';

export function Logo({ url, size = 32, className }: { url?: string | null; size?: number; className?: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        draggable={false}
        className={cn('shrink-0 rounded-lg border border-zinc-200 object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn('grid shrink-0 place-items-center rounded-lg bg-zinc-900 text-white', className)}
      style={{ width: size, height: size }}
    >
      <Scissors size={Math.round(size * 0.5)} strokeWidth={2} />
    </div>
  );
}
