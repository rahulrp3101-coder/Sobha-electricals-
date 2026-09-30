import React, { useState } from 'react';
import { 
  Database, Server, Cpu, Wifi, WifiOff, HardDrive, 
  ArrowRight, ArrowLeftRight, CheckCircle2, Shield, Layers, 
  Code2, Bluetooth, Usb, Printer, Copy, Check 
} from 'lucide-react';

export const ArchitectureViewer: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'ARCHITECTURE' | 'SCHEMA' | 'THERMAL_ENGINE'>('ARCHITECTURE');
  const [copiedPrisma, setCopiedPrisma] = useState(false);
  const [simulatedNetwork, setSimulatedNetwork] = useState<'ONLINE' | 'OFFLINE'>('ONLINE');

  const copyPrismaSchema = () => {
    setCopiedPrisma(true);
    setTimeout(() => setCopiedPrisma(false), 2000);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold uppercase rounded font-mono">
              System Architecture & Deliverables
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
            Enterprise Cloud PWA Technical Blueprint
          </h2>
          <p className="text-xs text-slate-500">
            Offline-first data sync flow, PostgreSQL/Prisma relational schema, and Web Hardware ESC/POS drivers
          </p>
        </div>

        {/* Deliverable Switcher */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs self-start sm:self-auto">
          {[
            { id: 'ARCHITECTURE', label: '1. Architecture & Data Flow' },
            { id: 'SCHEMA', label: '2. PostgreSQL Prisma Schema' },
            { id: 'THERMAL_ENGINE', label: '4. Thermal Print Engine' },
          ].map((sec) => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeSection === sec.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>
      </div>

      {/* DELIVERABLE 1: SYSTEM ARCHITECTURE & DATA FLOW */}
      {activeSection === 'ARCHITECTURE' && (
        <div className="space-y-6">
          {/* Simulation Toggle */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${simulatedNetwork === 'ONLINE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                {simulatedNetwork === 'ONLINE' ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
              </div>
              <div>
                <div className="text-xs font-bold">Interactive Sync Mode Simulation</div>
                <div className="text-[11px] text-slate-400">
                  {simulatedNetwork === 'ONLINE'
                    ? 'Online Mode: Real-time writes to IndexedDB + instant asynchronous dispatch to Cloud API & PostgreSQL'
                    : 'Offline Mode: Billing never stops. Invoices persist in IndexedDB and enqueue to background Sync Queue'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setSimulatedNetwork('ONLINE')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  simulatedNetwork === 'ONLINE' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Online Sync
              </button>
              <button
                onClick={() => setSimulatedNetwork('OFFLINE')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                  simulatedNetwork === 'OFFLINE' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Offline-First
              </button>
            </div>
          </div>

          {/* System Architecture Flow Diagram */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-6">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
              Data Flow: IndexedDB ⟷ Service Worker ⟷ Cloud API ⟷ PostgreSQL
            </h3>

            {/* Architecture Node Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
              {/* Node 1: Client Web App (UI & Keyboard POS) */}
              <div className="bg-blue-50/70 border-2 border-blue-300 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] bg-blue-200 text-blue-900 font-bold px-2 py-0.5 rounded font-mono">
                      LAYER 1
                    </span>
                    <Cpu className="w-4 h-4 text-blue-700" />
                  </div>
                  <h4 className="font-bold text-sm text-blue-950">Fast POS React UI</h4>
                  <p className="text-xs text-blue-900 mt-1">
                    Hotkeys (F2, Alt+P, Alt+S), camera barcode scanner, real-time GST state math.
                  </p>
                </div>
                <div className="mt-4 pt-2 border-t border-blue-200 text-[10px] font-mono text-blue-800">
                  Zero-latency counter billing
                </div>
              </div>

              {/* Node 2: IndexedDB Local Engine */}
              <div className="bg-slate-50 border-2 border-slate-300 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] bg-slate-200 text-slate-900 font-bold px-2 py-0.5 rounded font-mono">
                      LAYER 2
                    </span>
                    <HardDrive className="w-4 h-4 text-slate-700" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-900">IndexedDB Client Store</h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Stores items, parties, invoices, and <strong className="text-slate-900">sync_queue</strong>. Decrements stock in local transaction.
                  </p>
                </div>
                <div className="mt-4 pt-2 border-t border-slate-200 text-[10px] font-mono text-slate-700">
                  100% Offline Resilience
                </div>
              </div>

              {/* Node 3: Service Worker & Cloud API */}
              <div className="bg-indigo-50/70 border-2 border-indigo-300 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] bg-indigo-200 text-indigo-900 font-bold px-2 py-0.5 rounded font-mono">
                      LAYER 3
                    </span>
                    <Server className="w-4 h-4 text-indigo-700" />
                  </div>
                  <h4 className="font-bold text-sm text-indigo-950">Service Worker & Sync API</h4>
                  <p className="text-xs text-indigo-900 mt-1">
                    Workbox offline asset precaching + Express REST endpoints with idempotency keys.
                  </p>
                </div>
                <div className="mt-4 pt-2 border-t border-indigo-200 text-[10px] font-mono text-indigo-800">
                  Auto Background Replay
                </div>
              </div>

              {/* Node 4: PostgreSQL with Prisma ORM */}
              <div className="bg-purple-50/70 border-2 border-purple-300 rounded-2xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] bg-purple-200 text-purple-900 font-bold px-2 py-0.5 rounded font-mono">
                      LAYER 4
                    </span>
                    <Database className="w-4 h-4 text-purple-700" />
                  </div>
                  <h4 className="font-bold text-sm text-purple-950">PostgreSQL Cloud DB</h4>
                  <p className="text-xs text-purple-900 mt-1">
                    Prisma ORM multi-tenant company schemas, ACID invoices, ledger balance reconciliation.
                  </p>
                </div>
                <div className="mt-4 pt-2 border-t border-purple-200 text-[10px] font-mono text-purple-800">
                  ACID Relational Source of Truth
                </div>
              </div>
            </div>

            {/* Sync Lifecycle Breakdown */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2">
              <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                Synchronization & Conflict Resolution Protocol
              </div>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                <li>
                  <strong className="text-slate-800">Local-First Write:</strong> When cashier hits <code>Alt+S</code>, the invoice is immediately persisted to IndexedDB and stock is decremented instantly without waiting for network round-trips.
                </li>
                <li>
                  <strong className="text-slate-800">Idempotency Sync Key:</strong> Every invoice is generated with a client UUID (<code>clientSyncId</code>). Even if network retries occur, the backend prevents duplicate invoice entries.
                </li>
                <li>
                  <strong className="text-slate-800">Background Sync Queue:</strong> If <code>navigator.onLine === false</code>, the write is queued in the <code>sync_queue</code> object store. When <code>window.addEventListener('online')</code> fires, the background queue replays transactions sequentially.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* DELIVERABLE 2: POSTGRESQL PRISMA SCHEMA */}
      {activeSection === 'SCHEMA' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div>
              <h3 className="font-bold text-sm text-slate-900">PostgreSQL Relational Schema (prisma/schema.prisma)</h3>
              <p className="text-xs text-slate-500">
                Tables for Users, Parties, Items, ItemBatches, Invoices, InvoiceItems, Payments, and Expenses with proper relations and constraints.
              </p>
            </div>
            <button
              onClick={copyPrismaSchema}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition"
            >
              {copiedPrisma ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedPrisma ? 'Copied!' : 'Copy Schema'}</span>
            </button>
          </div>

          <div className="bg-slate-950 text-slate-200 p-5 rounded-2xl border border-slate-800 font-mono text-xs overflow-x-auto max-h-[550px] overflow-y-auto leading-relaxed">
            <pre>{`// Vyapar Pro - Production PostgreSQL Schema with Prisma ORM
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Company {
  id             String    @id @default(uuid())
  name           String
  legalTradeName String
  gstin          String    @unique
  state          String
  stateCode      String    @db.VarChar(2)
  address        String
  city           String
  pincode        String    @db.VarChar(6)
  phone          String
  email          String
  bankName       String?
  bankAccountNo  String?
  bankIfsc       String?
  bankBranch     String?
  upiId          String?
  invoicePrefix  String    @default("INV-2026-")

  users          User[]
  parties        Party[]
  items          Item[]
  invoices       Invoice[]
  payments       Payment[]
  expenses       Expense[]
}

model Party {
  id             String     @id @default(uuid())
  companyId      String
  company        Company    @relation(fields: [companyId], references: [id], onDelete: Cascade)
  name           String
  type           PartyType  @default(CUSTOMER)
  phone          String
  email          String?
  gstin          String?    @db.VarChar(15)
  state          String
  stateCode      String     @db.VarChar(2)
  address        String
  creditLimit    Decimal    @default(0.0) @db.Decimal(12, 2)
  currentBalance Decimal    @default(0.0) @db.Decimal(12, 2) // positive = receivable, negative = payable

  invoices       Invoice[]
  payments       Payment[]
  @@index([companyId, type])
}

model Item {
  id                 String       @id @default(uuid())
  companyId          String
  company            Company      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  name               String
  category           String
  sku                String       @unique
  barcode            String?      @unique
  hsn                String       @db.VarChar(8)
  unit               UnitType     @default(PCS)
  purchasePrice      Decimal      @db.Decimal(12, 2)
  wholesalePrice     Decimal      @db.Decimal(12, 2)
  retailPrice        Decimal      @db.Decimal(12, 2)
  taxRate            Decimal      @default(18.0) @db.Decimal(5, 2)
  taxInclusive       Boolean      @default(false)
  currentStock       Decimal      @default(0.0) @db.Decimal(12, 3)
  lowStockThreshold  Decimal      @default(10.0) @db.Decimal(12, 3)

  batches            ItemBatch[]
  invoiceItems       InvoiceItem[]
  @@index([companyId, category])
}

model Invoice {
  id              String        @id @default(uuid())
  companyId       String
  company         Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  partyId         String
  party           Party         @relation(fields: [partyId], references: [id], onDelete: Restrict)
  invoiceNumber   String        @unique
  documentType    DocumentType  @default(SALES_INVOICE)
  date            DateTime      @default(now())
  subTotal        Decimal       @db.Decimal(12, 2) // Taxable value
  totalDiscount   Decimal       @default(0.0) @db.Decimal(12, 2)
  totalCgst       Decimal       @default(0.0) @db.Decimal(12, 2)
  totalSgst       Decimal       @default(0.0) @db.Decimal(12, 2)
  totalIgst       Decimal       @default(0.0) @db.Decimal(12, 2)
  totalTax        Decimal       @default(0.0) @db.Decimal(12, 2)
  roundOff        Decimal       @default(0.0) @db.Decimal(6, 2)
  grandTotal      Decimal       @db.Decimal(12, 2)
  receivedAmount  Decimal       @default(0.0) @db.Decimal(12, 2)
  balanceAmount   Decimal       @default(0.0) @db.Decimal(12, 2)
  paymentMode     PaymentMode   @default(CASH)
  status          InvoiceStatus @default(PAID)
  clientSyncId    String?       @unique

  items           InvoiceItem[]
  payments        Payment[]
  @@index([companyId, documentType, date])
}

model InvoiceItem {
  id             String    @id @default(uuid())
  invoiceId      String
  invoice        Invoice   @relation(fields: [invoiceId], references: [id], onDelete: Cascade)
  itemId         String
  item           Item      @relation(fields: [itemId], references: [id], onDelete: Restrict)
  itemName       String
  hsn            String    @db.VarChar(8)
  unit           String
  quantity       Decimal   @db.Decimal(12, 3)
  unitPrice      Decimal   @db.Decimal(12, 2)
  discountAmount Decimal   @default(0.0) @db.Decimal(12, 2)
  taxRate        Decimal   @db.Decimal(5, 2)
  taxableAmount  Decimal   @db.Decimal(12, 2)
  cgstAmount     Decimal   @default(0.0) @db.Decimal(12, 2)
  sgstAmount     Decimal   @default(0.0) @db.Decimal(12, 2)
  igstAmount     Decimal   @default(0.0) @db.Decimal(12, 2)
  totalAmount    Decimal   @db.Decimal(12, 2)
}`}</pre>
          </div>
        </div>
      )}

      {/* DELIVERABLE 4: THERMAL PRINT ENGINE */}
      {activeSection === 'THERMAL_ENGINE' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
              Deliverable 4: Thermal Print Engine Implementation Specification
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Vyapar Pro implements a dual-mode thermal printing pipeline:
              <strong>1) Direct Web Bluetooth / Web Serial API</strong> raw binary ESC/POS communication, and
              <strong>2) Browser @media print CSS rasterization</strong> for universal driverless printing on 58mm and 80mm rolls.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Bluetooth className="w-4 h-4 text-blue-600" />
                  <span>Web Bluetooth GATT Driver</span>
                </div>
                <p className="text-slate-600">
                  Connects to BLE thermal POS receipt printers (standard POS printer service UUID <code>000018f0-0000-1000-8000-00805f9b34fb</code>). Data is packetized in 512-byte chunks to avoid Bluetooth buffer overflows.
                </p>
                <div className="font-mono text-[11px] bg-slate-900 text-emerald-400 p-2.5 rounded-lg">
                  navigator.bluetooth.requestDevice(&#123; acceptAllDevices: true &#125;)
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Usb className="w-4 h-4 text-slate-700" />
                  <span>Web Serial API (USB POS)</span>
                </div>
                <p className="text-slate-600">
                  Communicates directly with USB thermal receipt printers (TVS, Epson, Xprinter) using Chrome/Edge Web Serial API at standard 9600 baud rate.
                </p>
                <div className="font-mono text-[11px] bg-slate-900 text-emerald-400 p-2.5 rounded-lg">
                  port = await navigator.serial.requestPort(); await port.open(&#123; baudRate: 9600 &#125;);
                </div>
              </div>
            </div>

            <div className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-xs overflow-x-auto">
              <div className="text-slate-400 mb-2">// Sample ESC/POS Command Generator Snippet</div>
              <div>0x1B, 0x40  // ESC @: Initialize printer</div>
              <div>0x1B, 0x61, 0x01 // ESC a 1: Align Center</div>
              <div>0x1B, 0x21, 0x30 // ESC ! 0x30: Double Height & Width</div>
              <div>0x1B, 0x45, 0x01 // ESC E 1: Bold On</div>
              <div>0x1D, 0x56, 0x41, 0x03 // GS V 65 3: Automatic Paper Cut</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
