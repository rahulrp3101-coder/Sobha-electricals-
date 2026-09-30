import React, { useState, useMemo } from 'react';
import { 
  Search, Plus, Minus, Trash2, ShoppingBag, 
  Camera, Check, X, ArrowRight, Printer, Share2, 
  Sparkles, Banknote, QrCode, CreditCard, ChevronUp, ChevronDown 
} from 'lucide-react';
import { Item, Party, Invoice, InvoiceItem, CompanyProfile, PaymentMode } from '../../types';
import { calculateItemGST, calculateInvoiceTotals, formatINR } from '../../services/gstCalculator';
import { BarcodeCameraModal } from './BarcodeCameraModal';
import { generateWhatsAppInvoiceURL } from '../../services/whatsappShare';

interface MobilePOSProps {
  items: Item[];
  parties: Party[];
  company: CompanyProfile;
  onSaveInvoice: (invoice: Invoice, printImmediate?: boolean, printFormat?: 'thermal' | 'a4') => Promise<Invoice>;
}

export const MobilePOS: React.FC<MobilePOSProps> = ({
  items,
  parties,
  company,
  onSaveInvoice,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cartLines, setCartLines] = useState<InvoiceItem[]>([]);
  const [selectedParty, setSelectedParty] = useState<Party>(parties[0]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState<boolean>(false);
  const [showCameraScanner, setShowCameraScanner] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Invoice | null>(null);

  // Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => set.add(i.category));
    return ['All', ...Array.from(set)];
  }, [items]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesQuery = !searchQuery || 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.barcode?.includes(searchQuery);
      return matchesCategory && matchesQuery;
    });
  }, [items, selectedCategory, searchQuery]);

  // Add item
  const addItem = (item: Item) => {
    const existingIdx = cartLines.findIndex(l => l.itemId === item.id);
    const sellerStateCode = company.stateCode;
    const buyerStateCode = selectedParty.stateCode || company.stateCode;
    const rate = item.retailPrice || item.wholesalePrice;

    if (existingIdx >= 0) {
      const updated = [...cartLines];
      const line = updated[existingIdx];
      const newQty = line.quantity + 1;
      const calc = calculateItemGST({
        quantity: newQty,
        rate: line.unitPrice,
        taxRate: item.taxRate,
        isTaxInclusive: true,
        sellerStateCode,
        buyerStateCode,
      });

      updated[existingIdx] = {
        ...line,
        quantity: newQty,
        taxableAmount: calc.taxableAmount,
        cgstAmount: calc.cgstAmount,
        sgstAmount: calc.sgstAmount,
        igstAmount: calc.igstAmount,
        totalAmount: calc.totalAmount,
      };
      setCartLines(updated);
    } else {
      const calc = calculateItemGST({
        quantity: 1,
        rate,
        taxRate: item.taxRate,
        isTaxInclusive: true,
        sellerStateCode,
        buyerStateCode,
      });

      const newLine: InvoiceItem = {
        itemId: item.id,
        itemName: item.name,
        hsn: item.hsn,
        unit: item.unit,
        quantity: 1,
        unitPrice: rate,
        discountPercent: 0,
        discountAmount: 0,
        taxRate: item.taxRate,
        taxableAmount: calc.taxableAmount,
        cgstAmount: calc.cgstAmount,
        sgstAmount: calc.sgstAmount,
        igstAmount: calc.igstAmount,
        cessAmount: 0,
        totalAmount: calc.totalAmount,
      };
      setCartLines([newLine, ...cartLines]);
    }
  };

  const updateQuantity = (itemId: string, delta: number) => {
    const existingIdx = cartLines.findIndex(l => l.itemId === itemId);
    if (existingIdx < 0) return;

    const updated = [...cartLines];
    const line = updated[existingIdx];
    const newQty = line.quantity + delta;

    if (newQty <= 0) {
      setCartLines(cartLines.filter(l => l.itemId !== itemId));
      return;
    }

    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const calc = calculateItemGST({
      quantity: newQty,
      rate: line.unitPrice,
      taxRate: item.taxRate,
      isTaxInclusive: true,
      sellerStateCode: company.stateCode,
      buyerStateCode: selectedParty.stateCode || company.stateCode,
    });

    updated[existingIdx] = {
      ...line,
      quantity: newQty,
      taxableAmount: calc.taxableAmount,
      cgstAmount: calc.cgstAmount,
      sgstAmount: calc.sgstAmount,
      igstAmount: calc.igstAmount,
      totalAmount: calc.totalAmount,
    };
    setCartLines(updated);
  };

  const totals = calculateInvoiceTotals(cartLines);
  const totalItemCount = cartLines.reduce((s, l) => s + l.quantity, 0);

  const handleCheckout = async (printThermal = false) => {
    if (cartLines.length === 0) return;
    setIsSaving(true);
    try {
      const now = new Date();
      const invoiceNumber = `${company.invoicePrefix}${String(Date.now()).slice(-5)}`;

      const invoice: Invoice = {
        id: 'inv-' + Date.now(),
        invoiceNumber,
        documentType: 'SALES_INVOICE',
        partyId: selectedParty.id,
        partyName: selectedParty.name,
        partyGstin: selectedParty.gstin,
        partyPhone: selectedParty.phone,
        partyAddress: selectedParty.address,
        partyState: selectedParty.state,
        partyStateCode: selectedParty.stateCode,
        date: now.toISOString().split('T')[0],
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
        receivedAmount: totals.grandTotal,
        balanceAmount: 0,
        paymentMode,
        status: 'PAID',
        isSynced: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      const saved = await onSaveInvoice(invoice, printThermal, 'thermal');
      setLastSaved(saved);
      setCartLines([]);
      setIsCartDrawerOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4.25rem)] bg-slate-100 overflow-hidden relative">
      {/* Barcode Camera Modal */}
      <BarcodeCameraModal
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onDetected={(code) => {
          const found = items.find(i => i.barcode === code || i.sku === code);
          if (found) addItem(found);
        }}
      />

      {/* Top Mobile Bar */}
      <div className="bg-white p-3 border-b border-slate-200 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search products or scan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>
          <button
            onClick={() => setShowCameraScanner(true)}
            className="p-2 bg-blue-600 text-white rounded-xl shadow-xs"
            title="Scan Barcode"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        {/* Category Horizontal Scrolling Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Touch Product Grid Viewport */}
      <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5 pb-24">
        {filteredItems.map((item) => {
          const cartItem = cartLines.find(l => l.itemId === item.id);
          const isLowStock = item.currentStock <= item.lowStockThreshold;

          return (
            <div
              key={item.id}
              className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col justify-between shadow-2xs hover:border-blue-400 transition select-none"
            >
              <div>
                <div className="flex items-start justify-between gap-1 mb-1">
                  <span className="text-[10px] text-slate-400 font-mono truncate">{item.category}</span>
                  {isLowStock && (
                    <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.5 rounded font-mono">
                      Low Stock
                    </span>
                  )}
                </div>
                <h4 className="font-semibold text-xs text-slate-900 line-clamp-2 leading-tight mb-2">
                  {item.name}
                </h4>
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-bold text-sm text-slate-900 font-mono">
                    {formatINR(item.retailPrice || item.wholesalePrice)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Stock: {item.currentStock}
                  </span>
                </div>

                {cartItem ? (
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-1">
                    <button
                      onClick={() => updateQuantity(item.id, -1)}
                      className="w-7 h-7 bg-white rounded text-blue-700 font-bold flex items-center justify-center shadow-2xs"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono font-bold text-xs text-blue-900">
                      {cartItem.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, 1)}
                      className="w-7 h-7 bg-blue-600 rounded text-white font-bold flex items-center justify-center shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => addItem(item)}
                    className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 shadow-2xs transition active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Cart Bar */}
      {cartLines.length > 0 && !isCartDrawerOpen && (
        <div className="absolute bottom-3 inset-x-3 z-30">
          <button
            onClick={() => setIsCartDrawerOpen(true)}
            className="w-full bg-slate-900 text-white rounded-2xl p-3.5 flex items-center justify-between shadow-2xl active:scale-[0.98] transition border border-slate-700"
          >
            <div className="flex items-center gap-3">
              <div className="relative p-2 bg-blue-600 rounded-xl">
                <ShoppingBag className="w-5 h-5 text-white" />
                <span className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {totalItemCount}
                </span>
              </div>
              <div className="text-left">
                <div className="text-[11px] text-slate-300 font-medium">Cart Total ({cartLines.length} items)</div>
                <div className="text-base font-black font-mono">{formatINR(totals.grandTotal)}</div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs font-bold text-blue-400 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
              <span>View & Pay</span>
              <ChevronUp className="w-4 h-4" />
            </div>
          </button>
        </div>
      )}

      {/* Checkout Drawer (Bottom Sheet) */}
      {isCartDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-6">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Current Bill</h3>
                <p className="text-[11px] text-slate-500">{totalItemCount} items selected</p>
              </div>
              <button
                onClick={() => setIsCartDrawerOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cart Line List */}
            <div className="p-4 flex-1 overflow-y-auto divide-y divide-slate-100 space-y-2">
              {cartLines.map((line) => (
                <div key={line.itemId} className="pt-2 flex items-center justify-between">
                  <div className="flex-1 pr-2">
                    <div className="font-semibold text-xs text-slate-900">{line.itemName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {formatINR(line.unitPrice)} x {line.quantity}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-0.5">
                      <button
                        onClick={() => updateQuantity(line.itemId, -1)}
                        className="w-6 h-6 bg-white rounded text-slate-800 flex items-center justify-center font-bold text-xs shadow-2xs"
                      >
                        -
                      </button>
                      <span className="font-mono text-xs font-bold px-1.5">{line.quantity}</span>
                      <button
                        onClick={() => updateQuantity(line.itemId, 1)}
                        className="w-6 h-6 bg-white rounded text-slate-800 flex items-center justify-center font-bold text-xs shadow-2xs"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-mono font-bold text-xs text-slate-900 w-16 text-right">
                      {formatINR(line.totalAmount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Payment & Totals Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
              {/* Payment Mode */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'CASH', label: 'Cash', icon: Banknote },
                  { id: 'UPI', label: 'UPI QR', icon: QrCode },
                  { id: 'CREDIT', label: 'Udhar', icon: CreditCard },
                ].map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setPaymentMode(m.id as PaymentMode)}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition ${
                        paymentMode === m.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Total Row */}
              <div className="flex items-center justify-between text-slate-900">
                <span className="text-xs font-medium text-slate-600">Grand Total (incl. GST)</span>
                <span className="text-xl font-black font-mono">{formatINR(totals.grandTotal)}</span>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={isSaving}
                  onClick={() => handleCheckout(true)}
                  className="py-3 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition"
                >
                  <Printer className="w-4 h-4 text-emerald-400" />
                  <span>Print Receipt</span>
                </button>

                <button
                  disabled={isSaving}
                  onClick={() => handleCheckout(false)}
                  className="py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSaving ? 'Processing...' : 'Complete Bill'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification after billing */}
      {lastSaved && (
        <div className="fixed top-16 inset-x-4 z-40 bg-slate-900 text-white p-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center justify-between">
          <div>
            <div className="font-semibold text-xs text-emerald-400">Bill Saved! #{lastSaved.invoiceNumber}</div>
            <div className="text-[11px] text-slate-300">{formatINR(lastSaved.grandTotal)} · {lastSaved.paymentMode}</div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={generateWhatsAppInvoiceURL(lastSaved, company)}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Share</span>
            </a>
            <button
              onClick={() => setLastSaved(null)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
