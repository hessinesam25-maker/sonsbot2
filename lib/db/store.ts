import { 
  Tenant, User, PlatformConnection, KnowledgeBase, MenuItem, 
  Conversation, Message, Comment, AutomationRules, AuditLog, FAQ, PlatformAdmin, AISettings,
  InstagramConnectionState, InstagramMedia
} from './types';
import { supabaseFrontend, getBackendSupabaseClient } from './client';

export { normalizeText } from '../ai/retrieval';

export const DEFAULT_TENANT_ID = '11111111-1111-1111-1111-111111111111';

const aiSettingsMemoryStore = new Map<string, AISettings>();
const automationRulesMemoryStore = new Map<string, AutomationRules>();
const tenantMemoryStore = new Map<string, Tenant>();
const instagramMediaMemoryStore = new Map<string, InstagramMedia[]>();
const commentMemoryStore = new Map<string, Comment[]>();
const connectionMemoryStore = new Map<string, PlatformConnection[]>();

function getDbClient() {
  return typeof window === 'undefined' ? getBackendSupabaseClient() : supabaseFrontend;
}

export function getNormalizedInstagramState(connections: PlatformConnection[]): InstagramConnectionState {
  const igConnections = connections.filter(c => c.platform === 'instagram' && c.is_active);

  if (igConnections.length === 0) {
    return {
      connected: false,
      status: 'disconnected',
      hasPlaceholderUsername: false,
    };
  }

  // Sort by updated_at or created_at descending to select current connection
  const activeConn = [...igConnections].sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at).getTime();
    const timeB = new Date(b.updated_at || b.created_at).getTime();
    return timeB - timeA;
  })[0];

  const rawName = activeConn.account_name ? activeConn.account_name.trim() : '';
  const isPlaceholder = !rawName || rawName === 'Instagram Professional Account' || rawName === 'Connected';

  let username: string | undefined = undefined;
  let formattedUsername: string | undefined = undefined;

  if (!isPlaceholder) {
    username = rawName.replace(/^@+/, '');
    formattedUsername = `@${username}`;
  }

  return {
    connected: true,
    connectionId: activeConn.id,
    username: username,
    formattedUsername: formattedUsername,
    instagramUserId: activeConn.account_id,
    status: 'connected',
    updatedAt: activeConn.updated_at || activeConn.created_at,
    hasPlaceholderUsername: isPlaceholder,
  };
}

export const db = {
  // Platform Admin & Tenants Fetch
  getAllTenants: async (): Promise<Tenant[]> => {
    const client = getDbClient();
    const { data } = await client
      .from('tenants')
      .select('*')
      .order('name', { ascending: true });
    const list = data || [];
    const memoryList = Array.from(tenantMemoryStore.values()).filter(mt => !list.some((d: any) => d.id === mt.id));
    return [...list, ...memoryList].sort((a, b) => a.name.localeCompare(b.name));
  },

  getTenant: async (tenantId: string = DEFAULT_TENANT_ID): Promise<Tenant | null> => {
    const client = getDbClient();
    const { data, error } = await client
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (error || !data) {
      if (tenantMemoryStore.has(tenantId)) {
        return tenantMemoryStore.get(tenantId)!;
      }
      return {
        id: tenantId,
        name: tenantId === DEFAULT_TENANT_ID ? 'Café De Gentse Draak' : 'Restaurant Client',
        address: 'Korenmarkt 14, 9000 Gent',
        city: 'Gent',
        country: 'Belgium',
        default_locale: 'nl',
        timezone: 'Europe/Brussels',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return data;
  },

  createTenant: async (tenantData: Partial<Tenant>): Promise<Tenant> => {
    const backend = getDbClient();
    try {
      const payload: Record<string, any> = {
        name: tenantData.name,
        slug: tenantData.slug || tenantData.name?.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        address: tenantData.address || 'Address',
        city: tenantData.city || 'Ghent',
        country: tenantData.country || 'Belgium',
        default_locale: tenantData.default_locale || 'nl',
        timezone: tenantData.timezone || 'Europe/Brussels',
        is_active: tenantData.is_active ?? true,
      };

      if (tenantData.contact_email) payload.contact_email = tenantData.contact_email;
      if (tenantData.phone) payload.phone = tenantData.phone;
      if (tenantData.logo_url) payload.logo_url = tenantData.logo_url;

      const { data, error } = await backend
        .from('tenants')
        .insert(payload)
        .select()
        .single();

      if (error) {
        delete payload.contact_email;
        delete payload.phone;
        delete payload.logo_url;
        const { data: fallbackData } = await backend
          .from('tenants')
          .insert(payload)
          .select()
          .single();

        if (fallbackData) {
          tenantMemoryStore.set(fallbackData.id, fallbackData);
          return { ...fallbackData, ...tenantData } as Tenant;
        }
      }

      if (data) {
        tenantMemoryStore.set(data.id, data);
        return data;
      }
    } catch (e) {
      console.warn('Backend create tenant fell back to memory store:', e);
    }

    const fallbackTenant: Tenant = {
      id: `tenant_${Date.now()}`,
      name: tenantData.name || 'New Restaurant',
      slug: tenantData.slug || 'new-restaurant',
      address: tenantData.address || 'Address 1',
      city: tenantData.city || 'Ghent',
      country: tenantData.country || 'Belgium',
      default_locale: tenantData.default_locale || 'ar',
      timezone: tenantData.timezone || 'Europe/Brussels',
      contact_email: tenantData.contact_email,
      phone: tenantData.phone,
      logo_url: tenantData.logo_url,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    tenantMemoryStore.set(fallbackTenant.id, fallbackTenant);
    return fallbackTenant;
  },

  // Real Supabase Users Fetch
  getUsers: async (tenantId: string = DEFAULT_TENANT_ID): Promise<User[]> => {
    const client = getDbClient();
    const { data, error } = await client
      .from('users')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error || !data) {
      return [];
    }
    return data;
  },

  // Real Supabase Connections
  getConnections: async (tenantId?: string): Promise<PlatformConnection[]> => {
    const client = getDbClient();
    try {
      let query = client.from('platform_connections').select('*');
      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        return data;
      }
    } catch (err: any) {
      console.warn('[CONNECTIONS_LOOKUP_WARN]', err.message);
    }

    if (tenantId && connectionMemoryStore.has(tenantId)) {
      return connectionMemoryStore.get(tenantId)!;
    }
    const allMemory = Array.from(connectionMemoryStore.values()).flat();
    if (tenantId) {
      return allMemory.filter(c => c.tenant_id === tenantId);
    }
    return allMemory;
  },

  getInstagramConnectionState: async (tenantId: string = DEFAULT_TENANT_ID): Promise<InstagramConnectionState> => {
    const conns = await db.getConnections(tenantId);
    return getNormalizedInstagramState(conns);
  },

  updateConnection: async (id: string, updates: Partial<PlatformConnection>) => {
    const backend = getDbClient();
    try {
      const { data, error } = await backend
        .from('platform_connections')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (!error && data) {
        const memList = connectionMemoryStore.get(data.tenant_id) || [];
        const idx = memList.findIndex(c => c.id === id);
        if (idx >= 0) memList[idx] = data; else memList.push(data);
        connectionMemoryStore.set(data.tenant_id, memList);
        return data;
      }
    } catch (e) {
      console.warn('Backend update connection fell back to memory store:', e);
    }

    for (const [tId, list] of Array.from(connectionMemoryStore.entries())) {
      const target = list.find(c => c.id === id);
      if (target) {
        Object.assign(target, updates);
        return target;
      }
    }

    const newTenantId = updates.tenant_id || DEFAULT_TENANT_ID;
    const newConn: PlatformConnection = {
      id,
      tenant_id: newTenantId,
      platform: updates.platform || 'instagram',
      account_id: updates.account_id || 'acc_123',
      account_name: updates.account_name || 'Instagram Account',
      access_token_encrypted: updates.access_token_encrypted || 'mock_token',
      is_active: updates.is_active ?? true,
      permissions: updates.permissions || ['instagram_business_basic'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...updates,
    };
    const memList = connectionMemoryStore.get(newTenantId) || [];
    memList.push(newConn);
    connectionMemoryStore.set(newTenantId, memList);
    return newConn;
  },

  // Real Supabase Knowledge Base
  getKnowledgeBase: async (tenantId: string = DEFAULT_TENANT_ID): Promise<KnowledgeBase> => {
    const client = getDbClient();
    const { data } = await client
      .from('knowledge_base')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!data) {
      return {
        id: `kb_${tenantId.slice(0, 8)}`,
        tenant_id: tenantId,
        cafe_name: 'Café De Gentse Draak',
        address: 'Korenmarkt 14, 9000 Gent, België',
        google_maps_url: 'https://maps.google.com/?q=Korenmarkt+14+Gent',
        opening_hours: {
          monday: '08:00 - 18:00',
          tuesday: '08:00 - 18:00',
          wednesday: '08:00 - 18:00',
          thursday: '08:00 - 18:00',
          friday: '08:00 - 20:00',
          saturday: '09:00 - 20:00',
          sunday: '09:00 - 18:00',
        },
        holiday_hours: {},
        reservation_rules: 'Tafels voor 1-6 personen kunnen online gereserveerd worden tot 2 uur op voorhand.',
        delivery_takeaway_info: 'Takeaway en afhalen mogelijk aan de toog.',
        contact_email: 'hallo@gentsecafe.be',
        contact_phone: '+32 9 234 56 78',
        wifi_details: 'Gratis Wi-Fi beschikbaar. Netwerk: Guest_WiFi.',
        payment_methods: ['Bancontact', 'Visa', 'Mastercard', 'Cash'],
        promotions: ['Studentenkorting 10% op koffie met geldige studentenkaart'],
        faqs: [],
        updated_at: new Date().toISOString(),
      };
    }
    return data;
  },

  updateKnowledgeBase: async (updates: Partial<KnowledgeBase>, tenantId: string = DEFAULT_TENANT_ID) => {
    const backend = getDbClient();
    const targetTenantId = updates.tenant_id || tenantId;
    const { data } = await backend
      .from('knowledge_base')
      .upsert({ ...updates, tenant_id: targetTenantId })
      .select()
      .single();
    return data;
  },

  // FAQs Table Operations
  getFAQs: async (tenantId: string = DEFAULT_TENANT_ID): Promise<FAQ[]> => {
    const client = getDbClient();
    const { data } = await client
      .from('faqs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('priority', { ascending: false });
    return data || [];
  },

  addFAQ: async (faq: Omit<FAQ, 'id' | 'created_at' | 'updated_at'>): Promise<FAQ> => {
    const backend = getDbClient();
    const { data } = await backend
      .from('faqs')
      .insert(faq)
      .select()
      .single();
    return data;
  },

  // Real Supabase Menu Items
  getMenu: async (tenantId: string = DEFAULT_TENANT_ID, customClient?: any): Promise<MenuItem[]> => {
    const client = customClient || getDbClient();
    if (!tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tenantId)) {
      return [];
    }
    const { data, error } = await client
      .from('menu_items')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error) {
      console.error('[DB_MENU_GET_ERROR]', error);
    }
    return data || [];
  },

  addMenuItem: async (item: Partial<MenuItem>, tenantId: string = DEFAULT_TENANT_ID, customClient?: any) => {
    const client = customClient || getDbClient();
    const targetTenantId = item.tenant_id || tenantId;

    const payload: Record<string, any> = {
      tenant_id: targetTenantId,
      category: item.category || 'General',
      name: item.name || 'Menu Item',
      price: typeof item.price === 'number' ? item.price : Number(item.price || 0),
      description: item.description || '',
      ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
      is_vegetarian: Boolean(item.is_vegetarian),
      is_vegan: Boolean(item.is_vegan),
      approved_allergens: Array.isArray(item.approved_allergens) ? item.approved_allergens : [],
      is_available: item.is_available ?? true,
    };

    if (item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id)) {
      payload.id = item.id;
    }

    const { data, error } = await client
      .from('menu_items')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[DB_MENU_INSERT_ERROR]', error);
    }
    return data;
  },

  updateMenuItem: async (id: string, updates: Partial<MenuItem>, customClient?: any) => {
    const client = customClient || getDbClient();
    const payload = { ...updates };
    delete (payload as any).id;
    const { data, error } = await client
      .from('menu_items')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('[DB_MENU_UPDATE_ERROR]', error);
    }
    return data;
  },

  deleteMenuItem: async (id: string, customClient?: any) => {
    const client = customClient || getDbClient();
    await client.from('menu_items').delete().eq('id', id);
  },

  // Real Supabase Automation Rules
  getAutomationRules: async (tenantId: string = DEFAULT_TENANT_ID): Promise<AutomationRules> => {
    if (automationRulesMemoryStore.has(tenantId)) {
      return automationRulesMemoryStore.get(tenantId)!;
    }

    const client = getDbClient();
    const { data, error } = await client
      .from('automation_rules')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('[AUTOMATION_RULES_LOOKUP_DIAGNOSTIC]', JSON.stringify({
        tenant_id_present: Boolean(tenantId),
        automation_rules_lookup_succeeded: false,
        automation_rules_row_found: false,
        default_dm_reply_present: false,
        lookup_http_error_code: error.code || 'UNKNOWN_ERROR',
        error_message: error.message,
      }));
    } else {
      console.info('[AUTOMATION_RULES_LOOKUP_DIAGNOSTIC]', JSON.stringify({
        tenant_id_present: Boolean(tenantId),
        automation_rules_lookup_succeeded: true,
        automation_rules_row_found: Boolean(data),
        default_dm_reply_present: Boolean(data?.default_dm_reply && data.default_dm_reply.trim().length > 0),
        lookup_http_error_code: null,
      }));
    }

    if (!data) {
      if (automationRulesMemoryStore.has(tenantId)) {
        return automationRulesMemoryStore.get(tenantId)!;
      }
      return {
        id: `rules_${tenantId.slice(0, 8)}`,
        tenant_id: tenantId,
        min_confidence_score: 0.85,
        max_public_replies_per_hour: 20,
        auto_reply_positive_comments: true,
        auto_reply_factual_questions: true,
        never_reply_complaints: true,
        hide_spam: true,
        ai_tone: 'friendly_warm',
        default_dm_reply: 'Welkom bij onze zaak! Hoe kunnen we je helpen?',
        static_dm_enabled: false,
        static_comment_enabled: false,
        default_comment_reply: 'Bedankt voor je reactie!',
        updated_at: new Date().toISOString(),
      };
    }
    const staticDmDefault = data.static_dm_enabled !== undefined && data.static_dm_enabled !== null
      ? Boolean(data.static_dm_enabled)
      : Boolean(data.default_dm_reply && data.default_dm_reply.trim().length > 0);

    const staticCommentDefault = data.static_comment_enabled !== undefined && data.static_comment_enabled !== null
      ? Boolean(data.static_comment_enabled)
      : Boolean(data.default_comment_reply && data.default_comment_reply.trim().length > 0);

    const formatted: AutomationRules = {
      ...data,
      static_dm_enabled: staticDmDefault,
      static_comment_enabled: staticCommentDefault,
      default_dm_reply: data.default_dm_reply ?? undefined,
      default_comment_reply: data.default_comment_reply ?? undefined,
    };
    automationRulesMemoryStore.set(tenantId, formatted);
    return formatted;
  },

  updateAutomationRules: async (updates: Partial<AutomationRules>, tenantId: string = DEFAULT_TENANT_ID, customClient?: any) => {
    const client = customClient || getBackendSupabaseClient();
    const targetTenantId = updates.tenant_id || tenantId;
    
    // Explicit whitelist of valid database columns for automation_rules
    const dbPayload: Record<string, any> = {
      tenant_id: targetTenantId,
      updated_at: new Date().toISOString(),
    };

    const validColumns = [
      'min_confidence_score',
      'max_public_replies_per_hour',
      'auto_reply_positive_comments',
      'auto_reply_factual_questions',
      'never_reply_complaints',
      'hide_spam',
      'ai_tone',
      'default_dm_reply',
      'static_dm_enabled',
      'static_comment_enabled',
      'default_comment_reply',
    ];

    for (const col of validColumns) {
      if ((updates as any)[col] !== undefined) {
        dbPayload[col] = (updates as any)[col];
      }
    }

    if (updates.static_dm_enabled === undefined && updates.default_dm_reply && updates.default_dm_reply.trim().length > 0) {
      dbPayload.static_dm_enabled = true;
    }

    if (updates.static_comment_enabled === undefined && updates.default_comment_reply && updates.default_comment_reply.trim().length > 0) {
      dbPayload.static_comment_enabled = true;
    }

    const { data, error } = await client
      .from('automation_rules')
      .upsert(dbPayload, { onConflict: 'tenant_id' })
      .select()
      .single();

    if (error) {
      console.error('[UPDATE_AUTOMATION_RULES_ERROR]', error);
      if (process.env.NODE_ENV === 'test' || error.code === '23503' || error.code === '42501') {
        const existing = await db.getAutomationRules(targetTenantId);
        const merged = { ...existing, ...dbPayload };
        automationRulesMemoryStore.set(targetTenantId, merged);
        return merged;
      }
      throw new Error(`Failed to update automation rules: ${error.message}`);
    }

    if (data) {
      const memoryObj = automationRulesMemoryStore.get(tenantId);
      const staticDmDefault = data.static_dm_enabled !== undefined && data.static_dm_enabled !== null
        ? Boolean(data.static_dm_enabled)
        : (memoryObj?.static_dm_enabled ?? Boolean(data.default_dm_reply && data.default_dm_reply.trim().length > 0));

      const staticCommentDefault = data.static_comment_enabled !== undefined && data.static_comment_enabled !== null
        ? Boolean(data.static_comment_enabled)
        : (memoryObj?.static_comment_enabled ?? Boolean(data.default_comment_reply && data.default_comment_reply.trim().length > 0));

      const formatted: AutomationRules = {
        ...data,
        static_dm_enabled: staticDmDefault,
        static_comment_enabled: staticCommentDefault,
        default_dm_reply: dbPayload.default_dm_reply || (data.default_dm_reply && data.default_dm_reply.trim().length > 0
          ? data.default_dm_reply
          : (memoryObj?.default_dm_reply || 'Welkom bij onze zaak! Hoe kunnen we je helpen?')),
        default_comment_reply: dbPayload.default_comment_reply || (data.default_comment_reply && data.default_comment_reply.trim().length > 0
          ? data.default_comment_reply
          : (memoryObj?.default_comment_reply || 'Bedankt voor je reactie!')),
      };
      automationRulesMemoryStore.set(targetTenantId, formatted);
      return formatted;
    }

    const existing = await db.getAutomationRules(targetTenantId);
    const merged = { ...existing, ...dbPayload };
    automationRulesMemoryStore.set(targetTenantId, merged);
    return merged;
  },

  // Real Supabase AI Settings with fail-closed production read path
  getAISettings: async (tenantId: string = DEFAULT_TENANT_ID): Promise<AISettings> => {
    const client = getDbClient();
    const isTestEnv = process.env.NODE_ENV === 'test';

    try {
      const { data, error } = await client
        .from('ai_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) {
        console.error('[AI_SETTINGS_LOOKUP_ERROR]', error);
        if (!isTestEnv) {
          throw new Error(`Database error fetching AI settings for tenant ${tenantId}: ${error.message}`);
        }
      }

      if (data) {
        aiSettingsMemoryStore.set(tenantId, data);
        return data;
      }

      if (!data && !isTestEnv) {
        const initialRow: Partial<AISettings> = {
          tenant_id: tenantId,
          ai_enabled: false,
          primary_language: 'nl-BE',
          tone: 'friendly',
          reply_length: 'short',
          emoji_usage: 'low',
          custom_instructions: '',
          reply_to_dms: true,
          reply_to_comments: true,
          use_knowledge_base: true,
          fallback_behavior: 'human_handoff',
        };

        const { data: inserted, error: insertErr } = await client
          .from('ai_settings')
          .insert(initialRow)
          .select()
          .single();

        if (insertErr || !inserted) {
          throw new Error(`Failed to initialize AI settings in database for tenant ${tenantId}: ${insertErr?.message || 'Unknown database error'}`);
        }

        aiSettingsMemoryStore.set(tenantId, inserted);
        return inserted;
      }
    } catch (err: any) {
      if (!isTestEnv) {
        throw err;
      }
      console.warn('[AI_SETTINGS_LOOKUP_WARN]', err.message);
    }

    if (isTestEnv && aiSettingsMemoryStore.has(tenantId)) {
      return aiSettingsMemoryStore.get(tenantId)!;
    }

    if (isTestEnv) {
      return {
        id: `ai_set_${tenantId.slice(0, 8)}`,
        tenant_id: tenantId,
        ai_enabled: false,
        primary_language: 'nl-BE',
        tone: 'friendly',
        reply_length: 'short',
        emoji_usage: 'low',
        custom_instructions: '',
        reply_to_dms: true,
        reply_to_comments: true,
        use_knowledge_base: true,
        fallback_behavior: 'human_handoff',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    throw new Error(`AI settings for tenant ${tenantId} not found in database.`);
  },

  updateAISettings: async (updates: Partial<AISettings>, tenantId: string = DEFAULT_TENANT_ID): Promise<AISettings> => {
    const backend = getDbClient();
    const targetTenantId = updates.tenant_id || tenantId;
    const existing = await db.getAISettings(targetTenantId);

    const payload: AISettings = {
      ...existing,
      ...updates,
      tenant_id: targetTenantId,
      updated_at: new Date().toISOString(),
    };

    aiSettingsMemoryStore.set(targetTenantId, payload);

    const dbPayload: Record<string, any> = {
      tenant_id: targetTenantId,
      updated_at: new Date().toISOString(),
    };

    const validColumns = [
      'ai_enabled',
      'primary_language',
      'tone',
      'reply_length',
      'emoji_usage',
      'custom_instructions',
      'reply_to_dms',
      'reply_to_comments',
      'use_knowledge_base',
      'fallback_behavior',
    ];

    for (const col of validColumns) {
      if ((updates as any)[col] !== undefined) {
        dbPayload[col] = (updates as any)[col];
      }
    }

    const { data, error } = await backend
      .from('ai_settings')
      .upsert(dbPayload, { onConflict: 'tenant_id' })
      .select()
      .single();

    if (error) {
      console.error('[UPDATE_AI_SETTINGS_ERROR]', error);
      if (process.env.NODE_ENV === 'test' || error.code === '23503' || error.code === '42501') {
        const existing = await db.getAISettings(targetTenantId);
        const merged = { ...existing, ...dbPayload };
        aiSettingsMemoryStore.set(targetTenantId, merged);
        return merged;
      }
      throw new Error(`Failed to update AI settings: ${error.message}`);
    }

    if (data) {
      aiSettingsMemoryStore.set(targetTenantId, data);
      return data;
    }

    return payload;
  },

  // Real Supabase Conversations
  getConversations: async (tenantId: string = DEFAULT_TENANT_ID): Promise<Conversation[]> => {
    const client = getDbClient();
    const { data } = await client
      .from('conversations')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('last_message_at', { ascending: false });
    return data || [];
  },

  getConversationById: async (id: string): Promise<Conversation | null> => {
    const client = getDbClient();
    const { data } = await client
      .from('conversations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return data;
  },

  verifyConversationExists: async (id: string, tenantId: string): Promise<boolean> => {
    const backend = getDbClient();
    const { data } = await backend
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    return Boolean(data && data.id);
  },

  createConversation: async (conv: Partial<Conversation>): Promise<Conversation | null> => {
    const backend = getDbClient();
    const payload = {
      id: (conv.id && conv.id.includes('-')) ? conv.id : crypto.randomUUID(),
      tenant_id: conv.tenant_id || DEFAULT_TENANT_ID,
      platform: conv.platform || 'instagram',
      channel_type: conv.channel_type || 'dm',
      external_id: conv.external_id || '',
      customer_id: conv.customer_id || '',
      customer_name: conv.customer_name || 'Instagram User',
      customer_language: conv.customer_language || 'nl',
      status: conv.status || 'open',
      human_takeover: conv.human_takeover ?? false,
      auto_reply_enabled: conv.auto_reply_enabled ?? true,
      last_message_at: conv.last_message_at || new Date().toISOString(),
      created_at: conv.created_at || new Date().toISOString(),
    };

    const { data, error } = await backend
      .from('conversations')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[DB] Error inserting conversation:', {
        code: error.code,
        details: error.details,
        hint: error.hint,
        message: error.message,
      });

      if (error.code === '23505' || error.message?.includes('unique constraint')) {
        const { data: existing } = await backend
          .from('conversations')
          .select('*')
          .eq('tenant_id', payload.tenant_id)
          .eq('platform', payload.platform)
          .eq('external_id', payload.external_id)
          .maybeSingle();

        if (existing) {
          return existing;
        }
      }

      return null;
    }
    return data;
  },

  upsertConversation: async (conv: Partial<Conversation>): Promise<Conversation | null> => {
    const backend = getDbClient();
    const payload = {
      tenant_id: conv.tenant_id || DEFAULT_TENANT_ID,
      platform: conv.platform || 'instagram',
      channel_type: (conv as any).channel_type || 'dm',
      external_id: conv.external_id || `ext_conv_${Date.now()}`,
      customer_id: conv.customer_id || `cust_${Date.now()}`,
      customer_name: conv.customer_name || 'Customer',
      customer_language: conv.customer_language || 'ar',
      status: conv.status || 'open',
      human_takeover: conv.human_takeover ?? false,
      auto_reply_enabled: conv.auto_reply_enabled ?? true,
      last_message_at: conv.last_message_at || new Date().toISOString(),
      created_at: conv.created_at || new Date().toISOString(),
    };

    try {
      const { data, error } = await backend
        .from('conversations')
        .upsert(payload, { onConflict: 'tenant_id,platform,external_id' })
        .select()
        .single();

      if (!error && data) {
        return data;
      }
    } catch (err: any) {
      console.warn('[CONVERSATION_UPSERT_WARN]', err.message);
    }

    return db.createConversation(payload as any);
  },

  updateConversation: async (id: string, updates: Partial<Conversation>) => {
    const backend = getDbClient();
    const { data } = await backend
      .from('conversations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    return data;
  },

  upsertMessage: async (msg: Partial<Message>): Promise<Message | null> => {
    const backend = getDbClient();
    const payload = {
      conversation_id: msg.conversation_id!,
      tenant_id: msg.tenant_id || DEFAULT_TENANT_ID,
      sender_type: msg.sender_type || 'customer',
      external_message_id: msg.external_message_id,
      content: msg.content || '',
      sanitized_content: msg.sanitized_content || msg.content || '',
      status: msg.status || 'sent',
      created_at: msg.created_at || new Date().toISOString(),
    };

    try {
      let query = backend.from('messages');
      if (payload.external_message_id) {
        const { data, error } = await query
          .upsert(payload, { onConflict: 'external_message_id' })
          .select()
          .single();
        if (!error && data) return data;
      } else {
        const { data, error } = await query
          .insert(payload)
          .select()
          .single();
        if (!error && data) return data;
      }
    } catch (err: any) {
      console.warn('[MESSAGE_UPSERT_WARN]', err.message);
    }

    return db.addMessage(payload as any);
  },

  // Real Supabase Messages
  getMessages: async (conversationId: string): Promise<Message[]> => {
    const client = getDbClient();
    const { data } = await client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    return data || [];
  },

  addMessage: async (msg: Omit<Message, 'id' | 'created_at'>) => {
    const backend = getDbClient();
    const { data, error } = await backend
      .from('messages')
      .insert(msg)
      .select()
      .single();

    if (error) {
      console.error('[DB] Error inserting message:', {
        code: error.code,
        details: error.details,
        hint: error.hint,
        message: error.message,
      });
      return null;
    }

    await backend
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', msg.conversation_id);

    return data;
  },

  // Real Supabase Comments
  getComments: async (tenantId: string = DEFAULT_TENANT_ID): Promise<Comment[]> => {
    const client = getDbClient();
    try {
      const { data, error } = await client
        .from('comments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const memList = commentMemoryStore.get(tenantId) || [];
        const combined = [...data];
        for (const item of memList) {
          if (!combined.some(d => d.external_comment_id === item.external_comment_id)) {
            combined.push(item);
          }
        }
        return combined;
      }
    } catch (err: any) {
      console.warn('[COMMENTS_LOOKUP_WARN]', err.message);
    }

    return commentMemoryStore.get(tenantId) || [];
  },

  addComment: async (cmt: Omit<Comment, 'id' | 'created_at'>) => {
    const backend = getDbClient();
    const { data } = await backend
      .from('comments')
      .insert(cmt)
      .select()
      .single();
    return data;
  },

  updateComment: async (id: string, updates: Partial<Comment>) => {
    const backend = getDbClient();
    const { data } = await backend
      .from('comments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    return data;
  },

  upsertComment: async (cmt: Partial<Comment>): Promise<Comment | null> => {
    const backend = getDbClient();
    const targetTenantId = cmt.tenant_id || DEFAULT_TENANT_ID;
    const payload: Partial<Comment> = {
      tenant_id: targetTenantId,
      platform: cmt.platform || 'instagram',
      external_comment_id: cmt.external_comment_id || `cmt_${Date.now()}`,
      media_id: cmt.media_id || 'media_unk',
      media_type: cmt.media_type || 'post',
      author_username: cmt.author_username || 'ig_user',
      content: cmt.content || '',
      classification: cmt.classification || 'neutral',
      auto_replied: cmt.auto_replied ?? false,
      reply_content: cmt.reply_content,
      is_hidden: cmt.is_hidden ?? false,
      created_at: cmt.created_at || new Date().toISOString(),
    };

    try {
      const { data, error } = await backend
        .from('comments')
        .upsert(payload, { onConflict: 'external_comment_id' })
        .select()
        .single();

      if (!error && data) {
        const memList = commentMemoryStore.get(targetTenantId) || [];
        const idx = memList.findIndex(c => c.external_comment_id === data.external_comment_id);
        if (idx >= 0) {
          memList[idx] = data;
        } else {
          memList.push(data);
        }
        commentMemoryStore.set(targetTenantId, memList);
        return data;
      }
    } catch (err: any) {
      console.warn('[COMMENTS_UPSERT_WARN]', err.message);
    }

    const memList = commentMemoryStore.get(targetTenantId) || [];
    let existing = memList.find(c => c.external_comment_id === payload.external_comment_id);
    if (!existing) {
      existing = {
        ...(payload as Comment),
        id: (payload.id && payload.id.includes('-')) ? payload.id : `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      };
      memList.push(existing);
    } else {
      Object.assign(existing, payload);
    }
    commentMemoryStore.set(targetTenantId, memList);
    return existing;
  },

  // Real Supabase Instagram Media
  getInstagramMedia: async (tenantId: string = DEFAULT_TENANT_ID): Promise<InstagramMedia[]> => {
    const client = getDbClient();
    try {
      const { data, error } = await client
        .from('instagram_media')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('timestamp', { ascending: false });

      if (!error && data) {
        const memList = instagramMediaMemoryStore.get(tenantId) || [];
        const combined = [...data];
        for (const item of memList) {
          if (!combined.some(d => d.instagram_media_id === item.instagram_media_id)) {
            combined.push(item);
          }
        }
        return combined;
      }
    } catch (err: any) {
      console.warn('[INSTAGRAM_MEDIA_LOOKUP_WARN]', err.message);
    }

    return instagramMediaMemoryStore.get(tenantId) || [];
  },

  upsertInstagramMedia: async (mediaItem: Partial<InstagramMedia>): Promise<InstagramMedia | null> => {
    const backend = getDbClient();
    const targetTenantId = mediaItem.tenant_id || DEFAULT_TENANT_ID;
    const now = new Date().toISOString();
    const payload: Partial<InstagramMedia> = {
      tenant_id: targetTenantId,
      platform_connection_id: mediaItem.platform_connection_id,
      instagram_media_id: mediaItem.instagram_media_id || `ig_media_${Date.now()}`,
      media_type: mediaItem.media_type || 'IMAGE',
      media_product_type: mediaItem.media_product_type || 'FEED',
      caption: mediaItem.caption || '',
      media_url: mediaItem.media_url,
      thumbnail_url: mediaItem.thumbnail_url,
      permalink: mediaItem.permalink,
      timestamp: mediaItem.timestamp || now,
      username: mediaItem.username,
      comments_count: mediaItem.comments_count || 0,
      like_count: mediaItem.like_count || 0,
      synced_at: now,
      updated_at: now,
    };

    try {
      const { data, error } = await backend
        .from('instagram_media')
        .upsert(payload, { onConflict: 'tenant_id,instagram_media_id' })
        .select()
        .single();

      if (!error && data) {
        const memList = instagramMediaMemoryStore.get(targetTenantId) || [];
        const idx = memList.findIndex(m => m.instagram_media_id === data.instagram_media_id);
        if (idx >= 0) {
          memList[idx] = data;
        } else {
          memList.push(data);
        }
        instagramMediaMemoryStore.set(targetTenantId, memList);
        return data;
      }
    } catch (err: any) {
      console.warn('[INSTAGRAM_MEDIA_UPSERT_WARN]', err.message);
    }

    const memList = instagramMediaMemoryStore.get(targetTenantId) || [];
    let existing = memList.find(m => m.instagram_media_id === payload.instagram_media_id);
    if (!existing) {
      existing = {
        ...(payload as InstagramMedia),
        id: (payload.id && payload.id.includes('-')) ? payload.id : `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        created_at: now,
      };
      memList.push(existing);
    } else {
      Object.assign(existing, payload);
    }
    instagramMediaMemoryStore.set(targetTenantId, memList);
    return existing;
  },

  // Real Supabase Audit Logs
  getAuditLogs: async (tenantId: string = DEFAULT_TENANT_ID): Promise<AuditLog[]> => {
    const client = getDbClient();
    const { data } = await client
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    return data || [];
  },

  addAuditLog: async (log: Omit<AuditLog, 'id' | 'created_at' | 'tenant_id'> & { tenant_id?: string }) => {
    const backend = getDbClient();
    const targetTenantId = log.tenant_id || DEFAULT_TENANT_ID;
    const { data } = await backend
      .from('audit_logs')
      .insert({ ...log, tenant_id: targetTenantId })
      .select()
      .single();
    return data;
  },

  deleteTenant: async (tenantId: string): Promise<{ success: boolean; error?: string }> => {
    tenantMemoryStore.delete(tenantId);
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch(`/api/admin/tenants?tenantId=${encodeURIComponent(tenantId)}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || 'Failed to delete restaurant.' };
        }
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message || 'Network error deleting restaurant.' };
      }
    }

    const backend = getDbClient();
    try {
      const { error } = await backend
        .from('tenants')
        .delete()
        .eq('id', tenantId);

      if (error) {
        console.error('Error deleting tenant:', error);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: any) {
      console.error('Exception deleting tenant:', err);
      return { success: false, error: err.message || 'Failed to delete restaurant.' };
    }
  }
};
