/**
 * Interleaved Secret Cost Cipher for Retail Billing (POS)
 * 
 * Generates a disguised cost reference code from an item's net purchase cost (Purchase Rate + GST).
 * 
 * Rules:
 * - Digits of rounded net cost interleaved with safe alphabets.
 * - Confusing characters (O, I, l) omitted to prevent confusion with 0 and 1.
 * - Safe character list: ['A', 'B', 'C', 'D', 'E', 'X', 'Y', 'Z'].
 * - Examples:
 *   - 150  -> "1A5B0"
 *   - 85   -> "8X5"
 *   - 1250 -> "1A2B5C0"
 * 
 * Usage:
 * - Displayed strictly on the operator's POS screen (Cart table row) as "Ref: [Code]".
 * - Completely omitted and hidden from customer prints, PDFs, estimates, and WhatsApp.
 */

const SAFE_CIPHER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'X', 'Y', 'Z'];

export function generateInterleavedCostCode(cost: number | undefined | null): string {
  if (cost === undefined || cost === null || isNaN(cost) || cost <= 0) {
    return '';
  }

  // Round to integer for clean shopkeeper mental cipher
  const rounded = Math.round(cost);
  const digits = String(rounded);

  if (digits.length === 0) return '';
  if (digits.length === 1) return `X${digits}`;

  // For 2 digits, user specified example: 85 -> "8X5"
  if (digits.length === 2) {
    return `${digits[0]}X${digits[1]}`;
  }

  // For 3+ digits, user specified example: 150 -> "1A5B0", 1250 -> "1A2B5C0"
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    result += digits[i];
    if (i < digits.length - 1) {
      result += SAFE_CIPHER_LETTERS[i % SAFE_CIPHER_LETTERS.length];
    }
  }

  return result;
}

/**
 * Calculates the net landed purchase cost (Purchase Rate + GST) for an item
 */
export function calculateItemNetPurchaseCost(item?: {
  purchasePrice?: number;
  taxRate?: number;
  taxInclusive?: boolean;
} | null): number {
  if (!item) return 0;
  const purchasePrice = Number(item.purchasePrice) || 0;
  if (purchasePrice <= 0) return 0;

  if (item.taxInclusive) {
    return purchasePrice;
  }

  const taxRate = Number(item.taxRate) || 0;
  return purchasePrice * (1 + taxRate / 100);
}
