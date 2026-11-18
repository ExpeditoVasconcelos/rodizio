import { useCallback, useEffect, useState } from 'react';

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void>;
};
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

function currentElement(): Element | null {
  const d = document as FsDoc;
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

function supported(): boolean {
  const d = document as FsDoc;
  return !!(document.fullscreenEnabled || d.webkitFullscreenEnabled);
}

/** Fullscreen API com tratamento de navegadores incompatíveis. Só pode ser acionada por um toque do usuário. */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => !!currentElement());
  const isSupported = supported();

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!currentElement());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const enter = useCallback(async (): Promise<boolean> => {
    const el = document.documentElement as FsEl;
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      else return false;
      return true;
    } catch {
      return false;
    }
  }, []);

  const exit = useCallback(async () => {
    const d = document as FsDoc;
    try {
      if (document.exitFullscreen && document.fullscreenElement) await document.exitFullscreen();
      else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
    } catch {
      /* ignore */
    }
  }, []);

  return { isSupported, isFullscreen, enter, exit };
}

