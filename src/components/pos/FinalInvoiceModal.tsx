import React from 'react';
import { Invoice, CompanyProfile } from '../../types';
import { formatINR } from '../../services/gstCalculator';
import { generateWhatsAppInvoiceURL } from '../../services/whatsappShare';
import { Check, Printer, FileText, Share2, X, Plus, AlertTriangle, ArrowRight } from 'lucide-react';

interface FinalInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  company: CompanyProfile;
  customerPreviousBalance?: number;
  onPrintThermal: (invoice: Invoice) => void;
  onPrintA4: (invoice: Invoice) => void;
  onStartNewBill: () => void;
}

export const FinalInvoiceModal: React.FC<FinalInvoiceModalProps> = ({
  isOpen,
  onClose,
  invoice,
  company,
  customerPreviousBalance = 0,
  onPrintThermal,
  onPrintA4,
  onStartNewBill,
}) => {
  if (!isOpen || !invoice) return null;

  const isEstimate = invoice.documentType === 'ESTIMATE' || invoice.documentType === 'QUOTATION';
  const isUdhar = !isEstimate && (invoice.paymentMode === 'CREDIT' || invoice.balanceAmount > 0);
  const newOutstanding = customerPreviousBalance + invoice.balanceAmount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-2xs p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Top Success Banner */}
        <div className={`p-4 sm:p-5 text-white flex items-center justify-between ${
          isEstimate 
            ? 'bg-linear-to-r from-amber-600 via-orange-600 to-amber-700' 
            : 'bg-linear-to-r from-emerald-600 via-teal-600 to-emerald-700'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center font-bold">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black leading-tight">
                {isEstimate ? 'एस्टिमेट / कोटेशन तैयार हो गया!' : 'बिल सफलतापूर्वक पूरा हो गया!'}
              </h3>
              <p className="text-xs text-white/90 font-mono">
                {isEstimate ? 'एस्टिमेट नं: ' : 'बिल नं: '}
                <strong>{invoice.invoiceNumber}</strong> · तारीख: {invoice.date}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invoice Body Preview */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-slate-800 flex-1">
          {/* Shop & Customer Header */}
          <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">दुकान (Seller)</span>
              <div className="font-extrabold text-slate-900 text-sm">{company.name}</div>
              <div className="text-slate-500">{company.phone}</div>
              {company.gstin && <div className="font-mono text-slate-500">GSTIN: {company.gstin}</div>}
              <div className="text-slate-500">{company.state} ({company.stateCode})</div>
            </div>

            <div className="sm:border-l sm:border-slate-200 sm:pl-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ग्राहक (Customer)</span>
              <div className="font-extrabold text-slate-900 text-sm">{invoice.partyName}</div>
              {invoice.partyPhone && <div className="text-slate-500 font-mono">📱 {invoice.partyPhone}</div>}
              {invoice.partyAddress && <div className="text-slate-500 truncate">{invoice.partyAddress}</div>}
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[10px] font-bold bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded">
                  {isEstimate ? 'ESTIMATE / QUOTATION' : invoice.paymentMode === 'CREDIT' ? 'उधार बिल' : invoice.paymentMode}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  isEstimate ? 'bg-amber-100 text-amber-900 border border-amber-300 font-extrabold' : invoice.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                }`}>
                  {isEstimate ? (invoice.deductStock ? '📦 स्टॉक घटाया गया' : '🛡️ स्टॉक सुरक्षित') : invoice.status === 'PAID' ? 'चुकता (PAID)' : 'बकाया (UNPAID)'}
                </span>
              </div>
            </div>
          </div>

          {/* Itemized Table */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-600 grid grid-cols-12 gap-1 border-b border-slate-200">
              <span className="col-span-6">सामान (Item)</span>
              <span className="col-span-2 text-center">मात्रा</span>
              <span className="col-span-2 text-right">दर</span>
              <span className="col-span-2 text-right">कुल</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {invoice.items.map((line, idx) => (
                <div key={idx} className="px-3 py-2 text-xs grid grid-cols-12 gap-1 items-center">
                  <div className="col-span-6">
                    <div className="font-bold text-slate-900 truncate">{line.itemName}</div>
                    <div className="text-[10px] text-slate-400">GST: {line.taxRate}% {line.discountPercent ? `· छूट: ${line.discountPercent}%` : ''}</div>
                  </div>
                  <div className="col-span-2 text-center font-mono font-bold text-slate-800">
                    {line.quantity}
                  </div>
                  <div className="col-span-2 text-right font-mono text-slate-700">
                    {formatINR(line.unitPrice)}
                  </div>
                  <div className="col-span-2 text-right font-mono font-black text-slate-900">
                    {formatINR(line.totalAmount)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals Breakdown */}
          <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>उप-कुल (Subtotal):</span>
              <span className="font-mono">{formatINR(invoice.subTotal)}</span>
            </div>

            {invoice.totalDiscount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>कुल छूट (Discount):</span>
                <span className="font-mono">-{formatINR(invoice.totalDiscount)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-600">
              <span>कुल GST कर (Total Tax):</span>
              <span className="font-mono">{formatINR(invoice.totalTax)}</span>
            </div>

            {invoice.roundOff !== 0 && (
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>राउंड ऑफ (Round Off):</span>
                <span className="font-mono">{invoice.roundOff > 0 ? `+${invoice.roundOff}` : invoice.roundOff}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline font-black text-slate-900">
              <span className="text-sm">कुल देय राशि (Grand Total):</span>
              <span className="text-xl font-mono text-emerald-700">{formatINR(invoice.grandTotal)}</span>
            </div>

            {/* If Udhar: Highlight Ledger Update */}
            {isUdhar && (
              <div className="mt-2 p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>खाता अपडेट (Khata Ledger):</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>पिछला बकाया: <strong>{formatINR(customerPreviousBalance)}</strong></span>
                  <span>+ यह बिल (उधार): <strong>{formatINR(invoice.balanceAmount)}</strong></span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-amber-200 font-bold">
                  <span>ग्राहक का नया कुल बकाया:</span>
                  <span className="font-mono text-amber-900">{formatINR(newOutstanding)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Footer Buttons */}
        <div className="p-4 bg-white border-t border-slate-200 space-y-2.5">
          {/* Primary Action: WhatsApp Share (Requirement 2) */}
          <a
            href={generateWhatsAppInvoiceURL(invoice, company)}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-2 shadow-md active:scale-98 cursor-pointer"
            title="web.whatsapp.com पर ग्राहक को बिल भेजें"
          >
            <span className="text-base">📲</span>
            <span>WhatsApp पर बिल भेजें</span>
          </a>

          {/* Printing Buttons Grid */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onPrintThermal(invoice)}
              className="py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-98"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>थर्मल रसीद प्रिंट</span>
            </button>

            <button
              onClick={() => onPrintA4(invoice)}
              className="py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-98"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>A4 बिल प्रिंट / PDF</span>
            </button>
          </div>

          {/* Next Bill Button */}
          <button
            onClick={() => {
              onClose();
              onStartNewBill();
            }}
            className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>+ अगला नया बिल बनाएँ (Create Next Bill)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
