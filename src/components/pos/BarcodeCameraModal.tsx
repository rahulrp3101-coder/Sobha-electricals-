import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, Zap, AlertCircle, Check } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface BarcodeCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
}

export const BarcodeCameraModal: React.FC<BarcodeCameraModalProps> = ({
  isOpen,
  onClose,
  onDetected,
}) => {
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [manualCode, setManualCode] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const scannerId = 'barcode-reader-viewport';

    const startScanner = async () => {
      setIsInitializing(true);
      setErrorMsg('');

      try {
        // Wait for DOM element
        await new Promise((r) => setTimeout(r, 150));
        if (!isMounted) return;

        const html5QrCode = new Html5Qrcode(scannerId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          verbose: false,
        });

        scannerRef.current = html5QrCode;

        const config = {
          fps: 15,
          qrbox: { width: 260, height: 180 },
          aspectRatio: 1.333333,
        };

        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            if (isMounted) {
              stopScanner();
              onDetected(decodedText.trim());
              onClose();
            }
          },
          () => {
            // Frame scan failure - expected while seeking barcode
          }
        );

        if (isMounted) {
          isStartedRef.current = true;
          setIsInitializing(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('html5-qrcode scanner start error:', err);
          setIsInitializing(false);
          setErrorMsg(err?.message || 'कैमरा शुरू नहीं हो सका। कृपया कैमरा परमिशन (Permission) दें या नीचे बारकोड नंबर डालें।');
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [isOpen]);

  const stopScanner = async () => {
    if (scannerRef.current && isStartedRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // ignore
      } finally {
        isStartedRef.current = false;
        scannerRef.current = null;
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    stopScanner();
    onDetected(manualCode.trim());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 text-white shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Camera className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">कैमरा बारकोड स्कैनर</h3>
              <p className="text-[10px] text-slate-400">सामान के बारकोड को कैमरे के सामने लाएं</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopScanner();
              onClose();
            }}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport Box */}
        <div className="relative bg-black w-full min-h-[280px] flex items-center justify-center overflow-hidden">
          <div id="barcode-reader-viewport" className="w-full h-full" />

          {/* Initializing Spinner */}
          {isInitializing && !errorMsg && (
            <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center p-4 text-center space-y-2 z-10">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-xs font-semibold text-slate-300">कैमरा लोड हो रहा है...</p>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center space-y-3 z-10">
              <AlertCircle className="w-10 h-10 text-amber-500" />
              <div className="text-xs text-slate-300 leading-relaxed">{errorMsg}</div>
              <p className="text-[11px] text-slate-400">आप नीचे दिए गए बॉक्स में बारकोड या SKU टाइप कर सकते हैं।</p>
            </div>
          )}
        </div>

        {/* Manual Barcode / SKU Entry Fallback */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="बारकोड या SKU टाइप करें..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0"
            >
              <span>जोड़ें</span>
              <Check className="w-3.5 h-3.5" />
            </button>
          </form>

          <p className="text-[10px] text-center text-slate-500">
            EAN-13, EAN-8, Code-128, Code-39, UPC और QR कोड समर्थित हैं।
          </p>
        </div>
      </div>
    </div>
  );
};
