import React from 'react';

interface OfflineBannerProps {
  isOnline: boolean;
  pendingSyncCount: number;
}

// Floating sync bar / offline banner completely removed as requested
// Sync status is already cleanly visible in the top navbar / header
export const OfflineBanner: React.FC<OfflineBannerProps> = () => {
  return null;
};

