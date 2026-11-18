import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { cn } from './Button';

export function ThemeToggle({ showLabel = false, className }: { showLabel?: boolean; className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      data-testid="theme-toggle"
      title={isDark ? 'Alternar para modo claro (branco)' : 'Alternar para modo escuro'}
      aria-label={isDark ? 'Alternar para modo claro' : 'Alternar para modo escuro'}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900',
        showLabel ? 'px-3 py-2' : 'h-8 w-8 justify-center',
        className,
      )}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
      {showLabel && <span>{isDark ? 'Modo claro' : 'Modo escuro'}</span>}
    </button>
  );
}
