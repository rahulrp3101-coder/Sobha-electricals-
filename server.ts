import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createPool, db } from './src/db/index.ts';
import * as schema from './src/db/schema.ts';
import { eq, sql } from 'drizzle-orm';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// In-memory fallback for admin credentials & single active session
let inMemoryAdmin = {
  id: 'root_admin',
  username: 'admin',
  passwordHash: 'admin123',
  activeSessionToken: null as string | null,
  lastLoginAt: null as Date | null,
};

async function initAdminAuthTable() {
  try {
    await db.insert(schema.adminAuth)
      .values({
        id: 'root_admin',
        username: 'admin',
        passwordHash: 'admin123',
      })
      .onConflictDoNothing();
  } catch (err) {
    // If transient connection delay on boot, inMemoryAdmin handles it
  }
}

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Single Admin Authentication APIs
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'यूजरनेम और पासवर्ड दोनों आवश्यक हैं।' });
  }

  try {
    let adminRecord: any = null;
    try {
      const records = await db.select().from(schema.adminAuth).where(eq(schema.adminAuth.id, 'root_admin'));
      if (records.length > 0) {
        adminRecord = records[0];
      }
    } catch (e) {
      console.warn('DB read fallback to inMemoryAdmin', e);
    }

    if (!adminRecord) {
      adminRecord = inMemoryAdmin;
    }

    if (username.trim() !== adminRecord.username || password !== adminRecord.passwordHash) {
      return res.status(401).json({ error: 'गलत क्रेडेंशियल्स! सही यूजरनेम व पासवर्ड दर्ज करें।' });
    }

    const newSessionToken = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    const now = new Date();

    inMemoryAdmin.activeSessionToken = newSessionToken;
    inMemoryAdmin.lastLoginAt = now;
    inMemoryAdmin.username = adminRecord.username;
    inMemoryAdmin.passwordHash = adminRecord.passwordHash;

    try {
      await db.insert(schema.adminAuth)
        .values({
          id: 'root_admin',
          username: adminRecord.username,
          passwordHash: adminRecord.passwordHash,
          activeSessionToken: newSessionToken,
          lastLoginAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.adminAuth.id,
          set: {
            activeSessionToken: newSessionToken,
            lastLoginAt: now,
            updatedAt: now,
          },
        });
    } catch (dbErr) {
      console.warn('DB update warning during login:', dbErr);
    }

    return res.json({
      success: true,
      sessionToken: newSessionToken,
      username: adminRecord.username,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'लॉगिन में त्रुटि हुई' });
  }
});

// Validate Active Session - Enforces Single Device / Browser Active Session
app.get('/api/auth/session-check', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer ')) 
    ? authHeader.substring(7) 
    : (req.headers['x-session-token'] as string);

  if (!token) {
    return res.status(401).json({ valid: false, reason: 'NO_TOKEN', message: 'कृपया लॉगिन करें।' });
  }

  try {
    let currentToken = inMemoryAdmin.activeSessionToken;
    let currentUsername = inMemoryAdmin.username;

    try {
      const records = await db.select().from(schema.adminAuth).where(eq(schema.adminAuth.id, 'root_admin'));
      if (records.length > 0) {
        currentToken = records[0].activeSessionToken;
        currentUsername = records[0].username;
        inMemoryAdmin.activeSessionToken = currentToken;
        inMemoryAdmin.username = currentUsername;
        inMemoryAdmin.passwordHash = records[0].passwordHash;
      }
    } catch (e) {
      // fallback to memory
    }

    if (!currentToken || token !== currentToken) {
      return res.status(401).json({
        valid: false,
        reason: 'SESSION_TERMINATED_OTHER_DEVICE',
        message: 'आपकी आईडी किसी दूसरे ब्राउज़र या नए डिवाइस में लॉगिन हो गई है। सिंगल एक्टिव सेशन सुरक्षा के तहत यह पुराना सेशन लॉग आउट कर दिया गया है।',
      });
    }

    return res.json({ valid: true, username: currentUsername });
  } catch (err: any) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

// Change Admin Password and/or Username
app.post('/api/auth/change-credentials', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = (authHeader && authHeader.startsWith('Bearer ')) 
    ? authHeader.substring(7) 
    : (req.headers['x-session-token'] as string);

  const { currentPassword, newUsername, newPassword } = req.body;

  if (!currentPassword || !newUsername || !newPassword) {
    return res.status(400).json({ error: 'सभी विवरण (वर्तमान पासवर्ड, नया यूजरनेम, नया पासवर्ड) आवश्यक हैं।' });
  }

  try {
    let adminRecord: any = inMemoryAdmin;
    try {
      const records = await db.select().from(schema.adminAuth).where(eq(schema.adminAuth.id, 'root_admin'));
      if (records.length > 0) {
        adminRecord = records[0];
      }
    } catch {
      // fallback
    }

    if (adminRecord.passwordHash !== currentPassword) {
      return res.status(400).json({ error: 'वर्तमान पासवर्ड गलत है। कृपया सही पासवर्ड डालें।' });
    }

    const newSessionToken = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    const now = new Date();

    inMemoryAdmin.username = newUsername.trim();
    inMemoryAdmin.passwordHash = newPassword;
    inMemoryAdmin.activeSessionToken = newSessionToken;

    try {
      await db.insert(schema.adminAuth)
        .values({
          id: 'root_admin',
          username: newUsername.trim(),
          passwordHash: newPassword,
          activeSessionToken: newSessionToken,
          lastLoginAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.adminAuth.id,
          set: {
            username: newUsername.trim(),
            passwordHash: newPassword,
            activeSessionToken: newSessionToken,
            updatedAt: now,
          },
        });
    } catch (dbErr) {
      console.warn('DB update warning during password change:', dbErr);
    }

    return res.json({
      success: true,
      message: 'एडमिन क्रेडेंशियल्स और पासवर्ड सफलतापूर्वक बदल दिया गया है!',
      sessionToken: newSessionToken,
      username: newUsername.trim(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'त्रुटि हुई' });
  }
});

// Logout API
app.post('/api/auth/logout', async (req, res) => {
  inMemoryAdmin.activeSessionToken = null;
  try {
    await db.update(schema.adminAuth)
      .set({ activeSessionToken: null, updatedAt: new Date() })
      .where(eq(schema.adminAuth.id, 'root_admin'));
  } catch {
    // ignore
  }
  res.json({ success: true });
});


// 1. Pull All Data from Cloud SQL PostgreSQL
app.get('/api/sync/pull', async (req, res) => {
  try {
    const [allCompany, allItems, allParties, allInvoices, allPayments, allExpenses] = await Promise.all([
      db.select().from(schema.company),
      db.select().from(schema.items),
      db.select().from(schema.parties),
      db.select().from(schema.invoices),
      db.select().from(schema.payments),
      db.select().from(schema.expenses),
    ]);

    res.json({
      company: allCompany[0] || null,
      items: allItems,
      parties: allParties,
      invoices: allInvoices,
      payments: allPayments,
      expenses: allExpenses,
    });
  } catch (error: any) {
    console.error('Error pulling data from Cloud SQL:', error);
    res.status(500).json({ error: 'Failed to fetch data from database' });
  }
});

// 2. Push / Sync Batch Data to Cloud SQL PostgreSQL
app.post('/api/sync/push', async (req, res) => {
  const { invoices = [], items = [], parties = [], payments = [], company: companyData } = req.body;

  try {
    // Upsert company
    if (companyData && companyData.id) {
      await db.insert(schema.company)
        .values({
          id: companyData.id,
          name: companyData.name,
          legalTradeName: companyData.legalTradeName,
          gstin: companyData.gstin,
          state: companyData.state,
          stateCode: companyData.stateCode,
          address: companyData.address,
          city: companyData.city,
          pincode: companyData.pincode,
          phone: companyData.phone,
          email: companyData.email,
          upiId: companyData.upiId,
          bankName: companyData.bankName,
          bankAccountNo: companyData.bankAccountNo,
          bankIfsc: companyData.bankIfsc,
          bankBranch: companyData.bankBranch,
          invoicePrefix: companyData.invoicePrefix,
          terms: companyData.terms,
        })
        .onConflictDoUpdate({
          target: schema.company.id,
          set: {
            name: companyData.name,
            gstin: companyData.gstin,
            state: companyData.state,
            stateCode: companyData.stateCode,
            phone: companyData.phone,
            address: companyData.address,
            upiId: companyData.upiId,
            updatedAt: new Date(),
          },
        });
    }

    // Upsert Items
    for (const item of items) {
      await db.insert(schema.items)
        .values({
          id: item.id,
          name: item.name,
          category: item.category,
          sku: item.sku,
          barcode: item.barcode,
          hsn: item.hsn,
          unit: item.unit,
          purchasePrice: String(item.purchasePrice),
          wholesalePrice: String(item.wholesalePrice),
          retailPrice: String(item.retailPrice),
          taxRate: String(item.taxRate),
          taxInclusive: item.taxInclusive ?? true,
          currentStock: String(item.currentStock),
          lowStockThreshold: String(item.lowStockThreshold),
          batches: item.batches,
        })
        .onConflictDoUpdate({
          target: schema.items.id,
          set: {
            name: item.name,
            currentStock: String(item.currentStock),
            retailPrice: String(item.retailPrice),
            updatedAt: new Date(),
          },
        });
    }

    // Upsert Parties
    for (const party of parties) {
      await db.insert(schema.parties)
        .values({
          id: party.id,
          name: party.name,
          type: party.type,
          phone: party.phone,
          email: party.email,
          gstin: party.gstin,
          state: party.state,
          stateCode: party.stateCode,
          address: party.address,
          currentBalance: String(party.currentBalance),
        })
        .onConflictDoUpdate({
          target: schema.parties.id,
          set: {
            name: party.name,
            phone: party.phone,
            currentBalance: String(party.currentBalance),
            updatedAt: new Date(),
          },
        });
    }

    // Upsert Invoices
    for (const inv of invoices) {
      await db.insert(schema.invoices)
        .values({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          documentType: inv.documentType,
          partyId: inv.partyId,
          partyName: inv.partyName,
          partyPhone: inv.partyPhone,
          partyGstin: inv.partyGstin,
          partyAddress: inv.partyAddress,
          partyState: inv.partyState,
          partyStateCode: inv.partyStateCode,
          date: inv.date,
          items: inv.items,
          subTotal: String(inv.subTotal),
          totalDiscount: String(inv.totalDiscount || 0),
          totalCgst: String(inv.totalCgst || 0),
          totalSgst: String(inv.totalSgst || 0),
          totalIgst: String(inv.totalIgst || 0),
          totalCess: String(inv.totalCess || 0),
          totalTax: String(inv.totalTax || 0),
          roundOff: String(inv.roundOff || 0),
          grandTotal: String(inv.grandTotal),
          receivedAmount: String(inv.receivedAmount || 0),
          balanceAmount: String(inv.balanceAmount || 0),
          paymentMode: inv.paymentMode,
          status: inv.status,
          notes: inv.notes,
        })
        .onConflictDoNothing();
    }

    // Upsert Payments
    for (const pay of payments) {
      await db.insert(schema.payments)
        .values({
          id: pay.id,
          receiptNumber: pay.receiptNumber,
          partyId: pay.partyId,
          partyName: pay.partyName,
          amount: String(pay.amount),
          paymentMode: pay.paymentMode,
          type: pay.type,
          date: pay.date,
          notes: pay.notes,
        })
        .onConflictDoNothing();
    }

    res.json({ success: true, syncedAt: new Date().toISOString() });
  } catch (error: any) {
    console.error('Error pushing data to Cloud SQL:', error);
    res.status(500).json({ error: error.message || 'Failed to sync to database' });
  }
});

// Direct single item upsert
app.post('/api/items', async (req, res) => {
  const item = req.body;
  try {
    await db.insert(schema.items)
      .values({
        id: item.id,
        name: item.name,
        category: item.category,
        sku: item.sku,
        barcode: item.barcode,
        hsn: item.hsn,
        unit: item.unit,
        purchasePrice: String(item.purchasePrice),
        wholesalePrice: String(item.wholesalePrice),
        retailPrice: String(item.retailPrice),
        taxRate: String(item.taxRate),
        taxInclusive: item.taxInclusive ?? true,
        currentStock: String(item.currentStock),
        lowStockThreshold: String(item.lowStockThreshold),
        batches: item.batches,
      })
      .onConflictDoUpdate({
        target: schema.items.id,
        set: {
          name: item.name,
          currentStock: String(item.currentStock),
          retailPrice: String(item.retailPrice),
          purchasePrice: String(item.purchasePrice),
          updatedAt: new Date(),
        },
      });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Direct single party upsert
app.post('/api/parties', async (req, res) => {
  const party = req.body;
  try {
    await db.insert(schema.parties)
      .values({
        id: party.id,
        name: party.name,
        type: party.type,
        phone: party.phone,
        email: party.email,
        gstin: party.gstin,
        state: party.state,
        stateCode: party.stateCode,
        address: party.address,
        currentBalance: String(party.currentBalance),
      })
      .onConflictDoUpdate({
        target: schema.parties.id,
        set: {
          name: party.name,
          phone: party.phone,
          currentBalance: String(party.currentBalance),
          updatedAt: new Date(),
        },
      });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  await initAdminAuthTable();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
