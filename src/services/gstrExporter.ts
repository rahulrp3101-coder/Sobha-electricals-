import { Invoice, CompanyProfile } from '../types';

export interface GSTR1Summary {
  gstin: string;
  fp: string; // filing period (e.g. 092026)
  gt: number; // Gross turnover
  b2b: any[];
  b2cs: any[];
  hsn: { data: any[] };
  doc_issue: any;
}

/**
 * Builds standard GSTR-1 JSON schema from invoices
 */
export function generateGSTR1JSON(invoices: Invoice[], company: CompanyProfile, period: string = '092026'): GSTR1Summary {
  const salesInvoices = invoices.filter(inv => inv.documentType === 'SALES_INVOICE' && inv.status !== 'CANCELLED');

  const b2bMap: { [gstin: string]: any } = {};
  const b2csList: any[] = [];
  const hsnMap: { [hsn: string]: any } = {};

  let grossTurnover = 0;

  for (const inv of salesInvoices) {
    grossTurnover += inv.grandTotal;

    // Check if B2B (Party has valid GSTIN) or B2C
    if (inv.partyGstin && inv.partyGstin.trim().length === 15) {
      if (!b2bMap[inv.partyGstin]) {
        b2bMap[inv.partyGstin] = {
          ctin: inv.partyGstin,
          inv: [],
        };
      }

      b2bMap[inv.partyGstin].inv.push({
        inum: inv.invoiceNumber,
        idt: inv.date.split('-').reverse().join('-'), // DD-MM-YYYY
        val: inv.grandTotal,
        pos: inv.partyStateCode,
        rchrg: 'N',
        inv_typ: 'R',
        itms: inv.items.map((item, idx) => ({
          num: idx + 1,
          itm_det: {
            rt: item.taxRate,
            txval: item.taxableAmount,
            iamt: item.igstAmount,
            camt: item.cgstAmount,
            samt: item.sgstAmount,
            csamt: item.cessAmount || 0,
          },
        })),
      });
    } else {
      // B2C Small
      b2csList.push({
        sply_ty: inv.partyStateCode === company.stateCode ? 'INTRA' : 'INTER',
        pos: inv.partyStateCode,
        rt: inv.items[0]?.taxRate || 18,
        txval: inv.subTotal,
        iamt: inv.totalIgst,
        camt: inv.totalCgst,
        samt: inv.totalSgst,
        csamt: inv.totalCess,
      });
    }

    // HSN Summary aggregation
    for (const item of inv.items) {
      const hsnCode = item.hsn || '9999';
      if (!hsnMap[hsnCode]) {
        hsnMap[hsnCode] = {
          num: Object.keys(hsnMap).length + 1,
          hsn_sc: hsnCode,
          desc: item.itemName,
          uqc: item.unit || 'OTH',
          qty: 0,
          val: 0,
          txval: 0,
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
        };
      }

      const hsnEntry = hsnMap[hsnCode];
      hsnEntry.qty += item.quantity;
      hsnEntry.val += item.totalAmount;
      hsnEntry.txval += item.taxableAmount;
      hsnEntry.iamt += item.igstAmount;
      hsnEntry.camt += item.cgstAmount;
      hsnEntry.samt += item.sgstAmount;
      hsnEntry.csamt += (item.cessAmount || 0);
    }
  }

  return {
    gstin: company.gstin,
    fp: period,
    gt: Number(grossTurnover.toFixed(2)),
    b2b: Object.values(b2bMap),
    b2cs: b2csList,
    hsn: {
      data: Object.values(hsnMap).map(h => ({
        ...h,
        qty: Number(h.qty.toFixed(2)),
        val: Number(h.val.toFixed(2)),
        txval: Number(h.txval.toFixed(2)),
        iamt: Number(h.iamt.toFixed(2)),
        camt: Number(h.camt.toFixed(2)),
        samt: Number(h.samt.toFixed(2)),
      })),
    },
    doc_issue: {
      doc_det: [
        {
          doc_num: 1,
          doc_typ: 'Invoices for outward supply',
          from: salesInvoices[0]?.invoiceNumber || 'INV-001',
          to: salesInvoices[salesInvoices.length - 1]?.invoiceNumber || 'INV-001',
          totnum: salesInvoices.length,
          canc: 0,
          net_issue: salesInvoices.length,
        },
      ],
    },
  };
}

/**
 * Downloads a file to client machine
 */
export function downloadJSONFile(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports complete CA & Tax Filing Ready Excel/CSV Report
 * Includes GSTR-1 Outward, GSTR-2 Inward ITC, Shop Expenses, Net GST Liability, and P&L
 */
export function exportFullCASummaryCSV(
  invoices: Invoice[],
  expenses: any[],
  company: CompanyProfile,
  periodMonth: string = 'Current'
) {
  const lines: string[] = [];

  // 1. Report Header
  lines.push(`"GST FILING SUMMARY & BUSINESS REPORT (CA TAX FILING READY)"`);
  lines.push(`"Trade Name:","${company.legalTradeName || company.name}"`);
  lines.push(`"GSTIN:","${company.gstin}"`);
  lines.push(`"State:","${company.state} (${company.stateCode})"`);
  lines.push(`"Period:","${periodMonth}"`);
  lines.push(`"Generated On:","${new Date().toLocaleDateString('en-IN')}"`);
  lines.push(`""`);

  // Filter Sales & Purchases
  const salesInvoices = invoices.filter(i => (i.documentType === 'SALES_INVOICE' || !i.documentType) && i.status !== 'CANCELLED');
  const b2bSales = salesInvoices.filter(i => i.partyGstin && i.partyGstin.trim().length >= 15);
  const b2cSales = salesInvoices.filter(i => !i.partyGstin || i.partyGstin.trim().length < 15);
  const purchaseBills = invoices.filter(i => i.documentType === 'PURCHASE_BILL');

  // Summary Totals
  const totalSalesTaxable = salesInvoices.reduce((s, i) => s + i.subTotal, 0);
  const totalSalesCgst = salesInvoices.reduce((s, i) => s + i.totalCgst, 0);
  const totalSalesSgst = salesInvoices.reduce((s, i) => s + i.totalSgst, 0);
  const totalSalesIgst = salesInvoices.reduce((s, i) => s + i.totalIgst, 0);
  const totalSalesTax = totalSalesCgst + totalSalesSgst + totalSalesIgst;
  const totalSalesGross = salesInvoices.reduce((s, i) => s + i.grandTotal, 0);

  const totalPurchaseTaxable = purchaseBills.reduce((s, i) => s + i.subTotal, 0);
  const totalPurchaseCgst = purchaseBills.reduce((s, i) => s + i.totalCgst, 0);
  const totalPurchaseSgst = purchaseBills.reduce((s, i) => s + i.totalSgst, 0);
  const totalPurchaseIgst = purchaseBills.reduce((s, i) => s + i.totalIgst, 0);
  const totalPurchaseItc = totalPurchaseCgst + totalPurchaseSgst + totalPurchaseIgst;
  const totalPurchaseGross = purchaseBills.reduce((s, i) => s + i.grandTotal, 0);

  const totalExpenseAmount = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const expenseItc = expenses.reduce((s, e) => s + (e.taxAmount || 0), 0);

  const totalClaimableITC = totalPurchaseItc + expenseItc;
  const netGstPayable = Math.max(0, totalSalesTax - totalClaimableITC);
  const itcCarryForward = Math.max(0, totalClaimableITC - totalSalesTax);
  const netProfit = totalSalesGross - (totalPurchaseGross + totalExpenseAmount);

  // SECTION 1: GSTR-1 OUTWARD SUPPLIES
  lines.push(`"SECTION 1: GSTR-1 OUTWARD SUPPLIES (SALES REPORT)"`);
  lines.push(`"Summary Metric","Taxable Value (₹)","CGST (₹)","SGST (₹)","IGST (₹)","Total Tax (₹)","Gross Total (₹)"`);
  lines.push(`"Total Sales (B2B + B2C)",${totalSalesTaxable.toFixed(2)},${totalSalesCgst.toFixed(2)},${totalSalesSgst.toFixed(2)},${totalSalesIgst.toFixed(2)},${totalSalesTax.toFixed(2)},${totalSalesGross.toFixed(2)}`);
  lines.push(`""`);

  lines.push(`"--- B2B INVOICES (Sales to Registered Parties with GSTIN) ---"`);
  lines.push(`"Invoice No","Date","Customer Name","Customer GSTIN","State","Taxable Value","CGST","SGST","IGST","Total Bill"`);
  if (b2bSales.length === 0) {
    lines.push(`"No B2B Invoices in this period",,,,,,,,,`);
  } else {
    b2bSales.forEach(inv => {
      lines.push(`"${inv.invoiceNumber}","${inv.date}","${inv.partyName}","${inv.partyGstin}","${inv.partyState}",${inv.subTotal.toFixed(2)},${inv.totalCgst.toFixed(2)},${inv.totalSgst.toFixed(2)},${inv.totalIgst.toFixed(2)},${inv.grandTotal.toFixed(2)}`);
    });
  }
  lines.push(`""`);

  lines.push(`"--- B2C INVOICES (Sales to Retail Consumers) ---"`);
  lines.push(`"Invoice No","Date","Customer Name","Taxable Value","CGST","SGST","IGST","Total Bill"`);
  if (b2cSales.length === 0) {
    lines.push(`"No B2C Invoices in this period",,,,,,,`);
  } else {
    b2cSales.forEach(inv => {
      lines.push(`"${inv.invoiceNumber}","${inv.date}","${inv.partyName || 'Retail Customer'}",${inv.subTotal.toFixed(2)},${inv.totalCgst.toFixed(2)},${inv.totalSgst.toFixed(2)},${inv.totalIgst.toFixed(2)},${inv.grandTotal.toFixed(2)}`);
    });
  }
  lines.push(`""`);

  // SECTION 2: GSTR-2 INWARD SUPPLIES & ITC
  lines.push(`"SECTION 2: GSTR-2 INWARD SUPPLIES (PURCHASES & INPUT TAX CREDIT)"`);
  lines.push(`"Bill No","Date","Supplier Name","Supplier GSTIN","Taxable Value","CGST (ITC)","SGST (ITC)","IGST (ITC)","Total ITC Claimable","Gross Bill"`);
  if (purchaseBills.length === 0) {
    lines.push(`"No Purchase Bills recorded in this period",,,,,,,,,`);
  } else {
    purchaseBills.forEach(inv => {
      const itc = inv.totalCgst + inv.totalSgst + inv.totalIgst;
      lines.push(`"${inv.invoiceNumber}","${inv.date}","${inv.partyName}","${inv.partyGstin || 'Unregistered'}",${inv.subTotal.toFixed(2)},${inv.totalCgst.toFixed(2)},${inv.totalSgst.toFixed(2)},${inv.totalIgst.toFixed(2)},${itc.toFixed(2)},${inv.grandTotal.toFixed(2)}`);
    });
  }
  lines.push(`"Total Purchase ITC",,,,${totalPurchaseTaxable.toFixed(2)},${totalPurchaseCgst.toFixed(2)},${totalPurchaseSgst.toFixed(2)},${totalPurchaseIgst.toFixed(2)},${totalPurchaseItc.toFixed(2)},${totalPurchaseGross.toFixed(2)}`);
  lines.push(`""`);

  // SECTION 3: SHOP EXPENSES & EXPENSE ITC
  lines.push(`"SECTION 3: SHOP EXPENSES & BUSINESS ITC"`);
  lines.push(`"Date","Category","Description","Payment Mode","GST Applicable","GST Rate","ITC Claimable (₹)","Total Amount (₹)"`);
  if (expenses.length === 0) {
    lines.push(`"No Expenses recorded in this period",,,,,,,`);
  } else {
    expenses.forEach(e => {
      lines.push(`"${e.date}","${e.category}","${e.title || ''}","${e.paymentMode}","${e.isGstApplicable ? 'YES' : 'NO'}","${e.gstRate ? e.gstRate + '%' : '0%'}",${(e.taxAmount || 0).toFixed(2)},${(e.amount || 0).toFixed(2)}`);
    });
  }
  lines.push(`"Total Expense ITC",,,,,,,${expenseItc.toFixed(2)}`);
  lines.push(`"Total Shop Expenses",,,,,,,${totalExpenseAmount.toFixed(2)}`);
  lines.push(`""`);

  // SECTION 4: NET TAX LIABILITY & SUMMARY
  lines.push(`"SECTION 4: NET TAX LIABILITY & PROFIT/LOSS STATEMENT"`);
  lines.push(`"Particulars","Amount (₹)","Notes"`);
  lines.push(`"Total Tax Collected on Sales (Output GST)",${totalSalesTax.toFixed(2)},"CGST + SGST + IGST on sales"`);
  lines.push(`"Less: Input Tax Credit on Purchases (GSTR-2 ITC)",${totalPurchaseItc.toFixed(2)},"ITC on goods purchased"`);
  lines.push(`"Less: Input Tax Credit on Business Expenses",${expenseItc.toFixed(2)},"ITC on rent, power, freight bills"`);
  lines.push(`"Total Claimable Input Tax Credit (ITC)",${totalClaimableITC.toFixed(2)},"Total ITC Offset"`);
  lines.push(`"NET GST PAYABLE TO GOVERNMENT",${netGstPayable.toFixed(2)},"${netGstPayable > 0 ? 'Cash/Challan Payment Required' : 'NIL (Covered by ITC)'}"`);
  lines.push(`"ITC Balance to Carry Forward",${itcCarryForward.toFixed(2)},"Excess ITC credit carried to next month"`);
  lines.push(`""`);
  lines.push(`"PROFIT & LOSS (P&L) SUMMARY"`);
  lines.push(`"Total Gross Sales Revenue",${totalSalesGross.toFixed(2)},"All sales invoices"`);
  lines.push(`"Less: Total Goods Purchased (COGS)",${totalPurchaseGross.toFixed(2)},"Stock purchases"`);
  lines.push(`"Less: Total Shop Expenses",${totalExpenseAmount.toFixed(2)},"Rent, staff salary, freight, etc."`);
  lines.push(`"NET BUSINESS PROFIT / (LOSS)",${netProfit.toFixed(2)},"${netProfit >= 0 ? 'Net Profit' : 'Net Loss'}"`);

  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cleanGstin = company.gstin ? `_${company.gstin}` : '';
  a.download = `GST_CA_Summary_Report${cleanGstin}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportInvoicesToCSV(invoices: Invoice[]): void {
  const headers = [
    'Invoice Number',
    'Document Type',
    'Date',
    'Customer / Party',
    'Party GSTIN',
    'State',
    'Taxable Amount',
    'CGST',
    'SGST',
    'IGST',
    'Total Tax',
    'Grand Total',
    'Payment Mode',
    'Status',
  ];

  const rows = invoices.map(inv => [
    `"${inv.invoiceNumber}"`,
    `"${inv.documentType}"`,
    `"${inv.date}"`,
    `"${inv.partyName}"`,
    `"${inv.partyGstin || ''}"`,
    `"${inv.partyState}"`,
    inv.subTotal.toFixed(2),
    inv.totalCgst.toFixed(2),
    inv.totalSgst.toFixed(2),
    inv.totalIgst.toFixed(2),
    inv.totalTax.toFixed(2),
    inv.grandTotal.toFixed(2),
    `"${inv.paymentMode}"`,
    `"${inv.status}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Vyapar_Sales_Report_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

