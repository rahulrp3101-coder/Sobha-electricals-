import { useEffect, useRef } from 'react';

interface BarcodeScannerOptions {
  onScan: (barcode: string) => void;
  minChars?: number;
  maxIntervalMs?: number; // threshold between keystrokes in ms (typically 10-60ms for hardware scanners)
}

/**
 * Global Hardware Barcode Scanner Listener:
 * Intercepts rapid keyboard-emulated keystrokes from USB / Wireless / Bluetooth scanners
 * ending with 'Enter', whether an input is focused or not.
 */
export function useBarcodeScanner({ 
  onScan, 
  minChars = 3, 
  maxIntervalMs = 90 
}: BarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const scanStartRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore functional modifier keys (Ctrl, Alt, Meta)
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;

      const now = Date.now();
      const interval = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      const target = e.target as HTMLElement | null;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      // Hardware Scanner sends 'Enter' at the end of the barcode sequence
      if (e.key === 'Enter') {
        const totalDuration = now - scanStartRef.current;
        const scannedCode = bufferRef.current.trim();
        const codeLen = scannedCode.length;

        // Verify that this was an automated barcode scanner:
        // 1. Minimum character length (typically >= 3 characters)
        // 2. Average keystroke interval is rapid (<= maxIntervalMs or total rapid burst < 700ms)
        const isRapidScan = codeLen >= minChars && (totalDuration / codeLen <= maxIntervalMs || totalDuration < 700);

        if (isRapidScan) {
          e.preventDefault();
          e.stopPropagation();

          // If the scanner typed into an active input, clean it up so barcode digits don't linger
          if (isInput && target instanceof HTMLInputElement) {
            if (target.value === scannedCode || target.value.endsWith(scannedCode) || target.value.includes(scannedCode)) {
              target.value = target.value.replace(scannedCode, '').trim();
              target.dispatchEvent(new Event('input', { bubbles: true }));
              target.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }

          bufferRef.current = '';
          onScan(scannedCode);
          return;
        }

        bufferRef.current = '';
        return;
      }

      // If delay between consecutive keys is too slow, user is manually typing by hand
      if (interval > maxIntervalMs) {
        // Start fresh scan candidate buffer
        bufferRef.current = '';
        scanStartRef.current = now;
      }

      // Capture single printable characters
      if (e.key.length === 1) {
        if (bufferRef.current.length === 0) {
          scanStartRef.current = now;
        }
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onScan, minChars, maxIntervalMs]);
}

