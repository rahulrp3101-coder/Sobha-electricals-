import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Item, Party, Invoice, InvoiceItem, CompanyProfile, PaymentMode, DocumentType, PartyType 
} from '../../types';
import { 
  calculateItemGST, calculateInvoiceTotals, formatINR 
} from '../../services/gstCalculator';
import { PartySelectModal } from './PartySelectModal';
import { FinalInvoiceModal } from './FinalInvoiceModal';
import { BarcodeCameraModal } from './BarcodeCameraModal';
import { DynamicUpiQrModal } from './DynamicUpiQrModal';
import { UniversalCustomerSearch } from '../common/UniversalCustomerSearch';
import { generateUpiQrDataUrl } from '../../services/upiQrService';
import { playBarcodeBeep } from '../../services/soundEffects';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { 
  Plus, Search, Camera, Trash2, Printer, Check, ShoppingBag, 
  UserCheck, AlertTriangle, QrCode, CreditCard, Banknote, 
  X, Clock, RotateCcw, FileText, ChevronRight, Smartphone, Sparkles
} from 'lucide-react';

interface VyaparPOSViewProps {
  items: Item[];
  parties: Party[];
  company: CompanyProfile;
  invoices: Invoice[];
  onSaveInvoice: (invoice: Invoice, printImmediate?: boolean, printFormat?: 'thermal' | 'a4') => Promise<Invoice>;
  onSaveParty: (party: Party) => Promise<void>;
  onSaveItem?: (item: Item) => Promise<void>;
  onOpenPaymentIn?: () => void;
  onViewInvoice?: (invoice: Invoice, format: 'thermal' | 'a4') => void;
  initialDraftEstimate?: Invoice | null;
  onClearDraftEstimate?: () => void;
}

export const VyaparPOSView: React.FC<VyaparPOSViewProps> = ({
  items,
  parties,
  company,
  invoices,
  onSaveInvoice,
  onSaveParty,
  onSaveItem,
  onOpenPaymentIn,
  onViewInvoice,
  initialDraftEstimate,
  onClearDraftEstimate,
}) => {
  // Default Customer (Walk-in Customer)
  const defaultWalkInParty: Party = useMemo(() => {
    return (
      parties.find(p => p.id === 'pty-001' || p.name.toLowerCase().includes('walk-in')) ||
      parties.find(p => p.type === 'CUSTOMER') || {
        id: 'pty-walkin',
        name: 'Walk-in Customer (नकद ग्राहक)',
        phone: '',
        address: 'Counter',
        creditLimit: 0,
        type: 'CUSTOMER',
        currentBalance: 0,
        state: company.state || 'Rajasthan',
        stateCode: company.stateCode || '08',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    );
  }, [parties, company]);

  // Selected Party for Current Bill
  const [selectedParty, setSelectedParty] = useState<Party>(defaultWalkInParty);
  const [isPartyModalOpen, setIsPartyModalOpen] = useState<boolean>(false);

  // Cart Lines for Current Bill
  const [cartLines, setCartLines] = useState<InvoiceItem[]>([]);
  const [editingQtyItemId, setEditingQtyItemId] = useState<string | null>(null);
  const [editingQtyVal, setEditingQtyVal] = useState<string>('');

  // Mode Switch Toggle: 'TAX_INVOICE' vs 'ESTIMATE' (Requirement 1 & 2)
  const [billingMode, setBillingMode] = useState<'TAX_INVOICE' | 'ESTIMATE'>('TAX_INVOICE');
  const [estimateDeductStock, setEstimateDeductStock] = useState<boolean>(false);
  const [convertedFromEstimateId, setConvertedFromEstimateId] = useState<string | null>(null);

  // Pre-load draft estimate when converted from Estimates Register (Requirement 4)
  useEffect(() => {
    if (initialDraftEstimate) {
      const p = parties.find(party => party.id === initialDraftEstimate.partyId) || {
        id: initialDraftEstimate.partyId || `pty-${Date.now()}`,
        name: initialDraftEstimate.partyName,
        phone: initialDraftEstimate.partyPhone || '',
        address: initialDraftEstimate.partyAddress || '',
        type: 'CUSTOMER' as PartyType,
        creditLimit: 50000,
        currentBalance: 0,
        state: initialDraftEstimate.partyState || company.state,
        stateCode: initialDraftEstimate.partyStateCode || company.stateCode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setSelectedParty(p);
      setCartLines(initialDraftEstimate.items || []);
      setBillingMode('TAX_INVOICE');
      setConvertedFromEstimateId(initialDraftEstimate.id);
      showFlashToast(`🔄 कोटेशन #${initialDraftEstimate.invoiceNumber} लोड हो गया! अब पक्का बिल बनाएं।`);
      onClearDraftEstimate?.();
    }
  }, [initialDraftEstimate, parties, company, onClearDraftEstimate]);

  // Item Search & Input fields
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSearchItem, setSelectedSearchItem] = useState<Item | null>(null);
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [itemDiscountPercent, setItemDiscountPercent] = useState<number>(0);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState<boolean>(false);

  // Item Not Found in Stock & Quick Add State
  const [unrecognizedBarcode, setUnrecognizedBarcode] = useState<string | null>(null);
  const [isQuickAddingItem, setIsQuickAddingItem] = useState<boolean>(false);
  const [quickItemName, setQuickItemName] = useState<string>('');
  const [quickItemCategory, setQuickItemCategory] = useState<string>('General Goods (सामान्य वस्तुएं)');
  const [quickItemRetailPrice, setQuickItemRetailPrice] = useState<number>(100);
  const [quickItemPurchasePrice, setQuickItemPurchasePrice] = useState<number>(80);
  const [quickItemUnit, setQuickItemUnit] = useState<'PCS' | 'KG' | 'PACK' | 'BOX' | 'LTR' | 'BAG'>('PCS');
  const [quickItemStock, setQuickItemStock] = useState<number>(20);
  const [quickItemTaxRate, setQuickItemTaxRate] = useState<number>(18);
  const [isSavingQuickItem, setIsSavingQuickItem] = useState<boolean>(false);

  // Payment & Totals
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [receivedAmount, setReceivedAmount] = useState<number>(0);
  const [creditPaidAmount, setCreditPaidAmount] = useState<number>(0);
  const [creditPaymentMethod, setCreditPaymentMethod] = useState<'CASH' | 'UPI'>('CASH');
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');
  const [printFormatPref, setPrintFormatPref] = useState<'thermal' | 'a4'>('thermal');

  // Modals & Feedback
  const [showCameraScanner, setShowCameraScanner] = useState<boolean>(false);
  const [finalInvoice, setFinalInvoice] = useState<Invoice | null>(null);
  const [showFinalModal, setShowFinalModal] = useState<boolean>(false);
  const [showRecentBillsModal, setShowRecentBillsModal] = useState<boolean>(false);
  const [isUpiQrModalOpen, setIsUpiQrModalOpen] = useState<boolean>(false);
  const [inlineUpiQrUrl, setInlineUpiQrUrl] = useState<string>('');
  const [creditUpiQrUrl, setCreditUpiQrUrl] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedbackToast, setFeedbackToast] = useState<{ msg: string; isError?: boolean } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter items based on search input
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return items.filter(
      i =>
        i.name.toLowerCase().includes(q) ||
        (i.sku && i.sku.toLowerCase().includes(q)) ||
        (i.barcode && i.barcode.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [items, searchQuery]);

  // Flash feedback toast
  const showFlashToast = (msg: string, isError = false) => {
    setFeedbackToast({ msg, isError });
    setTimeout(() => setFeedbackToast(null), 3000);
  };

  // Hardware barcode listener
  useBarcodeScanner({
    onScan: (barcode) => {
      handleBarcodeScanned(barcode);
    },
  });

  const handleBarcodeScanned = (code: string) => {
    const cleanCode = code.trim().toLowerCase();
    const foundItem = items.find(
      i =>
        (i.barcode && i.barcode.trim().toLowerCase() === cleanCode) ||
        (i.sku && i.sku.trim().toLowerCase() === cleanCode)
    );

    // Clear search box and dropdown so hardware scanner characters don't linger
    setSearchQuery('');
    setIsSearchDropdownOpen(false);

    if (foundItem) {
      playBarcodeBeep();
      // Requirement 2: Use the quantity from the top Quantity box if preset (e.g., 5), otherwise default to 1 (+1 on Re-scan)
      const qtyToAdd = itemQuantity > 0 ? itemQuantity : 1;
      addItemToCartDirectly(foundItem, qtyToAdd, 0);
      showFlashToast(`⚡ स्कैन सफल: +${qtyToAdd} ${foundItem.name} (${formatINR(foundItem.retailPrice || foundItem.wholesalePrice)})`);
      // Reset top quantity box back to 1 for subsequent normal scans
      setItemQuantity(1);
    } else {
      // Barcode not in database -> Quick Add
      playBarcodeBeep();
      setUnrecognizedBarcode(code.trim());
      handleOpenQuickAddForm('', code.trim());
    }
  };

  const handleOpenQuickAddForm = (initialName: string = '', initialBarcode: string = '') => {
    setQuickItemName(initialName);
    setQuickItemCategory('General Goods (सामान्य वस्तुएं)');
    setQuickItemRetailPrice(100);
    setQuickItemPurchasePrice(80);
    setQuickItemUnit('PCS');
    setQuickItemStock(20);
    setQuickItemTaxRate(18);
    setUnrecognizedBarcode(initialBarcode || null);
    setIsQuickAddingItem(true);
  };

  const handleQuickItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickItemName.trim()) return;

    setIsSavingQuickItem(true);
    try {
      const newItem: Item = {
        id: `itm-${Date.now()}`,
        name: quickItemName.trim(),
        category: quickItemCategory.trim(),
        sku: `SKU-${String(Date.now()).slice(-6)}`,
        barcode: unrecognizedBarcode || undefined,
        hsn: '19053100',
        unit: quickItemUnit,
        purchasePrice: Number(quickItemPurchasePrice) || 0,
        wholesalePrice: Number(quickItemRetailPrice) * 0.9,
        retailPrice: Number(quickItemRetailPrice) || 0,
        taxRate: Number(quickItemTaxRate) || 18,
        taxInclusive: true,
        currentStock: Number(quickItemStock) || 10,
        lowStockThreshold: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (onSaveItem) {
        await onSaveItem(newItem);
      }

      playBarcodeBeep();
      addItemToCartDirectly(newItem, 1, 0);

      showFlashToast(`नया आइटम स्टॉक व बिल में जुड़ा: ${newItem.name}`);
      setUnrecognizedBarcode(null);
      setIsQuickAddingItem(false);
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to quick add item:', err);
      showFlashToast('सामान सेव करने में त्रुटि हुई', true);
    } finally {
      setIsSavingQuickItem(false);
    }
  };

  // Add Item to cart with quantity & discount
  const addItemToCartDirectly = (
    item: Item,
    qty: number = 1,
    discountPercent: number = 0
  ) => {
    const sellerStateCode = company.stateCode;
    const buyerStateCode = selectedParty ? selectedParty.stateCode || company.stateCode : company.stateCode;
    const rate = item.retailPrice || item.wholesalePrice;

    const existingIdx = cartLines.findIndex(l => l.itemId === item.id);
    if (existingIdx >= 0) {
      const updated = [...cartLines];
      const line = updated[existingIdx];
      const newQty = line.quantity + qty;
      const gst = calculateItemGST({
        quantity: newQty,
        rate: line.unitPrice,
        taxRate: item.taxRate,
        discountPercent: line.discountPercent,
        isTaxInclusive: true,
        sellerStateCode,
        buyerStateCode,
      });

      updated[existingIdx] = {
        ...line,
        quantity: newQty,
        taxableAmount: gst.taxableAmount,
        cgstAmount: gst.cgstAmount,
        sgstAmount: gst.sgstAmount,
        igstAmount: gst.igstAmount,
        totalAmount: gst.totalAmount,
      };
      setCartLines(updated);
    } else {
      const gst = calculateItemGST({
        quantity: qty,
        rate,
        taxRate: item.taxRate,
        discountPercent,
        isTaxInclusive: true,
        sellerStateCode,
        buyerStateCode,
      });

      const newLine: InvoiceItem = {
        itemId: item.id,
        itemName: item.name,
        hsn: item.hsn,
        unit: item.unit,
        quantity: qty,
        unitPrice: rate,
        discountPercent,
        discountAmount: (rate * qty * discountPercent) / 100,
        taxRate: item.taxRate,
        taxableAmount: gst.taxableAmount,
        cgstAmount: gst.cgstAmount,
        sgstAmount: gst.sgstAmount,
        igstAmount: gst.igstAmount,
        cessAmount: 0,
        totalAmount: gst.totalAmount,
      };
      setCartLines([newLine, ...cartLines]);
    }
  };

  // Update line quantity in cart
  const updateLineQty = (idx: number, newQty: number) => {
    if (newQty <= 0) {
      setCartLines(cartLines.filter((_, i) => i !== idx));
      return;
    }

    const updated = [...cartLines];
    const line = updated[idx];
    const item = items.find(i => i.id === line.itemId);
    const taxRate = item ? item.taxRate : line.taxRate;
    const sellerStateCode = company.stateCode;
    const buyerStateCode = selectedParty ? selectedParty.stateCode || company.stateCode : company.stateCode;

    const gst = calculateItemGST({
      quantity: newQty,
      rate: line.unitPrice,
      taxRate,
      discountPercent: line.discountPercent,
      isTaxInclusive: true,
      sellerStateCode,
      buyerStateCode,
    });

    updated[idx] = {
      ...line,
      quantity: newQty,
      taxableAmount: gst.taxableAmount,
      cgstAmount: gst.cgstAmount,
      sgstAmount: gst.sgstAmount,
      igstAmount: gst.igstAmount,
      totalAmount: gst.totalAmount,
    };
    setCartLines(updated);
  };

  // Remove line from cart
  const removeLine = (idx: number) => {
    setCartLines(cartLines.filter((_, i) => i !== idx));
  };

  // Invoice calculations
  const totals = calculateInvoiceTotals(cartLines);

  // Sync received amount based on payment mode
  useEffect(() => {
    if (paymentMode === 'CREDIT') {
      const sanitized = Math.min(totals.grandTotal, Math.max(0, Number(creditPaidAmount) || 0));
      setReceivedAmount(sanitized);
    } else {
      setReceivedAmount(totals.grandTotal);
      setCreditPaidAmount(0);
    }
  }, [totals.grandTotal, paymentMode, creditPaidAmount]);

  // Generate Dynamic UPI QR Code with exact bill amount
  useEffect(() => {
    if (paymentMode === 'UPI' && totals.grandTotal > 0) {
      generateUpiQrDataUrl(
        company.upiId || 'merchant@upi',
        company.name || 'Merchant Store',
        totals.grandTotal,
        'BILL',
        220
      )
        .then(url => setInlineUpiQrUrl(url))
        .catch(err => console.error('Failed to generate inline UPI QR:', err));
    } else if (paymentMode === 'CREDIT' && creditPaymentMethod === 'UPI' && creditPaidAmount > 0) {
      generateUpiQrDataUrl(
        company.upiId || 'merchant@upi',
        company.name || 'Merchant Store',
        creditPaidAmount,
        'PARTIAL_BILL',
        220
      )
        .then(url => setCreditUpiQrUrl(url))
        .catch(err => console.error('Failed to generate partial UPI QR:', err));
    }
  }, [paymentMode, totals.grandTotal, creditPaymentMethod, creditPaidAmount, company.upiId, company.name]);

  // Reset bill to fresh state
  const handleResetBill = () => {
    setSelectedParty(defaultWalkInParty);
    setCartLines([]);
    setSearchQuery('');
    setSelectedSearchItem(null);
    setItemQuantity(1);
    setItemDiscountPercent(0);
    setPaymentMode('CASH');
    setCreditPaidAmount(0);
    setInvoiceNotes('');
    setBillingMode('TAX_INVOICE');
    setEstimateDeductStock(false);
    setConvertedFromEstimateId(null);
    searchInputRef.current?.focus();
    showFlashToast('नया बिल तैयार (Cart Reset)');
  };

  // Finalize & Save Bill
  const handleFinalizeBill = async () => {
    if (cartLines.length === 0) {
      showFlashToast('कृपया बिल में कम से कम एक सामान जोड़ें', true);
      searchInputRef.current?.focus();
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date();
      const isEstimateMode = billingMode === 'ESTIMATE';
      const invoiceNumber = isEstimateMode
        ? `EST-${now.getFullYear()}-${String(Date.now()).slice(-5)}`
        : `${company.invoicePrefix || 'INV-'}${now.getFullYear()}-${String(Date.now()).slice(-5)}`;

      const isUdhar = paymentMode === 'CREDIT';
      const actualReceived = isUdhar
        ? Math.min(totals.grandTotal, Math.max(0, Number(creditPaidAmount) || 0))
        : receivedAmount;
      const balanceDue = Math.max(0, totals.grandTotal - actualReceived);
      const invoiceStatus: 'PAID' | 'PARTIAL' | 'UNPAID' =
        balanceDue === 0 ? 'PAID' : actualReceived > 0 ? 'PARTIAL' : 'UNPAID';

      let finalNotes = invoiceNotes.trim();
      if (isEstimateMode) {
        const estNote = estimateDeductStock 
          ? 'ESTIMATE (Stock Deducted / स्टॉक कम किया गया)' 
          : 'ESTIMATE / QUOTATION (कच्चा पर्चा / स्टॉक सुरक्षित)';
        finalNotes = finalNotes ? `${finalNotes} | ${estNote}` : estNote;
      } else if (convertedFromEstimateId) {
        const convNote = `Converted from Estimate #${convertedFromEstimateId}`;
        finalNotes = finalNotes ? `${finalNotes} | ${convNote}` : convNote;
      } else if (isUdhar && actualReceived > 0) {
        const partialNote = `Partial Paid: ${formatINR(actualReceived)} (${creditPaymentMethod}), Udhar: ${formatINR(balanceDue)}`;
        finalNotes = finalNotes ? `${finalNotes} | ${partialNote}` : partialNote;
      }

      const invoice: Invoice = {
        id: isEstimateMode ? `est-${Date.now()}` : `inv-${Date.now()}`,
        invoiceNumber,
        documentType: isEstimateMode ? ('ESTIMATE' as DocumentType) : ('SALES_INVOICE' as DocumentType),
        deductStock: isEstimateMode ? estimateDeductStock : true,
        partyId: selectedParty.id,
        partyName: selectedParty.name,
        partyPhone: selectedParty.phone,
        partyAddress: selectedParty.address,
        partyGstin: selectedParty.gstin,
        partyState: selectedParty.state || company.state,
        partyStateCode: selectedParty.stateCode || company.stateCode,
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
        receivedAmount: isEstimateMode ? 0 : actualReceived,
        balanceAmount: isEstimateMode ? totals.grandTotal : balanceDue,
        paymentMode: isEstimateMode ? 'CASH' : (isUdhar && actualReceived > 0 ? 'SPLIT' : paymentMode),
        status: isEstimateMode ? 'UNPAID' : invoiceStatus,
        notes: finalNotes || undefined,
        isSynced: true,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      const saved = await onSaveInvoice(invoice, false, printFormatPref);

      // If converted from an estimate, mark original estimate as converted
      if (convertedFromEstimateId) {
        const originalEst = invoices.find(inv => inv.id === convertedFromEstimateId);
        if (originalEst) {
          const updatedEst: Invoice = {
            ...originalEst,
            isConvertedToInvoice: true,
            convertedInvoiceId: saved.id,
            updatedAt: new Date().toISOString(),
          };
          await onSaveInvoice(updatedEst, false);
        }
        setConvertedFromEstimateId(null);
      }

      setFinalInvoice(saved);
      setShowFinalModal(true);

      // Reset cart lines for next instant bill
      setCartLines([]);
      setCreditPaidAmount(0);
      setInvoiceNotes('');
      showFlashToast(
        isEstimateMode 
          ? `📝 एस्टिमेट #${saved.invoiceNumber} सुरक्षित सेव हो गया` 
          : `⚡ टैक्स इनवॉइस #${saved.invoiceNumber} सफलतापूर्वक सेव हो गया`
      );
    } catch (err) {
      console.error('Error saving invoice:', err);
      showFlashToast('बिल सेव करने में त्रुटि हुई', true);
    } finally {
      setIsSaving(false);
    }
  };

  // Keyboard shortcut listener: Ctrl+Enter or F8 to finalize bill (F2 is dedicated for Universal Customer Search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === 'Enter') || e.key === 'F8') {
        e.preventDefault();
        if (cartLines.length > 0 && !isSaving) {
          handleFinalizeBill();
        }
      } else if (e.key === 'F4') {
        e.preventDefault();
        setIsPartyModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cartLines, isSaving, handleFinalizeBill]);

  // Today's summary stats
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayInvoices = useMemo(() => {
    return invoices.filter(
      i =>
        i.date.startsWith(todayStr) &&
        (i.documentType === 'SALES_INVOICE' || !i.documentType) &&
        i.status !== 'CANCELLED'
    );
  }, [invoices, todayStr]);

  const todaySalesTotal = useMemo(() => {
    return todayInvoices.reduce((s, i) => s + (i.grandTotal || 0), 0);
  }, [todayInvoices]);

  return (
    <div className="h-full w-full flex flex-col bg-slate-100 overflow-hidden text-slate-900 select-none">
      {/* Toast Notification */}
      {feedbackToast && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold flex items-center gap-2 border ${
              feedbackToast.isError
                ? 'bg-red-600 text-white border-red-700'
                : 'bg-emerald-600 text-white border-emerald-700'
            }`}
          >
            {feedbackToast.isError ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <Check className="w-4 h-4 shrink-0 stroke-[3]" />
            )}
            <span>{feedbackToast.msg}</span>
          </div>
        </div>
      )}

      {/* Estimate Mode Notification Banner (Requirement 1 & 3) */}
      {billingMode === 'ESTIMATE' && (
        <div className="bg-amber-500 text-white px-3 py-1.5 text-xs font-bold flex items-center justify-between shadow-xs animate-in slide-in-from-top-1 duration-150 z-30">
          <div className="flex items-center gap-2">
            <span className="text-sm">📝</span>
            <span>कोटेशन / कच्चा बिल मोड सक्रिय है (ESTIMATE MODE ACTIVE) — यह राशि मुख्य GST टर्नओवर व सेल्स टैक्स रिपोर्ट में शामिल नहीं होगी।</span>
          </div>
          <button
            type="button"
            onClick={() => setBillingMode('TAX_INVOICE')}
            className="text-[11px] bg-white/20 hover:bg-white/30 text-white px-2.5 py-0.5 rounded-lg font-bold cursor-pointer transition active:scale-95"
          >
            वापस Tax Invoice पर जाएँ ↵
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TOP FIXED HEADER (COMPACT STRIP: CUSTOMER & ITEM SEARCH)               */}
      {/* ========================================================================= */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-2.5 py-2 sm:px-4 sm:py-2.5 z-20 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          {/* Left Side: Smart Universal Customer Search & Active Customer View (Requirement 1, 2, 3, 4) */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0 font-bold">
              <UserCheck className="w-4 h-4" />
            </div>

            {/* Smart Universal Search Bar (Omni-Search, Live Card Dropdown, Keyboard Nav, Quick Add) */}
            <div className="flex-1 min-w-[200px] max-w-xs sm:max-w-sm lg:max-w-md">
              <UniversalCustomerSearch
                parties={parties}
                selectedParty={selectedParty}
                onSelectParty={(party) => {
                  setSelectedParty(party);
                  showFlashToast(`ग्राहक चुना गया: ${party.name}`);
                }}
                onQuickAddParty={async (name, phone) => {
                  const newParty: Party = {
                    id: `pty-${Date.now()}`,
                    name,
                    type: 'CUSTOMER',
                    phone,
                    address: '',
                    state: company.state || 'Maharashtra',
                    stateCode: company.stateCode || '27',
                    creditLimit: 50000,
                    currentBalance: 0,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  };
                  await onSaveParty(newParty);
                  setSelectedParty(newParty);
                  showFlashToast(`नया ग्राहक जोड़ा गया: ${newParty.name}`);
                  return newParty;
                }}
                placeholder="ग्राहक खोजें (मोबाइल पूरा/अंतिम अंक, नाम, गाँव, दुकान)... [F2 / Alt+C]"
                shortcutHint="F2 / Alt+C"
                isPOSMode={true}
                filterType="CUSTOMER"
              />
            </div>

            {/* Selected Customer Status Badge */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <div className="flex flex-col text-left">
                <span className="text-xs font-black text-slate-900 truncate max-w-[130px]">
                  {selectedParty.name}
                </span>
                {selectedParty.phone && (
                  <span className="text-[10px] text-slate-500 font-mono">
                    {selectedParty.phone}
                  </span>
                )}
              </div>

              {selectedParty.currentBalance !== 0 && (
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                  selectedParty.currentBalance > 0
                    ? 'bg-red-100 text-red-800 border border-red-300 font-extrabold'
                    : 'bg-purple-100 text-purple-900 border border-purple-300'
                }`}>
                  {selectedParty.currentBalance > 0
                    ? `${formatINR(selectedParty.currentBalance)} बाकी`
                    : `${formatINR(Math.abs(selectedParty.currentBalance))} जमा`}
                </span>
              )}
            </div>

            {/* Mode Switch Toggle: Tax Invoice vs Estimate / Quotation (Requirement 1) */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-300 shrink-0">
              <button
                type="button"
                onClick={() => setBillingMode('TAX_INVOICE')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  billingMode === 'TAX_INVOICE'
                    ? 'bg-blue-600 text-white shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="पक्का टैक्स इनवॉइस मोड (Official GST Tax Invoice)"
              >
                <span>🧾 Tax Invoice</span>
                <span className="hidden xl:inline text-[11px] font-normal">(पक्का बिल)</span>
              </button>
              <button
                type="button"
                onClick={() => setBillingMode('ESTIMATE')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  billingMode === 'ESTIMATE'
                    ? 'bg-amber-500 text-white shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="कच्चा बिल / कोटेशन मोड (Estimate / Quotation Slip)"
              >
                <span>📝 Estimate</span>
                <span className="hidden xl:inline text-[11px] font-normal">(कच्चा पर्चा)</span>
              </button>
            </div>

            {/* Change customer list modal fallback button */}
            <button
              type="button"
              onClick={() => setIsPartyModalOpen(true)}
              className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition border border-slate-300 active:scale-95 shrink-0"
              title="पार्टी सूची मोडल (F4)"
            >
              <span>सूची</span>
            </button>

            {/* Today Sales Quick Badge */}
            <button
              type="button"
              onClick={() => setShowRecentBillsModal(true)}
              className="hidden xl:flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 transition shrink-0"
              title="View today's generated bills"
            >
              <Clock className="w-3 h-3 text-slate-500" />
              <span>Today: <strong>{formatINR(todaySalesTotal)}</strong> ({todayInvoices.length})</span>
            </button>

            {/* Clear Cart / Reset Bill button */}
            {cartLines.length > 0 && (
              <button
                type="button"
                onClick={handleResetBill}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition shrink-0"
                title="Reset active bill (नया बिल)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Right Side: Compact Item Search & Add Strip */}
          <div className="flex items-center gap-1.5 shrink-0 min-w-0">
            {/* Search Input with Autocomplete */}
            <div className="relative flex-1 sm:w-72 md:w-80">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchDropdownOpen(true);
                }}
                onFocus={() => setIsSearchDropdownOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (searchResults.length > 0) {
                      const first = searchResults[0];
                      addItemToCartDirectly(first, itemQuantity, itemDiscountPercent);
                      showFlashToast(`+${itemQuantity} ${first.name}`);
                      setSearchQuery('');
                      setSelectedSearchItem(null);
                      setIsSearchDropdownOpen(false);
                      setItemQuantity(1);
                      setItemDiscountPercent(0);
                    } else if (searchQuery.trim()) {
                      handleOpenQuickAddForm(searchQuery.trim());
                      setIsSearchDropdownOpen(false);
                    }
                  } else if (e.key === 'Escape') {
                    setIsSearchDropdownOpen(false);
                  }
                }}
                placeholder="Search Item / Scan Barcode (Enter)..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-semibold"
              />

              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedSearchItem(null);
                  }}
                  className="absolute right-2 top-2 p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}

              {/* Autocomplete Dropdown */}
              {isSearchDropdownOpen && searchQuery.trim().length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-64 overflow-y-auto z-50 p-1 divide-y divide-slate-100">
                  {searchResults.length > 0 ? (
                    <>
                      {searchResults.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            addItemToCartDirectly(item, itemQuantity, itemDiscountPercent);
                            showFlashToast(`+${itemQuantity} ${item.name}`);
                            setSearchQuery('');
                            setSelectedSearchItem(null);
                            setIsSearchDropdownOpen(false);
                            setItemQuantity(1);
                            setItemDiscountPercent(0);
                          }}
                          className="p-2 hover:bg-blue-50 rounded-xl cursor-pointer flex items-center justify-between text-xs transition"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="font-bold text-slate-900 truncate">{item.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              SKU: {item.sku} {item.barcode ? `· ${item.barcode}` : ''}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-bold text-blue-700">
                              {formatINR(item.retailPrice || item.wholesalePrice)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Stock: {item.currentStock} {item.unit}
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Quick Add Option */}
                      <div
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleOpenQuickAddForm(searchQuery.trim());
                          setIsSearchDropdownOpen(false);
                        }}
                        className="p-2 bg-blue-50/90 hover:bg-blue-100 text-blue-800 font-bold flex items-center justify-between text-xs cursor-pointer rounded-b-xl"
                      >
                        <span className="flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5 text-blue-600 stroke-[3]" />
                          <span>+ Add &quot;{searchQuery.trim()}&quot; to Stock</span>
                        </span>
                        <span className="text-[10px] bg-blue-200 text-blue-900 px-1.5 py-0.2 rounded font-mono">New Item</span>
                      </div>
                    </>
                  ) : (
                    <div className="p-3 text-center space-y-1.5">
                      <p className="text-xs text-slate-500">
                        Item not found for &quot;<strong className="text-slate-800">{searchQuery}</strong>&quot;
                      </p>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleOpenQuickAddForm(searchQuery.trim());
                          setIsSearchDropdownOpen(false);
                        }}
                        className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1 shadow-xs transition"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        <span>+ Add New Item &quot;{searchQuery}&quot; (नया आइटम जोड़ें)</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Camera Barcode Button */}
            <button
              type="button"
              onClick={() => setShowCameraScanner(true)}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1 shrink-0"
              title="Camera Barcode Scanner"
            >
              <Camera className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Camera</span>
            </button>

            {/* Quantity Input (Requirement 2.3: Preset Quantity for Scan & Add) */}
            <div 
              className="flex items-center bg-slate-50 border border-slate-300 rounded-xl px-1 py-0.5 shrink-0 focus-within:border-blue-500 focus-within:bg-white transition"
              title="स्कैन मात्रा: यदि यहाँ 5 डालते हैं, तो बारकोड स्कैन करने पर सीधे 5 मात्रा जुड़ेगी"
            >
              <span className="text-[10px] text-slate-500 font-bold px-1 hidden sm:inline">Qty:</span>
              <button
                type="button"
                onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                className="w-5 h-5 bg-white hover:bg-slate-200 rounded text-slate-800 font-bold flex items-center justify-center text-xs shadow-2xs cursor-pointer active:scale-95"
              >
                -
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={itemQuantity}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.currentTarget.select()}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  setItemQuantity(raw ? Math.max(1, parseInt(raw, 10)) : 1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    searchInputRef.current?.focus();
                  }
                }}
                className="w-8 text-center bg-transparent font-mono font-bold text-xs text-slate-900 focus:outline-none"
                title="स्कैन मात्रा डालें (उदा. 5) और बारकोड स्कैन करें"
              />
              <button
                type="button"
                onClick={() => setItemQuantity(itemQuantity + 1)}
                className="w-5 h-5 bg-white hover:bg-slate-200 rounded text-slate-800 font-bold flex items-center justify-center text-xs shadow-2xs cursor-pointer active:scale-95"
              >
                +
              </button>
            </div>

            {/* Discount % Input */}
            <div className="flex items-center bg-slate-50 border border-slate-300 rounded-xl px-1.5 py-1 shrink-0 w-16 sm:w-18">
              <span className="text-[10px] text-slate-400 font-bold mr-0.5">D%:</span>
              <input
                type="number"
                min="0"
                max="100"
                value={itemDiscountPercent || ''}
                placeholder="0"
                onChange={(e) => setItemDiscountPercent(Number(e.target.value) || 0)}
                className="w-full text-center bg-transparent font-mono font-bold text-xs text-slate-900 focus:outline-none"
              />
            </div>

            {/* Add Button */}
            <button
              type="button"
              onClick={() => {
                if (searchResults.length > 0) {
                  const target = searchResults[0];
                  addItemToCartDirectly(target, itemQuantity, itemDiscountPercent);
                  showFlashToast(`+${itemQuantity} ${target.name}`);
                  setSearchQuery('');
                  setSelectedSearchItem(null);
                  setItemQuantity(1);
                  setItemDiscountPercent(0);
                } else if (searchQuery.trim()) {
                  handleOpenQuickAddForm(searchQuery.trim());
                } else {
                  showFlashToast('कृपया पहले सामान का नाम या बारकोड खोजें', true);
                  searchInputRef.current?.focus();
                }
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1 shrink-0"
              title="Add item to bill"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>+ Add (जोड़ें)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MIDDLE SECTION: DEDICATED SCROLLABLE CART TABLE                        */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-3 min-h-0">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col h-full">
          {/* Table Container with Sticky Header */}
          <div className="flex-1 overflow-y-auto">
            {cartLines.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-500 border border-blue-100 flex items-center justify-center">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-800">
                    बिल खाली है (Cart is Empty)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 max-w-sm">
                    ऊपर दिए गए सर्च बार से सामान खोजें, बारकोड स्कैन करें या नीचे दिए गए लोकप्रिय सामानों पर क्लिक करें।
                  </p>
                </div>

                {/* Quick Catalog Chips */}
                {items.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      लोकप्रिय सामान (Quick Click to Add):
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg">
                      {items.slice(0, 8).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            addItemToCartDirectly(item, 1, 0);
                            showFlashToast(`+1 ${item.name}`);
                          }}
                          className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-800 border border-slate-200 hover:border-blue-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 active:scale-95 shadow-2xs"
                        >
                          <Plus className="w-3 h-3 text-blue-600 stroke-[3]" />
                          <span>{item.name}</span>
                          <span className="font-mono text-[11px] text-blue-700 font-extrabold">
                            {formatINR(item.retailPrice || item.wholesalePrice)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs text-slate-600 border-b border-slate-200 z-10 font-bold uppercase text-[11px] select-none shadow-2xs">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center text-slate-400">#</th>
                    <th className="py-2.5 px-3">Item Details (सामान का नाम)</th>
                    <th className="py-2.5 px-3 text-right">Rate (दर ₹)</th>
                    <th className="py-2.5 px-3 text-center">Qty (मात्रा)</th>
                    <th className="py-2.5 px-3 text-right">Tax (GST)</th>
                    <th className="py-2.5 px-3 text-right">Disc %</th>
                    <th className="py-2.5 px-3 text-right font-black">Total Amount (कुल राशि)</th>
                    <th className="py-2.5 px-3 w-12 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {cartLines.map((line, idx) => (
                    <tr key={line.itemId} className="hover:bg-blue-50/40 transition">
                      <td className="py-2 px-3 text-center font-mono text-slate-400 text-[11px]">
                        {idx + 1}
                      </td>

                      <td className="py-2 px-3">
                        <div className="font-extrabold text-slate-900 text-xs sm:text-sm">
                          {line.itemName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                          {line.hsn && <span>HSN: {line.hsn}</span>}
                          <span>Unit: {line.unit || 'PCS'}</span>
                        </div>
                      </td>

                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-700">
                        {formatINR(line.unitPrice)}
                      </td>

                      <td className="py-2 px-3 text-center">
                        <div className="inline-flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 shadow-2xs hover:border-blue-400 transition">
                          <button
                            type="button"
                            onClick={() => updateLineQty(idx, line.quantity - 1)}
                            className="w-6 h-6 bg-white hover:bg-slate-200 rounded text-slate-800 font-bold flex items-center justify-center text-xs active:bg-slate-300 transition cursor-pointer"
                            title="मात्रा घटाएं (-1)"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={editingQtyItemId === line.itemId ? editingQtyVal : line.quantity}
                            onFocus={(e) => {
                              setEditingQtyItemId(line.itemId);
                              setEditingQtyVal(String(line.quantity));
                              e.target.select();
                            }}
                            onClick={(e) => {
                              e.currentTarget.select();
                            }}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              setEditingQtyVal(raw);
                              const parsed = parseInt(raw, 10);
                              if (!isNaN(parsed) && parsed > 0) {
                                updateLineQty(idx, parsed);
                              }
                            }}
                            onBlur={() => {
                              const parsed = parseInt(editingQtyVal, 10);
                              if (isNaN(parsed) || parsed < 1) {
                                updateLineQty(idx, 1);
                              }
                              setEditingQtyItemId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const parsed = parseInt(editingQtyVal, 10);
                                if (isNaN(parsed) || parsed < 1) {
                                  updateLineQty(idx, 1);
                                }
                                setEditingQtyItemId(null);
                                e.currentTarget.blur();
                              }
                            }}
                            className="w-11 text-center bg-transparent font-mono font-bold text-xs text-slate-900 focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-600 rounded py-0.5 transition"
                            title="मात्रा बदलें: क्लिक करते ही पूरी संख्या सेलेक्ट होगी, सीधे टाइप करके Enter दबाएं"
                          />
                          <button
                            type="button"
                            onClick={() => updateLineQty(idx, line.quantity + 1)}
                            className="w-6 h-6 bg-white hover:bg-slate-200 rounded text-slate-800 font-bold flex items-center justify-center text-xs active:bg-slate-300 transition cursor-pointer"
                            title="मात्रा बढ़ाएं (+1)"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      <td className="py-2 px-3 text-right font-mono text-slate-600 text-xs">
                        <span>{line.taxRate}%</span>
                        <div className="text-[10px] text-slate-400">
                          {formatINR(line.cgstAmount + line.sgstAmount + line.igstAmount)}
                        </div>
                      </td>

                      <td className="py-2 px-3 text-right font-mono text-slate-600 text-xs">
                        {line.discountPercent > 0 ? (
                          <span className="text-emerald-700 font-bold">{line.discountPercent}%</span>
                        ) : (
                          <span className="text-slate-300">0%</span>
                        )}
                      </td>

                      <td className="py-2 px-3 text-right font-mono font-black text-sm text-slate-900">
                        {formatINR(line.totalAmount)}
                      </td>

                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(idx)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="हटाएं (Delete)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. BOTTOM FIXED FOOTER (COMPACT PAYMENT & ACTION BAR)                    */}
      {/* ========================================================================= */}
      <div className="shrink-0 bg-white border-t border-slate-200 px-3 py-2 sm:px-5 sm:py-2.5 z-20 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Left Side: Summary & Big Grand Total */}
          <div className="flex items-center gap-4 flex-wrap min-w-0">
            {/* Quick breakdown tags */}
            <div className="space-y-0.5 text-xs text-slate-600">
              <div className="flex items-center gap-3">
                <span>Subtotal (उप-कुल): <strong className="font-mono text-slate-900">{formatINR(totals.subTotal)}</strong></span>
                <span>•</span>
                <span>GST Tax: <strong className="font-mono text-slate-900">{formatINR(totals.totalTax)}</strong></span>
                {totals.totalDiscount > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-700 font-bold">छूट: -{formatINR(totals.totalDiscount)}</span>
                  </>
                )}
              </div>
              <div className="text-[10px] text-slate-400">
                Items: {cartLines.length} | Round Off: {totals.roundOff > 0 ? `+${totals.roundOff}` : totals.roundOff}
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block" />

            {/* Big Prominent Grand Total */}
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Grand Total (कुल राशि)
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-blue-700 leading-tight">
                {formatINR(totals.grandTotal)}
              </div>
            </div>
          </div>

          {/* Right Side: Payment Mode & Save/Print Bill */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Payment Mode Selector Pills */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              {[
                { id: 'CASH', label: '💵 Cash (नकद)' },
                { id: 'UPI', label: '📱 UPI / QR' },
                { id: 'CREDIT', label: '📒 Credit (उधार)' },
                { id: 'BANK_TRANSFER', label: '💳 Bank' },
              ].map((m) => {
                const isSelected = paymentMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setPaymentMode(m.id as PaymentMode);
                      if (m.id === 'UPI' && totals.grandTotal > 0) {
                        setIsUpiQrModalOpen(true);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                      isSelected
                        ? m.id === 'CREDIT'
                          ? 'bg-amber-500 text-white shadow-xs font-black'
                          : 'bg-blue-600 text-white shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Credit Partial Amount Input */}
            {paymentMode === 'CREDIT' && (
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 p-1 rounded-xl text-xs">
                <span className="text-[10px] text-amber-900 font-bold">Paid: ₹</span>
                <input
                  type="number"
                  min="0"
                  max={totals.grandTotal}
                  value={creditPaidAmount === 0 ? '' : creditPaidAmount}
                  placeholder="0.00"
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCreditPaidAmount(Math.min(totals.grandTotal, Math.max(0, isNaN(val) ? 0 : val)));
                  }}
                  className="w-16 pl-1 pr-1 py-0.5 bg-white border border-amber-300 rounded font-mono font-bold text-xs text-slate-900 focus:outline-none"
                />
                <span className="text-[10px] text-amber-800 font-bold">
                  Bal: {formatINR(Math.max(0, totals.grandTotal - creditPaidAmount))}
                </span>
              </div>
            )}

            {/* Quick Format Preference */}
            <div className="hidden xl:flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setPrintFormatPref('thermal')}
                className={`px-2 py-1 rounded-lg transition ${
                  printFormatPref === 'thermal' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                }`}
              >
                Thermal
              </button>
              <button
                type="button"
                onClick={() => setPrintFormatPref('a4')}
                className={`px-2 py-1 rounded-lg transition ${
                  printFormatPref === 'a4' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                }`}
              >
                A4
              </button>
            </div>

            {/* Deduct Stock Toggle in Estimate Mode (Requirement 2) */}
            {billingMode === 'ESTIMATE' && (
              <label 
                className="flex items-center gap-2 bg-amber-50 border border-amber-300 px-3 py-2 rounded-xl text-xs font-bold text-amber-950 cursor-pointer hover:bg-amber-100 transition shadow-2xs select-none"
                title="यदि टिक करेंगे तो एस्टिमेट सेव होने पर सामान इन्वेंटरी स्टॉक में से घटेगा"
              >
                <input
                  type="checkbox"
                  checked={estimateDeductStock}
                  onChange={(e) => setEstimateDeductStock(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600 cursor-pointer"
                />
                <span className="flex items-center gap-1">
                  <span>🔘 स्टॉक में से घटाएं?</span>
                  <span className="text-[10px] text-amber-800 font-medium hidden sm:inline">(Deduct stock)</span>
                </span>
              </label>
            )}

            {/* BIG SAVE & PRINT BILL BUTTON */}
            <button
              type="button"
              disabled={isSaving || cartLines.length === 0}
              onClick={handleFinalizeBill}
              className={`py-2.5 px-5 sm:px-6 disabled:opacity-50 text-white rounded-xl text-xs sm:text-sm font-black transition shadow-lg flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${
                billingMode === 'ESTIMATE'
                  ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
              title={billingMode === 'ESTIMATE' ? 'Save & Print Estimate (Ctrl+Enter / F8)' : 'Save & Print Bill (Ctrl+Enter / F8)'}
            >
              <Printer className="w-4 h-4 stroke-[2.5]" />
              <span>
                {isSaving 
                  ? 'सेव हो रहा है...' 
                  : billingMode === 'ESTIMATE' 
                    ? '📝 Save & Print Estimate (कच्चा पर्चा)' 
                    : '💾 Save & Print Bill (प्रिंट करें)'}
              </span>
              <span className={`hidden sm:inline text-[10px] px-1.5 py-0.5 rounded font-mono ${
                billingMode === 'ESTIMATE' ? 'bg-amber-700 text-amber-100' : 'bg-emerald-700 text-emerald-100'
              }`}>
                Ctrl+↵ / F8
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODALS & OVERLAYS                                                        */}
      {/* ========================================================================= */}

      {/* Party Select Modal */}
      <PartySelectModal
        isOpen={isPartyModalOpen}
        onClose={() => setIsPartyModalOpen(false)}
        parties={parties}
        selectedPartyId={selectedParty.id}
        company={company}
        onSelectParty={(party) => {
          setSelectedParty(party);
          setIsPartyModalOpen(false);
          showFlashToast(`ग्राहक बदला गया: ${party.name}`);
        }}
        onSaveNewParty={onSaveParty}
      />

      {/* Barcode Camera Modal */}
      <BarcodeCameraModal
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onDetected={(barcode: string) => {
          handleBarcodeScanned(barcode);
          setShowCameraScanner(false);
        }}
      />

      {/* Dynamic UPI QR Code Modal */}
      <DynamicUpiQrModal
        isOpen={isUpiQrModalOpen}
        onClose={() => setIsUpiQrModalOpen(false)}
        upiId={company.upiId}
        shopName={company.name}
        amount={
          paymentMode === 'CREDIT' && creditPaidAmount > 0
            ? creditPaidAmount
            : totals.grandTotal
        }
        invoiceNumber="POS BILL"
        onConfirmPaid={() => {
          showFlashToast('UPI payment marked as received!');
          setIsUpiQrModalOpen(false);
        }}
      />

      {/* Final Invoice Success & Print Modal */}
      {showFinalModal && finalInvoice && (
        <FinalInvoiceModal
          isOpen={showFinalModal}
          invoice={finalInvoice}
          company={company}
          customerPreviousBalance={selectedParty.currentBalance}
          onClose={() => setShowFinalModal(false)}
          onPrintThermal={(inv) => {
            onViewInvoice?.(inv, 'thermal');
          }}
          onPrintA4={(inv) => {
            onViewInvoice?.(inv, 'a4');
          }}
          onStartNewBill={() => {
            setShowFinalModal(false);
            handleResetBill();
          }}
        />
      )}

      {/* Quick Add Product Modal (When barcode or name not found in stock) */}
      {isQuickAddingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400 stroke-[3]" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Quick Add Item to Stock (नया सामान जोड़ें)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickAddingItem(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickItemSubmit} className="p-4 sm:p-5 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Item Name (सामान का नाम) *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="उदा. Maggi 70g, Surf Excel, Amul Milk"
                  value={quickItemName}
                  onChange={(e) => setQuickItemName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              {unrecognizedBarcode && (
                <div className="p-2 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between font-mono">
                  <span className="text-slate-500">Barcode:</span>
                  <span className="font-bold text-blue-900">{unrecognizedBarcode}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Sale Price (बिक्री दर ₹) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={quickItemRetailPrice}
                    onChange={(e) => setQuickItemRetailPrice(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Purchase Price (खरीद ₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={quickItemPurchasePrice}
                    onChange={(e) => setQuickItemPurchasePrice(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">GST Tax Rate (%)</label>
                  <select
                    value={quickItemTaxRate}
                    onChange={(e) => setQuickItemTaxRate(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    {[0, 5, 12, 18, 28].map(r => (
                      <option key={r} value={r}>{r}% GST</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Unit (इकाई)</label>
                  <select
                    value={quickItemUnit}
                    onChange={(e) => setQuickItemUnit(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  >
                    {['PCS', 'KG', 'PACK', 'BOX', 'LTR', 'BAG'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQuickAddingItem(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition"
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickItem || !quickItemName.trim()}
                  className="flex-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition shadow-xs flex items-center justify-center gap-1"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingQuickItem ? 'सेव हो रहा है...' : 'Save & Add to Bill'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recent Invoices Drawer / Modal */}
      {showRecentBillsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Today&apos;s Invoices (आज के बिल - {todayInvoices.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRecentBillsModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <span>Total Generated Today:</span>
              <span className="font-mono font-black text-blue-700 text-base">
                {formatINR(todaySalesTotal)}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
              {todayInvoices.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  आज कोई बिल नहीं बना है
                </div>
              ) : (
                todayInvoices.map((inv) => (
                  <div key={inv.id} className="p-3 hover:bg-slate-50 rounded-xl flex items-center justify-between text-xs transition">
                    <div>
                      <div className="font-bold text-slate-900">{inv.invoiceNumber}</div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        {inv.partyName} · {inv.items?.length || 0} items
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div>
                        <div className="font-mono font-black text-slate-900">
                          {formatINR(inv.grandTotal)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {inv.paymentMode}
                        </div>
                      </div>
                      {onViewInvoice && (
                        <button
                          type="button"
                          onClick={() => onViewInvoice(inv, 'thermal')}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition flex items-center gap-1"
                        >
                          <Printer className="w-3 h-3" />
                          <span>Print</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
