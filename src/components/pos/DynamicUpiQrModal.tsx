import React, { useState, useEffect } from 'react';
import { QrCode, X, Check, Copy, AlertCircle, Smartphone, ArrowRight } from 'lucide-react';
import { generateUpiQrDataUrl, generateUpiPaymentUrl } from '../../services/upiQrService';
import { formatINR } from '../../services/gstCalculator';

interface DynamicUpiQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  upiId: string;
  shopName: string;
  amount: number;
  invoiceNumber?: string;
  onConfirmPaid?: () => void;
}

export const DynamicUpiQrModal: React.FC<DynamicUpiQrModalProps> = ({
  isOpen,
  onClose,
  upiId,
  shopName,
  amount,
  invoiceNumber = '',
  onConfirmPaid,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const displayUpiId = (upiId || '').trim();

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);

    generateUpiQrDataUrl(displayUpiId || 'merchant@upi', shopName, amount, invoiceNumber, 280)
      .then((url) => {
        if (isMounted) {
          setQrDataUrl(url);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Error generating QR:', err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, displayUpiId, shopName, amount, invoiceNumber]);

  if (!isOpen) return null;

  const handleCopyUpi = () => {
    if (!displayUpiId) return;
    navigator.clipboard.writeText(displayUpiId);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 bg-linear-to-r from-blue-700 via-indigo-700 to-blue-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm tracking-tight">Dynamic UPI QR Code (डायनामिक QR)</h3>
              <p className="text-[11px] text-blue-100">Scan &amp; Pay via PhonePe / GPay / Paytm</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col items-center text-center space-y-4">
          {/* Shop & Amount */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {shopName || 'Merchant Store'}
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 mt-0.5">
              {formatINR(amount)}
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full inline-block mt-1">
              Exact Amount Embedded (सटीक राशि दर्ज है)
            </div>
          </div>

          {/* QR Code Container */}
          <div className="w-64 h-64 bg-white p-3 rounded-2xl border-2 border-slate-900 shadow-md flex items-center justify-center relative">
            {isLoading ? (
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Dynamic UPI QR"
                className="w-full h-full object-contain rounded-lg"
              />
            ) : (
              <div className="text-xs text-red-600 font-bold p-2">
                Failed to generate QR code (QR कोड नहीं बन सका).
              </div>
            )}
          </div>

          {/* UPI Apps supported */}
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
            <Smartphone className="w-3.5 h-3.5 text-slate-400" />
            <span>Google Pay, PhonePe, Paytm, BHIM, Cred, Navi</span>
          </div>

          {/* UPI ID Display & Copy */}
          <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
            <div className="text-left min-w-0 pr-2">
              <span className="text-[10px] text-slate-400 block">Merchant UPI ID (दुकान की UPI ID):</span>
              <span className="font-mono font-bold text-slate-800 truncate block">
                {displayUpiId || 'Please configure UPI ID in Settings'}
              </span>
            </div>
            {displayUpiId && (
              <button
                type="button"
                onClick={handleCopyUpi}
                className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 transition"
              >
                {isCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{isCopied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="w-full pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
            >
              Close (बंद करें)
            </button>
            {onConfirmPaid && (
              <button
                type="button"
                onClick={() => {
                  onConfirmPaid();
                  onClose();
                }}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1 active:scale-95"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Mark as Paid (भुगतान प्राप्त)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
