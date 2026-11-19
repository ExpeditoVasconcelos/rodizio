import { dismissToast, useToasts } from '../../hooks/toasts';

export function Toasts() {
  const toasts = useToasts();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-16 z-[80] flex flex-col items-center gap-2 px-4 md:top-14"
      aria-live="assertive"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className="animate-slide-up pointer-events-auto flex max-w-[min(92vw,540px)] items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-left text-xs font-medium text-white shadow-lg"
        >
          <span>{t.text}</span>
        </button>
      ))}
    </div>
  );
}
