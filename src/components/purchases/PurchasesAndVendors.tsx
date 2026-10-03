import React, { useState, useMemo } from 'react';
import { 
  Party, Item, Invoice, PaymentTransaction, CompanyProfile, 
  InvoiceItem, PaymentMode, DocumentType 
} from '../../types';
import { formatINR, calculateItemGST, calculateInvoiceTotals } from '../../services/gstCalculator';
import { 
  Plus, Search, Building2, Users, FileText, ArrowDownLeft, 
  ArrowUpRight, RotateCcw, AlertTriangle, Check, Printer, 
  Phone, MapPin, Hash, Trash2, X, ChevronRight, DollarSign,
  Calendar, CreditCard, ShoppingBag, Eye, Edit, Camera, Sparkles
} from 'lucide-react';
import { AiBillScannerModal } from './AiBillScannerModal';

interface PurchasesAndVendorsProps {
  parties: Party[];
  items: Item[];
  invoices: Invoice[];
  payments: PaymentTransaction[];
  company: CompanyProfile;
  onSaveInvoice: (invoice: Invoice, printImmediate?: boolean, printFormat?: 'thermal' | 'a4') => Promise<Invoice>;
  onUpdateInvoice?: (updatedInvoice: Invoice, oldInvoice: Invoice) => Promise<Invoice>;
  onDeleteInvoice?: (invoiceId: string) => Promise<void>;
  onSaveParty: (party: Party) => Promise<void>;
  onSaveItem?: (item: Item) => Promise<void>;
  onRecordPayment: (payment: PaymentTransaction) => Promise<void>;
  onViewInvoice?: (invoice: Invoice, format: 'thermal' | 'a4') => void;
}

export const PurchasesAndVendors: React.FC<PurchasesAndVendorsProps> = ({
  parties,
  items,
  invoices,
  payments,
  company,
  onSaveInvoice,
  onUpdateInvoice,
  onDeleteInvoice,
  onSaveParty,
  onSaveItem,
  onRecordPayment,
  onViewInvoice,
}) => {
  // Main Sub-tabs: 'PURCHASE_BILLS' | 'SUPPLIERS' | 'RETURNS'
  const [activeTab, setActiveTab] = useState<'PURCHASE_BILLS' | 'SUPPLIERS' | 'RETURNS'>('PURCHASE_BILLS');

  // Supplier filter & search
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isAddSupplierModalOpen, setIsAddSupplierModalOpen] = useState(false);
  const [isNewPurchaseModalOpen, setIsNewPurchaseModalOpen] = useState(false);
  const [isAiScannerModalOpen, setIsAiScannerModalOpen] = useState(false);
  const [isPaymentOutModalOpen, setIsPaymentOutModalOpen] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnType, setReturnType] = useState<'SALES_RETURN' | 'PURCHASE_RETURN'>('PURCHASE_RETURN');
  const [selectedSupplierForLedger, setSelectedSupplierForLedger] = useState<Party | null>(null);

  // Supplier Form State
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierGstin, setSupplierGstin] = useState('');
  const [supplierOpeningBalance, setSupplierOpeningBalance] = useState(0); // positive = we owe them

  // Purchase Bill Form State
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [tempNewSupplier, setTempNewSupplier] = useState<{
    name: string;
    gstin?: string;
    phone?: string;
    address?: string;
    state?: string;
    stateCode?: string;
  } | null>(null);
  const [isInlineNewSupplierOpen, setIsInlineNewSupplierOpen] = useState(false);
  const [inlineSupplierName, setInlineSupplierName] = useState('');
  const [inlineSupplierPhone, setInlineSupplierPhone] = useState('');
  const [inlineSupplierGstin, setInlineSupplierGstin] = useState('');
  const [supplierBillNo, setSupplierBillNo] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchaseLines, setPurchaseLines] = useState<InvoiceItem[]>([]);
  const [purchasePaymentMode, setPurchasePaymentMode] = useState<PaymentMode>('CREDIT');
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseItemSearch, setPurchaseItemSearch] = useState('');
  const [isSavingPurchase, setIsSavingPurchase] = useState(false);

  // Payment Out Form State
  const [paymentOutPartyId, setPaymentOutPartyId] = useState('');
  const [paymentOutAmount, setPaymentOutAmount] = useState<number>(0);
  const [paymentOutMode, setPaymentOutMode] = useState<PaymentMode>('CASH');
  const [paymentOutRef, setPaymentOutRef] = useState('');
  const [paymentOutNotes, setPaymentOutNotes] = useState('');
  const [isSavingPaymentOut, setIsSavingPaymentOut] = useState(false);

  // Return Form State
  const [returnPartyId, setReturnPartyId] = useState('');
  const [returnLines, setReturnLines] = useState<InvoiceItem[]>([]);
  const [returnNotes, setReturnNotes] = useState('');
  const [isSavingReturn, setIsSavingReturn] = useState(false);

  // Feedback Toast
  const [toastMsg, setToastMsg] = useState<{ msg: string; isError?: boolean } | null>(null);

  const showToast = (msg: string, isError = false) => {
    setToastMsg({ msg, isError });
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Add New Item in Purchase Form State (Requirement 3)
  const [isAddNewItemModalOpen, setIsAddNewItemModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPurchasePrice, setNewItemPurchasePrice] = useState<number | ''>('');
  const [newItemSalePrice, setNewItemSalePrice] = useState<number | ''>('');
  const [newItemTaxRate, setNewItemTaxRate] = useState<number>(0);
  const [newItemHsn, setNewItemHsn] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('PCS');
  const [newItemCategory, setNewItemCategory] = useState('General');
  const [newItemInitialStock, setNewItemInitialStock] = useState<number>(0);
  const [isSavingNewItem, setIsSavingNewItem] = useState(false);

  // Edit Purchase Bill State (Requirement 2)
  const [editingPurchaseInvoice, setEditingPurchaseInvoice] = useState<Invoice | null>(null);

  // Delete Purchase Bill State (Requirement 3)
  const [purchaseToDelete, setPurchaseToDelete] = useState<Invoice | null>(null);
  const [isDeletingPurchase, setIsDeletingPurchase] = useState(false);

  // Edit Supplier Form State (Requirement 1)
  const [supplierToEdit, setSupplierToEdit] = useState<Party | null>(null);
  const [editSupplierName, setEditSupplierName] = useState('');
  const [editSupplierPhone, setEditSupplierPhone] = useState('');
  const [editSupplierAddress, setEditSupplierAddress] = useState('');
  const [editSupplierGstin, setEditSupplierGstin] = useState('');
  const [editSupplierOpeningBalance, setEditSupplierOpeningBalance] = useState<number>(0);
  const [isSavingEditSupplier, setIsSavingEditSupplier] = useState(false);

  const handleOpenEditSupplier = (supplier: Party) => {
    setSupplierToEdit(supplier);
    setEditSupplierName(supplier.name || '');
    setEditSupplierPhone(supplier.phone || '');
    setEditSupplierAddress(supplier.address || '');
    setEditSupplierGstin(supplier.gstin || '');
    setEditSupplierOpeningBalance(supplier.openingBalance || 0);
  };

  const handleSaveEditSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierToEdit || !editSupplierName.trim()) return;

    setIsSavingEditSupplier(true);
    try {
      const oldOpening = supplierToEdit.openingBalance || 0;
      const newOpening = Number(editSupplierOpeningBalance) || 0;
      const diff = newOpening - oldOpening;

      const updatedSupplier: Party = {
        ...supplierToEdit,
        name: editSupplierName.trim(),
        phone: editSupplierPhone.trim(),
        address: editSupplierAddress.trim(),
        gstin: editSupplierGstin ? editSupplierGstin.trim().toUpperCase() : undefined,
        openingBalance: newOpening,
        currentBalance: (supplierToEdit.currentBalance || 0) + diff,
        updatedAt: new Date().toISOString(),
      };

      await onSaveParty(updatedSupplier);
      showToast(`सप्लायर '${updatedSupplier.name}' का विवरण सफलतापूर्वक अपडेट हुआ!`);
      setSupplierToEdit(null);
    } catch (err: any) {
      console.error('Failed to update supplier:', err);
      showToast('सप्लायर अपडेट करने में त्रुटि: ' + (err.message || 'Error'), true);
    } finally {
      setIsSavingEditSupplier(false);
    }
  };

  const handleCreateNewItemForPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !onSaveItem) return;

    setIsSavingNewItem(true);
    try {
      const pPrice = Number(newItemPurchasePrice) || 0;
      const sPrice = Number(newItemSalePrice) || pPrice;
      const tax = Number(newItemTaxRate) || 0;
      const initStock = Number(newItemInitialStock) || 0;

      const createdItem: Item = {
        id: `itm-${Date.now()}`,
        name: newItemName.trim(),
        category: newItemCategory.trim() || 'General',
        sku: `SKU-${Date.now().toString().slice(-6)}`,
        purchasePrice: pPrice,
        retailPrice: sPrice,
        wholesalePrice: sPrice,
        taxRate: tax,
        taxInclusive: false,
        hsn: newItemHsn.trim() || '19053100',
        unit: (newItemUnit.trim() || 'PCS') as any,
        currentStock: initStock,
        lowStockThreshold: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSaveItem(createdItem);
      // Immediately add to current purchase bill
      handleAddPurchaseLine(createdItem);
      setPurchaseItemSearch('');
      setIsAddNewItemModalOpen(false);
      showToast(`नया सामान '${createdItem.name}' सफलतापूर्वक बन गया और बिल में जुड़ गया!`);

      // Reset form
      setNewItemName('');
      setNewItemPurchasePrice('');
      setNewItemSalePrice('');
      setNewItemTaxRate(0);
      setNewItemHsn('');
      setNewItemInitialStock(0);
    } catch (err: any) {
      console.error('Failed to add new item:', err);
      showToast('नया आइटम जोड़ने में त्रुटि: ' + (err.message || 'Error'), true);
    } finally {
      setIsSavingNewItem(false);
    }
  };

  // Filtered Suppliers
  const suppliers = useMemo(() => {
    return parties.filter(p => p.type === 'SUPPLIER');
  }, [parties]);

  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;
    const q = searchQuery.toLowerCase();
    return suppliers.filter(
      s => s.name.toLowerCase().includes(q) || s.phone.includes(q) || (s.gstin && s.gstin.toLowerCase().includes(q))
    );
  }, [suppliers, searchQuery]);

  // Filtered Purchase Invoices (PURCHASE_BILL & DEBIT_NOTE)
  const purchaseInvoices = useMemo(() => {
    return invoices.filter(i => i.documentType === 'PURCHASE_BILL' || i.documentType === 'DEBIT_NOTE');
  }, [invoices]);

  // Returns list (CREDIT_NOTE for sales return, DEBIT_NOTE for purchase return)
  const returnsList = useMemo(() => {
    return invoices.filter(i => i.documentType === 'CREDIT_NOTE' || i.documentType === 'DEBIT_NOTE');
  }, [invoices]);

  // Aggregate stats
  const totalPurchaseAmount = useMemo(() => {
    return purchaseInvoices
      .filter(i => i.documentType === 'PURCHASE_BILL')
      .reduce((sum, inv) => sum + inv.grandTotal, 0);
  }, [purchaseInvoices]);

  const totalPayableToSuppliers = useMemo(() => {
    // CurrentBalance: negative = we owe them (Payable)
    return suppliers.reduce((sum, s) => sum + (s.currentBalance < 0 ? Math.abs(s.currentBalance) : 0), 0);
  }, [suppliers]);

  // -------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------

  // Save New Supplier
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) return;

    try {
      const newParty: Party = {
        id: `supp-${Date.now()}`,
        name: supplierName.trim(),
        type: 'SUPPLIER',
        phone: supplierPhone.trim() || '9999999999',
        address: supplierAddress.trim() || '',
        gstin: supplierGstin.trim().toUpperCase() || undefined,
        state: company.state || 'Maharashtra',
        stateCode: company.stateCode || '27',
        creditLimit: 0,
        currentBalance: supplierOpeningBalance > 0 ? -supplierOpeningBalance : 0, // negative represents payable
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSaveParty(newParty);
      showToast(`Supplier added: ${newParty.name}`);
      setIsAddSupplierModalOpen(false);
      setSupplierName('');
      setSupplierPhone('');
      setSupplierAddress('');
      setSupplierGstin('');
      setSupplierOpeningBalance(0);
    } catch (err: any) {
      showToast('Failed to save supplier: ' + err.message, true);
    }
  };

  // Helper to get selected supplier (supports auto-created temp supplier)
  const selectedSupplier = useMemo(() => {
    if (selectedSupplierId === '__TEMP_NEW__' && tempNewSupplier) {
      return {
        id: '__TEMP_NEW__',
        name: tempNewSupplier.name,
        type: 'SUPPLIER' as const,
        phone: tempNewSupplier.phone || '9999999999',
        address: tempNewSupplier.address || '',
        gstin: tempNewSupplier.gstin,
        state: tempNewSupplier.state || company.state || 'Maharashtra',
        stateCode: tempNewSupplier.stateCode || company.stateCode || '27',
        creditLimit: 0,
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return suppliers.find(s => s.id === selectedSupplierId);
  }, [suppliers, selectedSupplierId, tempNewSupplier, company]);

  // Handle supplier selection change and recalculate existing lines' taxes
  const handleSelectSupplier = (suppId: string) => {
    if (suppId === '__ADD_INLINE__') {
      setIsInlineNewSupplierOpen(true);
      return;
    }
    setSelectedSupplierId(suppId);
    if (suppId !== '__TEMP_NEW__') {
      setTempNewSupplier(null);
    }
    const supp = suppId === '__TEMP_NEW__' && tempNewSupplier
      ? { stateCode: tempNewSupplier.stateCode || company.stateCode || '27' }
      : suppliers.find(s => s.id === suppId);

    const sellerStateCode = supp?.stateCode || company.stateCode || '27';
    const buyerStateCode = company.stateCode || '27';

    setPurchaseLines(prevLines =>
      prevLines.map(line => {
        const calc = calculateItemGST({
          rate: line.unitPrice,
          quantity: line.quantity,
          discountPercent: 0,
          taxRate: line.taxRate,
          isTaxInclusive: false,
          sellerStateCode,
          buyerStateCode,
        });
        return {
          ...line,
          taxableAmount: calc.taxableAmount,
          cgstAmount: calc.cgstAmount,
          sgstAmount: calc.sgstAmount,
          igstAmount: calc.igstAmount,
          totalAmount: calc.totalAmount,
        };
      })
    );
  };

  // Add Item Line to Purchase Bill (Tax Exclusive: Net Price + GST with MRP & Sale Price tracking)
  const handleAddPurchaseLine = (item: Item) => {
    const existingIndex = purchaseLines.findIndex(l => l.itemId === item.id);
    const initialMrp = item.retailPrice || item.purchasePrice || 100;
    const initialNetRate = item.purchasePrice || item.retailPrice || 100;
    const initialSalePrice = item.retailPrice || Math.round(initialNetRate * 1.20);
    const taxRate = item.taxRate !== undefined ? item.taxRate : 18;
    const sellerStateCode = selectedSupplier?.stateCode || company.stateCode || '27';
    const buyerStateCode = company.stateCode || '27';

    if (existingIndex >= 0) {
      const existing = purchaseLines[existingIndex];
      const newQty = existing.quantity + 1;
      const calc = calculateItemGST({
        rate: existing.unitPrice,
        quantity: newQty,
        discountPercent: 0,
        taxRate: existing.taxRate,
        isTaxInclusive: false, // Tax Exclusive
        sellerStateCode,
        buyerStateCode,
      });

      const updatedLines = [...purchaseLines];
      updatedLines[existingIndex] = {
        ...existing,
        quantity: newQty,
        taxableAmount: calc.taxableAmount,
        cgstAmount: calc.cgstAmount,
        sgstAmount: calc.sgstAmount,
        igstAmount: calc.igstAmount,
        totalAmount: calc.totalAmount,
      };
      setPurchaseLines(updatedLines);
      return;
    }

    const calc = calculateItemGST({
      rate: initialNetRate,
      quantity: 1,
      discountPercent: 0,
      taxRate: taxRate,
      isTaxInclusive: false, // Tax Exclusive: Net Price + GST
      sellerStateCode,
      buyerStateCode,
    });

    const newLine: InvoiceItem = {
      itemId: item.id,
      itemName: item.name,
      hsn: item.hsn || '19053100',
      unit: item.unit || 'PCS',
      quantity: 1,
      mrp: initialMrp,
      discountPercent: 0,
      discountAmount: 0,
      unitPrice: initialNetRate,
      salePrice: initialSalePrice,
      taxRate: taxRate,
      taxableAmount: calc.taxableAmount,
      cgstAmount: calc.cgstAmount,
      sgstAmount: calc.sgstAmount,
      igstAmount: calc.igstAmount,
      cessAmount: 0,
      totalAmount: calc.totalAmount,
    };

    setPurchaseLines([...purchaseLines, newLine]);
  };

  // Update Line in Purchase Bill (MRP, Discount %, Net Rate, Sale Price, Tax Rate, Qty)
  const handleUpdatePurchaseLine = (
    index: number,
    field: 'qty' | 'mrp' | 'discount' | 'netRate' | 'salePrice' | 'taxRate' | 'remove',
    val: number
  ) => {
    if (field === 'remove' || (field === 'qty' && val <= 0)) {
      setPurchaseLines(purchaseLines.filter((_, i) => i !== index));
      return;
    }

    const current = purchaseLines[index];
    let qty = field === 'qty' ? val : current.quantity;
    let mrp = field === 'mrp' ? val : (current.mrp ?? current.unitPrice);
    let disc = field === 'discount' ? val : (current.discountPercent ?? 0);
    let netRate = field === 'netRate' ? val : current.unitPrice;
    let salePrice = field === 'salePrice' ? val : (current.salePrice ?? Math.round(netRate * 1.20));
    let taxRate = field === 'taxRate' ? val : (current.taxRate ?? 18);

    // Rule: Net Rate Calculation
    // When MRP or Discount % changes: Net Rate = MRP - (MRP * Disc % / 100)
    if (field === 'mrp' || field === 'discount') {
      netRate = Math.round((mrp * (1 - disc / 100)) * 100) / 100;
      if (field === 'mrp' && salePrice < mrp) {
        salePrice = mrp;
      }
    } else if (field === 'netRate') {
      // If Net Rate is directly changed, calculate implied discount % if MRP > 0
      if (mrp > 0 && mrp >= netRate) {
        disc = Math.round(((mrp - netRate) / mrp) * 1000) / 10;
      }
    }

    const sellerStateCode = selectedSupplier?.stateCode || company.stateCode || '27';
    const buyerStateCode = company.stateCode || '27';

    const calc = calculateItemGST({
      rate: netRate,
      quantity: qty,
      discountPercent: 0,
      taxRate: taxRate,
      isTaxInclusive: false,
      sellerStateCode,
      buyerStateCode,
    });

    const updated: InvoiceItem = {
      ...current,
      quantity: qty,
      mrp,
      discountPercent: disc,
      discountAmount: ((mrp - netRate) * qty),
      unitPrice: netRate,
      salePrice,
      taxRate,
      taxableAmount: calc.taxableAmount,
      cgstAmount: calc.cgstAmount,
      sgstAmount: calc.sgstAmount,
      igstAmount: calc.igstAmount,
      totalAmount: calc.totalAmount,
    };

    const newArr = [...purchaseLines];
    newArr[index] = updated;
    setPurchaseLines(newArr);
  };

  // Handle auto-filling purchase bill from AI Bill Scanner
  const handleApplyScannedBill = (data: {
    supplierId: string;
    tempNewSupplier?: {
      name: string;
      gstin?: string;
      phone?: string;
      address?: string;
    };
    supplierBillNo: string;
    billDate: string;
    paymentMode: PaymentMode;
    lines: InvoiceItem[];
    notes?: string;
  }) => {
    if (data.tempNewSupplier) {
      setTempNewSupplier({
        ...data.tempNewSupplier,
        state: company.state || 'Maharashtra',
        stateCode: company.stateCode || '27',
      });
      setSelectedSupplierId('__TEMP_NEW__');
      setIsInlineNewSupplierOpen(false);
    } else {
      setTempNewSupplier(null);
      setSelectedSupplierId(data.supplierId);
      setIsInlineNewSupplierOpen(false);
    }
    setSupplierBillNo(data.supplierBillNo);
    setBillDate(data.billDate);
    setPurchasePaymentMode(data.paymentMode);
    setPurchaseLines(data.lines);
    if (data.notes) setPurchaseNotes(data.notes);
    setEditingPurchaseInvoice(null);
    setIsNewPurchaseModalOpen(true);
  };

  // Open Edit Purchase Bill Modal (Requirement 2)
  const handleOpenEditPurchase = (bill: Invoice) => {
    setEditingPurchaseInvoice(bill);
    setSelectedSupplierId(bill.partyId || '');
    setSupplierBillNo(bill.invoiceNumber || '');
    setBillDate(bill.date || new Date().toISOString().split('T')[0]);
    const billSellerState = bill.partyStateCode || company.stateCode || '27';
    const billBuyerState = company.stateCode || '27';

    setPurchaseLines(
      (bill.items || []).map(line => {
        const calc = calculateItemGST({
          rate: line.unitPrice,
          quantity: line.quantity,
          discountPercent: line.discountPercent || 0,
          taxRate: line.taxRate ?? 18,
          isTaxInclusive: false,
          sellerStateCode: billSellerState,
          buyerStateCode: billBuyerState,
        });
        return {
          ...line,
          taxRate: line.taxRate ?? 18,
          taxableAmount: calc.taxableAmount,
          cgstAmount: calc.cgstAmount,
          sgstAmount: calc.sgstAmount,
          igstAmount: calc.igstAmount,
          totalAmount: calc.totalAmount,
        };
      })
    );
    setPurchasePaymentMode(bill.paymentMode || 'CREDIT');
    setPurchaseNotes(bill.notes || '');
    setIsNewPurchaseModalOpen(true);
  };

  // Confirm Delete Purchase Bill with Stock and Supplier Balance Rollback (Requirement 3)
  const handleConfirmDeletePurchase = async () => {
    if (!purchaseToDelete || !onDeleteInvoice) return;
    setIsDeletingPurchase(true);
    try {
      const invNum = purchaseToDelete.invoiceNumber;
      await onDeleteInvoice(purchaseToDelete.id);
      showToast(`खरीद बिल #${invNum} सफलतापूर्वक डिलीट हो गया! स्टॉक व सप्लायर बैलेंस रोलबैक हो गए।`);
      setPurchaseToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete purchase invoice:', err);
      showToast('खरीद बिल डिलीट करने में त्रुटि: ' + (err.message || 'Error'), true);
    } finally {
      setIsDeletingPurchase(false);
    }
  };

  // Calculate Purchase Bill Totals
  const purchaseTotals = useMemo(() => {
    return calculateInvoiceTotals(purchaseLines);
  }, [purchaseLines]);

  // Submit or Update Purchase Bill
  const handleSavePurchaseBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || purchaseLines.length === 0) {
      showToast('Please select a supplier and add at least 1 item', true);
      return;
    }

    setIsSavingPurchase(true);
    try {
      // 1. Auto-create supplier if new (Requirement 1)
      let supplier = suppliers.find(s => s.id === selectedSupplierId);

      if ((!supplier || selectedSupplierId === '__TEMP_NEW__') && tempNewSupplier && onSaveParty) {
        const newParty: Party = {
          id: `supp-${Date.now()}`,
          name: tempNewSupplier.name.trim(),
          type: 'SUPPLIER',
          phone: tempNewSupplier.phone?.trim() || '9999999999',
          address: tempNewSupplier.address?.trim() || '',
          gstin: tempNewSupplier.gstin ? tempNewSupplier.gstin.trim().toUpperCase() : undefined,
          state: tempNewSupplier.state || company.state || 'Maharashtra',
          stateCode: tempNewSupplier.stateCode || company.stateCode || '27',
          creditLimit: 0,
          currentBalance: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await onSaveParty(newParty);
        supplier = newParty;
        setSelectedSupplierId(newParty.id);
        setTempNewSupplier(null);
        showToast(`नया सप्लायर '${newParty.name}' सफलतापूर्वक सेव हुआ और खाता शुरू हो गया!`);
      }

      if (!supplier) {
        showToast('कृपया सप्लायर चुनें या नया सप्लायर विवरण दर्ज करें', true);
        return;
      }

      const invNum = supplierBillNo.trim() || `PUR-${Date.now().toString().slice(-6)}`;
      const isPaid = purchasePaymentMode !== 'CREDIT';

      if (editingPurchaseInvoice) {
        // Updating existing purchase bill (Requirement 2)
        const updatedPurchaseInvoice: Invoice = {
          ...editingPurchaseInvoice,
          invoiceNumber: invNum,
          partyId: supplier.id,
          partyName: supplier.name,
          partyGstin: supplier.gstin,
          partyPhone: supplier.phone,
          partyAddress: supplier.address,
          partyState: supplier.state,
          partyStateCode: supplier.stateCode,
          date: billDate,
          items: purchaseLines,
          subTotal: purchaseTotals.subTotal,
          totalDiscount: 0,
          totalCgst: purchaseTotals.totalCgst,
          totalSgst: purchaseTotals.totalSgst,
          totalIgst: purchaseTotals.totalIgst,
          totalCess: 0,
          totalTax: purchaseTotals.totalTax,
          roundOff: purchaseTotals.roundOff,
          grandTotal: purchaseTotals.grandTotal,
          receivedAmount: isPaid ? purchaseTotals.grandTotal : 0,
          balanceAmount: isPaid ? 0 : purchaseTotals.grandTotal,
          paymentMode: purchasePaymentMode,
          status: isPaid ? 'PAID' : 'UNPAID',
          notes: purchaseNotes.trim() || undefined,
          updatedAt: new Date().toISOString(),
        };

        if (onUpdateInvoice) {
          await onUpdateInvoice(updatedPurchaseInvoice, editingPurchaseInvoice);
        } else {
          await onSaveInvoice(updatedPurchaseInvoice);
        }

        showToast(`खरीद बिल '${updatedPurchaseInvoice.invoiceNumber}' सफलतापूर्वक अपडेट हुआ! स्टॉक व सप्लायर बैलेंस एडजस्ट हो गया।`);
      } else {
        // Creating new purchase bill
        const purchaseInvoice: Invoice = {
          id: `pur-${Date.now()}`,
          invoiceNumber: invNum,
          documentType: 'PURCHASE_BILL',
          partyId: supplier.id,
          partyName: supplier.name,
          partyGstin: supplier.gstin,
          partyPhone: supplier.phone,
          partyAddress: supplier.address,
          partyState: supplier.state,
          partyStateCode: supplier.stateCode,
          date: billDate,
          items: purchaseLines,
          subTotal: purchaseTotals.subTotal,
          totalDiscount: 0,
          totalCgst: purchaseTotals.totalCgst,
          totalSgst: purchaseTotals.totalSgst,
          totalIgst: purchaseTotals.totalIgst,
          totalCess: 0,
          totalTax: purchaseTotals.totalTax,
          roundOff: purchaseTotals.roundOff,
          grandTotal: purchaseTotals.grandTotal,
          receivedAmount: isPaid ? purchaseTotals.grandTotal : 0,
          balanceAmount: isPaid ? 0 : purchaseTotals.grandTotal,
          paymentMode: purchasePaymentMode,
          status: isPaid ? 'PAID' : 'UNPAID',
          notes: purchaseNotes.trim() || undefined,
          isSynced: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await onSaveInvoice(purchaseInvoice);
        showToast(`खरीद बिल सेव हुआ! ${purchaseLines.length} सामान का स्टॉक बढ़ गया।`);
      }

      // 2. Update inventory items with new Purchase Rate AND Sale Price (Requirement 2 & 3)
      if (onSaveItem) {
        for (const line of purchaseLines) {
          const existingItem = items.find(i => i.id === line.itemId);
          if (existingItem) {
            const newSalePrice = line.salePrice !== undefined && line.salePrice > 0
              ? line.salePrice
              : (existingItem.retailPrice || Math.round(line.unitPrice * 1.2));

            const updatedItem: Item = {
              ...existingItem,
              purchasePrice: line.unitPrice, // Net Purchase Rate
              retailPrice: newSalePrice,     // Sale Price
              wholesalePrice: Math.round(newSalePrice * 0.95),
              updatedAt: new Date().toISOString(),
            };
            await onSaveItem(updatedItem);
          }
        }
      }

      setIsNewPurchaseModalOpen(false);
      setEditingPurchaseInvoice(null);
      setPurchaseLines([]);
      setSelectedSupplierId('');
      setTempNewSupplier(null);
      setIsInlineNewSupplierOpen(false);
      setSupplierBillNo('');
      setPurchaseNotes('');
    } catch (err: any) {
      showToast('Failed to save purchase bill: ' + err.message, true);
    } finally {
      setIsSavingPurchase(false);
    }
  };

  // Submit Payment Out (Paid to supplier)
  const handleSavePaymentOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentOutPartyId || paymentOutAmount <= 0) {
      showToast('Please select supplier and enter valid amount', true);
      return;
    }

    const supplier = suppliers.find(s => s.id === paymentOutPartyId);
    if (!supplier) return;

    setIsSavingPaymentOut(true);
    try {
      const payment: PaymentTransaction = {
        id: `pay-out-${Date.now()}`,
        receiptNumber: `VOUCHER-${String(Date.now()).slice(-5)}`,
        partyId: supplier.id,
        partyName: supplier.name,
        amount: Number(paymentOutAmount),
        paymentMode: paymentOutMode,
        type: 'PAYMENT_OUT',
        date: new Date().toISOString().split('T')[0],
        referenceNo: paymentOutRef.trim() || undefined,
        notes: paymentOutNotes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      await onRecordPayment(payment);
      showToast(`Payment Out of ${formatINR(paymentOutAmount)} recorded for ${supplier.name}`);
      setIsPaymentOutModalOpen(false);
      setPaymentOutAmount(0);
      setPaymentOutRef('');
      setPaymentOutNotes('');
    } catch (err: any) {
      showToast('Failed to record payment: ' + err.message, true);
    } finally {
      setIsSavingPaymentOut(false);
    }
  };

  // Submit Return (Sales Return or Purchase Return)
  const handleSaveReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnPartyId || returnLines.length === 0) {
      showToast('Please select party and add item(s) to return', true);
      return;
    }

    const party = parties.find(p => p.id === returnPartyId);
    if (!party) return;

    setIsSavingReturn(true);
    try {
      const isSalesReturn = returnType === 'SALES_RETURN';
      const docType: DocumentType = isSalesReturn ? 'CREDIT_NOTE' : 'DEBIT_NOTE';
      const totals = calculateInvoiceTotals(returnLines);

      const returnInvoice: Invoice = {
        id: `ret-${Date.now()}`,
        invoiceNumber: isSalesReturn ? `CN-${Date.now().toString().slice(-5)}` : `DN-${Date.now().toString().slice(-5)}`,
        documentType: docType,
        partyId: party.id,
        partyName: party.name,
        partyGstin: party.gstin,
        partyPhone: party.phone,
        partyAddress: party.address,
        partyState: party.state,
        partyStateCode: party.stateCode,
        date: new Date().toISOString().split('T')[0],
        items: returnLines,
        subTotal: totals.subTotal,
        totalDiscount: 0,
        totalCgst: totals.totalCgst,
        totalSgst: totals.totalSgst,
        totalIgst: totals.totalIgst,
        totalCess: 0,
        totalTax: totals.totalTax,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        receivedAmount: totals.grandTotal,
        balanceAmount: 0,
        paymentMode: 'CASH',
        status: 'PAID',
        notes: returnNotes.trim() || (isSalesReturn ? 'Sales Return (ग्राहक वापसी)' : 'Purchase Return (सप्लायर वापसी)'),
        isSynced: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSaveInvoice(returnInvoice);
      showToast(
        isSalesReturn
          ? `Sales Return recorded! Item stock has been restocked.`
          : `Purchase Return recorded! Item stock has been deducted.`
      );
      setIsReturnModalOpen(false);
      setReturnLines([]);
      setReturnPartyId('');
      setReturnNotes('');
    } catch (err: any) {
      showToast('Return failed: ' + err.message, true);
    } finally {
      setIsSavingReturn(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div className={`fixed top-18 right-4 z-50 px-4 py-2.5 rounded-2xl shadow-xl border text-xs sm:text-sm font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${
          toastMsg.isError ? 'bg-red-900 text-white border-red-700' : 'bg-slate-900 text-white border-slate-700'
        }`}>
          {toastMsg.isError ? <AlertTriangle className="w-4 h-4 text-red-300" /> : <Check className="w-4 h-4 text-emerald-400" />}
          <span>{toastMsg.msg}</span>
        </div>
      )}

      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                Purchases &amp; Vendors <span className="text-xs font-normal text-slate-500">(खरीद व सप्लायर)</span>
              </h2>
              <p className="text-xs text-slate-500">
                Manage supplier bills, stock replenishment, vendor ledger, and returns
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* AI Photo Bill Scanner Button (Requirement 1) */}
          <button
            type="button"
            onClick={() => setIsAiScannerModalOpen(true)}
            className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 active:scale-98 text-white rounded-xl text-xs font-black transition shadow-md shadow-indigo-500/20 flex items-center gap-2 cursor-pointer border border-indigo-400/30"
          >
            <Camera className="w-4 h-4 text-indigo-200 animate-pulse" />
            <span>📸 Scan & Auto-Fill Bill (फोटो से बिल भरें)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsNewPurchaseModalOpen(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Purchase Bill (खरीद दर्ज करें)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPaymentOutPartyId(suppliers[0]?.id || '');
              setIsPaymentOutModalOpen(true);
            }}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 active:scale-98 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <ArrowUpRight className="w-4 h-4 text-amber-400" />
            <span>Payment Out (पैसा दिया)</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddSupplierModalOpen(true)}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
          >
            <Users className="w-4 h-4 text-slate-600" />
            <span>+ New Supplier</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Total Purchases (कुल खरीद)
          </span>
          <div className="text-lg sm:text-xl font-black font-mono text-slate-900">
            {formatINR(totalPurchaseAmount)}
          </div>
          <span className="text-[10px] text-slate-400 block">
            {purchaseInvoices.length} Bills recorded
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
            To Pay (देना बाकी)
          </span>
          <div className="text-lg sm:text-xl font-black font-mono text-amber-900">
            {formatINR(totalPayableToSuppliers)}
          </div>
          <span className="text-[10px] text-amber-600 font-semibold block">
            Supplier Pending Payable
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Total Suppliers (सप्लायर संख्या)
          </span>
          <div className="text-lg sm:text-xl font-black font-mono text-indigo-700">
            {suppliers.length}
          </div>
          <span className="text-[10px] text-slate-400 block">Active vendors in directory</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Returns / Adjustments (वापसी)
          </span>
          <div className="text-lg sm:text-xl font-black font-mono text-slate-700">
            {returnsList.length}
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('RETURNS');
              setIsReturnModalOpen(true);
            }}
            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline block"
          >
            + Create Return (वापसी दर्ज करें)
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('PURCHASE_BILLS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'PURCHASE_BILLS'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Purchase Bills (खरीद बिल)</span>
          <span className="ml-1 text-[10px] bg-slate-700 text-white px-1.5 py-0.2 rounded-full">
            {purchaseInvoices.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('SUPPLIERS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'SUPPLIERS'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Supplier Directory &amp; Ledger (व्यापारी खाता)</span>
          <span className="ml-1 text-[10px] bg-slate-200 text-slate-800 px-1.5 py-0.2 rounded-full">
            {suppliers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('RETURNS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
            activeTab === 'RETURNS'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Returns &amp; Debit Notes (वापसी रजिस्टर)</span>
          <span className="ml-1 text-[10px] bg-slate-200 text-slate-800 px-1.5 py-0.2 rounded-full">
            {returnsList.length}
          </span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: PURCHASE BILLS REGISTER */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'PURCHASE_BILLS' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search purchase bill or supplier..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setIsAiScannerModalOpen(true)}
                className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Camera className="w-4 h-4 text-indigo-200" />
                <span>📸 Scan Bill (AI)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsNewPurchaseModalOpen(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Purchase Bill</span>
              </button>
            </div>
          </div>

          {purchaseInvoices.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-3">
              <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
              <div>
                <p className="text-sm font-bold text-slate-700">No Purchase Bills Yet (कोई खरीद बिल दर्ज नहीं है)</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-0.5">
                  Click "+ Add Purchase Bill" to record stock purchase from suppliers. Stock will automatically increment!
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAiScannerModalOpen(true)}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-indigo-200" />
                  <span>📸 Scan Bill Photo (AI स्कैनर)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsNewPurchaseModalOpen(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Create First Purchase Bill</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3.5">Bill Number (बिल नंबर)</th>
                    <th className="p-3.5">Supplier (व्यापारी)</th>
                    <th className="p-3.5">Date (दिनांक)</th>
                    <th className="p-3.5">Items (सामान)</th>
                    <th className="p-3.5">Taxable &amp; GST</th>
                    <th className="p-3.5">Payment (भुगतान)</th>
                    <th className="p-3.5 text-right">Amount (कुल राशि)</th>
                    <th className="p-3.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {purchaseInvoices.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5 font-mono font-bold text-slate-900">
                        {inv.invoiceNumber}
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900">{inv.partyName}</div>
                        {inv.partyPhone && <div className="text-[11px] text-slate-400">{inv.partyPhone}</div>}
                      </td>
                      <td className="p-3.5 text-slate-500 whitespace-nowrap">
                        {inv.date}
                      </td>
                      <td className="p-3.5 text-slate-600 whitespace-nowrap">
                        <span className="font-bold">{inv.items.length}</span> items
                      </td>
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="text-[11px] text-slate-600">
                          Taxable: <span className="font-mono font-semibold">{formatINR(inv.subTotal || 0)}</span>
                        </div>
                        <div className="text-[10px] text-indigo-700 font-semibold">
                          GST: <span className="font-mono">{formatINR(inv.totalTax || 0)}</span>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          inv.paymentMode === 'CREDIT' 
                            ? 'bg-amber-100 text-amber-800' 
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {inv.paymentMode === 'CREDIT' ? 'उधार (Credit)' : inv.paymentMode}
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono font-black text-slate-900 text-sm">
                        {formatINR(inv.grandTotal)}
                      </td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {onViewInvoice && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                onViewInvoice(inv, 'a4');
                              }}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                              title="View / Print Bill"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* ✏️ Edit Purchase Bill Button (Requirement 2) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleOpenEditPurchase(inv);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold transition shadow-2xs active:scale-95 cursor-pointer"
                            title="Edit Purchase Bill (बिल संपादित करें)"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>

                          {/* 🗑️ Delete Purchase Bill Button (Requirement 3) */}
                          {onDeleteInvoice && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                setPurchaseToDelete(inv);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-bold transition shadow-2xs active:scale-95 cursor-pointer"
                              title="Delete Purchase Bill & Rollback Stock (बिल हटाएं व स्टॉक रोलबैक करें)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: SUPPLIER DIRECTORY & LEDGER */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'SUPPLIERS' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search supplier by name, phone or GSTIN..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsAddSupplierModalOpen(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add New Supplier (नया व्यापारी)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredSuppliers.map(supplier => {
              const isPayable = supplier.currentBalance < 0;
              const balanceAmt = Math.abs(supplier.currentBalance);

              return (
                <div
                  key={supplier.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-sm transition flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-extrabold text-sm text-slate-900 truncate">
                          {supplier.name}
                        </h4>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{supplier.phone}</span>
                        </div>
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        isPayable ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800'
                      }`}>
                        {isPayable ? 'देना बाकी (To Pay)' : 'चुकता (Clear)'}
                      </span>
                    </div>

                    {supplier.gstin && (
                      <div className="text-[10px] text-slate-400 font-mono">
                        GSTIN: {supplier.gstin}
                      </div>
                    )}
                    {supplier.address && (
                      <div className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{supplier.address}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Balance (बकाया राशि):</span>
                      <span className={`text-sm font-black font-mono ${
                        isPayable ? 'text-red-700' : 'text-slate-700'
                      }`}>
                        {formatINR(balanceAmt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditSupplier(supplier)}
                        className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition flex items-center gap-1 active:scale-95 cursor-pointer"
                        title="Edit Supplier Details (सप्लायर विवरण बदलें)"
                      >
                        <Edit className="w-3.5 h-3.5 text-blue-600" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setPaymentOutPartyId(supplier.id);
                          setPaymentOutAmount(balanceAmt);
                          setIsPaymentOutModalOpen(true);
                        }}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold transition"
                      >
                        Pay Out
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedSupplierForLedger(supplier)}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
                      >
                        Khata →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: RETURNS & ADJUSTMENTS (SALES & PURCHASE RETURNS) */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'RETURNS' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">
                Returns &amp; Credit/Debit Notes (वापसी रजिस्टर)
              </h3>
              <p className="text-[11px] text-slate-500">
                Record customer returns (stock restocked) or vendor returns (stock deducted)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setReturnType('SALES_RETURN');
                  setIsReturnModalOpen(true);
                }}
                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>+ Sales Return (ग्राहक वापसी)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setReturnType('PURCHASE_RETURN');
                  setIsReturnModalOpen(true);
                }}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>+ Purchase Return (सप्लायर वापसी)</span>
              </button>
            </div>
          </div>

          {returnsList.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <RotateCcw className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No Returns Recorded Yet</p>
              <p className="text-xs text-slate-400">
                Customer returns and vendor returns will appear here. Stock adjusts automatically!
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3.5">Note Number</th>
                    <th className="p-3.5">Type (प्रकार)</th>
                    <th className="p-3.5">Party (पार्टी)</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Items</th>
                    <th className="p-3.5 text-right">Amount (राशि)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {returnsList.map(ret => (
                    <tr key={ret.id} className="hover:bg-slate-50 transition">
                      <td className="p-3.5 font-mono font-bold text-slate-900">
                        {ret.invoiceNumber}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          ret.documentType === 'CREDIT_NOTE'
                            ? 'bg-purple-100 text-purple-900'
                            : 'bg-amber-100 text-amber-900'
                        }`}>
                          {ret.documentType === 'CREDIT_NOTE' ? 'Sales Return (ग्राहक)' : 'Purchase Return (सप्लायर)'}
                        </span>
                      </td>
                      <td className="p-3.5 font-bold text-slate-900">
                        {ret.partyName}
                      </td>
                      <td className="p-3.5 text-slate-500">
                        {ret.date}
                      </td>
                      <td className="p-3.5 text-slate-600">
                        {ret.items.length} items
                      </td>
                      <td className="p-3.5 text-right font-mono font-black text-slate-900 text-sm">
                        {formatINR(ret.grandTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: ADD NEW SUPPLIER */}
      {/* ------------------------------------------------------------- */}
      {isAddSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  + Add New Supplier (नया सप्लायर / व्यापारी)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddSupplierModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Supplier / Vendor Name (व्यापारी का नाम) *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="उदा. श्री कृष्णा डिस्ट्रीब्यूटर्स / बालाजी एजेंसी"
                  value={supplierName}
                  onChange={e => setSupplierName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Phone / Mobile (फोन नंबर) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+91 98765 43210"
                    value={supplierPhone}
                    onChange={e => setSupplierPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    GSTIN (वैकल्पिक)
                  </label>
                  <input
                    type="text"
                    placeholder="27ABCDE1234F1Z5"
                    value={supplierGstin}
                    onChange={e => setSupplierGstin(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono text-xs text-slate-900 focus:bg-white focus:outline-none uppercase focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Shop Address / City (दुकान का पता)
                </label>
                <input
                  type="text"
                  placeholder="मार्केट यार्ड, दुकान नं 12, पुणे"
                  value={supplierAddress}
                  onChange={e => setSupplierAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Opening Payable Balance (पिछला बकाया - जो हमें देना है ₹)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  value={supplierOpeningBalance || ''}
                  onChange={e => setSupplierOpeningBalance(Number(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddSupplierModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs active:scale-95"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: ADD / EDIT PURCHASE BILL */}
      {/* ------------------------------------------------------------- */}
      {isNewPurchaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-2xs p-3 sm:p-4">
          <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  {editingPurchaseInvoice 
                    ? `✏️ Edit Purchase Bill #${editingPurchaseInvoice.invoiceNumber} (खरीद बिल संपादित करें)`
                    : '+ Add Purchase Bill (सप्लायर से खरीद दर्ज करें)'}
                </h3>
              </div>
              <div className="flex items-center gap-2.5">
                {!editingPurchaseInvoice && (
                  <button
                    type="button"
                    onClick={() => setIsAiScannerModalOpen(true)}
                    className="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-400/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-indigo-300" />
                    <span>📸 Scan Bill Photo (फोटो से भरें)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsNewPurchaseModalOpen(false);
                    setEditingPurchaseInvoice(null);
                    setPurchaseLines([]);
                    setSelectedSupplierId('');
                    setSupplierBillNo('');
                    setPurchaseNotes('');
                  }}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSavePurchaseBill} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
              {/* Header Inputs: Supplier, Bill No, Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">
                      Select Supplier (सप्लायर चुनें) *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsInlineNewSupplierOpen(!isInlineNewSupplierOpen);
                        if (!isInlineNewSupplierOpen) {
                          setSelectedSupplierId('__TEMP_NEW__');
                        }
                      }}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-0.5 cursor-pointer"
                    >
                      {isInlineNewSupplierOpen ? 'सूची से चुनें' : '+ नया सप्लायर'}
                    </button>
                  </div>

                  {!isInlineNewSupplierOpen ? (
                    <select
                      required
                      value={selectedSupplierId}
                      onChange={e => handleSelectSupplier(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none"
                    >
                      <option value="">-- Choose Supplier --</option>
                      {tempNewSupplier && (
                        <option value="__TEMP_NEW__" className="font-bold text-indigo-700">
                          ✨ [नया सप्लायर] {tempNewSupplier.name} (बिल सेव पर ऑटो-क्रिएट होगा)
                        </option>
                      )}
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.phone})
                        </option>
                      ))}
                      <option value="__ADD_INLINE__">+ नया सप्लायर लिखें (Create Inline)</option>
                    </select>
                  ) : (
                    <div className="space-y-1.5 p-2 bg-blue-50/80 rounded-xl border border-blue-200">
                      <div className="text-[10px] font-bold text-blue-900">
                        नया सप्लायर विवरण (बिल सेव पर खाता शुरू होगा):
                      </div>
                      <input
                        type="text"
                        required
                        placeholder="सप्लायर का नाम *"
                        value={inlineSupplierName}
                        onChange={e => {
                          setInlineSupplierName(e.target.value);
                          setTempNewSupplier({
                            name: e.target.value,
                            phone: inlineSupplierPhone,
                            gstin: inlineSupplierGstin,
                          });
                          setSelectedSupplierId('__TEMP_NEW__');
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-900"
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="tel"
                          placeholder="फोन नंबर"
                          value={inlineSupplierPhone}
                          onChange={e => {
                            setInlineSupplierPhone(e.target.value);
                            if (tempNewSupplier) {
                              setTempNewSupplier({ ...tempNewSupplier, phone: e.target.value });
                            }
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-900"
                        />
                        <input
                          type="text"
                          placeholder="GSTIN (यदि हो)"
                          value={inlineSupplierGstin}
                          onChange={e => {
                            setInlineSupplierGstin(e.target.value.toUpperCase());
                            if (tempNewSupplier) {
                              setTempNewSupplier({ ...tempNewSupplier, gstin: e.target.value.toUpperCase() });
                            }
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-900 uppercase"
                        />
                      </div>
                    </div>
                  )}
                  {tempNewSupplier && !isInlineNewSupplierOpen && (
                    <p className="text-[10px] text-indigo-700 font-bold mt-1">
                      * यह सप्लायर बिल सेव होते ही डेटाबेस में सुरक्षित हो जाएगा।
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Supplier Invoice No (बिल नंबर)
                  </label>
                  <input
                    type="text"
                    placeholder="उदा. INV-2024-892"
                    value={supplierBillNo}
                    onChange={e => setSupplierBillNo(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Bill Date (तारीख)
                  </label>
                  <input
                    type="date"
                    required
                    value={billDate}
                    onChange={e => setBillDate(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* Item Selector */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-700">
                  Select Purchased Items (खरीदे गए सामान जोड़ें - Tax Exclusive):
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Type item name to add (सामान का नाम खोजें)..."
                      value={purchaseItemSearch}
                      onChange={e => setPurchaseItemSearch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none"
                    />
                  </div>

                  {onSaveItem && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewItemName(purchaseItemSearch.trim());
                        setIsAddNewItemModalOpen(true);
                      }}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 shadow-xs active:scale-95 cursor-pointer"
                      title="नया आइटम बनाएं जो इन्वेंटरी में पहले से नहीं है"
                    >
                      <Plus className="w-4 h-4 stroke-[2.5]" />
                      <span>+ Add New Item (+ नया सामान)</span>
                    </button>
                  )}
                </div>

                {purchaseItemSearch && (
                  <div className="bg-white border border-slate-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-100 shadow-sm">
                    {items
                      .filter(i => i.name.toLowerCase().includes(purchaseItemSearch.toLowerCase()))
                      .slice(0, 6)
                      .map(item => (
                        <div
                          key={item.id}
                          onClick={() => {
                            handleAddPurchaseLine(item);
                            setPurchaseItemSearch('');
                          }}
                          className="p-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900">{item.name}</span>
                            <span className="text-[10px] text-slate-400 ml-2">Stock: {item.currentStock} {item.unit}</span>
                          </div>
                          <span className="font-mono text-slate-700 font-bold">
                            Rate: {formatINR(item.purchasePrice || item.retailPrice)} (+{item.taxRate || 18}% GST)
                          </span>
                        </div>
                      ))}

                    {/* Quick Add Option at bottom of search dropdown (Requirement 3) */}
                    {onSaveItem && (
                      <div
                        onClick={() => {
                          setNewItemName(purchaseItemSearch.trim());
                          setIsAddNewItemModalOpen(true);
                        }}
                        className="p-2.5 bg-emerald-50 hover:bg-emerald-100 cursor-pointer flex items-center justify-between text-xs font-bold text-emerald-800 border-t border-emerald-200 transition"
                      >
                        <div className="flex items-center gap-1.5">
                          <Plus className="w-4 h-4 text-emerald-700 stroke-[2.5]" />
                          <span>+ नया सामान जोड़ें: &quot;{purchaseItemSearch}&quot;</span>
                        </div>
                        <span className="text-[10px] bg-emerald-200/60 px-2 py-0.5 rounded text-emerald-900 font-normal">
                          Click to create &amp; add to bill
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Purchase Lines Table (Requirement: MRP, Discount %, Net Rate, and Sale Price) */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                {purchaseLines.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    No items added to bill yet. Search items above to add, or click &quot;Scan Bill Photo&quot; to auto-fill.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-left text-xs min-w-[900px] divide-y divide-slate-200">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[10px] sticky top-0 z-10 shadow-xs">
                        <tr>
                          <th className="p-2.5">Item Name (सामान)</th>
                          <th className="p-2.5 w-16 text-center">Qty</th>
                          <th className="p-2.5 w-24 text-right">MRP / List ₹</th>
                          <th className="p-2.5 w-20 text-center">Disc %</th>
                          <th className="p-2.5 w-24 text-right text-blue-900 bg-blue-50/50">Net Rate ₹</th>
                          <th className="p-2.5 w-28 text-right bg-emerald-50 text-emerald-950 border-x border-emerald-200">
                            Sale Price (बिक्री मूल्य) ✨
                          </th>
                          <th className="p-2.5 w-20 text-center">GST %</th>
                          <th className="p-2.5 w-24 text-right">Taxable ₹</th>
                          <th className="p-2.5 w-20 text-right">GST ₹</th>
                          <th className="p-2.5 w-24 text-right font-black">Total ₹</th>
                          <th className="p-2.5 w-10 text-center">✕</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {purchaseLines.map((line, idx) => (
                          <tr key={line.itemId} className="hover:bg-slate-50/70 transition">
                            <td className="p-2.5 min-w-[180px]">
                              <div className="font-bold text-slate-900">{line.itemName}</div>
                              {line.hsn && (
                                <div className="text-[10px] text-slate-400 font-mono">HSN: {line.hsn}</div>
                              )}
                            </td>
                            <td className="p-2.5 text-center">
                              <input
                                type="number"
                                min="0.1"
                                step="any"
                                value={line.quantity}
                                onChange={e => handleUpdatePurchaseLine(idx, 'qty', Number(e.target.value) || 0)}
                                className="w-14 text-center bg-slate-50 border border-slate-300 rounded-lg py-1 font-mono font-bold"
                              />
                            </td>
                            <td className="p-2.5 text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.mrp ?? line.unitPrice}
                                onChange={e => handleUpdatePurchaseLine(idx, 'mrp', Number(e.target.value) || 0)}
                                className="w-20 text-right bg-slate-50 border border-slate-300 rounded-lg py-1 px-1.5 font-mono font-bold"
                                title="Printed MRP or List Price"
                              />
                            </td>
                            <td className="p-2.5 text-center">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="any"
                                value={line.discountPercent ?? 0}
                                onChange={e => handleUpdatePurchaseLine(idx, 'discount', Number(e.target.value) || 0)}
                                className="w-16 text-center bg-slate-50 border border-slate-300 rounded-lg py-1 font-mono font-bold"
                                title="Trade Discount % on MRP"
                              />
                            </td>
                            <td className="p-2.5 text-right bg-blue-50/30">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={line.unitPrice}
                                onChange={e => handleUpdatePurchaseLine(idx, 'netRate', Number(e.target.value) || 0)}
                                className="w-22 text-right bg-blue-50/60 border border-blue-300 rounded-lg py-1 px-1.5 font-mono font-black text-blue-950"
                                title="Net Purchase Rate (MRP minus Trade Discount)"
                              />
                            </td>
                            <td className="p-2.5 text-right bg-emerald-50/60 border-x border-emerald-200">
                              <div className="relative">
                                <span className="absolute left-1.5 top-1 text-emerald-600 font-bold text-[10px]">₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={line.salePrice ?? Math.round(line.unitPrice * 1.2)}
                                  onChange={e => handleUpdatePurchaseLine(idx, 'salePrice', Number(e.target.value) || 0)}
                                  className="w-22 pl-4 text-right bg-white border border-emerald-400 rounded-lg py-1 px-1.5 font-mono font-black text-emerald-950 shadow-2xs"
                                  title="Retail Selling Price - will be saved to Inventory automatically on Save Purchase"
                                />
                              </div>
                            </td>
                            <td className="p-2.5 text-center">
                              <select
                                value={line.taxRate}
                                onChange={e => handleUpdatePurchaseLine(idx, 'taxRate', Number(e.target.value))}
                                className="w-16 bg-slate-50 border border-slate-300 rounded-lg py-1 px-1 text-[11px] font-bold text-slate-800"
                              >
                                <option value={0}>0%</option>
                                <option value={5}>5%</option>
                                <option value={12}>12%</option>
                                <option value={18}>18%</option>
                                <option value={28}>28%</option>
                              </select>
                            </td>
                            <td className="p-2.5 text-right font-mono font-medium text-slate-700 text-[11px]">
                              {formatINR(line.taxableAmount)}
                            </td>
                            <td className="p-2.5 text-right font-mono font-semibold text-indigo-700 text-[11px]">
                              {formatINR(line.cgstAmount + line.sgstAmount + line.igstAmount)}
                            </td>
                            <td className="p-2.5 text-right font-mono font-black text-slate-900 text-[11px]">
                              {formatINR(line.totalAmount)}
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleUpdatePurchaseLine(idx, 'remove', 0)}
                                className="text-slate-400 hover:text-red-600 transition cursor-pointer"
                                title="Remove line"
                              >
                                <Trash2 className="w-3.5 h-3.5 mx-auto" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Summary & Payment Mode (Requirement 1: Taxable, CGST+SGST or IGST, and Grand Total distinct) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Payment Mode (भुगतान का प्रकार):
                  </label>
                  <select
                    value={purchasePaymentMode}
                    onChange={e => setPurchasePaymentMode(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  >
                    <option value="CREDIT">📒 उधार / बाकी (Credit - Pay Later)</option>
                    <option value="CASH">💵 नकद दिया (Paid in Cash)</option>
                    <option value="BANK_TRANSFER">💳 बैंक / ट्रांसफर (Bank Transfer)</option>
                    <option value="UPI">📱 UPI द्वारा भुगतान (Paid via UPI)</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1 font-medium">
                    {purchasePaymentMode === 'CREDIT' 
                      ? 'बकाया राशि सप्लायर के खाते में जुड़ जाएगी (देना बाकी)।' 
                      : 'बिल का पूरा भुगतान तुरंत दर्ज होगा।'}
                  </p>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1.5 text-right">
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Total Taxable Value (कुल कर योग्य मूल्य):</span>
                    <span className="font-mono font-bold text-slate-900">{formatINR(purchaseTotals.subTotal)}</span>
                  </div>

                  {purchaseTotals.totalIgst > 0 ? (
                    <div className="flex justify-between items-center text-xs text-blue-700 bg-blue-50/60 px-2 py-1 rounded-lg">
                      <span className="font-medium">Total IGST (Inter-State Tax):</span>
                      <span className="font-mono font-bold">{formatINR(purchaseTotals.totalIgst)}</span>
                    </div>
                  ) : (
                    <div className="space-y-1 bg-slate-100/60 p-2 rounded-xl">
                      <div className="flex justify-between items-center text-xs text-slate-600">
                        <span>Total CGST (Central Tax):</span>
                        <span className="font-mono font-bold text-slate-800">{formatINR(purchaseTotals.totalCgst)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-slate-600">
                        <span>Total SGST (State Tax):</span>
                        <span className="font-mono font-bold text-slate-800">{formatINR(purchaseTotals.totalSgst)}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-xs text-indigo-700 font-bold border-t border-slate-200 pt-1.5">
                    <span>Total GST Amount (कुल टैक्स):</span>
                    <span className="font-mono">{formatINR(purchaseTotals.totalTax)}</span>
                  </div>

                  {purchaseTotals.roundOff !== 0 && (
                    <div className="flex justify-between items-center text-[11px] text-slate-500">
                      <span>Round Off:</span>
                      <span className="font-mono font-medium">
                        {purchaseTotals.roundOff > 0 ? '+' : ''}{formatINR(purchaseTotals.roundOff)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-sm sm:text-base font-black text-blue-900 border-t-2 border-slate-300 pt-1.5">
                    <span>Grand Total (Taxable + GST):</span>
                    <span className="font-mono text-blue-700">{formatINR(purchaseTotals.grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewPurchaseModalOpen(false);
                    setEditingPurchaseInvoice(null);
                    setPurchaseLines([]);
                    setSelectedSupplierId('');
                    setSupplierBillNo('');
                    setPurchaseNotes('');
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPurchase || purchaseLines.length === 0}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-md active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>
                    {isSavingPurchase 
                      ? 'Saving...' 
                      : editingPurchaseInvoice 
                        ? 'Update Purchase Bill & Sync Stock' 
                        : 'Save Purchase Bill & Add Stock'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: DELETE PURCHASE BILL CONFIRMATION (Requirement 3) */}
      {/* ------------------------------------------------------------- */}
      {purchaseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-red-200 overflow-hidden flex flex-col">
            <div className="p-4 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-white" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Delete Purchase Bill? (खरीद बिल हटाएं?)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPurchaseToDelete(null)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-red-50 p-3.5 rounded-2xl border border-red-200 text-red-900 leading-relaxed">
                <p className="font-bold text-sm text-red-700 mb-1">
                  क्या आप खरीद बिल #{purchaseToDelete.invoiceNumber} डिलीट करना चाहते हैं?
                </p>
                <p className="text-xs text-red-800">
                  इससे इन्वेंटरी स्टॉक और सप्लायर बैलेंस रोलबैक हो जाएगा।
                </p>
              </div>

              {/* Breakdown of what will happen */}
              <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <div className="font-bold text-slate-700 text-xs">
                  रोलबैक विवरण (Rollback Details):
                </div>

                <div className="text-[11px] space-y-1.5">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>सप्लायर (Supplier):</span>
                    <span className="font-bold text-slate-900">{purchaseToDelete.partyName}</span>
                  </div>

                  <div className="flex justify-between items-center text-slate-600">
                    <span>बिल की कुल राशि (Bill Total):</span>
                    <span className="font-mono font-bold text-slate-900">{formatINR(purchaseToDelete.grandTotal)}</span>
                  </div>

                  {purchaseToDelete.balanceAmount > 0 && (
                    <div className="flex justify-between items-center text-amber-800 font-bold bg-amber-50 p-2 rounded-lg border border-amber-200">
                      <span>सप्लायर देना बाकी (Payable Debt):</span>
                      <span className="font-mono text-red-700">-{formatINR(purchaseToDelete.balanceAmount)} (घटेगा)</span>
                    </div>
                  )}

                  <div className="pt-1.5 border-t border-slate-200">
                    <span className="text-slate-500 font-bold block mb-1">इन्वेंटरी स्टॉक से घटेगा (Stock Rollback):</span>
                    <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                      {purchaseToDelete.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200">
                          <span className="truncate max-w-[190px] font-medium">{it.itemName}</span>
                          <span className="font-mono font-bold text-red-600">-{it.quantity} {it.unit || 'PCS'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isDeletingPurchase}
                  onClick={() => setPurchaseToDelete(null)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition cursor-pointer"
                >
                  रद्द करें (Cancel)
                </button>
                <button
                  type="button"
                  disabled={isDeletingPurchase}
                  onClick={handleConfirmDeletePurchase}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-md active:scale-95 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeletingPurchase ? 'डिलीट हो रहा है...' : 'हाँ, बिल डिलीट और रोलबैक करें'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: PAYMENT OUT (PAID TO SUPPLIER) */}
      {/* ------------------------------------------------------------- */}
      {isPaymentOutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Payment Out (सप्लायर को भुगतान)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentOutModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePaymentOut} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Supplier (व्यापारी) *
                </label>
                <select
                  required
                  value={paymentOutPartyId}
                  onChange={e => setPaymentOutPartyId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                >
                  <option value="">-- Choose Supplier --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} (देना बाकी: {formatINR(Math.abs(s.currentBalance))})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Amount Paid (भुगतान राशि ₹) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  autoFocus
                  placeholder="0.00"
                  value={paymentOutAmount || ''}
                  onChange={e => setPaymentOutAmount(Number(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-black text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={paymentOutMode}
                    onChange={e => setPaymentOutMode(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                  >
                    <option value="CASH">💵 Cash (नकद)</option>
                    <option value="BANK_TRANSFER">💳 Bank / NEFT</option>
                    <option value="UPI">📱 UPI</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Reference / UTR No
                  </label>
                  <input
                    type="text"
                    placeholder="उदा. UTR982312"
                    value={paymentOutRef}
                    onChange={e => setPaymentOutRef(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentOutModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPaymentOut || paymentOutAmount <= 0}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl font-bold shadow-xs active:scale-95"
                >
                  Save Payment Out
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 4: RECORD RETURN (SALES RETURN / PURCHASE RETURN) */}
      {/* ------------------------------------------------------------- */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-purple-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  {returnType === 'SALES_RETURN' 
                    ? 'Sales Return / Credit Note (ग्राहक वापसी)' 
                    : 'Purchase Return / Debit Note (सप्लायर वापसी)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReturnModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveReturn} className="p-5 space-y-3.5 text-xs overflow-y-auto">
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setReturnType('SALES_RETURN')}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition ${
                    returnType === 'SALES_RETURN' ? 'bg-purple-600 text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Sales Return (ग्राहक वापसी)
                </button>
                <button
                  type="button"
                  onClick={() => setReturnType('PURCHASE_RETURN')}
                  className={`flex-1 py-1.5 rounded-lg font-bold text-xs transition ${
                    returnType === 'PURCHASE_RETURN' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-600'
                  }`}
                >
                  Purchase Return (सप्लायर वापसी)
                </button>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {returnType === 'SALES_RETURN' ? 'Select Customer (ग्राहक)' : 'Select Supplier (व्यापारी)'} *
                </label>
                <select
                  required
                  value={returnPartyId}
                  onChange={e => setReturnPartyId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900"
                >
                  <option value="">-- Choose Party --</option>
                  {(returnType === 'SALES_RETURN' 
                    ? parties.filter(p => p.type === 'CUSTOMER')
                    : suppliers
                  ).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.phone})
                    </option>
                  ))}
                </select>
              </div>

              {/* Add Returned Item */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Add Item Returned (वापस हुआ सामान जोड़ें)
                </label>
                <select
                  onChange={e => {
                    const found = items.find(i => i.id === e.target.value);
                    if (found) {
                      handleAddPurchaseLine(found);
                      e.target.value = '';
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900"
                >
                  <option value="">-- Click to select item --</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name} (Stock: {i.currentStock}) - Rate: {formatINR(i.retailPrice || i.wholesalePrice)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Items List */}
              <div className="border border-slate-200 rounded-xl p-2 max-h-40 overflow-y-auto space-y-2">
                {purchaseLines.length === 0 ? (
                  <div className="text-center text-slate-400 py-4">No items selected for return.</div>
                ) : (
                  purchaseLines.map((line, idx) => (
                    <div key={line.itemId} className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg">
                      <div className="font-bold text-slate-900 truncate flex-1">{line.itemName}</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={e => handleUpdatePurchaseLine(idx, 'qty', Number(e.target.value) || 1)}
                          className="w-12 text-center bg-white border border-slate-300 rounded py-0.5 font-bold"
                        />
                        <span className="font-mono font-bold text-slate-900">{formatINR(line.totalAmount)}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdatePurchaseLine(idx, 'remove', 0)}
                          className="text-red-500 hover:text-red-700 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReturnModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingReturn || purchaseLines.length === 0}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-bold shadow-xs active:scale-95"
                >
                  Record Return &amp; Adjust Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 5: SUPPLIER LEDGER KHATA VIEW */}
      {/* ------------------------------------------------------------- */}
      {selectedSupplierForLedger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base">
                  {selectedSupplierForLedger.name} - Ledger Khata (व्यापारी का खाता)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Ph: {selectedSupplierForLedger.phone} | GSTIN: {selectedSupplierForLedger.gstin || 'None'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSupplierForLedger(null)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 block font-bold uppercase">Net Payable (देना बाकी):</span>
                <span className="text-xl font-black font-mono text-red-700">
                  {formatINR(Math.abs(selectedSupplierForLedger.currentBalance))}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPaymentOutPartyId(selectedSupplierForLedger.id);
                  setPaymentOutAmount(Math.abs(selectedSupplierForLedger.currentBalance));
                  setSelectedSupplierForLedger(null);
                  setIsPaymentOutModalOpen(true);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Record Payment Out (भुगतान दें)</span>
              </button>
            </div>

            {/* Transaction List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
              <h4 className="font-bold text-slate-700 text-xs mb-2">Transaction History (लेन-देन विवरण):</h4>
              {invoices.filter(i => i.partyId === selectedSupplierForLedger.id).length === 0 &&
               payments.filter(p => p.partyId === selectedSupplierForLedger.id).length === 0 ? (
                <div className="p-8 text-center text-slate-400">No transactions recorded with this supplier yet.</div>
              ) : (
                <div className="space-y-2">
                  {invoices
                    .filter(i => i.partyId === selectedSupplierForLedger.id)
                    .map(inv => (
                      <div key={inv.id} className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">
                            {inv.documentType === 'PURCHASE_BILL' ? 'Purchase Bill' : 'Purchase Return'} #{inv.invoiceNumber}
                          </div>
                          <div className="text-[11px] text-slate-400">📅 {inv.date} | {inv.items.length} items</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-black text-slate-900">{formatINR(inv.grandTotal)}</div>
                          <div className="text-[10px] text-amber-700 font-bold">{inv.paymentMode}</div>
                        </div>
                      </div>
                    ))}

                  {payments
                    .filter(p => p.partyId === selectedSupplierForLedger.id)
                    .map(pay => (
                      <div key={pay.id} className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between">
                        <div>
                          <div className="font-bold text-emerald-950 flex items-center gap-1">
                            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Payment Out ({pay.receiptNumber})</span>
                          </div>
                          <div className="text-[11px] text-emerald-700">📅 {pay.date} | Mode: {pay.paymentMode}</div>
                        </div>
                        <div className="text-right font-mono font-black text-emerald-800 text-sm">
                          - {formatINR(pay.amount)}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 1: ADD NEW ITEM FOR PURCHASE BILL (Requirement 3) */}
      {/* ============================================================= */}
      {isAddNewItemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in zoom-in-95 duration-200 text-slate-900">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-emerald-700 text-white">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-white stroke-[2.5]" />
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">
                    + Add New Item for Purchase (+ नया सामान जोड़ें)
                  </h3>
                  <p className="text-[11px] text-emerald-100">
                    सामान तुरंत इन्वेंटरी में जुड़ेगा और चालू खरीद बिल में भी सेलेक्ट हो जाएगा
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddNewItemModalOpen(false)}
                className="p-1 rounded-lg text-emerald-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewItemForPurchase} className="p-4 sm:p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Item Name (सामान का नाम) *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  placeholder="उदा. Fortune Oil 1L / Parle-G 100g"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Purchase Price (खरीद दर ₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newItemPurchasePrice}
                      onChange={e => setNewItemPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="120.00"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Sale Price / MRP (बिक्री दर ₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newItemSalePrice}
                      onChange={e => setNewItemSalePrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="140.00"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    GST Tax Rate (टैक्स दर %)
                  </label>
                  <select
                    value={newItemTaxRate}
                    onChange={e => setNewItemTaxRate(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value={0}>0% (Tax Exempt / Nil)</option>
                    <option value={5}>5% GST</option>
                    <option value={12}>12% GST</option>
                    <option value={18}>18% GST (Standard)</option>
                    <option value={28}>28% GST</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    HSN Code (एचएसएन कोड)
                  </label>
                  <input
                    type="text"
                    value={newItemHsn}
                    onChange={e => setNewItemHsn(e.target.value)}
                    placeholder="19053100"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Unit (इकाई)
                  </label>
                  <select
                    value={newItemUnit}
                    onChange={e => setNewItemUnit(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                  >
                    <option value="PCS">PCS (पीस)</option>
                    <option value="KG">KG (किलो)</option>
                    <option value="LTR">LTR (लीटर)</option>
                    <option value="BOX">BOX (डिब्बा)</option>
                    <option value="PKT">PKT (पैकेट)</option>
                    <option value="MTR">MTR (मीटर)</option>
                    <option value="DOZEN">DOZEN (दर्जन)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Category (श्रेणी)
                  </label>
                  <input
                    type="text"
                    value={newItemCategory}
                    onChange={e => setNewItemCategory(e.target.value)}
                    placeholder="General / किराना"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Initial Stock (मौजूदा)
                  </label>
                  <input
                    type="number"
                    value={newItemInitialStock}
                    onChange={e => setNewItemInitialStock(Number(e.target.value))}
                    placeholder="0"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddNewItemModalOpen(false)}
                  disabled={isSavingNewItem}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  रद्द करें (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSavingNewItem}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>{isSavingNewItem ? 'सेव हो रहा है...' : 'सेव करें व बिल में जोड़ें'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL 2: EDIT SUPPLIER MODAL (Requirement 1) */}
      {/* ============================================================= */}
      {supplierToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in zoom-in-95 duration-200 text-slate-900">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-blue-600 text-white">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-white" />
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">
                    ✏️ Edit Supplier Details (सप्लायर विवरण बदलें)
                  </h3>
                  <p className="text-[11px] text-blue-100">IndexedDB और Supabase दोनों में तुरंत सिंक होगा</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSupplierToEdit(null)}
                className="p-1 rounded-lg text-blue-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditSupplier} className="p-4 sm:p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Supplier Name (सप्लायर / फर्म का नाम) *
                </label>
                <input
                  type="text"
                  required
                  value={editSupplierName}
                  onChange={e => setEditSupplierName(e.target.value)}
                  placeholder="उदा. Sharma Wholesale Traders"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Mobile Number (फ़ोन / WhatsApp)
                  </label>
                  <input
                    type="tel"
                    value={editSupplierPhone}
                    onChange={e => setEditSupplierPhone(e.target.value)}
                    placeholder="98XXXXXXXX"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    GSTIN Number (GSTIN)
                  </label>
                  <input
                    type="text"
                    value={editSupplierGstin}
                    onChange={e => setEditSupplierGstin(e.target.value)}
                    placeholder="23AAAAA0000A1Z5"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono uppercase text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Address (पता / स्थान)
                </label>
                <textarea
                  rows={2}
                  value={editSupplierAddress}
                  onChange={e => setEditSupplierAddress(e.target.value)}
                  placeholder="सप्लायर का गोदाम या दुकान का पता..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600 resize-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Opening Khata Balance (शुरुआती बकाया ₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 font-bold text-slate-400">₹</span>
                  <input
                    type="number"
                    step="any"
                    value={editSupplierOpeningBalance}
                    onChange={e => setEditSupplierOpeningBalance(Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-7 pr-3 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  * शुरुआती बकाया बदलने से वर्तमान देना बाकी बैलेंस अपने आप समायोजित हो जाएगा।
                </p>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSupplierToEdit(null)}
                  disabled={isSavingEditSupplier}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition cursor-pointer"
                >
                  रद्द करें (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSavingEditSupplier}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>{isSavingEditSupplier ? 'अपडेट हो रहा है...' : 'सुरक्षित करें (Update Supplier)'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Photo Bill Scanner Modal (Gemini Vision OCR & Smart Mapping) */}
      <AiBillScannerModal
        isOpen={isAiScannerModalOpen}
        onClose={() => setIsAiScannerModalOpen(false)}
        items={items}
        suppliers={suppliers}
        company={company}
        onSaveItem={onSaveItem}
        onSaveParty={onSaveParty}
        onApplyScannedBill={handleApplyScannedBill}
        showToast={showToast}
      />
    </div>
  );
};
