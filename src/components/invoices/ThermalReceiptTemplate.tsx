import React, { useState, useEffect } from 'react';
import { Invoice, CompanyProfile } from '../../types';
import { thermalPrinter } from '../../services/thermalPrinter';
import { formatINR } from '../../services/gstCalculator';
import { generateUpiQrDataUrl } from '../../services/upiQrService';
import { Printer, Bluetooth, Usb, Check, AlertCircle, ArrowLeft, Copy, Sliders } from 'lucide-react';

interface ThermalReceiptTemplateProps {
  invoice: Invoice;
  company: CompanyProfile;
  onBack?: () => void;
}

export const ThermalReceiptTemplate: React.FC<ThermalReceiptTemplateProps> = ({
  invoice,
  company,
  onBack,
}) => {
  const [paperWidth, setPaperWidth] = useState<'58mm' | '80mm'>('80mm');
  const [statusMsg, setStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [showHexDump, setShowHexDump] = useState<boolean>(false);
  const [upiQrUrl, setUpiQrUrl] = useState<string>('');

  useEffect(() => {
    if (company.upiId) {
      generateUpiQrDataUrl(company.upiId, company.name, invoice.grandTotal, invoice.invoiceNumber, 150)
        .then(url => setUpiQrUrl(url))
        .catch(err => console.warn('QR gen err:', err));
    }
  }, [company.upiId, company.name, invoice.grandTotal, invoice.invoiceNumber]);

  // Generate raw ESC/POS bytes
  const escPosBytes = thermalPrinter.generateEscPosBytes(invoice, company, paperWidth);

  const showStatus = (text: string, isError = false) => {
    setStatusMsg({ text, isError });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  // 1. Web Bluetooth Print
  const handleBluetoothPrint = async () => {
    setIsPrinting(true);
    try {
      const res = await thermalPrinter.printViaBluetooth(escPosBytes);
      if (res.success) {
        showStatus('Receipt sent to Bluetooth thermal printer successfully!');
      } else {
        showStatus(res.error || 'Bluetooth printing failed.', true);
      }
    } catch (err: any) {
      showStatus(err.message || 'Bluetooth connection failed.', true);
    } finally {
      setIsPrinting(false);
    }
  };

  // 2. Web Serial Print (USB)
  const handleSerialPrint = async () => {
    setIsPrinting(true);
    try {
      const res = await thermalPrinter.printViaSerial(escPosBytes);
      if (res.success) {
        showStatus('Receipt sent to USB thermal printer successfully!');
      } else {
        showStatus(res.error || 'Serial printing failed.', true);
      }
    } catch (err: any) {
      showStatus(err.message || 'Serial connection failed.', true);
    } finally {
      setIsPrinting(false);
    }
  };

  // 3. Browser Print (Fallback / Any local printer)
  const handleBrowserPrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 sm:p-8 flex flex-col items-center text-white">
      {/* Top Controls Toolbar */}
      <div className="w-full max-w-xl mb-4 flex items-center justify-between no-print">
        {onBack ? (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        ) : <div />}

        {/* Paper Width Toggle */}
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
          <button
            onClick={() => setPaperWidth('58mm')}
            className={`px-3 py-1 rounded-md font-semibold transition ${
              paperWidth === '58mm' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            58mm (2")
          </button>
          <button
            onClick={() => setPaperWidth('80mm')}
            className={`px-3 py-1 rounded-md font-semibold transition ${
              paperWidth === '80mm' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            80mm (3")
          </button>
        </div>
      </div>

      {/* Hardware Print Actions Bar */}
      <div className="w-full max-w-xl mb-6 bg-slate-800/90 border border-slate-700 rounded-2xl p-4 no-print space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Hardware Thermal Print Engine</span>
          <button
            onClick={() => setShowHexDump(!showHexDump)}
            className="text-[11px] text-blue-400 hover:underline flex items-center gap-1"
          >
            <Sliders className="w-3 h-3" />
            {showHexDump ? 'Hide ESC/POS Bytes' : 'View ESC/POS Bytes'}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {/* Bluetooth */}
          <button
            disabled={isPrinting}
            onClick={handleBluetoothPrint}
            className="flex flex-col items-center justify-center p-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
          >
            <Bluetooth className="w-4 h-4 mb-1" />
            <span>Web Bluetooth</span>
          </button>

          {/* Web Serial (USB) */}
          <button
            disabled={isPrinting}
            onClick={handleSerialPrint}
            className="flex flex-col items-center justify-center p-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
          >
            <Usb className="w-4 h-4 mb-1" />
            <span>Web Serial USB</span>
          </button>

          {/* Browser Print */}
          <button
            onClick={handleBrowserPrint}
            className="flex flex-col items-center justify-center p-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold transition shadow-xs"
          >
            <Printer className="w-4 h-4 mb-1" />
            <span>Browser Print</span>
          </button>
        </div>

        {statusMsg && (
          <div className={`p-2.5 rounded-lg text-xs font-medium flex items-center gap-2 ${
            statusMsg.isError ? 'bg-red-900/60 text-red-200 border border-red-700' : 'bg-emerald-900/60 text-emerald-200 border border-emerald-700'
          }`}>
            {statusMsg.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {showHexDump && (
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[10px] font-mono text-emerald-400 max-h-36 overflow-y-auto">
            <div className="text-slate-500 mb-1">// ESC/POS Generated Binary Stream ({escPosBytes.length} bytes):</div>
            {Array.from(escPosBytes.slice(0, 160))
              .map(b => b.toString(16).padStart(2, '0').toUpperCase())
              .join(' ')}
            {escPosBytes.length > 160 && ' ...'}
          </div>
        )}
      </div>

      {/* Realistic Skeuomorphic Thermal Paper Slip View */}
      <div 
        id="printable-invoice"
        className={`bg-white text-black p-5 rounded-sm shadow-2xl thermal-receipt text-xs transition-all ${
          paperWidth === '58mm' ? 'w-[320px]' : 'w-[420px]'
        }`}
        style={{
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          lineHeight: '1.35',
        }}
      >
        {/* Header */}
        <div className="text-center pb-2">
          {invoice.documentType === 'ESTIMATE' || invoice.documentType === 'QUOTATION' ? (
            <div className="text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 py-1 px-2 rounded mb-1.5 uppercase tracking-wide">
              *** ESTIMATE / QUOTATION (अनुमानित पर्ची) ***
            </div>
          ) : null}
          <div className="font-bold text-sm uppercase tracking-tight">{company.name}</div>
          <div className="text-[11px]">{company.address}</div>
          <div className="text-[11px]">{company.city} - {company.pincode}</div>
          <div className="text-[11px]">Tel: {company.phone}</div>
          {company.gstin && <div className="text-[11px] font-mono">GSTIN: {company.gstin}</div>}
        </div>

        <div className="border-t border-dashed border-black my-2" />

        {/* Invoice Metadata */}
        <div className="text-[11px] space-y-0.5">
          <div className="flex justify-between">
            <span>
              {invoice.documentType === 'ESTIMATE' || invoice.documentType === 'QUOTATION' ? 'Est No:' : 'Bill No:'}{' '}
              <strong>{invoice.invoiceNumber}</strong>
            </span>
            <span>{invoice.documentType === 'ESTIMATE' || invoice.documentType === 'QUOTATION' ? 'ESTIMATE' : invoice.paymentMode}</span>
          </div>
          <div className="flex justify-between">
            <span>Date: {invoice.date}</span>
            <span>{new Date(invoice.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div>Cust: {invoice.partyName}</div>
          {invoice.partyPhone && invoice.partyPhone !== '9999999999' && (
            <div>Ph: {invoice.partyPhone}</div>
          )}
        </div>

        <div className="border-t border-dashed border-black my-2" />

        {/* Line Items */}
        <div className="text-[11px]">
          <div className="flex justify-between font-bold border-b border-black pb-1 mb-1">
            <span>Item</span>
            <span className="text-right">Qty x Rate</span>
            <span className="text-right">Amount</span>
          </div>

          <div className="space-y-1">
            {invoice.items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-start">
                <div className="flex-1 pr-1 truncate">
                  <div>{item.itemName}</div>
                  <div className="text-[10px] text-neutral-600">HSN:{item.hsn} GST:{item.taxRate}%</div>
                </div>
                <div className="text-right whitespace-nowrap pr-2">
                  {item.quantity} x {item.unitPrice.toFixed(2)}
                </div>
                <div className="text-right font-bold whitespace-nowrap">
                  {item.totalAmount.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-dashed border-black my-2" />

        {/* Totals */}
        <div className="text-[11px] space-y-0.5">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>Rs. {invoice.subTotal.toFixed(2)}</span>
          </div>
          {invoice.totalDiscount > 0 && (
            <div className="flex justify-between">
              <span>Discount:</span>
              <span>(-) Rs. {invoice.totalDiscount.toFixed(2)}</span>
            </div>
          )}
          {invoice.totalCgst > 0 && (
            <>
              <div className="flex justify-between">
                <span>CGST:</span>
                <span>Rs. {invoice.totalCgst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>SGST:</span>
                <span>Rs. {invoice.totalSgst.toFixed(2)}</span>
              </div>
            </>
          )}
          {invoice.totalIgst > 0 && (
            <div className="flex justify-between">
              <span>IGST:</span>
              <span>Rs. {invoice.totalIgst.toFixed(2)}</span>
            </div>
          )}
          {invoice.roundOff !== 0 && (
            <div className="flex justify-between">
              <span>Round Off:</span>
              <span>{invoice.roundOff > 0 ? '+' : ''}{invoice.roundOff.toFixed(2)}</span>
            </div>
          )}

          <div className="border-t border-black my-1" />

          <div className="flex justify-between text-sm font-bold pt-0.5">
            <span>NET TOTAL:</span>
            <span>Rs. {invoice.grandTotal.toFixed(2)}</span>
          </div>

          <div className="flex justify-between text-[11px]">
            <span>Paid Amount:</span>
            <span>Rs. {invoice.receivedAmount.toFixed(2)}</span>
          </div>
          {invoice.balanceAmount > 0 && (
            <div className="flex justify-between text-[11px] font-bold">
              <span>Balance Due:</span>
              <span>Rs. {invoice.balanceAmount.toFixed(2)}</span>
            </div>
          )}
        </div>

        <div className="border-t border-dashed border-black my-2" />

        {/* Dynamic UPI QR Code for instant scan & pay */}
        {company.upiId && upiQrUrl && (
          <div className="text-center py-2 flex flex-col items-center justify-center border-t border-dashed border-black mt-2">
            <span className="text-[10px] font-bold uppercase tracking-wider mb-1">
              Scan &amp; Pay via UPI (PhonePe/GPay)
            </span>
            <div className="w-24 h-24 p-1 bg-white border border-black inline-block">
              <img src={upiQrUrl} alt="UPI QR" className="w-full h-full object-contain" />
            </div>
            <span className="text-[9px] font-mono font-bold mt-0.5">
              Exact Amount: Rs. {invoice.grandTotal.toFixed(2)}
            </span>
          </div>
        )}

        {/* Receipt Footer */}
        <div className="text-center text-[10px] space-y-0.5 pt-1">
          <div>Thank you! Please visit again.</div>
          {company.upiId && <div className="font-mono text-[9px]">UPI ID: {company.upiId}</div>}
          <div className="text-[9px] text-neutral-500 mt-1">Generated by Vyapar Pro Cloud POS</div>
        </div>

        {/* Paper Jagged Tear Simulation */}
        <div className="mt-4 pt-2 border-b-2 border-dashed border-slate-300" />
      </div>
    </div>
  );
};
