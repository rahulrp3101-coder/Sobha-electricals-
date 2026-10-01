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
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-xl border border-amber-500 animate-in slide-in-from-bottom-2">
        <WifiOff className="w-4 h-4 animate-pulse shrink-0 text-amber-200" />
        <span>
          🟡 ऑफ़लाइन - {pendingSyncCount} पेंडिंग बदलाव (वापस ऑनलाइन आने पर स्वतः सिंक होंगे)
        </span>
      </div>
    );
  }

  if (pendingSyncCount > 0) {
    return (
      <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-xl border border-blue-500 animate-in slide-in-from-bottom-2">
        <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-blue-200" />
        <span>
          🔵 सिंक हो रहा है... ({pendingSyncCount} पेंडिंग रिकॉर्ड्स Supabase क्लाउड पर जा रहे हैं)
        </span>
      </div>
    );
  }

  return null;
};
