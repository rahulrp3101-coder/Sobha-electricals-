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
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      const res = await processSyncQueue();
      if (res.syncedCount > 0) {
        setLastSyncTime(new Date().toLocaleTimeString());
      }
      await refreshSyncCount();
    } catch (err) {
      console.error('Sync failed', err);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshSyncCount]);

  useEffect(() => {
    refreshSyncCount();

    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic check
    const interval = setInterval(() => {
      refreshSyncCount();
    }, 5000);

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
