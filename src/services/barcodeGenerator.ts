/**
 * Generates a valid GS1 India compliant 13-digit EAN barcode (prefix 890)
 * with a mathematically correct modulo-10 checksum digit.
 */
export function generateEAN13Barcode(): string {
  // GS1 India prefix: 890
  let code = '890';
  
  // 9 random digits
  for (let i = 0; i < 9; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }

  // Calculate EAN-13 check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(code[i], 10);
    // 1-indexed: odd positions * 1, even positions * 3
    sum += (i % 2 === 0) ? digit * 1 : digit * 3;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return code + checkDigit.toString();
}

/**
 * Generates a clean internal SKU code (e.g. SKU-849201)
 */
export function generateRandomSKU(prefix: string = 'SKU'): string {
  return `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
}
