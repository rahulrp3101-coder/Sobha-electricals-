import React, { useState, useEffect } from 'react';
import { Invoice, CompanyProfile } from '../../types';
import { formatINR, numberToWordsINR } from '../../services/gstCalculator';
import { generateUpiQrDataUrl } from '../../services/upiQrService';
import { Printer, Download, Share2, ArrowLeft } from 'lucide-react';
import { generateWhatsAppInvoiceURL } from '../../services/whatsappShare';

interface A4InvoiceTemplateProps {
  invoice: Invoice;
  company: CompanyProfile;
  onBack?: () => void;
}

export const A4InvoiceTemplate: React.FC<A4InvoiceTemplateProps> = ({
  invoice,
  company,
  onBack,
}) => {
  const isInterState = invoice.partyStateCode.trim() !== company.stateCode.trim();
  const [upiQrUrl, setUpiQrUrl] = useState<string>('');

  useEffect(() => {
    if (company.upiId) {
      generateUpiQrDataUrl(company.upiId, company.name, invoice.grandTotal, invoice.invoiceNumber, 160)
        .then(url => setUpiQrUrl(url))
        .catch(err => console.warn('QR gen err:', err));
    }
  }, [company.upiId, company.name, invoice.grandTotal, invoice.invoiceNumber]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-200/80 p-4 sm:p-8 flex flex-col items-center">
      {/* Top Toolbar (Hidden during print) */}
      <div className="w-full max-w-4xl mb-4 flex items-center justify-between no-print">
        {onBack ? (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Invoices</span>
          </button>
        ) : <div />}

        <div className="flex items-center gap-2">
          <a
            href={generateWhatsAppInvoiceURL(invoice, company)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition shadow-2xs"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>WhatsApp</span>
          </a>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Invoice</span>
          </button>
        </div>
      </div>

      {/* Printable Sheet (Standard A4 dimensions) */}
      <div 
        id="printable-invoice"
        className="w-full max-w-4xl bg-white rounded-xl shadow-xl border border-slate-300 p-8 sm:p-12 text-slate-900 font-sans print:shadow-none print:border-none print:p-0 print:m-0"
      >
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-200 pb-6 mb-6">
          <div>
            {invoice.documentType === 'ESTIMATE' || invoice.documentType === 'QUOTATION' ? (
              <div className="inline-block px-3 py-1 bg-amber-100 text-amber-950 border border-amber-300 text-xs sm:text-sm font-black tracking-wider uppercase rounded mb-2">
                ESTIMATE / QUOTATION (अनुमानित पर्ची / कच्चा बिल)
              </div>
            ) : (
              <div className="inline-block px-2.5 py-0.5 bg-blue-50 text-blue-800 text-[11px] font-bold tracking-wider uppercase rounded mb-2">
                Tax Invoice
              </div>
            )}
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{company.name}</h1>
            <p className="text-xs text-slate-500 font-medium">{company.legalTradeName}</p>
            <p className="text-xs text-slate-600 mt-1 max-w-sm">{company.address}, {company.city} - {company.pincode}</p>
            <div className="text-xs text-slate-600 mt-1 font-mono">
              <span>GSTIN: <strong>{company.gstin}</strong></span>
              <span className="mx-2">·</span>
              <span>State: <strong>{company.state} [{company.stateCode}]</strong></span>
            </div>
            <div className="text-xs text-slate-600 mt-0.5">
              <span>Phone: {company.phone}</span>
              <span className="mx-2">·</span>
              <span>Email: {company.email}</span>
            </div>
          </div>

          <div className="text-right">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
              <div>
                <span className="text-slate-400">
                  {invoice.documentType === 'ESTIMATE' || invoice.documentType === 'QUOTATION' ? 'Estimate No:' : 'Invoice No:'}
                </span>{' '}
                <strong className="font-mono text-slate-900 text-sm">{invoice.invoiceNumber}</strong>
              </div>
              <div>
                <span className="text-slate-400">Date:</span>{' '}
                <strong className="font-mono text-slate-800">{invoice.date}</strong>
              </div>
              <div>
                <span className="text-slate-400">Payment Mode:</span>{' '}
                <strong className="text-slate-800">{invoice.paymentMode}</strong>
              </div>
              <div>
                <span className="text-slate-400">Status:</span>{' '}
                <span className={`font-semibold ${
                  invoice.documentType === 'ESTIMATE' || invoice.documentType === 'QUOTATION'
                    ? 'text-amber-700'
                    : invoice.status === 'PAID' ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  {invoice.documentType === 'ESTIMATE' || invoice.documentType === 'QUOTATION'
                    ? 'ESTIMATE (कच्चा पर्चा)'
                    : invoice.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bill To & Ship To Details */}
        <div className="grid grid-cols-2 gap-6 bg-slate-50/70 border border-slate-200 rounded-xl p-4 mb-6 text-xs">
          <div>
            <h3 className="font-bold text-[11px] uppercase tracking-wider text-slate-500 mb-1">Billed To (Customer)</h3>
            <div className="font-bold text-sm text-slate-900">{invoice.partyName}</div>
            <div className="text-slate-600 mt-0.5">{invoice.partyAddress}</div>
            <div className="text-slate-600 mt-1 font-mono">
              Phone: {invoice.partyPhone}
            </div>
            {invoice.partyGstin && (
              <div className="text-slate-700 font-mono mt-0.5">
                GSTIN: <strong>{invoice.partyGstin}</strong>
              </div>
            )}
            <div className="text-slate-600 mt-0.5">
              Place of Supply: <strong>{invoice.partyState} [{invoice.partyStateCode}]</strong>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-[11px] uppercase tracking-wider text-slate-500 mb-1">Dispatch / Terms</h3>
            <div className="text-slate-600">Reverse Charge (RCM): <strong>No</strong></div>
            <div className="text-slate-600 mt-0.5">Supply Type: <strong>{isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'}</strong></div>
            {invoice.notes && (
              <div className="mt-2 text-slate-600 bg-white p-2 rounded border border-slate-200">
                <span className="font-semibold">Notes:</span> {invoice.notes}
              </div>
            )}
          </div>
        </div>

        {/* Table of Items */}
        <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Item Description</th>
                <th className="py-2.5 px-3 font-mono">HSN/SAC</th>
                <th className="py-2.5 px-3 text-right">Qty</th>
                <th className="py-2.5 px-3 text-right">Rate</th>
                <th className="py-2.5 px-3 text-right">Taxable</th>
                {isInterState ? (
                  <th className="py-2.5 px-3 text-right">IGST</th>
                ) : (
                  <>
                    <th className="py-2.5 px-3 text-right">CGST</th>
                    <th className="py-2.5 px-3 text-right">SGST</th>
                  </>
                )}
                <th className="py-2.5 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.items.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50">
                  <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                  <td className="py-2 px-3 font-semibold text-slate-900">{item.itemName}</td>
                  <td className="py-2 px-3 font-mono text-slate-500">{item.hsn}</td>
                  <td className="py-2 px-3 text-right font-mono">{item.quantity} {item.unit}</td>
                  <td className="py-2 px-3 text-right font-mono">{formatINR(item.unitPrice)}</td>
                  <td className="py-2 px-3 text-right font-mono">{formatINR(item.taxableAmount)}</td>
                  {isInterState ? (
                    <td className="py-2 px-3 text-right font-mono text-slate-600">
                      {formatINR(item.igstAmount)} <span className="text-[10px] text-slate-400">({item.taxRate}%)</span>
                    </td>
                  ) : (
                    <>
                      <td className="py-2 px-3 text-right font-mono text-slate-600">{formatINR(item.cgstAmount)}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-600">{formatINR(item.sgstAmount)}</td>
                    </>
                  )}
                  <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{formatINR(item.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals & Bank Details Row */}
        <div className="grid grid-cols-2 gap-6 items-start mb-8 text-xs">
          {/* Left: Bank Details & UPI QR & Amount in Words */}
          <div className="space-y-3">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
              <div className="flex-1">
                <h4 className="font-bold text-[11px] uppercase tracking-wider text-slate-600 mb-1">Bank Payment Details</h4>
                <div className="grid grid-cols-2 gap-y-0.5 text-slate-700 text-[11px]">
                  <span className="text-slate-400">Bank Name:</span>
                  <span className="font-medium">{company.bankName}</span>
                  <span className="text-slate-400">A/C Number:</span>
                  <span className="font-mono font-bold">{company.bankAccountNo}</span>
                  <span className="text-slate-400">IFSC Code:</span>
                  <span className="font-mono font-bold">{company.bankIfsc}</span>
                  <span className="text-slate-400">Branch:</span>
                  <span>{company.bankBranch}</span>
                  {company.upiId && (
                    <>
                      <span className="text-slate-400">UPI ID:</span>
                      <span className="font-mono text-blue-700 font-semibold">{company.upiId}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Dynamic QR Box */}
              {company.upiId && upiQrUrl && (
                <div className="text-center p-2 bg-white rounded-xl border border-slate-300 shrink-0">
                  <div className="w-20 h-20">
                    <img src={upiQrUrl} alt="UPI QR" className="w-full h-full object-contain" />
                  </div>
                  <span className="text-[9px] font-bold text-slate-600 block mt-0.5">Scan &amp; Pay UPI</span>
                </div>
              )}
            </div>

            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
              <span className="text-[11px] text-blue-900 font-medium">Invoice Amount in Words:</span>
              <p className="font-bold text-blue-950 mt-0.5">{numberToWordsINR(invoice.grandTotal)}</p>
            </div>
          </div>

          {/* Right: Calculations Summary Box */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Total Taxable Amount:</span>
              <span className="font-mono font-medium text-slate-900">{formatINR(invoice.subTotal)}</span>
            </div>

            {invoice.totalDiscount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Total Discount:</span>
                <span className="font-mono">(-) {formatINR(invoice.totalDiscount)}</span>
              </div>
            )}

            {isInterState ? (
              <div className="flex justify-between text-slate-700">
                <span>Integrated Tax (IGST):</span>
                <span className="font-mono font-medium">{formatINR(invoice.totalIgst)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-slate-700">
                  <span>Central Tax (CGST):</span>
                  <span className="font-mono font-medium">{formatINR(invoice.totalCgst)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>State Tax (SGST):</span>
                  <span className="font-mono font-medium">{formatINR(invoice.totalSgst)}</span>
                </div>
              </>
            )}

            {invoice.roundOff !== 0 && (
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Round Off:</span>
                <span className="font-mono">{invoice.roundOff > 0 ? '+' : ''}{invoice.roundOff.toFixed(2)}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-black text-slate-900">
              <span>Grand Total:</span>
              <span className="font-mono text-base">{formatINR(invoice.grandTotal)}</span>
            </div>

            <div className="pt-1 flex justify-between text-slate-700">
              <span>Received Amount:</span>
              <span className="font-mono font-semibold text-emerald-600">{formatINR(invoice.receivedAmount)}</span>
            </div>

            {invoice.balanceAmount > 0 && (
              <div className="flex justify-between text-amber-700 font-bold bg-amber-50 p-1.5 rounded">
                <span>Balance Due:</span>
                <span className="font-mono">{formatINR(invoice.balanceAmount)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Terms & Signatures */}
        <div className="pt-6 border-t border-slate-200 grid grid-cols-2 gap-6 items-end text-[11px] text-slate-500">
          <div>
            <h4 className="font-bold text-slate-700 mb-1">Terms & Conditions</h4>
            <ol className="list-decimal pl-4 space-y-0.5 text-slate-600">
              {company.terms.map((t, idx) => (
                <li key={idx}>{t}</li>
              ))}
            </ol>
          </div>

          <div className="text-right space-y-12">
            <div>
              <p className="font-semibold text-slate-800">For {company.legalTradeName}</p>
            </div>
            <div>
              <div className="border-t border-slate-300 inline-block w-48 pt-1 text-center font-medium text-slate-700">
                Authorized Signatory
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
