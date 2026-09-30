import { useEffect, useRef } from 'react';

interface BarcodeScannerOptions {
  onScan: (barcode: string) => void;
  minChars?: number;
  maxIntervalMs?: number;
}

/**
 * Listens for hardware USB barcode scanner keyboard-emulated input.
 * USB scanners emit characters with extremely low inter-character intervals (<30ms),
 * followed by an Enter key.
 */
export function useBarcodeScanner({ onScan, minChars = 4, maxIntervalMs = 50 }: BarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is intentionally typing into a regular text input or textarea
      // unless it's the barcode scanner input or key speed indicates scanner
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      const now = Date.now();
      const interval = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= minChars) {
          const scannedCode = bufferRef.current.trim();
          bufferRef.current = '';
          onScan(scannedCode);
          if (isInput) {
            e.preventDefault();
          }
        }
        bufferRef.current = '';
        return;
      }

      // If characters come slower than maxIntervalMs, reset buffer (user is typing slowly by hand)
      if (interval > maxIntervalMs && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      // Only capture printable ASCII characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onScan, minChars, maxIntervalMs]);
}
