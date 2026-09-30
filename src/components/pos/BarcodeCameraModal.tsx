import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, Zap, AlertCircle } from 'lucide-react';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [manualCode, setManualCode] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCamera();

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setErrorMsg('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not supported by browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setHasPermission(true);
        initBarcodeDetector();
      }
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      setHasPermission(false);
      setErrorMsg(err.message || 'Unable to access device camera. Please allow permissions.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const initBarcodeDetector = () => {
    if ('BarcodeDetector' in window) {
      const barcodeDetector = new (window as any).BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a'],
      });

      const detectInterval = setInterval(async () => {
        if (!videoRef.current || !isScanning || videoRef.current.readyState < 2) return;
        try {
          const barcodes = await barcodeDetector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            clearInterval(detectInterval);
            setIsScanning(false);
            onDetected(rawValue);
            onClose();
          }
        } catch {
          // ignore frames where nothing detected
        }
      }, 250);

      return () => clearInterval(detectInterval);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 text-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-sm">Scan Product Barcode</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder Area */}
        <div className="relative w-full h-72 bg-black flex items-center justify-center overflow-hidden">
          {hasPermission ? (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
              />
              {/* Laser Target Reticle */}
              <div className="absolute inset-x-8 top-16 bottom-16 border-2 border-blue-400/80 rounded-xl pointer-events-none flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                <div className="w-full h-0.5 bg-red-500 animate-pulse" />
              </div>
              <div className="absolute bottom-2 text-xs text-slate-300 bg-black/60 px-3 py-1 rounded-full">
                Align barcode inside the blue box
              </div>
            </>
          ) : (
            <div className="p-6 text-center">
              <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-slate-300 mb-2">Camera permission required or device unavailable.</p>
              <p className="text-xs text-slate-500 mb-4">{errorMsg}</p>
              <button
                onClick={startCamera}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 rounded-lg text-xs font-medium text-white hover:bg-blue-500"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Camera
              </button>
            </div>
          )}
        </div>

        {/* Quick Demo Scans & Manual Input */}
        <div className="p-4 bg-slate-800/80 border-t border-slate-700 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Or enter barcode / SKU manually..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualCode.trim()) {
                  onDetected(manualCode.trim());
                  onClose();
                }
              }}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
            />
            <button
              onClick={() => {
                if (manualCode.trim()) {
                  onDetected(manualCode.trim());
                  onClose();
                }
              }}
              className="px-3 py-2 bg-blue-600 rounded-lg text-xs font-semibold text-white hover:bg-blue-500 transition"
            >
              Add
            </button>
          </div>

          <div>
            <div className="text-[11px] text-slate-400 mb-1.5">Quick Barcode Simulator (Click to test):</div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { code: '8901030384712', name: 'Tata Salt' },
                { code: '8906007280014', name: 'Fortune Oil' },
                { code: '8901736128491', name: 'Havells LED' },
                { code: '8904257100422', name: 'Syska PB' },
              ].map((b) => (
                <button
                  key={b.code}
                  onClick={() => {
                    onDetected(b.code);
                    onClose();
                  }}
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px] text-slate-200 transition font-mono"
                >
                  {b.name} ({b.code.slice(-4)})
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
