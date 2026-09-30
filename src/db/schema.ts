import { pgTable, serial, text, numeric, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

// Users Table (Firebase Auth sync)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Company / Shop Profile Table
export const company = pgTable('company', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  legalTradeName: text('legal_trade_name'),
  gstin: text('gstin'),
  state: text('state'),
  stateCode: text('state_code'),
  address: text('address'),
  city: text('city'),
  pincode: text('pincode'),
  phone: text('phone'),
  email: text('email'),
  upiId: text('upi_id'),
  bankName: text('bank_name'),
  bankAccountNo: text('bank_account_no'),
  bankIfsc: text('bank_ifsc'),
  bankBranch: text('bank_branch'),
  invoicePrefix: text('invoice_prefix'),
  terms: jsonb('terms'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Inventory Items Table
export const items = pgTable('items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  sku: text('sku'),
  barcode: text('barcode'),
  hsn: text('hsn'),
  unit: text('unit').notNull().default('PCS'),
  purchasePrice: numeric('purchase_price', { precision: 12, scale: 2 }).notNull(),
  wholesalePrice: numeric('wholesale_price', { precision: 12, scale: 2 }).notNull(),
  retailPrice: numeric('retail_price', { precision: 12, scale: 2 }).notNull(),
  taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).notNull().default('18'),
  taxInclusive: boolean('tax_inclusive').notNull().default(true),
  currentStock: numeric('current_stock', { precision: 12, scale: 3 }).notNull().default('0'),
  lowStockThreshold: numeric('low_stock_threshold', { precision: 12, scale: 3 }).notNull().default('10'),
  batches: jsonb('batches'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('items_barcode_idx').on(table.barcode),
  index('items_sku_idx').on(table.sku),
]);

// Parties / Customer Khata Table
export const parties = pgTable('parties', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull().default('CUSTOMER'), // CUSTOMER | SUPPLIER
  phone: text('phone'),
  email: text('email'),
  gstin: text('gstin'),
  state: text('state'),
  stateCode: text('state_code'),
  address: text('address'),
  creditLimit: numeric('credit_limit', { precision: 12, scale: 2 }),
  currentBalance: numeric('current_balance', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Invoices & Billing Documents Table
export const invoices = pgTable('invoices', {
  id: text('id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  documentType: text('document_type').notNull().default('SALES_INVOICE'),
  partyId: text('party_id'),
  partyName: text('party_name').notNull(),
  partyPhone: text('party_phone'),
  partyGstin: text('party_gstin'),
  partyAddress: text('party_address'),
  partyState: text('party_state'),
  partyStateCode: text('party_state_code'),
  date: text('date').notNull(),
  dueDate: text('due_date'),
  items: jsonb('items').notNull(),
  subTotal: numeric('sub_total', { precision: 12, scale: 2 }).notNull(),
  totalDiscount: numeric('total_discount', { precision: 12, scale: 2 }).notNull().default('0'),
  totalCgst: numeric('total_cgst', { precision: 12, scale: 2 }).notNull().default('0'),
  totalSgst: numeric('total_sgst', { precision: 12, scale: 2 }).notNull().default('0'),
  totalIgst: numeric('total_igst', { precision: 12, scale: 2 }).notNull().default('0'),
  totalCess: numeric('total_cess', { precision: 12, scale: 2 }).notNull().default('0'),
  totalTax: numeric('total_tax', { precision: 12, scale: 2 }).notNull().default('0'),
  roundOff: numeric('round_off', { precision: 5, scale: 2 }).notNull().default('0'),
  grandTotal: numeric('grand_total', { precision: 12, scale: 2 }).notNull(),
  receivedAmount: numeric('received_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  balanceAmount: numeric('balance_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  paymentMode: text('payment_mode').notNull().default('CASH'),
  status: text('status').notNull().default('PAID'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Payments Table (Khata vouchers)
export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  receiptNumber: text('receipt_number').notNull(),
  partyId: text('party_id').notNull(),
  partyName: text('party_name').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paymentMode: text('payment_mode').notNull(),
  type: text('type').notNull(), // PAYMENT_IN | PAYMENT_OUT
  date: text('date').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Expenses Table
export const expenses = pgTable('expenses', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  paymentMode: text('payment_mode').notNull().default('CASH'),
  date: text('date').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Single Admin Auth & Active Session Table
export const adminAuth = pgTable('admin_auth', {
  id: text('id').primaryKey(), // 'root_admin'
  username: text('username').notNull().default('admin'),
  passwordHash: text('password_hash').notNull().default('admin123'),
  activeSessionToken: text('active_session_token'),
  lastLoginAt: timestamp('last_login_at'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

