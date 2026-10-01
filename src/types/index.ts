/**
 * Vyapar Pro - Core Data Types & GST Accounting Models
 */

export type DocumentType = 
  | 'SALES_INVOICE'
  | 'PURCHASE_BILL'
  | 'QUOTATION'
  | 'DELIVERY_CHALLAN'
  | 'CREDIT_NOTE'
  | 'DEBIT_NOTE';

export type PaymentMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CREDIT' | 'SPLIT';

export type PartyType = 'CUSTOMER' | 'SUPPLIER';

export type GSTType = 'CGST_SGST' | 'IGST';

export interface CompanyProfile {
  name: string;
  legalTradeName: string;
  gstin: string;
  state: string;
  stateCode: string;
  address: string;
  city: string;
  pincode: string;
  phone: string;
  email: string;
  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
  bankBranch: string;
  upiId: string;
  invoicePrefix: string;
  terms: string[];
}

export interface Party {
  id: string;
  name: string;
  type: PartyType;
  phone: string;
  email?: string;
  gstin?: string;
  state: string;
  stateCode: string;
  address: string;
  creditLimit: number;
  currentBalance: number; // positive = they owe us (Receivable), negative = we owe them (Payable)
  openingBalance?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ItemBatch {
  batchNumber: string;
  mfgDate?: string;
  expiryDate: string;
  quantity: number;
}

export interface Item {
  id: string;
  name: string;
  category: string;
  sku: string;
  barcode?: string;
  hsn: string;
  unit: 'PCS' | 'KG' | 'PACK' | 'BOX' | 'MTR' | 'LTR' | 'BAG';
  purchasePrice: number;
  wholesalePrice: number;
  retailPrice: number;
  taxRate: number; // 0, 5, 12, 18, 28
  taxInclusive: boolean;
  currentStock: number;
  lowStockThreshold: number;
  batches?: ItemBatch[];
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceItem {
  itemId: string;
  itemName: string;
  hsn: string;
  unit: string;
  quantity: number;
  unitPrice: number; // base price or selling price
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount: number;
  totalAmount: number;
  batchNumber?: string;
}

export interface SplitPayment {
  cash: number;
  upi: number;
  bankTransfer: number;
  credit: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  documentType: DocumentType;
  partyId: string;
  partyName: string;
  partyGstin?: string;
  partyPhone: string;
  partyAddress: string;
  partyState: string;
  partyStateCode: string;
  date: string;
  dueDate?: string;
  items: InvoiceItem[];
  subTotal: number; // Total taxable amount
  totalDiscount: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalCess: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  receivedAmount: number;
  balanceAmount: number;
  paymentMode: PaymentMode;
  splitDetails?: SplitPayment;
  notes?: string;
  status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'CANCELLED';
  isSynced: boolean; // offline sync flag
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTransaction {
  id: string;
  receiptNumber: string;
  partyId: string;
  partyName: string;
  amount: number;
  paymentMode: PaymentMode;
  type: 'PAYMENT_IN' | 'PAYMENT_OUT';
  date: string;
  referenceNo?: string;
  notes?: string;
  linkedInvoiceId?: string;
  createdAt: string;
}

export type ExpenseCategory = 
  | 'RENT' 
  | 'ELECTRICITY' 
  | 'SALARY' 
  | 'FREIGHT' 
  | 'OFFICE' 
  | 'MAINTENANCE' 
  | 'MARKETING'
  | 'UTILITIES'
  | 'LOGISTICS'
  | 'OTHER';

export interface Expense {
  id: string;
  category: ExpenseCategory | string;
  title: string;
  amount: number;
  date: string;
  paymentMode: PaymentMode;
  notes?: string;
  isGstApplicable?: boolean;
  gstRate?: number;
  taxAmount?: number;
  receiptPhoto?: string;
  createdAt: string;
}

export interface DaySummary {
  todaySales: number;
  todayPurchases: number;
  cashInHand: number;
  bankBalance: number;
  totalReceivable: number;
  totalPayable: number;
  lowStockCount: number;
}

export interface SyncQueueItem {
  id: string;
  entity: 'INVOICE' | 'PURCHASE' | 'ITEM' | 'PARTY' | 'PAYMENT' | 'EXPENSE';
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'INSERT';
  payload: any;
  timestamp: number;
  attempts: number;
  is_synced?: boolean;
  sync_action?: 'INSERT' | 'UPDATE' | 'DELETE';
}
