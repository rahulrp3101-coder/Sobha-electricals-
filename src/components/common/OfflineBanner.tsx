import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

interface OfflineBannerProps {
  isOnline: boolean;
  pendingSyncCount: number;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  isOnline,
  pendingSyncCount,
}) => {
  if (isOnline && pendingSyncCount === 0) return null;

  if (!isOnline) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xl border border-amber-500 animate-in slide-in-from-bottom-2">
        <WifiOff className="w-4 h-4 animate-pulse" />
        <span>Offline Mode — All invoices saved locally in IndexedDB ({pendingSyncCount} pending sync)</span>
      </div>
    );
  }

  if (pendingSyncCount > 0) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xl border border-blue-500 animate-in slide-in-from-bottom-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>Syncing {pendingSyncCount} offline records to cloud database...</span>
      </div>
    );
  }

  return null;
};
