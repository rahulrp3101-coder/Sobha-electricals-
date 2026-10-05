/**
 * Interleaved Secret Cost Cipher for Retail Billing (POS)
 * 
 * Generates a disguised cost reference code from an item's net purchase cost (Purchase Rate + GST).
 * 
 * Rules:
 * - Digits of net cost interleaved with safe alphabets.
 * - Confusing characters (O, I, l) omitted to prevent confusion with 0 and 1.
 * - Safe character list: ['A', 'B', 'C', 'D', 'E', 'X', 'Y', 'Z'].
 * - Paise support: If cost has paise (e.g. ₹7.50), uses 'P' as separator (e.g. "7P5")
 * - Examples:
 *   - 150    -> "1A5B0"
 *   - 85     -> "8X5"
 *   - 1250   -> "1A2B5C0"
 *   - 7.50   -> "7P5"
 *   - 85.50  -> "8X5P5"
 *   - 0 / <=0 -> "0"
 * 
 * Usage:
 * - Displayed strictly on the operator's POS screen (Cart table row) as "Ref: [Code]".
 * - Completely omitted and hidden from customer prints, PDFs, estimates, and WhatsApp.
 */

const SAFE_CIPHER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'X', 'Y', 'Z'];

/**
 * Encodes the integer (Rupees) part into the interleaved cipher
 */
function encodeIntegerPart(intStr: string, hasPaise: boolean): string {
  if (!intStr || intStr.length === 0) return '0';
  
  if (intStr.length === 1) {
    // If paise is present (e.g. 7.50), 'P' acts as the separator: "7P5"
    // If no paise (e.g. 7), prefix with X to make 2 characters: "X7"
    return hasPaise ? intStr : `X${intStr}`;
  }

  if (intStr.length === 2) {
    return `${intStr[0]}X${intStr[1]}`;
  }

  let result = '';
  for (let i = 0; i < intStr.length; i++) {
    result += intStr[i];
    if (i < intStr.length - 1) {
      result += SAFE_CIPHER_LETTERS[i % SAFE_CIPHER_LETTERS.length];
    }
  }

  return result;
}

/**
 * Generates an interleaved secret cost code for shopkeeper reference
 * Rule 1: Paise (decimal) support using 'P' as separator (e.g. 7.50 -> "7P5")
 * Rule 3: Zero/Invalid/Negative cost safely returns '0'
 */
export function generateInterleavedCostCode(cost: number | undefined | null): string {
  // Rule 3: Zero and invalid cost safety - returns '0' fallback
  if (cost === undefined || cost === null || typeof cost !== 'number' || isNaN(cost) || cost <= 0) {
    return '0';
  }

  // Rule 1: Do not wipe out decimals with Math.round; preserve up to 2 decimal places
  const roundedCost = Math.round(cost * 100) / 100;
  if (roundedCost <= 0) {
    return '0';
  }

  // Check for paise
  const parts = roundedCost.toFixed(2).split('.');
  const rupeesPart = parts[0];
  let paisePart = parts[1] || '';

  // Trim trailing zero from paise (e.g. "50" -> "5" for ₹7.50 -> "7P5")
  paisePart = paisePart.replace(/0+$/, '');
  const hasPaise = paisePart.length > 0;

  const encodedRupees = encodeIntegerPart(rupeesPart, hasPaise);

  if (hasPaise) {
    // Rule 1: Use 'P' as separator in place of decimal point (e.g. "7P5")
    return `${encodedRupees}P${paisePart}`;
  }

  return encodedRupees;
}

/**
 * Calculates the net landed purchase cost (Purchase Rate + GST) for an item
 * Rule 2: Safe field fallbacks for purchasePrice and taxInclusive
 * Supports item.taxInclusive || item.isTaxInclusive || item.is_tax_inclusive to prevent double taxation
 */
export function calculateItemNetPurchaseCost(item?: {
  purchasePrice?: number;
  taxRate?: number;
  taxInclusive?: boolean;
  isTaxInclusive?: boolean;
  is_tax_inclusive?: boolean;
  [key: string]: any;
} | null): number {
  if (!item) return 0;

  // Rule 2: Safe Field Fallbacks for purchase price across databases and schemas
  const rawPrice = 
    item.purchasePrice ?? 
    item.purchase_price ?? 
    item.costPrice ?? 
    item.cost_price ?? 
    item.purchaseRate ?? 
    item.purchase_rate ?? 
    item.buyPrice ?? 
    0;

  const purchasePrice = Number(rawPrice);
  if (isNaN(purchasePrice) || purchasePrice <= 0) return 0;

  // Rule 2: Safe Field Fallbacks for taxInclusive to prevent double charging GST
  const isTaxInclusive = Boolean(
    item.taxInclusive || 
    item.isTaxInclusive || 
    item.is_tax_inclusive || 
    item.tax_inclusive ||
    item.purchasePriceTaxInclusive
  );

  if (isTaxInclusive) {
    return purchasePrice;
  }

  // Safe Field Fallbacks for tax rate
  const rawTaxRate = 
    item.taxRate ?? 
    item.tax_rate ?? 
    item.gstRate ?? 
    item.gst_rate ?? 
    item.gst ?? 
    0;

  const taxRate = Number(rawTaxRate);
  if (isNaN(taxRate) || taxRate <= 0) {
    return purchasePrice;
  }

  return purchasePrice * (1 + taxRate / 100);
}
