import { useEffect, useState, useCallback } from 'react';
import { getPendingSyncCount, processSyncQueue } from '../db/indexedDB';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Just now');

  const refreshSyncCount = useCallback(async () => {
    try {
      const count = await getPendingSyncCount();
      setPendingSyncCount(count);
    } catch {
      // ignore
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await processSyncQueue();
      if (res.syncedCount > 0) {
        setLastSyncTime(new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' }));
      }
      await refreshSyncCount();
    } catch (err) {
      console.warn('Sync attempt completed with warnings:', err);
    } finally {
      setIsSyncing(false);
      await refreshSyncCount();
    }
  }, [isSyncing, refreshSyncCount]);

  useEffect(() => {
    refreshSyncCount();

    const handleOnline = () => {
      setIsOnline(true);
      // Automatically trigger sync when network reconnects (Requirement 4)
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check for pending changes every 4 seconds
    const interval = setInterval(() => {
      refreshSyncCount();
    }, 4000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [refreshSyncCount, triggerSync]);

  return {
    isOnline,
    pendingSyncCount,
    isSyncing,
    lastSyncTime,
    triggerSync,
    refreshSyncCount,
  };
}
