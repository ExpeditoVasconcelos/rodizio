import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'queue' | 'work';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-zinc-900 text-white hover:bg-zinc-800 active:bg-black',
  secondary: 'bg-white text-zinc-900 border border-zinc-300 hover:bg-zinc-50 active:bg-zinc-100',
  ghost: 'bg-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 active:bg-zinc-200',
  danger: 'bg-white text-zinc-900 border border-zinc-300 hover:bg-zinc-100 active:bg-zinc-200',
  queue: 'bg-zinc-900 text-white hover:bg-zinc-800 active:bg-black',
  work: 'bg-zinc-900 text-white hover:bg-zinc-800 active:bg-black',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: ReactNode;
}

const SIZES = {
  sm: 'min-h-9 px-3 text-xs rounded-lg gap-1.5',
  md: 'min-h-10 px-4 text-sm rounded-lg gap-2',
  lg: 'min-h-12 px-5 text-sm rounded-xl gap-2',
  xl: 'min-h-14 px-6 text-base rounded-xl gap-2.5',
};

export function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors disabled:opacity-40',
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
