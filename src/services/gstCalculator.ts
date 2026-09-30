/**
 * GST Calculation Engine for Indian Taxation
 * Supports Intra-state (CGST + SGST) and Inter-state (IGST) automatic breakdown,
 * Cess, Tax Inclusive/Exclusive conversions, and standard mathematical round-off.
 */

export const INDIAN_STATES: { [code: string]: string } = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

export interface GSTCalculationResult {
  unitPrice: number;
  discountAmount: number;
  taxableAmount: number;
  taxRate: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  cessAmount: number;
  totalAmount: number;
  isInterState: boolean;
}

/**
 * Calculates GST breakdown for a single item
 */
export function calculateItemGST({
  quantity,
  rate,
  discountPercent = 0,
  taxRate = 18,
  isTaxInclusive = false,
  sellerStateCode,
  buyerStateCode,
  cessPercent = 0,
}: {
  quantity: number;
  rate: number;
  discountPercent?: number;
  taxRate?: number;
  isTaxInclusive?: boolean;
  sellerStateCode: string;
  buyerStateCode: string;
  cessPercent?: number;
}): GSTCalculationResult {
  const isInterState = sellerStateCode.trim() !== buyerStateCode.trim();
  const rawSubtotal = quantity * rate;
  const discountAmount = Number(((rawSubtotal * discountPercent) / 100).toFixed(2));
  const postDiscountSubtotal = Math.max(0, rawSubtotal - discountAmount);

  let taxableAmount = 0;
  let totalTax = 0;

  if (isTaxInclusive) {
    // If price includes tax: Rate = Taxable * (1 + TaxRate/100)
    taxableAmount = Number((postDiscountSubtotal / (1 + (taxRate + cessPercent) / 100)).toFixed(2));
    totalTax = Number((postDiscountSubtotal - taxableAmount).toFixed(2));
  } else {
    taxableAmount = Number(postDiscountSubtotal.toFixed(2));
    totalTax = Number(((taxableAmount * taxRate) / 100).toFixed(2));
  }

  let cgstRate = 0;
  let cgstAmount = 0;
  let sgstRate = 0;
  let sgstAmount = 0;
  let igstRate = 0;
  let igstAmount = 0;

  if (isInterState) {
    igstRate = taxRate;
    igstAmount = totalTax;
  } else {
    cgstRate = taxRate / 2;
    sgstRate = taxRate / 2;
    cgstAmount = Number((totalTax / 2).toFixed(2));
    sgstAmount = Number((totalTax / 2).toFixed(2));
  }

  const cessAmount = Number(((taxableAmount * cessPercent) / 100).toFixed(2));
  const totalAmount = Number((taxableAmount + cgstAmount + sgstAmount + igstAmount + cessAmount).toFixed(2));

  return {
    unitPrice: rate,
    discountAmount,
    taxableAmount,
    taxRate,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    cessAmount,
    totalAmount,
    isInterState,
  };
}

/**
 * Computes grand total with round-off difference
 */
export function calculateInvoiceTotals(items: {
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount?: number;
  discountAmount?: number;
}[]) {
  let subTotal = 0;
  let totalDiscount = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;

  for (const item of items) {
    subTotal += item.taxableAmount;
    totalDiscount += item.discountAmount || 0;
    totalCgst += item.cgstAmount;
    totalSgst += item.sgstAmount;
    totalIgst += item.igstAmount;
    totalCess += item.cessAmount || 0;
  }

  const totalTax = totalCgst + totalSgst + totalIgst + totalCess;
  const rawGrandTotal = subTotal + totalTax;
  const roundedGrandTotal = Math.round(rawGrandTotal);
  const roundOff = Number((roundedGrandTotal - rawGrandTotal).toFixed(2));

  return {
    subTotal: Number(subTotal.toFixed(2)),
    totalDiscount: Number(totalDiscount.toFixed(2)),
    totalCgst: Number(totalCgst.toFixed(2)),
    totalSgst: Number(totalSgst.toFixed(2)),
    totalIgst: Number(totalIgst.toFixed(2)),
    totalCess: Number(totalCess.toFixed(2)),
    totalTax: Number(totalTax.toFixed(2)),
    roundOff,
    grandTotal: roundedGrandTotal,
  };
}

/**
 * Format currency amount to Indian format (₹ 1,23,456.00)
 */
export function formatINR(amount: number): string {
  if (isNaN(amount)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Number to Indian words converter for formal invoices
 */
export function numberToWordsINR(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded === 0) return 'Zero Rupees Only';

  const singleDigits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const twoDigits = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertLessThanOneThousand(n: number): string {
    let str = '';
    if (n >= 100) {
      str += singleDigits[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    } else if (n >= 10) {
      str += twoDigits[n - 10] + ' ';
      n = 0;
    }
    if (n > 0) {
      str += singleDigits[n] + ' ';
    }
    return str.trim();
  }

  let num = rounded;
  let result = '';

  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const remainder = num;

  if (crore > 0) result += convertLessThanOneThousand(crore) + ' Crore ';
  if (lakh > 0) result += convertLessThanOneThousand(lakh) + ' Lakh ';
  if (thousand > 0) result += convertLessThanOneThousand(thousand) + ' Thousand ';
  if (remainder > 0) result += convertLessThanOneThousand(remainder) + ' ';

  return (result.trim() + ' Rupees Only');
}
