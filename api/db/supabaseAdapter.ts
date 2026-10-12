import type {
  DatabaseSchema,
  UserRecord,
  SessionRecord,
  ConversationRecord,
  MessageRecord,
  MediaRecord,
  StatusRecord,
  StatusViewRecord,
  BlockRecord,
  ReportRecord,
  ContactRecord,
} from '../index';

export interface SupabaseAdapterStatus {
  configured: boolean;
  active: boolean;
  provider: 'local' | 'supabase';
  supabaseUrlConfigured: boolean;
  serviceRoleKeyConfigured: boolean;
  dbUrlConfigured: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

let lastSupabaseSyncedAt: string | null = null;
let lastSupabaseError: string | null = null;

export function getSupabaseProjectUrl(): string {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  ).trim();
  return url.replace(/\/+$/, '');
}

export function getSupabaseServiceKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseProjectUrl();
  const key = getSupabaseServiceKey();
  return (
    Boolean(url && key) &&
    !url.includes('YOUR_PROJECT_REF') &&
    !key.includes('YOUR_SUPABASE_SERVICE_ROLE_KEY') &&
    !key.includes('YOUR_SUPABASE_ANON_KEY') &&
    url.startsWith('https://')
  );
}

export function getActiveDbProvider(): 'local' | 'supabase' {
  const raw = (process.env.LAMAVI_DB_PROVIDER || '').trim().toLowerCase();
  if (raw === 'supabase') return 'supabase';
  if (raw === 'local') {
    // When valid server-side Supabase credentials are provisioned, activate Supabase unless LAMAVI_FORCE_LOCAL=true
    if (isSupabaseConfigured() && process.env.LAMAVI_FORCE_LOCAL !== 'true') {
      return 'supabase';
    }
    return 'local';
  }
  return isSupabaseConfigured() ? 'supabase' : 'local';
}

export function getSupabaseAdapterStatus(): SupabaseAdapterStatus {
  const url = getSupabaseProjectUrl();
  const key = getSupabaseServiceKey();
  const dbUrl = (process.env.SUPABASE_DB_URL || '').trim();
  const supabaseUrlConfigured = Boolean(
    url && !url.includes('YOUR_PROJECT_REF') && url.startsWith('https://')
  );
  const serviceRoleKeyConfigured = Boolean(
    key && !key.includes('YOUR_SUPABASE_SERVICE_ROLE_KEY')
  );
  const dbUrlConfigured = Boolean(dbUrl && !dbUrl.includes('YOUR_DB_PASSWORD'));
  const provider = getActiveDbProvider();
  const configured = supabaseUrlConfigured && serviceRoleKeyConfigured;

  return {
    configured,
    active: provider === 'supabase' && configured,
    provider,
    supabaseUrlConfigured,
    serviceRoleKeyConfigured,
    dbUrlConfigured,
    lastSyncedAt: lastSupabaseSyncedAt,
    lastError: lastSupabaseError,
  };
}

function getSupabaseHeaders(prefer?: string): Record<string, string> {
  const key = getSupabaseServiceKey();
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
  if (prefer) {
    headers.Prefer = prefer;
  }
  return headers;
}

function getRestBaseUrl(): string {
  const url = getSupabaseProjectUrl();
  return `${url}/rest/v1`;
}

export async function fetchTableRows<T>(table: string, query = 'select=*'): Promise<T[]> {
  const endpoint = `${getRestBaseUrl()}/${table}?${query}`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: getSupabaseHeaders(),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase GET ${table} failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  return (await res.json()) as T[];
}

export async function upsertTableRows(
  table: string,
  rows: Record<string, unknown>[],
  onConflict = 'id'
): Promise<void> {
  if (!rows.length) return;
  const endpoint = `${getRestBaseUrl()}/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: getSupabaseHeaders('resolution=merge-duplicates,return=minimal'),
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase UPSERT ${table} failed (${res.status}): ${errText.slice(0, 200)}`);
  }
}

export async function deleteTableRowWhere(
  table: string,
  filterQuery: string
): Promise<void> {
  if (getActiveDbProvider() !== 'supabase' || !isSupabaseConfigured()) return;
  const endpoint = `${getRestBaseUrl()}/${table}?${filterQuery}`;
  const res = await fetch(endpoint, {
    method: 'DELETE',
    headers: getSupabaseHeaders('return=minimal'),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase DELETE ${table} failed (${res.status}): ${errText.slice(0, 200)}`);
  }
}

// --- ROW MAPPERS (Snake_case PostgreSQL <-> CamelCase Application Model) ---

export function mapRowToUser(r: Record<string, unknown>): UserRecord {
  return {
    id: String(r.id),
    fullName: String(r.full_name || ''),
    username: String(r.username || '').toLowerCase(),
    email: String(r.email || '').toLowerCase(),
    passwordSalt: String(r.password_salt || 'sha256_client'),
    passwordHash: String(r.password_hash || ''),
    recoveryCodeSalt: String(r.recovery_code_salt || 'sha256_client'),
    recoveryCodeHash: String(r.recovery_code_hash || ''),
    bio: String(r.bio || ''),
    avatarUrl: String(r.avatar_url || ''),
    createdAt: String(r.created_at || new Date().toISOString()),
    lastSeen: String(r.last_seen || new Date().toISOString()),
    isOnline: Boolean(r.is_online),
    usernameChangeTimestamps: Array.isArray(r.username_change_timestamps)
      ? (r.username_change_timestamps as string[])
      : [],
    privacy: (r.privacy as UserRecord['privacy']) || {
      profilePicVisibility: 'everyone',
      lastSeenVisibility: 'everyone',
      readReceipts: true,
      statusPrivacy: 'everyone',
      whoCanContact: 'everyone',
    },
    notifications: (r.notifications as UserRecord['notifications']) || {
      messageAlerts: true,
      soundEnabled: true,
      previewText: true,
    },
    chatSettings: (r.chat_settings as UserRecord['chatSettings']) || {
      enterToSend: true,
      fontSize: 'medium',
      autoDownloadImages: true,
    },
  };
}

export function mapUserToRow(u: UserRecord): Record<string, unknown> {
  return {
    id: u.id,
    full_name: u.fullName,
    username: u.username.toLowerCase(),
    email: u.email.toLowerCase(),
    password_salt: u.passwordSalt,
    password_hash: u.passwordHash,
    recovery_code_salt: u.recoveryCodeSalt,
    recovery_code_hash: u.recoveryCodeHash,
    bio: u.bio || '',
    avatar_url: u.avatarUrl || '',
    created_at: u.createdAt,
    last_seen: u.lastSeen,
    is_online: Boolean(u.isOnline),
    username_change_timestamps: u.usernameChangeTimestamps || [],
    privacy: u.privacy,
    notifications: u.notifications,
    chat_settings: u.chatSettings,
  };
}

export function mapRowToSession(r: Record<string, unknown>): SessionRecord {
  return {
    token: String(r.token),
    userId: String(r.user_id),
    createdAt: String(r.created_at || new Date().toISOString()),
    expiresAt: String(r.expires_at || new Date().toISOString()),
  };
}

export function mapSessionToRow(s: SessionRecord): Record<string, unknown> {
  return {
    token: s.token,
    user_id: s.userId,
    created_at: s.createdAt,
    expires_at: s.expiresAt,
  };
}

export function mapRowToConversation(r: Record<string, unknown>): ConversationRecord {
  const pIds = Array.isArray(r.participant_ids)
    ? (r.participant_ids as string[])
    : [String(r.participant_a || ''), String(r.participant_b || '')];
  return {
    id: String(r.id),
    participantIds: [String(pIds[0] || ''), String(pIds[1] || '')],
    createdAt: String(r.created_at || new Date().toISOString()),
    updatedAt: String(r.updated_at || new Date().toISOString()),
    deletedBy: Array.isArray(r.deleted_by) ? (r.deleted_by as string[]) : [],
    clearedAt:
      r.cleared_at && typeof r.cleared_at === 'object'
        ? (r.cleared_at as Record<string, string>)
        : {},
  };
}

export function mapConversationToRow(c: ConversationRecord): Record<string, unknown> {
  return {
    id: c.id,
    participant_ids: c.participantIds,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    deleted_by: c.deletedBy || [],
    cleared_at: c.clearedAt || {},
  };
}

export function mapRowToMessage(r: Record<string, unknown>): MessageRecord {
  return {
    id: String(r.id),
    clientTempId: r.client_temp_id ? String(r.client_temp_id) : undefined,
    conversationId: String(r.conversation_id),
    senderId: String(r.sender_id),
    recipientId: r.recipient_id ? String(r.recipient_id) : undefined,
    text: String(r.text || ''),
    imageId: r.image_id ? String(r.image_id) : undefined,
    replyToMessageId: r.reply_to_message_id ? String(r.reply_to_message_id) : undefined,
    createdAt: String(r.created_at || new Date().toISOString()),
    expiresAt: String(r.expires_at || new Date().toISOString()),
    status: (r.status as MessageRecord['status']) || 'sent',
    deliveredAt: r.delivered_at ? String(r.delivered_at) : undefined,
    readAt: r.read_at ? String(r.read_at) : undefined,
    deletedFor: Array.isArray(r.deleted_for) ? (r.deleted_for as string[]) : [],
    deletedForEveryone: Boolean(r.deleted_for_everyone),
  };
}

export function mapMessageToRow(m: MessageRecord): Record<string, unknown> {
  return {
    id: m.id,
    client_temp_id: m.clientTempId || null,
    conversation_id: m.conversationId,
    sender_id: m.senderId,
    recipient_id: m.recipientId || null,
    text: m.text || '',
    image_id: m.imageId || null,
    reply_to_message_id: m.replyToMessageId || null,
    created_at: m.createdAt,
    expires_at: m.expiresAt,
    status: m.status || 'sent',
    delivered_at: m.deliveredAt || null,
    read_at: m.readAt || null,
    deleted_for: m.deletedFor || [],
    deleted_for_everyone: Boolean(m.deletedForEveryone),
  };
}

export function mapRowToMedia(r: Record<string, unknown>): MediaRecord {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    conversationId: r.conversation_id ? String(r.conversation_id) : undefined,
    statusId: r.status_id ? String(r.status_id) : undefined,
    mimeType: String(r.mime_type || 'image/jpeg'),
    dataBase64: String(r.data_base64 || ''),
    sizeBytes: Number(r.size_bytes || 0),
    createdAt: String(r.created_at || new Date().toISOString()),
    expiresAt: String(r.expires_at || new Date().toISOString()),
  };
}

export function mapMediaToRow(m: MediaRecord): Record<string, unknown> {
  return {
    id: m.id,
    owner_id: m.ownerId,
    conversation_id: m.conversationId || null,
    status_id: m.statusId || null,
    mime_type: m.mimeType,
    data_base64: m.dataBase64,
    size_bytes: m.sizeBytes,
    created_at: m.createdAt,
    expires_at: m.expiresAt,
  };
}

export function mapRowToStatus(r: Record<string, unknown>): StatusRecord {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    type: r.type === 'image' ? 'image' : 'text',
    text: String(r.text || ''),
    backgroundColor: String(r.background_color || '#F2F2F7'),
    textColor: String(r.text_color || '#1C1C1E'),
    imageId: r.image_id ? String(r.image_id) : undefined,
    privacy: r.privacy === 'contacts' ? 'contacts' : 'everyone',
    createdAt: String(r.created_at || new Date().toISOString()),
    expiresAt: String(r.expires_at || new Date().toISOString()),
  };
}

export function mapStatusToRow(s: StatusRecord): Record<string, unknown> {
  return {
    id: s.id,
    user_id: s.userId,
    type: s.type,
    text: s.text || '',
    background_color: s.backgroundColor,
    text_color: s.textColor,
    image_id: s.imageId || null,
    privacy: s.privacy,
    created_at: s.createdAt,
    expires_at: s.expiresAt,
  };
}

export function mapRowToStatusView(r: Record<string, unknown>): StatusViewRecord {
  return {
    id: String(r.id),
    statusId: String(r.status_id),
    viewerId: String(r.viewer_id),
    viewedAt: String(r.viewed_at || new Date().toISOString()),
  };
}

export function mapStatusViewToRow(sv: StatusViewRecord): Record<string, unknown> {
  return {
    id: sv.id,
    status_id: sv.statusId,
    viewer_id: sv.viewerId,
    viewed_at: sv.viewedAt,
  };
}

export function mapRowToContact(r: Record<string, unknown>): ContactRecord {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    contactUserId: String(r.contact_user_id),
    createdAt: String(r.created_at || new Date().toISOString()),
  };
}

export function mapContactToRow(c: ContactRecord): Record<string, unknown> {
  return {
    id: c.id,
    user_id: c.userId,
    contact_user_id: c.contactUserId,
    created_at: c.createdAt,
  };
}

export function mapRowToBlock(r: Record<string, unknown>): BlockRecord {
  return {
    id: String(r.id),
    blockerId: String(r.blocker_id),
    blockedUserId: String(r.blocked_user_id),
    createdAt: String(r.created_at || new Date().toISOString()),
  };
}

export function mapBlockToRow(b: BlockRecord): Record<string, unknown> {
  return {
    id: b.id,
    blocker_id: b.blockerId,
    blocked_user_id: b.blockedUserId,
    created_at: b.createdAt,
  };
}

export function mapRowToReport(r: Record<string, unknown>): ReportRecord {
  return {
    id: String(r.id),
    reporterId: String(r.reporter_id),
    reportedUserId: String(r.reported_user_id),
    reason: String(r.reason || ''),
    details: String(r.details || ''),
    createdAt: String(r.created_at || new Date().toISOString()),
  };
}

export function mapReportToRow(rp: ReportRecord): Record<string, unknown> {
  return {
    id: rp.id,
    reporter_id: rp.reporterId,
    reported_user_id: rp.reportedUserId,
    reason: rp.reason,
    details: rp.details || '',
    created_at: rp.createdAt,
  };
}

export async function loadDatabaseFromSupabase(): Promise<Partial<DatabaseSchema> | null> {
  if (getActiveDbProvider() !== 'supabase' || !isSupabaseConfigured()) {
    return null;
  }

  try {
    const [
      usersRows,
      sessionsRows,
      conversationsRows,
      messagesRows,
      mediaRows,
      statusesRows,
      statusViewsRows,
      contactsRows,
      blocksRows,
      reportsRows,
    ] = await Promise.all([
      fetchTableRows<Record<string, unknown>>('lamavi_users'),
      fetchTableRows<Record<string, unknown>>('lamavi_sessions'),
      fetchTableRows<Record<string, unknown>>('lamavi_conversations'),
      fetchTableRows<Record<string, unknown>>('lamavi_messages', 'select=*&order=created_at.asc'),
      fetchTableRows<Record<string, unknown>>('lamavi_media'),
      fetchTableRows<Record<string, unknown>>('lamavi_statuses'),
      fetchTableRows<Record<string, unknown>>('lamavi_status_views'),
      fetchTableRows<Record<string, unknown>>('lamavi_contacts'),
      fetchTableRows<Record<string, unknown>>('lamavi_blocks'),
      fetchTableRows<Record<string, unknown>>('lamavi_reports'),
    ]);

    lastSupabaseSyncedAt = new Date().toISOString();
    lastSupabaseError = null;

    return {
      users: usersRows.map(mapRowToUser),
      sessions: sessionsRows.map(mapRowToSession),
      conversations: conversationsRows.map(mapRowToConversation),
      messages: messagesRows.map(mapRowToMessage),
      media: mediaRows.map(mapRowToMedia),
      statuses: statusesRows.map(mapRowToStatus),
      statusViews: statusViewsRows.map(mapRowToStatusView),
      contacts: contactsRows.map(mapRowToContact),
      blocks: blocksRows.map(mapRowToBlock),
      reports: reportsRows.map(mapRowToReport),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    lastSupabaseError = message;
    console.error('[SupabaseAdapter] Load error:', message);
    return null;
  }
}

export async function saveDatabaseToSupabase(
  data: DatabaseSchema,
  syncMedia = false
): Promise<{ ok: boolean; error?: string; status?: number }> {
  if (getActiveDbProvider() !== 'supabase') {
    return { ok: true };
  }

  if (!isSupabaseConfigured()) {
    const msg =
      'LAMAVI_DB_PROVIDER is set to "supabase", but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.';
    lastSupabaseError = msg;
    return { ok: false, error: msg, status: 503 };
  }

  try {
    // 1. Upsert users first (foreign key parent for sessions, messages, contacts, etc.)
    // Deduplicate by id, username, and email so PostgreSQL unique constraints never reject batch upserts
    const seenIds = new Set<string>();
    const seenUsernames = new Set<string>();
    const seenEmails = new Set<string>();
    const deduplicatedUsers: UserRecord[] = [];
    for (const u of data.users) {
      const uid = String(u.id || '').trim();
      const uname = String(u.username || '').trim().toLowerCase();
      const uemail = String(u.email || '').trim().toLowerCase();
      if (!uid || !uname || !uemail) continue;
      if (seenIds.has(uid) || seenUsernames.has(uname) || seenEmails.has(uemail)) continue;
      seenIds.add(uid);
      seenUsernames.add(uname);
      seenEmails.add(uemail);
      deduplicatedUsers.push(u);
    }

    await upsertTableRows('lamavi_users', deduplicatedUsers.map(mapUserToRow), 'id');

    const validUserIds = new Set(deduplicatedUsers.map((u) => u.id));

    // 2. Upsert conversations and sessions in parallel
    const validSessions = data.sessions.filter((s) => validUserIds.has(s.userId));
    const validStatuses = data.statuses.filter((s) => validUserIds.has(s.userId));
    await Promise.all([
      upsertTableRows('lamavi_sessions', validSessions.map(mapSessionToRow), 'token'),
      upsertTableRows('lamavi_conversations', data.conversations.map(mapConversationToRow), 'id'),
      upsertTableRows('lamavi_statuses', validStatuses.map(mapStatusToRow), 'id'),
    ]);

    const validConvIds = new Set(data.conversations.map((c) => c.id));
    const validStatusIds = new Set(validStatuses.map((s) => s.id));

    // 3. Upsert messages, status views, contacts, blocks, and reports in parallel
    const validMessages = data.messages.filter(
      (m) => validConvIds.has(m.conversationId) && validUserIds.has(m.senderId)
    );
    const validStatusViews = data.statusViews.filter(
      (sv) => validStatusIds.has(sv.statusId) && validUserIds.has(sv.viewerId)
    );
    const validContacts = data.contacts.filter(
      (c) => validUserIds.has(c.userId) && validUserIds.has(c.contactUserId)
    );
    const validBlocks = data.blocks.filter(
      (b) => validUserIds.has(b.blockerId) && validUserIds.has(b.blockedUserId)
    );
    const validReports = data.reports.filter(
      (rp) => validUserIds.has(rp.reporterId) && validUserIds.has(rp.reportedUserId)
    );

    await Promise.all([
      upsertTableRows('lamavi_messages', validMessages.map(mapMessageToRow), 'id'),
      upsertTableRows(
        'lamavi_status_views',
        validStatusViews.map(mapStatusViewToRow),
        'status_id,viewer_id'
      ),
      upsertTableRows(
        'lamavi_contacts',
        validContacts.map(mapContactToRow),
        'user_id,contact_user_id'
      ),
      upsertTableRows(
        'lamavi_blocks',
        validBlocks.map(mapBlockToRow),
        'blocker_id,blocked_user_id'
      ),
      upsertTableRows('lamavi_reports', validReports.map(mapReportToRow), 'id'),
    ]);

    // 4. Upsert media (one row at a time when syncMedia=true so large base64 payloads never exceed PostgREST limits)
    if (syncMedia && data.media.length > 0) {
      const validMedia = data.media.filter((m) => validUserIds.has(m.ownerId));
      for (const m of validMedia) {
        await upsertTableRows('lamavi_media', [mapMediaToRow(m)], 'id');
      }
    }

    lastSupabaseSyncedAt = new Date().toISOString();
    lastSupabaseError = null;
    return { ok: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    lastSupabaseError = message;
    console.error('[SupabaseAdapter] Save error:', message);
    return { ok: false, error: message, status: 503 };
  }
}
