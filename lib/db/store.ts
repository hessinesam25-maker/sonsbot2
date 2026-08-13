import { 
  Tenant, User, PlatformConnection, KnowledgeBase, MenuItem, 
  Conversation, Message, Comment, AutomationRules, AuditLog, FAQ, PlatformAdmin, AISettings,
  InstagramConnectionState
} from './types';
import { supabaseFrontend, getBackendSupabaseClient } from './client';

export const DEFAULT_TENANT_ID = '11111111-1111-1111-1111-111111111111';

const aiSettingsMemoryStore = new Map<string, AISettings>();

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
    return data || [];
  },

  getTenant: async (tenantId: string = DEFAULT_TENANT_ID): Promise<Tenant | null> => {
    const client = getDbClient();
    const { data, error } = await client
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (error || !data) {
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
          return { ...fallbackData, ...tenantData } as Tenant;
        }
      }

      if (data) return data;
    } catch (e) {
      console.warn('Backend create tenant fell back to memory store:', e);
    }

    return {
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
    let query = client.from('platform_connections').select('*');
    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching platform connections:', error);
      return [];
    }
    return data || [];
  },

  getInstagramConnectionState: async (tenantId: string = DEFAULT_TENANT_ID): Promise<InstagramConnectionState> => {
    const conns = await db.getConnections(tenantId);
    return getNormalizedInstagramState(conns);
  },

  updateConnection: async (id: string, updates: Partial<PlatformConnection>) => {
    const backend = getDbClient();
    const { data } = await backend
      .from('platform_connections')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    return data;
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
  getMenu: async (tenantId: string = DEFAULT_TENANT_ID): Promise<MenuItem[]> => {
    const client = getDbClient();
    const { data } = await client
      .from('menu_items')
      .select('*')
      .eq('tenant_id', tenantId);
    return data || [];
  },

  addMenuItem: async (item: Omit<MenuItem, 'id' | 'created_at'>, tenantId: string = DEFAULT_TENANT_ID) => {
    const backend = getDbClient();
    const { data } = await backend
      .from('menu_items')
      .insert({ ...item, tenant_id: item.tenant_id || tenantId })
      .select()
      .single();
    return data;
  },

  updateMenuItem: async (id: string, updates: Partial<MenuItem>) => {
    const backend = getDbClient();
    const { data } = await backend
      .from('menu_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    return data;
  },

  deleteMenuItem: async (id: string) => {
    const backend = getDbClient();
    await backend.from('menu_items').delete().eq('id', id);
  },

  // Real Supabase Automation Rules
  getAutomationRules: async (tenantId: string = DEFAULT_TENANT_ID): Promise<AutomationRules> => {
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
        default_dm_reply: 'Welkom! Hoe kunnen we u vandaag helpen?',
        updated_at: new Date().toISOString(),
      };
    }
    return data;
  },

  updateAutomationRules: async (updates: Partial<AutomationRules>, tenantId: string = DEFAULT_TENANT_ID) => {
    const backend = getDbClient();
    const targetTenantId = updates.tenant_id || tenantId;
    const { data } = await backend
      .from('automation_rules')
      .upsert({ ...updates, tenant_id: targetTenantId })
      .select()
      .single();
    return data;
  },

  // Real Supabase AI Settings with graceful fallback
  getAISettings: async (tenantId: string = DEFAULT_TENANT_ID): Promise<AISettings> => {
    const client = getDbClient();
    try {
      const { data, error } = await client
        .from('ai_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!error && data) {
        aiSettingsMemoryStore.set(tenantId, data);
        return data;
      }
    } catch (err: any) {
      console.warn('[AI_SETTINGS_LOOKUP_WARN]', err.message);
    }

    if (aiSettingsMemoryStore.has(tenantId)) {
      return aiSettingsMemoryStore.get(tenantId)!;
    }

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

    const dbPayload = { ...payload };
    if (dbPayload.id && dbPayload.id.startsWith('ai_set_')) {
      delete (dbPayload as any).id;
    }

    try {
      const { data, error } = await backend
        .from('ai_settings')
        .upsert(dbPayload, { onConflict: 'tenant_id' })
        .select()
        .single();

      if (!error && data) {
        aiSettingsMemoryStore.set(targetTenantId, data);
        return data;
      }
    } catch (err: any) {
      console.warn('[AI_SETTINGS_UPDATE_WARN]', err.message);
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
    const { data } = await client
      .from('comments')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    return data || [];
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
