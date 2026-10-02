import React, { useState } from 'react';
import { 
  Invoice, DocumentType, Party, Item, InvoiceItem, 
  CompanyProfile, PaymentMode 
} from '../../types';
import { calculateItemGST, calculateInvoiceTotals, formatINR, INDIAN_STATES } from '../../services/gstCalculator';
import { ArrowLeft, Plus, Trash2, Save, Printer, Share2, AlertCircle } from 'lucide-react';

interface InvoiceFormProps {
  initialType?: DocumentType;
  parties: Party[];
  items: Item[];
  company: CompanyProfile;
  onSave: (invoice: Invoice, printImmediate?: boolean) => Promise<Invoice>;
  onCancel: () => void;
}

export const InvoiceForm: React.FC<InvoiceFormProps> = ({
  initialType = 'SALES_INVOICE',
  parties,
  items,
  company,
  onSave,
  onCancel,
}) => {
  const [docType, setDocType] = useState<DocumentType>(initialType);
  const [selectedParty, setSelectedParty] = useState<Party>(parties[0]);
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState<string>(`${company.invoicePrefix}${String(Date.now()).slice(-5)}`);
  const [cartLines, setCartLines] = useState<InvoiceItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [notes, setNotes] = useState<string>('');
  const [isTaxInclusive, setIsTaxInclusive] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Selected item to add
  const [selectedItemId, setSelectedItemId] = useState<string>(items[0]?.id || '');
  const [addQty, setAddQty] = useState<number>(1);

  const isInterState = company.stateCode.trim() !== (selectedParty.stateCode || company.stateCode).trim();

  const handleAddItem = () => {
    const item = items.find(i => i.id === selectedItemId);
    if (!item) return;

    const rate = docType === 'PURCHASE_BILL' ? item.purchasePrice : (item.retailPrice || item.wholesalePrice);
    const sellerStateCode = company.stateCode;
    const buyerStateCode = selectedParty.stateCode || company.stateCode;

    const gstCalc = calculateItemGST({
      quantity: addQty,
      rate,
      taxRate: item.taxRate,
      isTaxInclusive,
      sellerStateCode,
      buyerStateCode,
    });

    const newLine: InvoiceItem = {
      itemId: item.id,
      itemName: item.name,
      hsn: item.hsn,
      unit: item.unit,
      quantity: addQty,
      unitPrice: rate,
      discountPercent: 0,
      discountAmount: gstCalc.discountAmount,
      taxRate: item.taxRate,
      taxableAmount: gstCalc.taxableAmount,
      cgstAmount: gstCalc.cgstAmount,
      sgstAmount: gstCalc.sgstAmount,
      igstAmount: gstCalc.igstAmount,
      cessAmount: gstCalc.cessAmount,
      totalAmount: gstCalc.totalAmount,
    };

    setCartLines([...cartLines, newLine]);
    setAddQty(1);
  };

  const removeLine = (idx: number) => {
    setCartLines(cartLines.filter((_, i) => i !== idx));
  };

  const totals = calculateInvoiceTotals(cartLines);

  const handleSubmit = async (printImmediate = false) => {
    if (cartLines.length === 0) return;
    setIsSaving(true);
    try {
      const newInvoice: Invoice = {
        id: `inv-${Date.now()}`,
        invoiceNumber,
        documentType: docType,
        partyId: selectedParty.id,
        partyName: selectedParty.name,
        partyGstin: selectedParty.gstin,
        partyPhone: selectedParty.phone,
        partyAddress: selectedParty.address,
        partyState: selectedParty.state,
        partyStateCode: selectedParty.stateCode,
        date: invoiceDate,
        items: cartLines,
        subTotal: totals.subTotal,
        totalDiscount: totals.totalDiscount,
        totalCgst: totals.totalCgst,
        totalSgst: totals.totalSgst,
        totalIgst: totals.totalIgst,
        totalCess: totals.totalCess,
        totalTax: totals.totalTax,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        receivedAmount: paymentMode === 'CREDIT' ? 0 : totals.grandTotal,
        balanceAmount: paymentMode === 'CREDIT' ? totals.grandTotal : 0,
        paymentMode,
        notes: notes || undefined,
        status: paymentMode === 'CREDIT' ? 'UNPAID' : 'PAID',
        isSynced: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSave(newInvoice, printImmediate);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <h2 className="text-lg font-bold text-slate-900">
          Create {docType.replace('_', ' ')}
        </h2>

        <div className="flex items-center gap-2">
          <button
            disabled={isSaving || cartLines.length === 0}
            onClick={() => handleSubmit(false)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>Save Document</span>
          </button>
        </div>
      </div>

      {/* Main Document Details Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4 text-xs">
        {/* Document Type & Party Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Document Type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocumentType)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-semibold text-xs focus:outline-none focus:border-blue-600"
            >
              <option value="SALES_INVOICE">Sales Invoice</option>
              <option value="PURCHASE_BILL">Purchase Bill</option>
              <option value="QUOTATION">Quotation / Estimate</option>
              <option value="DELIVERY_CHALLAN">Delivery Challan</option>
              <option value="CREDIT_NOTE">Credit Note</option>
              <option value="DEBIT_NOTE">Debit Note</option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Customer / Supplier</label>
            <select
              value={selectedParty.id}
              onChange={(e) => {
                const found = parties.find(p => p.id === e.target.value);
                if (found) setSelectedParty(found);
              }}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-semibold text-xs focus:outline-none focus:border-blue-600"
            >
              {parties.filter(p => !p.isBlacklisted || p.id === selectedParty?.id).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.state})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Invoice / Doc #</label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-mono font-bold text-xs"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Invoice Date</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 font-mono text-xs"
            />
          </div>
        </div>

        {/* GST State Indicator */}
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-slate-600">
          <div>
            <span>Place of Supply: <strong>{selectedParty.state} [{selectedParty.stateCode}]</strong></span>
            <span className="mx-2">·</span>
            <span>Billing State: <strong>{company.state} [{company.stateCode}]</strong></span>
          </div>
          <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
            {isInterState ? 'Inter-State Supply (IGST)' : 'Intra-State Supply (CGST + SGST)'}
          </span>
        </div>

        {/* Item Selector & Add Row */}
        <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex flex-col sm:flex-row items-center gap-3">
          <div className="flex-1 w-full">
            <label className="block font-medium text-blue-900 mb-1">Select Product to Add</label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full bg-white border border-blue-200 rounded-lg px-2.5 py-1.5 font-medium text-xs focus:outline-none focus:border-blue-600"
            >
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} — {formatINR(i.retailPrice)} (Stock: {i.currentStock})
                </option>
              ))}
            </select>
          </div>

          <div className="w-24">
            <label className="block font-medium text-blue-900 mb-1">Quantity</label>
            <input
              type="number"
              min="1"
              value={addQty}
              onChange={(e) => setAddQty(parseFloat(e.target.value) || 1)}
              className="w-full bg-white border border-blue-200 rounded-lg px-2 py-1.5 font-mono font-bold text-center text-xs"
            />
          </div>

          <button
            onClick={handleAddItem}
            className="self-end px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item</span>
          </button>
        </div>

        {/* Added Items Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Item</th>
                <th className="py-2.5 px-3 font-mono">HSN</th>
                <th className="py-2.5 px-3 text-right">Price</th>
                <th className="py-2.5 px-3 text-center">Qty</th>
                <th className="py-2.5 px-3 text-right">Taxable</th>
                <th className="py-2.5 px-3 text-right">GST Rate</th>
                <th className="py-2.5 px-3 text-right">Total</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cartLines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No items added yet. Select a product above to add to this invoice.
                  </td>
                </tr>
              ) : (
                cartLines.map((line, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{line.itemName}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">{line.hsn}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatINR(line.unitPrice)}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold">{line.quantity}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatINR(line.taxableAmount)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">{line.taxRate}%</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">{formatINR(line.totalAmount)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => removeLine(idx)}
                        className="p-1 text-slate-400 hover:text-red-600 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Calculations Footer */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-3 border-t border-slate-200">
          <div className="space-y-3">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI / Google Pay</option>
                <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                <option value="CREDIT">Udhar / 30-Day Credit</option>
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Remarks / Internal Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add special terms, transport details, or PO number..."
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs"
              />
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal:</span>
              <span className="font-mono font-medium">{formatINR(totals.subTotal)}</span>
            </div>
            {isInterState ? (
              <div className="flex justify-between text-slate-700">
                <span>IGST:</span>
                <span className="font-mono font-semibold text-blue-700">{formatINR(totals.totalIgst)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-slate-700">
                  <span>CGST:</span>
                  <span className="font-mono">{formatINR(totals.totalCgst)}</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>SGST:</span>
                  <span className="font-mono">{formatINR(totals.totalSgst)}</span>
                </div>
              </>
            )}
            <div className="pt-2 border-t border-slate-200 flex justify-between font-black text-sm text-slate-900">
              <span>Grand Total:</span>
              <span className="font-mono text-base">{formatINR(totals.grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
