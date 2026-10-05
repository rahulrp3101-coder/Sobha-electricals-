import React, { useEffect, useRef, useState, Component, ErrorInfo, ReactNode } from 'react';
import { Camera, X, RefreshCw, AlertCircle, Check, ShieldAlert, ArrowRight } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

// ============================================================================
// 1. SCANNER ERROR BOUNDARY (Fallback UI to prevent White Screen Crashes)
// ============================================================================
interface ErrorBoundaryProps {
  onClose: () => void;
  onDetected: (barcode: string) => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string;
}

class ScannerErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorInfo: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message = error instanceof Error ? error.message : String(error);
    return {
      hasError: true,
      errorInfo: message || 'कैमरा स्कैनर लोड करने में अप्रत्याशित समस्या आई।',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ScannerErrorBoundary caught camera error:', error, errorInfo);
  }

  handleManualFallback = (code: string) => {
    this.setState({ hasError: false, errorInfo: '' });
    this.props.onDetected(code);
    this.props.onClose();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 text-white shadow-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div>
              <h3 className="font-bold text-base text-white">कैमरा स्कैनर सुरक्षित मोड</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                कैमरा शुरू करने में समस्या आई। बिलिंग स्क्रीन को सुरक्षित रखते हुए स्कैनर को रीसेट किया गया है।
              </p>
            </div>

            {/* Error Message Display */}
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-[11px] text-amber-300 font-mono break-all text-left">
              {this.state.errorInfo}
            </div>

            {/* Manual Entry Fallback Form */}
            <FallbackManualInput onSubmit={this.handleManualFallback} />

            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorInfo: '' });
                this.props.onClose();
              }}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>स्कैनर बंद करें</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// 2. MANUAL BARCODE / SKU FALLBACK FORM
// ============================================================================
interface FallbackManualInputProps {
  onSubmit: (code: string) => void;
}

const FallbackManualInput: React.FC<FallbackManualInputProps> = ({ onSubmit }) => {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    onSubmit(code.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full">
      <input
        type="text"
        placeholder="बारकोड या SKU टाइप करें..."
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoFocus
        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
      />
      <button
        type="submit"
        disabled={!code.trim()}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
      >
        <span>जोड़ें</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </form>
  );
};

// ============================================================================
// 3. BARCODE CAMERA MODAL INNER COMPONENT
// ============================================================================
interface BarcodeCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
}

const BarcodeCameraModalInner: React.FC<BarcodeCameraModalProps> = ({
  isOpen,
  onClose,
  onDetected,
}) => {
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [manualCode, setManualCode] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [activeCameraLabel, setActiveCameraLabel] = useState<string>('');

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  // Generate stable unique container ID per mount to avoid DOM collisions
  const scannerContainerId = useRef('barcode-reader-viewport-' + Math.random().toString(36).substring(2, 9)).current;

  // Cleanup helper to stop any active video tracks & html5QrCode
  const safeStopScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    isScanningRef.current = false;

    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        scanner.clear();
      } catch (err) {
        console.warn('Non-fatal warning while stopping html5-qrcode scanner:', err);
      }
    }

    // Explicitly release any media stream tracks to ensure camera light turns off immediately
    try {
      const container = document.getElementById(scannerContainerId);
      if (container) {
        const videoElements = container.querySelectorAll('video');
        videoElements.forEach((video) => {
          if (video.srcObject && 'getTracks' in video.srcObject) {
            (video.srcObject as MediaStream).getTracks().forEach((track) => {
              try {
                track.stop();
              } catch {}
            });
            video.srcObject = null;
          }
        });
      }
    } catch (cleanupErr) {
      console.warn('Non-fatal warning while releasing camera tracks:', cleanupErr);
    }
  };

  const startScanner = async () => {
    setIsInitializing(true);
    setErrorMsg('');
    setActiveCameraLabel('');

    // Requirement 1: Verify browser mediaDevices and HTTPS support
    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setIsInitializing(false);
      setErrorMsg('कैमरा केवल सुरक्षित कनेक्शन (HTTPS) में काम करता है। कृपया HTTPS पर खोलें या नीचे बारकोड मैन्युअली टाइप करें।');
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setIsInitializing(false);
      setErrorMsg('इस ब्राउज़र में कैमरा उपलब्ध नहीं है या अनुमति (Permission) ब्लॉक है।');
      return;
    }

    try {
      // Requirement 3: Wait until the container is confirmed in the DOM (requestAnimationFrame + microtask)
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 80);
        });
      });

      if (!isMountedRef.current) return;

      const container = document.getElementById(scannerContainerId);
      if (!container) {
        throw new Error('स्कैनर डिस्प्ले कंटेनर DOM में तैयार नहीं हुआ। कृपया पुनः प्रयास करें।');
      }

      // Requirement 1 & 2: Safe probe with try...catch for getUserMedia
      let probeStream: MediaStream | null = null;
      try {
        probeStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
      } catch (permissionErr: any) {
        console.warn('getUserMedia permission probe failed:', permissionErr);
        const errName = permissionErr?.name || '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
          throw new Error('कैमरा अनुमति (Permission) ब्लॉक है। कृपया ब्राउज़र सेटिंग्स में कैमरा एक्सेस ऑन करें।');
        } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
          throw new Error('डिवाइस में कोई कैमरा नहीं मिला। कृपया बारकोड नंबर नीचे टाइप करें।');
        } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
          throw new Error('कैमरा किसी अन्य ऐप या टैब में उपयोग में है। कृपया उसे बंद करके पुनः प्रयास करें।');
        } else {
          throw new Error('कैमरा उपलब्ध नहीं है या अनुमति (Permission) ब्लॉक है।');
        }
      } finally {
        // Stop probe stream tracks immediately so Html5Qrcode has full access
        if (probeStream) {
          probeStream.getTracks().forEach((track) => {
            try {
              track.stop();
            } catch {}
          });
        }
      }

      if (!isMountedRef.current) return;

      // Instantiate Html5Qrcode with comprehensive barcode formats
      const html5QrCode = new Html5Qrcode(scannerContainerId, {
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

      const handleScanSuccess = (decodedText: string) => {
        if (isMountedRef.current) {
          safeStopScanner();
          onDetected(decodedText.trim());
          onClose();
        }
      };

      // Requirement 2: Prefer mobile back-camera ({ facingMode: { ideal: "environment" } }),
      // but gracefully fallback to default/user camera if unavailable (e.g. desktop/laptop)
      try {
        await html5QrCode.start(
          { facingMode: { ideal: 'environment' } },
          config,
          handleScanSuccess,
          () => {} // Frame scan ignore
        );
        setActiveCameraLabel('Back Camera (वातावरण)');
      } catch (backCamErr) {
        console.warn('Back camera failed or not available, falling back to default camera:', backCamErr);
        if (!isMountedRef.current) return;

        // Fallback to user / default camera
        await html5QrCode.start(
          { facingMode: 'user' },
          config,
          handleScanSuccess,
          () => {}
        );
        setActiveCameraLabel('Default Camera');
      }

      if (isMountedRef.current) {
        isScanningRef.current = true;
        setIsInitializing(false);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        console.warn('Camera scanner initialization error:', err);
        setIsInitializing(false);
        setErrorMsg(err?.message || 'कैमरा उपलब्ध नहीं है या अनुमति (Permission) ब्लॉक है।');
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    startScanner();

    return () => {
      isMountedRef.current = false;
      safeStopScanner();
    };
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    safeStopScanner();
    onDetected(manualCode.trim());
    onClose();
  };

  const handleRetry = () => {
    safeStopScanner();
    startScanner();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 text-white shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-xs">
              <Camera className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">कैमरा बारकोड स्कैनर</h3>
                {activeCameraLabel && (
                  <span className="text-[9px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono">
                    {activeCameraLabel}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">सामान के बारकोड को कैमरे के सामने लाएं</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              safeStopScanner();
              onClose();
            }}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="बंद करें"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Viewport Container */}
        <div className="relative bg-black w-full min-h-[290px] flex items-center justify-center overflow-hidden">
          {/* Targeted Scanner Viewport with isolated unique ID */}
          <div id={scannerContainerId} className="w-full h-full min-h-[290px]" />

          {/* Initializing Loading State */}
          {isInitializing && !errorMsg && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-4 text-center space-y-2.5 z-10">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              <p className="text-xs font-semibold text-slate-200">कैमरा प्रारंभ हो रहा है...</p>
              <p className="text-[10px] text-slate-400">कृपया कुछ सेकंड प्रतीक्षा करें</p>
            </div>
          )}

          {/* Error Banner with Retry Option */}
          {errorMsg && (
            <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center p-6 text-center space-y-3.5 z-10">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-xs text-amber-400 uppercase tracking-wide">
                  कैमरा एक्सेस त्रुटि
                </h4>
                <p className="text-xs text-slate-200 leading-relaxed max-w-xs">{errorMsg}</p>
              </div>

              <button
                type="button"
                onClick={handleRetry}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>पुनः प्रयास करें (Retry)</span>
              </button>
            </div>
          )}
        </div>

        {/* Manual Barcode / SKU Entry Fallback */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-2.5">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="बारकोड या SKU टाइप करें..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow-xs active:scale-95"
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

// ============================================================================
// 4. MAIN EXPORT WRAPPED IN ERROR BOUNDARY
// ============================================================================
export const BarcodeCameraModal: React.FC<BarcodeCameraModalProps> = (props) => {
  if (!props.isOpen) return null;

  return (
    <ScannerErrorBoundary onClose={props.onClose} onDetected={props.onDetected}>
      <BarcodeCameraModalInner {...props} />
    </ScannerErrorBoundary>
  );
};
