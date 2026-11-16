import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const updateFnRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    try {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          setUpdateAvailable(true);
        },
        onOfflineReady() {
          // Offline cache ready silently without interrupting gameplay
        },
        onRegisterError() {
          // Ignore registration errors in restricted preview/private browsing contexts
        },
      });
      updateFnRef.current = updateSW;
    } catch {
      // Service worker unsupported or blocked
    }
  }, []);

  const applyUpdate = useCallback(() => {
    if (updateFnRef.current) {
      setUpdateAvailable(false);
      void updateFnRef.current(true);
    } else {
      window.location.reload();
    }
  }, []);

  return {
    updateAvailable,
    applyUpdate,
  };
}
