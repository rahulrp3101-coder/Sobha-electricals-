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
 * Exports invoices to Excel-ready CSV
 */
export function exportInvoicesToCSV(invoices: Invoice[]) {
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
