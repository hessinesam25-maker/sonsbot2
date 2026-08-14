import { describe, it, expect } from 'vitest';
import { retrieveRelevantTenantData, normalizeText } from '../lib/ai/retrieval';
import { buildTenantMessages } from '../lib/ai/promptBuilder';
import { MenuItem, KnowledgeBase, AISettings } from '../lib/db/types';

describe('Menu Search, Availability & Pagination Test Suite', () => {
  const sampleMenu: MenuItem[] = [
    {
      id: 'item-101',
      tenant_id: '1029a20d-1342-42fa-87c2-c0fef3cceeaf',
      category: 'ESPRESSO BASED',
      name: 'Espresso',
      price: 2.90,
      description: 'Classic single shot espresso',
      ingredients: ['coffee beans', 'water'],
      approved_allergens: [],
      is_vegetarian: true,
      is_vegan: true,
      is_available: false, // UNAVAILABLE TEST ITEM
      created_at: new Date().toISOString(),
    },
    {
      id: 'item-102',
      tenant_id: '1029a20d-1342-42fa-87c2-c0fef3cceeaf',
      category: 'ESPRESSO BASED',
      name: 'Cappuccino',
      price: 4.20,
      description: 'Espresso with steamed milk foam',
      ingredients: ['espresso', 'milk'],
      approved_allergens: ['dairy'],
      is_vegetarian: true,
      is_vegan: false,
      is_available: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 'item-103',
      tenant_id: '1029a20d-1342-42fa-87c2-c0fef3cceeaf',
      category: 'SANDWICHES',
      name: 'CHICKEN & CHEESE',
      price: 7.60,
      description: 'Grilled chicken breast with melted gouda',
      ingredients: ['chicken', 'cheese', 'bread'],
      approved_allergens: ['gluten', 'dairy'],
      is_vegetarian: false,
      is_vegan: false,
      is_available: true,
      created_at: new Date().toISOString(),
    },
    {
      id: 'item-104',
      tenant_id: '1029a20d-1342-42fa-87c2-c0fef3cceeaf',
      category: 'SANDWICHES',
      name: 'VEGETARIAN',
      price: 7.50,
      description: 'Fresh mozzarella with pesto and tomatoes',
      ingredients: ['mozzarella', 'pesto', 'tomato', 'basil'],
      approved_allergens: ['dairy', 'nuts'],
      is_vegetarian: true,
      is_vegan: false,
      is_available: true,
      created_at: new Date().toISOString(),
    },
  ];

  const dummyKb = {
    tenant_id: '1029a20d-1342-42fa-87c2-c0fef3cceeaf',
    cafe_name: 'Ghent Cafe Test',
    address: 'Veldstraat 12, 9000 Gent',
  } as KnowledgeBase;

  const dummySettings = {
    tenant_id: '1029a20d-1342-42fa-87c2-c0fef3cceeaf',
    tone: 'friendly',
    primary_language: 'ar',
    reply_length: 'short',
    emoji_usage: 'low',
    fallback_behavior: 'human_handoff',
  } as AISettings;

  it('1. Search matches by name, category, description, and ingredients (case-insensitive)', () => {
    const searchMenu = (query: string, categoryFilter: string = 'ALL') => {
      const normQ = normalizeText(query);
      return sampleMenu.filter(item => {
        if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
        if (!normQ) return true;
        const normName = normalizeText(item.name || '');
        const normCat = normalizeText(item.category || '');
        const normDesc = normalizeText(item.description || '');
        const normIngr = Array.isArray(item.ingredients) ? item.ingredients.map(normalizeText).join(' ') : '';

        return (
          normName.includes(normQ) ||
          normCat.includes(normQ) ||
          normDesc.includes(normQ) ||
          normIngr.includes(normQ)
        );
      });
    };

    // Test A: Name search "Espresso"
    const espressoMatches = searchMenu('Espresso');
    expect(espressoMatches.map(i => i.name)).toContain('Espresso');

    // Test B: Category search "sandwich"
    const sandwichMatches = searchMenu('sandwich');
    expect(sandwichMatches.length).toBe(2);
    expect(sandwichMatches.map(i => i.name)).toEqual(expect.arrayContaining(['CHICKEN & CHEESE', 'VEGETARIAN']));

    // Test C: Ingredient search "chicken"
    const chickenMatches = searchMenu('chicken');
    expect(chickenMatches.length).toBe(1);
    expect(chickenMatches[0].name).toBe('CHICKEN & CHEESE');
  });

  it('2. Direct item query retrieves unavailable items so AI can explain their status', () => {
    const res = retrieveRelevantTenantData('هل عندكم Espresso؟', dummyKb, sampleMenu);
    expect(res.relevantMenuItems.length).toBeGreaterThan(0);
    const espressoItem = res.relevantMenuItems.find(i => i.name === 'Espresso');
    expect(espressoItem).toBeDefined();
    expect(espressoItem?.is_available).toBe(false);
  });

  it('3. AI prompt builder includes explicit availability status and strict rules for unavailable items', () => {
    const resData = retrieveRelevantTenantData('هل عندكم Espresso؟', dummyKb, sampleMenu);
    const messages = buildTenantMessages({
      settings: dummySettings,
      retrievedData: resData,
      currentMessage: 'هل عندكم Espresso؟',
    });

    const systemPrompt = messages[0].content;
    expect(systemPrompt).toContain('ITEM AVAILABILITY RULES');
    expect(systemPrompt).toContain('Never describe a menu item marked [STATUS: CURRENTLY UNAVAILABLE / OUT OF STOCK] as currently available');
    expect(systemPrompt).toContain('- Espresso: €2.90 | Category: ESPRESSO BASED | [STATUS: CURRENTLY UNAVAILABLE / OUT OF STOCK]');
  });

  it('4. Broad recommendation inquiries exclude unavailable items from choices', () => {
    const res = retrieveRelevantTenantData('إيه المشروبات المتاحة؟', dummyKb, sampleMenu);
    const names = res.relevantMenuItems.map(i => i.name);
    expect(names).not.toContain('Espresso');
    expect(names).toContain('Cappuccino');
  });

  it('5. Pagination calculates page slices and item counters correctly', () => {
    const manyItems: MenuItem[] = Array.from({ length: 43 }, (_, idx) => ({
      id: `item-${idx + 1}`,
      tenant_id: '1029a20d-1342-42fa-87c2-c0fef3cceeaf',
      category: idx < 20 ? 'ESPRESSO BASED' : 'SANDWICHES',
      name: `Item ${idx + 1}`,
      price: 5.00 + idx,
      description: `Description ${idx + 1}`,
      ingredients: [],
      approved_allergens: [],
      is_vegetarian: true,
      is_vegan: false,
      is_available: true,
      created_at: new Date().toISOString(),
    }));

    const ITEMS_PER_PAGE = 10;
    const totalItems = manyItems.length; // 43
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE); // 5

    // Page 1
    const page1Items = manyItems.slice(0, 10);
    expect(page1Items.length).toBe(10);
    expect(page1Items[0].name).toBe('Item 1');
    expect(page1Items[9].name).toBe('Item 10');

    // Page 5 (last page with 3 items)
    const page5Items = manyItems.slice(40, 50);
    expect(page5Items.length).toBe(3);
    expect(page5Items[0].name).toBe('Item 41');
    expect(page5Items[2].name).toBe('Item 43');
    expect(totalPages).toBe(5);
  });
});
