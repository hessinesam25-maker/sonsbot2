import { MenuItem } from '../db/types';

export interface ParsedMenuItem {
  tempId: string;
  name: string;
  category: string;
  price: number;
  description: string;
  ingredients: string[];
  approved_allergens: string[];
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_available: boolean;
  selected: boolean;
  isDuplicate?: boolean;
  duplicateOfId?: string;
  duplicateAction?: 'skip' | 'update' | 'import_new';
  confidenceWarning?: string;
}

export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses numeric price from currency strings safely (e.g. "€12,50", "12.50 eur", "$4.00")
 */
export function parsePrice(raw: string | number): number {
  if (typeof raw === 'number') {
    return isNaN(raw) ? 0 : Number(raw.toFixed(2));
  }
  if (!raw || typeof raw !== 'string') return 0;

  // Replace decimal comma with dot (e.g. 12,50 -> 12.50)
  const cleaned = raw
    .replace(/[^0-9.,]/g, '')
    .replace(',', '.');

  // Handle multiple dots if present
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    const combined = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
    const val = parseFloat(combined);
    return isNaN(val) ? 0 : Number(val.toFixed(2));
  }

  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : Number(val.toFixed(2));
}

/**
 * Parses CSV content with flexible header mapping
 */
export function parseCsvMenu(csvContent: string): ParsedMenuItem[] {
  if (!csvContent || typeof csvContent !== 'string') return [];

  const lines = csvContent
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) return [];

  // Determine delimiter (comma or semicolon)
  const firstLine = lines[0];
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';

  // Parse header row
  const headerCells = firstLine.split(delimiter).map(h => normalizeText(h.replace(/^"|"$/g, '')));

  let nameIdx = -1;
  let catIdx = -1;
  let descIdx = -1;
  let priceIdx = -1;
  let algIdx = -1;
  let ingIdx = -1;
  let vegIdx = -1;
  let veganIdx = -1;

  headerCells.forEach((h, idx) => {
    if (h.includes('name') || h.includes('item') || h.includes('product') || h.includes('title') || h.includes('اسم') || h.includes('صنف') || h.includes('وجبة')) {
      if (nameIdx === -1) nameIdx = idx;
    } else if (h.includes('category') || h.includes('type') || h.includes('section') || h.includes('قسم') || h.includes('فئة') || h.includes('تصنيف')) {
      if (catIdx === -1) catIdx = idx;
    } else if (h.includes('desc') || h.includes('detail') || h.includes('summary') || h.includes('وصف') || h.includes('تفاصيل')) {
      if (descIdx === -1) descIdx = idx;
    } else if (h.includes('price') || h.includes('cost') || h.includes('rate') || h.includes('amount') || h.includes('سعر') || h.includes('مبلغ') || h.includes('تكلفة')) {
      if (priceIdx === -1) priceIdx = idx;
    } else if (h.includes('aller') || h.includes('حساسية')) {
      if (algIdx === -1) algIdx = idx;
    } else if (h.includes('ingred') || h.includes('مكونات')) {
      if (ingIdx === -1) ingIdx = idx;
    } else if (h.includes('vegetarian') || h.includes('veggie') || h.includes('نباتي')) {
      if (vegIdx === -1) vegIdx = idx;
    } else if (h.includes('vegan') || h.includes('محض')) {
      if (veganIdx === -1) veganIdx = idx;
    }
  });

  // If header row exists, start data loop from index 1; else treat line 0 as data
  const hasHeader = nameIdx !== -1 || priceIdx !== -1 || catIdx !== -1;
  const startRowIndex = hasHeader ? 1 : 0;

  // Fallback positional indices if headers missing
  if (!hasHeader) {
    nameIdx = 0;
    priceIdx = 1;
    catIdx = 2;
    descIdx = 3;
  }

  const result: ParsedMenuItem[] = [];

  for (let i = startRowIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    // Split respecting quotes
    const cells = rawLine.split(new RegExp(`${delimiter}(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)`))
      .map(c => c.trim().replace(/^"|"$/g, ''));

    const rawName = nameIdx !== -1 && cells[nameIdx] ? cells[nameIdx] : '';
    if (!rawName) continue;

    const rawPrice = priceIdx !== -1 && cells[priceIdx] ? cells[priceIdx] : '0';
    const parsedPrice = parsePrice(rawPrice);

    const category = catIdx !== -1 && cells[catIdx] ? cells[catIdx] : 'General';
    const description = descIdx !== -1 && cells[descIdx] ? cells[descIdx] : '';

    const allergensRaw = algIdx !== -1 && cells[algIdx] ? cells[algIdx] : '';
    const allergens = allergensRaw ? allergensRaw.split(/[,|]/).map(s => s.trim()).filter(Boolean) : [];

    const ingredientsRaw = ingIdx !== -1 && cells[ingIdx] ? cells[ingIdx] : '';
    const ingredients = ingredientsRaw ? ingredientsRaw.split(/[,|]/).map(s => s.trim()).filter(Boolean) : [];

    const vegVal = vegIdx !== -1 && cells[vegIdx] ? cells[vegIdx].toLowerCase() : '';
    const isVegetarian = vegVal === 'true' || vegVal === 'yes' || vegVal === '1' || vegVal.includes('نباتي');

    const veganVal = veganIdx !== -1 && cells[veganIdx] ? cells[veganIdx].toLowerCase() : '';
    const isVegan = veganVal === 'true' || veganVal === 'yes' || veganVal === '1' || veganVal.includes('نباتي');

    result.push({
      tempId: `tmp_${Date.now()}_${i}`,
      name: rawName,
      category,
      price: parsedPrice,
      description,
      ingredients,
      approved_allergens: allergens,
      is_vegetarian: isVegetarian,
      is_vegan: isVegan,
      is_available: true,
      selected: true,
    });
  }

  return result;
}

/**
 * Extracts structured menu items from raw OCR or PDF text output
 */
export function parseTextMenu(rawText: string): ParsedMenuItem[] {
  if (!rawText || typeof rawText !== 'string') return [];

  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const result: ParsedMenuItem[] = [];
  let currentCategory = 'General';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Clean OCR artifacts: strip trailing =, —, -, ~ and replace leader dots/dashes
    line = line
      .replace(/[=\-—~]+$/g, '')
      .replace(/[\.\-_=\s]{3,}/g, ' ')
      .trim();

    if (!line) continue;

    // Detect Category Headings (e.g. "DRINKS:", "COFFEE & TEA", "COFFEE AND DESSERTS")
    const cleanCategory = line.replace(/[:=—\-]+$/, '').trim();
    if (
      (line.endsWith(':') || cleanCategory === cleanCategory.toUpperCase()) &&
      cleanCategory.length < 40 &&
      !cleanCategory.match(/\d+[,.]?\d*/) &&
      !cleanCategory.includes('PT)')
    ) {
      currentCategory = cleanCategory;
      continue;
    }

    // Match lines containing an item name and a numeric price (e.g. "Espresso 2.50" or "Cappuccino 3,80")
    const priceMatch = line.match(/(.+?)\s+[\$€£]?\s*(\d+[.,]\d{1,2})\s*[\$€£\s=—\-]*$/) ||
                       line.match(/^[\$€£]?\s*(\d+[.,]\d{1,2})\s+(.+)$/);

    if (priceMatch) {
      let name = '';
      let priceStr = '';

      if (line.match(/^[\$€£]?\s*(\d+[.,]\d{1,2})/)) {
        priceStr = priceMatch[1];
        name = priceMatch[2];
      } else {
        name = priceMatch[1];
        priceStr = priceMatch[2];
      }

      name = name.replace(/^[\.\-\*\=\—\s]+|[\.\-\*\=\—\s]+$/g, '').trim();
      if (!name || name.length < 2 || name.startsWith('(')) continue;

      const price = parsePrice(priceStr);
      const isVeg = name.toLowerCase().includes('veg') || name.toLowerCase().includes('veggie') || name.includes('نباتي');
      const isVegan = name.toLowerCase().includes('vegan');

      result.push({
        tempId: `tmp_txt_${Date.now()}_${i}`,
        name,
        category: currentCategory,
        price,
        description: '',
        ingredients: [],
        approved_allergens: [],
        is_vegetarian: isVeg,
        is_vegan: isVegan,
        is_available: true,
        selected: true,
      });
    }
  }

  return result;
}

/**
 * Duplicate Detection Engine: Compares extracted menu items with current tenant database menu
 */
export function detectDuplicates(
  parsedItems: ParsedMenuItem[],
  existingMenu: MenuItem[]
): ParsedMenuItem[] {
  const normExistingMap = new Map<string, MenuItem>();

  for (const ex of existingMenu) {
    const key = `${normalizeText(ex.name)}|${normalizeText(ex.category || '')}`;
    const nameKeyOnly = normalizeText(ex.name);
    normExistingMap.set(key, ex);
    normExistingMap.set(nameKeyOnly, ex);
  }

  return parsedItems.map(item => {
    const itemKey = `${normalizeText(item.name)}|${normalizeText(item.category || '')}`;
    const nameKeyOnly = normalizeText(item.name);

    const match = normExistingMap.get(itemKey) || normExistingMap.get(nameKeyOnly);

    if (match) {
      return {
        ...item,
        isDuplicate: true,
        duplicateOfId: match.id,
        duplicateAction: 'skip', // Default safe action: Skip duplicate
      };
    }

    return {
      ...item,
      isDuplicate: false,
      duplicateAction: 'import_new',
    };
  });
}
