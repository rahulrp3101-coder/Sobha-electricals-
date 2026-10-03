/**
 * Smart Fuzzy Item Matching & Aliases Engine
 * Designed for Indian retail, wholesale, electrical, pharmacy, FMCG, and hardware invoices.
 * Supports token matching, unit/spec extraction, HSN correlation, and learned vendor aliases.
 */

import { Item } from '../types';

/**
 * Normalizes text for clean token and character comparison
 */
export function normalizeItemText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // replace punctuation with spaces
    .replace(/\b(\d+)\s*(w|watt|watts)\b/gi, '$1w')
    .replace(/\b(\d+)\s*(v|volt|volts)\b/gi, '$1v')
    .replace(/\b(\d+)\s*(kg|kilo|kilogram)\b/gi, '$1kg')
    .replace(/\b(\d+)\s*(gm|g|gram|grams)\b/gi, '$1g')
    .replace(/\b(\d+)\s*(ml|millilitre|milliliter)\b/gi, '$1ml')
    .replace(/\b(\d+)\s*(l|ltr|litre|liter)\b/gi, '$1l')
    .replace(/\b(\d+)\s*(mm|millimeter)\b/gi, '$1mm')
    .replace(/\b(\d+)\s*(in|inch|inches)\b/gi, '$1in')
    .replace(/\b(pkt|pkts|packet|packets)\b/gi, 'pack')
    .replace(/\b(nos|no|pcs|pieces|piece)\b/gi, 'pcs')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts key specifications (e.g. 9w, 12v, 500ml, 1kg)
 */
export function extractSpecs(text: string): Set<string> {
  const normalized = normalizeItemText(text);
  const specs = new Set<string>();
  const matches = normalized.match(/\b\d+(?:w|v|kg|g|ml|l|mm|in)\b/g);
  if (matches) {
    matches.forEach(m => specs.add(m));
  }
  return specs;
}

/**
 * Tokenize string into meaningful words (excluding short filler words)
 */
export function tokenize(text: string): string[] {
  const norm = normalizeItemText(text);
  if (!norm) return [];
  const stopWords = new Set(['and', 'or', 'with', 'the', 'for', 'of', 'in', 'at']);
  return norm
    .split(' ')
    .filter(word => word.length > 1 && !stopWords.has(word));
}

/**
 * Dice Coefficient (Bigram similarity)
 */
export function diceCoefficient(a: string, b: string): number {
  const strA = normalizeItemText(a);
  const strB = normalizeItemText(b);
  if (strA === strB) return 1.0;
  if (strA.length < 2 || strB.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < strA.length - 1; i++) {
    const bigram = strA.substring(i, i + 2);
    bigramsA.set(bigram, (bigramsA.get(bigram) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < strB.length - 1; i++) {
    const bigram = strB.substring(i, i + 2);
    const count = bigramsA.get(bigram) || 0;
    if (count > 0) {
      bigramsA.set(bigram, count - 1);
      intersection++;
    }
  }

  const total = (strA.length - 1) + (strB.length - 1);
  return total > 0 ? (2 * intersection) / total : 0;
}

export type MatchType = 'EXACT_NAME' | 'EXACT_ALIAS' | 'HIGH_FUZZY' | 'MODERATE_FUZZY' | 'LOW';

export interface ItemMatchResult {
  item: Item;
  score: number; // 0.0 to 1.0
  matchType: MatchType;
  matchedOn: string; // The exact string matched (either item.name or an alias)
}

/**
 * Calculates match score between a scanned bill item name and an inventory item.
 */
export function calculateItemMatchScore(
  scannedName: string,
  inventoryItem: Item,
  billHsn?: string
): ItemMatchResult {
  const cleanScanned = normalizeItemText(scannedName);
  const cleanItemName = normalizeItemText(inventoryItem.name);

  // 1. Exact match with item name
  if (cleanScanned === cleanItemName) {
    return {
      item: inventoryItem,
      score: 1.0,
      matchType: 'EXACT_NAME',
      matchedOn: inventoryItem.name,
    };
  }

  // 2. Exact match with any learned alias
  if (inventoryItem.aliases && Array.isArray(inventoryItem.aliases)) {
    for (const alias of inventoryItem.aliases) {
      if (normalizeItemText(alias) === cleanScanned) {
        return {
          item: inventoryItem,
          score: 1.0,
          matchType: 'EXACT_ALIAS',
          matchedOn: alias,
        };
      }
    }
  }

  // 3. Check fuzzy match against item name and all aliases
  const targetsToCompare = [
    inventoryItem.name,
    ...(inventoryItem.aliases || []),
  ];

  let bestScore = 0;
  let bestMatchedTarget = inventoryItem.name;

  const scannedTokens = tokenize(scannedName);
  const scannedSpecs = extractSpecs(scannedName);

  for (const target of targetsToCompare) {
    const targetTokens = tokenize(target);
    const targetSpecs = extractSpecs(target);

    // Compute token overlap (Jaccard)
    const scannedSet = new Set(scannedTokens);
    const targetSet = new Set(targetTokens);

    let matchCount = 0;
    for (const token of scannedTokens) {
      if (targetSet.has(token)) {
        matchCount++;
      }
    }

    const unionSize = new Set([...scannedTokens, ...targetTokens]).size;
    const tokenScore = unionSize > 0 ? matchCount / unionSize : 0;

    // Character similarity (Dice)
    const diceScore = diceCoefficient(scannedName, target);

    // Combine token score (70%) and dice score (30%)
    let combined = (tokenScore * 0.7) + (diceScore * 0.3);

    // Specs matching bonus / penalty
    // e.g. If both have specs and they match (e.g. 9w === 9w), give strong bonus
    if (scannedSpecs.size > 0 && targetSpecs.size > 0) {
      let specMatches = 0;
      for (const spec of scannedSpecs) {
        if (targetSpecs.has(spec)) specMatches++;
      }
      if (specMatches > 0) {
        combined += 0.15;
      } else {
        // Conflicting specs (e.g. 9w vs 12w) -> penalty
        combined -= 0.25;
      }
    }

    // Substring containment bonus
    const cleanTarget = normalizeItemText(target);
    if (cleanScanned.includes(cleanTarget) || cleanTarget.includes(cleanScanned)) {
      combined += 0.10;
    }

    // HSN code match bonus
    if (billHsn && inventoryItem.hsn) {
      const hsnA = billHsn.trim().replace(/\D/g, '');
      const hsnB = inventoryItem.hsn.trim().replace(/\D/g, '');
      if (hsnA && hsnB && (hsnA.startsWith(hsnB) || hsnB.startsWith(hsnA))) {
        combined += 0.10;
      }
    }

    const finalScore = Math.min(1.0, Math.max(0.0, combined));
    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestMatchedTarget = target;
    }
  }

  let matchType: MatchType = 'LOW';
  if (bestScore >= 0.75) {
    matchType = 'HIGH_FUZZY';
  } else if (bestScore >= 0.45) {
    matchType = 'MODERATE_FUZZY';
  }

  return {
    item: inventoryItem,
    score: Number(bestScore.toFixed(3)),
    matchType,
    matchedOn: bestMatchedTarget,
  };
}

/**
 * Finds top matching inventory items for a scanned bill item name.
 * Returns best match and candidate list.
 */
export function findBestItemMatches(
  scannedName: string,
  inventoryItems: Item[],
  billHsn?: string,
  limit: number = 4
): {
  bestMatch: ItemMatchResult | null;
  candidates: ItemMatchResult[];
} {
  if (!scannedName.trim() || inventoryItems.length === 0) {
    return { bestMatch: null, candidates: [] };
  }

  const results: ItemMatchResult[] = inventoryItems.map(item =>
    calculateItemMatchScore(scannedName, item, billHsn)
  );

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  const topCandidates = results.slice(0, limit);
  const bestMatch = topCandidates.length > 0 && topCandidates[0].score >= 0.35
    ? topCandidates[0]
    : null;

  return {
    bestMatch,
    candidates: topCandidates.filter(c => c.score >= 0.25),
  };
}
