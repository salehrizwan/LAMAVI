import {
  UserProfile,
  ConversationItem,
  MessageItem,
  StatusItem,
  PrivacySettings,
  NotificationSettings,
  ChatSettings,
} from '../types';
import seedDatabaseRaw from '../../data/seed_database.json';

interface StoredUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  passwordDigest: string;
  recoveryDigest: string;
  bio: string;
  avatarUrl: string;
  createdAt: string;
  lastSeen: string;
  isOnline: boolean;
  usernameChangeTimestamps: string[];
  privacy: PrivacySettings;
  notifications: NotificationSettings;
  chatSettings: ChatSettings;
}

interface StoredConversation {
  id: string;
  participantIds: [string, string];
  createdAt: string;
  updatedAt: string;
  deletedBy: string[];
  clearedAt: Record<string, string>;
}

interface StoredMessage {
  id: string;
  clientTempId?: string;
  conversationId: string;
  senderId: string;
  text: string;
  imageId?: string;
  replyToMessageId?: string;
  createdAt: string;
  expiresAt: string;
  status: 'sent' | 'delivered' | 'read';
  deliveredAt?: string;
  readAt?: string;
  deletedFor: string[];
  deletedForEveryone: boolean;
}

interface StoredMedia {
  id: string;
  ownerId: string;
  conversationId?: string;
  statusId?: string;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
}

interface StoredStatus {
  id: string;
  userId: string;
  type: 'text' | 'image';
  text: string;
  backgroundColor: string;
  textColor: string;
  imageId?: string;
  privacy: 'everyone' | 'contacts';
  createdAt: string;
  expiresAt: string;
  viewers: { viewerId: string; viewedAt: string }[];
}

interface LocalState {
  users: StoredUser[];
  sessions: Record<string, string>;
  conversations: StoredConversation[];
  messages: StoredMessage[];
  media: StoredMedia[];
  statuses: StoredStatus[];
  contacts: { userId: string; contactUserId: string }[];
  blocks: { blockerId: string; blockedUserId: string }[];
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const LOCAL_STORAGE_KEY = 'lamavi_local_state_v3';

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomHex(bytes = 8): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getDeterministicClientConvId(userA: string, userB: string): Promise<string> {
  const [first, second] = [String(userA).trim(), String(userB).trim()].sort();
  const digest = await sha256Hex(`${first}:${second}`);
  return `conv_${digest.slice(0, 16)}`;
}

// BroadcastChannel for instant real-time sync across tabs/windows on the same device
const lamaviBroadcast =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('lamavi_realtime_sync')
    : null;

export function notifyRealtimeSync(event: string, payload?: unknown) {
  try {
    lamaviBroadcast?.postMessage({
      type: 'state_updated',
      event,
      payload,
      timestamp: Date.now(),
    });
  } catch {
    // ignore
  }
}

function generateClientRecoveryCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) {
    p1 += chars[Math.floor(Math.random() * chars.length)];
    p2 += chars[Math.floor(Math.random() * chars.length)];
  }
  return `LAMAVI-${p1}-${p2}`;
}

function emptyState(): LocalState {
  return {
    users: [],
    sessions: {},
    conversations: [],
    messages: [],
    media: [],
    statuses: [],
    contacts: [],
    blocks: [],
  };
}

function mergeLocalStates(a: LocalState, b: LocalState): LocalState {
  const userMap = new Map<string, StoredUser>();
  for (const u of [...(a.users || []), ...(b.users || [])]) {
    const key = (u.username || '').toLowerCase();
    if (!key) continue;
    const prev = userMap.get(key);
    if (!prev) {
      userMap.set(key, u);
    } else {
      const incomingNewer =
        (u.lastSeen || u.createdAt || '') >= (prev.lastSeen || prev.createdAt || '');
      userMap.set(key, {
        ...prev,
        ...(incomingNewer ? u : {}),
        id: prev.id || u.id,
        avatarUrl:
          (incomingNewer && u.avatarUrl ? u.avatarUrl : prev.avatarUrl) || u.avatarUrl || '',
        bio: (incomingNewer && u.bio !== undefined ? u.bio : prev.bio) || u.bio || '',
        fullName: (incomingNewer && u.fullName ? u.fullName : prev.fullName) || u.fullName || '',
        passwordDigest:
          (incomingNewer && u.passwordDigest ? u.passwordDigest : prev.passwordDigest) ||
          u.passwordDigest ||
          '',
        recoveryDigest:
          (incomingNewer && u.recoveryDigest ? u.recoveryDigest : prev.recoveryDigest) ||
          u.recoveryDigest ||
          '',
      });
    }
  }

  const sessions: Record<string, string> = {
    ...(a.sessions || {}),
    ...(b.sessions || {}),
  };

  const convByPair = new Map<string, StoredConversation>();
  const convIdRemap = new Map<string, string>();
  for (const c of [...(a.conversations || []), ...(b.conversations || [])]) {
    if (!c || !Array.isArray(c.participantIds) || c.participantIds.length < 2) continue;
    const sortedPair = [c.participantIds[0], c.participantIds[1]].sort() as [string, string];
    const pairKey = sortedPair.join(':');
    const existingConv = convByPair.get(pairKey);
    if (!existingConv) {
      convByPair.set(pairKey, {
        ...c,
        participantIds: sortedPair,
        deletedBy: Array.isArray(c.deletedBy) ? c.deletedBy : [],
        clearedAt: c.clearedAt || {},
      });
      convIdRemap.set(c.id, c.id);
    } else {
      convIdRemap.set(c.id, existingConv.id);
      const mergedUpdatedAt =
        (c.updatedAt || '') > (existingConv.updatedAt || '')
          ? c.updatedAt
          : existingConv.updatedAt;
      convByPair.set(pairKey, {
        ...existingConv,
        participantIds: sortedPair,
        updatedAt: mergedUpdatedAt,
        deletedBy:
          (c.updatedAt || '') > (existingConv.updatedAt || '')
            ? c.deletedBy || []
            : existingConv.deletedBy || [],
        clearedAt: { ...(existingConv.clearedAt || {}), ...(c.clearedAt || {}) },
      });
    }
  }

  const msgMap = new Map<string, StoredMessage>();
  const statusRank: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
  for (const m of [...(a.messages || []), ...(b.messages || [])]) {
    if (!m || !m.id) continue;
    const canonicalConvId = convIdRemap.get(m.conversationId) || m.conversationId;
    const normalized: StoredMessage = {
      ...m,
      conversationId: canonicalConvId,
      deletedFor: Array.isArray(m.deletedFor) ? m.deletedFor : [],
      deletedForEveryone: Boolean(m.deletedForEveryone),
    };
    const prev = msgMap.get(m.id);
    if (!prev) {
      msgMap.set(m.id, normalized);
    } else {
      const bestStatus =
        (statusRank[normalized.status] || 1) >= (statusRank[prev.status] || 1)
          ? normalized.status
          : prev.status;
      msgMap.set(m.id, {
        ...prev,
        ...normalized,
        status: bestStatus,
        deliveredAt: normalized.deliveredAt || prev.deliveredAt,
        readAt: normalized.readAt || prev.readAt,
      });
    }
  }

  for (const m of msgMap.values()) {
    for (const c of convByPair.values()) {
      if (c.id === m.conversationId && m.createdAt > (c.updatedAt || '')) {
        c.updatedAt = m.createdAt;
        c.deletedBy = [];
      }
    }
  }

  const mediaMap = new Map<string, StoredMedia>();
  for (const med of [...(a.media || []), ...(b.media || [])]) {
    mediaMap.set(med.id, med);
  }

  const statusMap = new Map<string, StoredStatus>();
  for (const s of [...(a.statuses || []), ...(b.statuses || [])]) {
    statusMap.set(s.id, { ...s, viewers: s.viewers || [] });
  }

  const contactSet = new Set<string>();
  const contacts: { userId: string; contactUserId: string }[] = [];
  for (const ct of [...(a.contacts || []), ...(b.contacts || [])]) {
    const k = `${ct.userId}:${ct.contactUserId}`;
    if (!contactSet.has(k)) {
      contactSet.add(k);
      contacts.push({ userId: ct.userId, contactUserId: ct.contactUserId });
    }
  }

  const blockSet = new Set<string>();
  const blocks: { blockerId: string; blockedUserId: string }[] = [];
  for (const bl of [...(a.blocks || []), ...(b.blocks || [])]) {
    const k = `${bl.blockerId}:${bl.blockedUserId}`;
    if (!blockSet.has(k)) {
      blockSet.add(k);
      blocks.push({ blockerId: bl.blockerId, blockedUserId: bl.blockedUserId });
    }
  }

  return {
    users: Array.from(userMap.values()),
    sessions,
    conversations: Array.from(convByPair.values()),
    messages: Array.from(msgMap.values()),
    media: Array.from(mediaMap.values()),
    statuses: Array.from(statusMap.values()),
    contacts,
    blocks,
  };
}

function normalizeParsedLocalState(rawObj: Record<string, unknown>): LocalState {
  const base = emptyState();
  const rawUsers = Array.isArray(rawObj.users) ? rawObj.users : [];
  base.users = rawUsers.map((u: Record<string, unknown>) => ({
    id: String(u.id || ''),
    fullName: String(u.fullName || ''),
    username: String(u.username || ''),
    email: String(u.email || ''),
    passwordDigest: String(u.passwordDigest || u.passwordHash || ''),
    recoveryDigest: String(u.recoveryDigest || u.recoveryCodeHash || ''),
    bio: String(u.bio || ''),
    avatarUrl: String(u.avatarUrl || ''),
    createdAt: String(u.createdAt || new Date().toISOString()),
    lastSeen: String(u.lastSeen || new Date().toISOString()),
    isOnline: Boolean(u.isOnline),
    usernameChangeTimestamps: Array.isArray(u.usernameChangeTimestamps)
      ? (u.usernameChangeTimestamps as string[])
      : [],
    privacy: (u.privacy as PrivacySettings) || {
      profilePicVisibility: 'everyone',
      lastSeenVisibility: 'everyone',
      readReceipts: true,
      statusPrivacy: 'everyone',
      whoCanContact: 'everyone',
    },
    notifications: (u.notifications as NotificationSettings) || {
      messageAlerts: true,
      soundEnabled: true,
      previewText: true,
    },
    chatSettings: (u.chatSettings as ChatSettings) || {
      enterToSend: true,
      fontSize: 'medium',
      autoDownloadImages: true,
    },
  }));

  if (Array.isArray(rawObj.sessions)) {
    for (const s of rawObj.sessions as Array<{ token?: string; userId?: string }>) {
      if (s && s.token && s.userId) {
        base.sessions[s.token] = s.userId;
      }
    }
  } else if (rawObj.sessions && typeof rawObj.sessions === 'object') {
    base.sessions = { ...(rawObj.sessions as Record<string, string>) };
  }
  if (rawObj.sessionsMap && typeof rawObj.sessionsMap === 'object') {
    base.sessions = { ...base.sessions, ...(rawObj.sessionsMap as Record<string, string>) };
  }

  base.conversations = Array.isArray(rawObj.conversations)
    ? (rawObj.conversations as StoredConversation[])
    : [];
  base.messages = Array.isArray(rawObj.messages) ? (rawObj.messages as StoredMessage[]) : [];
  base.media = Array.isArray(rawObj.media) ? (rawObj.media as StoredMedia[]) : [];
  base.statuses = Array.isArray(rawObj.statuses)
    ? (rawObj.statuses as StoredStatus[]).map((s) => ({ ...s, viewers: s.viewers || [] }))
    : [];
  base.contacts = Array.isArray(rawObj.contacts)
    ? (rawObj.contacts as { userId: string; contactUserId: string }[])
    : [];
  base.blocks = Array.isArray(rawObj.blocks)
    ? (rawObj.blocks as { blockerId: string; blockedUserId: string }[])
    : [];
  return base;
}

function readLocalState(): LocalState {
  const seedState = normalizeParsedLocalState(
    seedDatabaseRaw as unknown as Record<string, unknown>
  );
  let localState: LocalState = emptyState();

  try {
    const raw =
      localStorage.getItem(LOCAL_STORAGE_KEY) ||
      localStorage.getItem('lamavi_cloud_fallback_state_v2');
    if (raw) {
      localState = normalizeParsedLocalState(JSON.parse(raw));
    }
  } catch {
    // ignore
  }

  const resolved = mergeLocalStates(seedState, localState);
  const nowIso = new Date().toISOString();

  resolved.messages = (resolved.messages || []).filter((m) => !m.expiresAt || m.expiresAt > nowIso);
  resolved.media = (resolved.media || []).filter((med) => !med.expiresAt || med.expiresAt > nowIso);
  resolved.statuses = (resolved.statuses || []).filter((s) => !s.expiresAt || s.expiresAt > nowIso);

  return resolved;
}

function writeLocalState(state: LocalState): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    localStorage.removeItem('lamavi_cloud_fallback_state_v2');
  } catch {
    // ignore
  }
}

function toUserProfile(u: StoredUser, viewerId: string, state: LocalState): UserProfile {
  const isSelf = u.id === viewerId;
  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const recentChanges = (u.usernameChangeTimestamps || []).filter((ts) => ts > thirtyDaysAgo);
  const isBlocked = (state.blocks || []).some(
    (b) => b.blockerId === viewerId && b.blockedUserId === u.id
  );
  const isContact = (state.contacts || []).some(
    (c) => c.userId === viewerId && c.contactUserId === u.id
  );

  const connected =
    isSelf ||
    (state.contacts || []).some(
      (c) =>
        (c.userId === viewerId && c.contactUserId === u.id) ||
        (c.userId === u.id && c.contactUserId === viewerId)
    );
  const canSeeProfilePic =
    isSelf ||
    u.privacy.profilePicVisibility === 'everyone' ||
    (u.privacy.profilePicVisibility === 'contacts' && connected);
  const canSeeLastSeen =
    isSelf ||
    u.privacy.lastSeenVisibility === 'everyone' ||
    (u.privacy.lastSeenVisibility === 'contacts' && connected);

  return {
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    email: isSelf ? u.email : undefined,
    bio: u.bio,
    avatarUrl: canSeeProfilePic ? u.avatarUrl : '',
    isOnline: canSeeLastSeen ? u.isOnline : false,
    lastSeen: canSeeLastSeen ? u.lastSeen : null,
    createdAt: u.createdAt,
    usernameChangesRemaining: isSelf ? Math.max(0, 3 - recentChanges.length) : undefined,
    privacy: isSelf ? u.privacy : undefined,
    notifications: isSelf ? u.notifications : undefined,
    chatSettings: isSelf ? u.chatSettings : undefined,
    isContact,
    isBlocked,
  };
}

export function installLocalFallbackInterceptor() {
  const originalFetch = window.fetch.bind(window);

  const wrappedFetch: typeof window.fetch = async (input, init) => {
    const urlStr =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!urlStr.startsWith('/api/')) {
      return originalFetch(input, init);
    }

    const mergedHeaders = new Headers(init?.headers || {});
    try {
      const cachedUserRaw = localStorage.getItem('lamavi_current_user');
      if (cachedUserRaw && !mergedHeaders.has('X-Lamavi-User')) {
        mergedHeaders.set('X-Lamavi-User', cachedUserRaw);
      }
    } catch {
      // ignore
    }
    const nextInit: RequestInit = {
      ...init,
      headers: mergedHeaders,
    };

    const reqBodyObj =
      init?.body && typeof init.body === 'string'
        ? (() => {
            try {
              return JSON.parse(init.body) as Record<string, unknown>;
            } catch {
              return {};
            }
          })()
        : {};

    try {
      const response = await originalFetch(input, nextInit);
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        if (
          response.ok &&
          (urlStr.startsWith('/api/auth/register') ||
            urlStr.startsWith('/api/auth/login') ||
            urlStr.startsWith('/api/users/profile'))
        ) {
          response
            .clone()
            .json()
            .then(async (data) => {
              if (data && data.user) {
                const st = readLocalState();
                const existingIdx = st.users.findIndex(
                  (u) =>
                    u.id === data.user.id ||
                    u.username.toLowerCase() === String(data.user.username || '').toLowerCase()
                );
                const submittedPassword =
                  typeof reqBodyObj.password === 'string' ? reqBodyObj.password.trim() : '';
                const computedPwDigest = submittedPassword
                  ? await sha256Hex(submittedPassword)
                  : '';
                const computedRecDigest =
                  typeof data.recoveryCode === 'string' && data.recoveryCode
                    ? await sha256Hex(data.recoveryCode.trim().toUpperCase())
                    : '';

                const now = new Date().toISOString();
                const uObj: StoredUser = {
                  id: data.user.id,
                  fullName: data.user.fullName || '',
                  username: String(data.user.username || '').toLowerCase(),
                  email: String(
                    data.user.email ||
                      (typeof reqBodyObj.email === 'string' ? reqBodyObj.email : '') ||
                      (existingIdx >= 0 ? st.users[existingIdx].email : '')
                  ).toLowerCase(),
                  passwordDigest:
                    computedPwDigest ||
                    (existingIdx >= 0 ? st.users[existingIdx].passwordDigest : ''),
                  recoveryDigest:
                    computedRecDigest ||
                    (existingIdx >= 0 ? st.users[existingIdx].recoveryDigest : ''),
                  bio: data.user.bio || '',
                  avatarUrl: data.user.avatarUrl || '',
                  createdAt: data.user.createdAt || now,
                  lastSeen: now,
                  isOnline: true,
                  usernameChangeTimestamps: [],
                  privacy: data.user.privacy || {
                    profilePicVisibility: 'everyone',
                    lastSeenVisibility: 'everyone',
                    readReceipts: true,
                    statusPrivacy: 'everyone',
                    whoCanContact: 'everyone',
                  },
                  notifications: data.user.notifications || {
                    messageAlerts: true,
                    soundEnabled: true,
                    previewText: true,
                  },
                  chatSettings: data.user.chatSettings || {
                    enterToSend: true,
                    fontSize: 'medium',
                    autoDownloadImages: true,
                  },
                };
                if (existingIdx >= 0) {
                  st.users[existingIdx] = { ...st.users[existingIdx], ...uObj };
                } else {
                  st.users.push(uObj);
                }
                if (data.token) {
                  st.sessions[data.token] = data.user.id;
                }
                writeLocalState(st);
              }
            })
            .catch(() => {});
        }

        if (
          response.ok &&
          init?.method === 'POST' &&
          (urlStr.startsWith('/api/conversations/start') ||
            /^\/api\/conversations\/[^/]+\/messages$/.test(urlStr))
        ) {
          response
            .clone()
            .json()
            .then((data) => {
              const st = readLocalState();
              if (data.conversation && data.conversation.id && data.conversation.recipient) {
                const cachedUserRaw = localStorage.getItem('lamavi_current_user');
                const me = cachedUserRaw ? JSON.parse(cachedUserRaw) : null;
                if (me && me.id) {
                  const exists = st.conversations.some((c) => c.id === data.conversation.id);
                  if (!exists) {
                    st.conversations.push({
                      id: data.conversation.id,
                      participantIds: [me.id, data.conversation.recipient.id],
                      createdAt: data.conversation.createdAt || new Date().toISOString(),
                      updatedAt: data.conversation.updatedAt || new Date().toISOString(),
                      deletedBy: [],
                      clearedAt: {},
                    });
                  }
                }
              }
              if (data.message && data.message.id) {
                if (!st.messages.some((m) => m.id === data.message.id)) {
                  st.messages.push({
                    ...data.message,
                    expiresAt:
                      data.message.expiresAt ||
                      new Date(Date.now() + SEVEN_DAYS_MS).toISOString(),
                    deletedFor: [],
                    deletedForEveryone: false,
                  });
                }
                const c = st.conversations.find((cv) => cv.id === data.message.conversationId);
                if (c) {
                  c.updatedAt = data.message.createdAt;
                  c.deletedBy = [];
                }
              }
              writeLocalState(st);
              notifyRealtimeSync('message:sync', {
                conversationId: data.message?.conversationId || data.conversation?.id,
              });
            })
            .catch(() => {});
        }

        if (
          response.status === 401 &&
          (urlStr.startsWith('/api/auth/login') || urlStr.startsWith('/api/auth/recover'))
        ) {
          const fallbackAuthRes = await handleFallbackApiRequest(urlStr, nextInit);
          if (fallbackAuthRes.ok) {
            return fallbackAuthRes;
          }
        }

        if (
          response.status === 401 &&
          !urlStr.startsWith('/api/auth/login') &&
          !urlStr.startsWith('/api/auth/recover') &&
          !urlStr.startsWith('/api/auth/register')
        ) {
          const fallbackRes = await handleFallbackApiRequest(urlStr, nextInit);
          if (fallbackRes.ok) {
            return fallbackRes;
          }
        }

        if (urlStr.startsWith('/api/users/search') && response.ok) {
          const clone = response.clone();
          const data = await clone.json();
          if (data && data.result) {
            return response;
          }
          const fallbackRes = await handleFallbackApiRequest(urlStr, nextInit);
          const fallbackData = await fallbackRes.clone().json();
          if (fallbackData && fallbackData.result) {
            return fallbackRes;
          }
        }
        return response;
      }
      return response;
    } catch {
      // Network error reaching `/api/*` -> fall through to local handler
    }

    return handleFallbackApiRequest(urlStr, nextInit);
  };

  try {
    window.fetch = wrappedFetch;
  } catch {
    // ignore
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleFallbackApiRequest(urlStr: string, init?: RequestInit): Promise<Response> {
  const url = new URL(urlStr, window.location.origin);
  const pathname = url.pathname;
  const method = (init?.method || 'GET').toUpperCase();
  const bodyObj = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};

  const headers = new Headers(init?.headers || {});
  const authHeader = headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const state = readLocalState();
  let currentUserId = token ? state.sessions[token] : undefined;
  if (!currentUserId && token.startsWith('lmv.')) {
    const parts = token.split('.');
    if (parts.length >= 3) {
      currentUserId = parts[1];
    }
  }
  let currentUser = currentUserId ? state.users.find((u) => u.id === currentUserId) : undefined;
  if (!currentUser && token) {
    try {
      const cachedRaw = localStorage.getItem('lamavi_current_user');
      if (cachedRaw) {
        const cachedUser = JSON.parse(cachedRaw) as UserProfile;
        if (cachedUser && cachedUser.id) {
          currentUser = state.users.find(
            (u) =>
              u.id === cachedUser.id ||
              u.username.toLowerCase() === cachedUser.username.toLowerCase()
          );
          if (!currentUser) {
            const now = new Date().toISOString();
            const recovered: StoredUser = {
              id: cachedUser.id,
              fullName: cachedUser.fullName || cachedUser.username,
              username: cachedUser.username.toLowerCase(),
              email: (cachedUser.email || '').toLowerCase(),
              passwordDigest: '',
              recoveryDigest: '',
              bio: cachedUser.bio || '',
              avatarUrl: cachedUser.avatarUrl || '',
              createdAt: cachedUser.createdAt || now,
              lastSeen: now,
              isOnline: true,
              usernameChangeTimestamps: [],
              privacy: cachedUser.privacy || {
                profilePicVisibility: 'everyone',
                lastSeenVisibility: 'everyone',
                readReceipts: true,
                statusPrivacy: 'everyone',
                whoCanContact: 'everyone',
              },
              notifications: cachedUser.notifications || {
                messageAlerts: true,
                soundEnabled: true,
                previewText: true,
              },
              chatSettings: cachedUser.chatSettings || {
                enterToSend: true,
                fontSize: 'medium',
                autoDownloadImages: true,
              },
            };
            state.users.push(recovered);
            state.sessions[token] = recovered.id;
            writeLocalState(state);
            currentUser = recovered;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 1. Register
  if (pathname === '/api/auth/register' && method === 'POST') {
    const { fullName, username, email, password } = bodyObj;
    if (!fullName || String(fullName).trim().length < 2) {
      return jsonResponse(400, { error: 'Full real name is required (minimum 2 characters).' });
    }
    const cleanUsername = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9_.]{3,24}$/.test(cleanUsername)) {
      return jsonResponse(400, {
        error: 'Username must be 3–24 characters using letters, numbers, underscores, or periods.',
      });
    }
    if (state.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      return jsonResponse(409, { error: 'This username is already taken. Please choose another.' });
    }
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return jsonResponse(400, { error: 'A valid Gmail / email address is required.' });
    }
    if (state.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
      return jsonResponse(409, { error: 'An account with this email address already exists.' });
    }
    if (
      typeof password !== 'string' ||
      password.length !== 8 ||
      !/[a-zA-Z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      return jsonResponse(400, {
        error: 'Password must be 8 characters with at least one letter and one digit.',
      });
    }

    const recoveryCode = generateClientRecoveryCode();
    const passwordDigest = await sha256Hex(password.trim());
    const recoveryDigest = await sha256Hex(recoveryCode);
    const now = new Date().toISOString();

    const newUser: StoredUser = {
      id: `usr_${randomHex(8)}`,
      fullName: String(fullName).trim(),
      username: cleanUsername,
      email: cleanEmail,
      passwordDigest,
      recoveryDigest,
      bio: '',
      avatarUrl: '',
      createdAt: now,
      lastSeen: now,
      isOnline: true,
      usernameChangeTimestamps: [],
      privacy: {
        profilePicVisibility: 'everyone',
        lastSeenVisibility: 'everyone',
        readReceipts: true,
        statusPrivacy: 'everyone',
        whoCanContact: 'everyone',
      },
      notifications: { messageAlerts: true, soundEnabled: true, previewText: true },
      chatSettings: { enterToSend: true, fontSize: 'medium', autoDownloadImages: true },
    };

    const newToken = `lmv.${newUser.id}.${randomHex(24)}`;
    state.users.push(newUser);
    state.sessions[newToken] = newUser.id;
    writeLocalState(state);

    return jsonResponse(201, {
      token: newToken,
      user: toUserProfile(newUser, newUser.id, state),
      recoveryCode,
    });
  }

  // 2. Login
  if (pathname === '/api/auth/login' && method === 'POST') {
    const { identifier, password } = bodyObj;
    const cleanId = String(identifier || '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '');
    const rawPw = String(password || '');
    const pwCandidates = await Promise.all([
      sha256Hex(rawPw),
      sha256Hex(rawPw.trim()),
      sha256Hex(rawPw.trim().toLowerCase()),
      sha256Hex(rawPw.trim().toUpperCase()),
    ]);
    const user = state.users.find((u) => {
      const uname = u.username.toLowerCase();
      const uemail = (u.email || '').toLowerCase();
      const emailPrefix = uemail.includes('@') ? uemail.split('@')[0] : '';
      return (
        uname === cleanId ||
        uemail === cleanId ||
        uemail === `${cleanId}@gmail.com` ||
        (emailPrefix && emailPrefix === cleanId)
      );
    });
    if (!user || !pwCandidates.includes(user.passwordDigest)) {
      return jsonResponse(401, { error: 'Incorrect username/Gmail or password.' });
    }
    user.lastSeen = new Date().toISOString();
    user.isOnline = true;
    const newToken = `lmv.${user.id}.${randomHex(24)}`;
    state.sessions[newToken] = user.id;
    writeLocalState(state);
    return jsonResponse(200, {
      token: newToken,
      user: toUserProfile(user, user.id, state),
    });
  }

  // 3. Recover
  if (pathname === '/api/auth/recover' && method === 'POST') {
    const { identifier, recoveryCode, newPassword } = bodyObj;
    const cleanId = String(identifier || '')
      .trim()
      .toLowerCase()
      .replace(/^@/, '');
    const recDigest = await sha256Hex(String(recoveryCode || '').trim().toUpperCase());
    const user = state.users.find((u) => {
      const uname = u.username.toLowerCase();
      const uemail = (u.email || '').toLowerCase();
      const emailPrefix = uemail.includes('@') ? uemail.split('@')[0] : '';
      return (
        uname === cleanId ||
        uemail === cleanId ||
        uemail === `${cleanId}@gmail.com` ||
        (emailPrefix && emailPrefix === cleanId)
      );
    });
    if (!user || user.recoveryDigest !== recDigest) {
      return jsonResponse(401, { error: 'Invalid account identifier or recovery code.' });
    }
    user.passwordDigest = await sha256Hex(String(newPassword).trim());
    writeLocalState(state);
    return jsonResponse(200, { message: 'Password updated! You can now log in.' });
  }

  if (!currentUser) {
    return jsonResponse(401, { error: 'Authentication required.' });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    currentUser.lastSeen = new Date().toISOString();
    currentUser.isOnline = true;
    writeLocalState(state);
    return jsonResponse(200, { user: toUserProfile(currentUser, currentUser.id, state) });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    delete state.sessions[token];
    writeLocalState(state);
    return jsonResponse(200, { success: true });
  }

  // Profile update
  if (pathname === '/api/users/profile' && method === 'PUT') {
    const { fullName, username, email, bio, avatarUrl, privacy, notifications, chatSettings } =
      bodyObj;

    if (fullName !== undefined) {
      currentUser.fullName = String(fullName).trim();
    }
    if (username !== undefined) {
      const cleanU = String(username).trim().toLowerCase();
      if (cleanU !== currentUser.username.toLowerCase()) {
        if (state.users.some((u) => u.id !== currentUser.id && u.username === cleanU)) {
          return jsonResponse(409, { error: 'Username is already taken by another user.' });
        }
        const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
        const recent = (currentUser.usernameChangeTimestamps || []).filter(
          (ts) => ts > thirtyDaysAgo
        );
        if (recent.length >= 3) {
          return jsonResponse(429, {
            error: 'You can only change your username 3 times per month (30 days).',
          });
        }
        currentUser.username = cleanU;
        currentUser.usernameChangeTimestamps = [...recent, new Date().toISOString()];
      }
    }
    if (email !== undefined) {
      const cleanE = String(email).trim().toLowerCase();
      if (!cleanE || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanE)) {
        return jsonResponse(400, { error: 'A valid Gmail / email address is required.' });
      }
      if (state.users.some((u) => u.id !== currentUser.id && u.email === cleanE)) {
        return jsonResponse(409, { error: 'Email is already registered to another account.' });
      }
      currentUser.email = cleanE;
    }
    if (bio !== undefined) currentUser.bio = String(bio).trim().slice(0, 160);
    if (avatarUrl !== undefined) currentUser.avatarUrl = String(avatarUrl);
    if (privacy) currentUser.privacy = { ...currentUser.privacy, ...privacy };
    if (notifications)
      currentUser.notifications = { ...currentUser.notifications, ...notifications };
    if (chatSettings) currentUser.chatSettings = { ...currentUser.chatSettings, ...chatSettings };

    currentUser.lastSeen = new Date().toISOString();
    writeLocalState(state);
    return jsonResponse(200, { user: toUserProfile(currentUser, currentUser.id, state) });
  }

  // Search
  if (pathname === '/api/users/search' && method === 'GET') {
    const rawQ = (url.searchParams.get('q') || '').trim().toLowerCase();
    const normQ = rawQ.startsWith('@') ? rawQ.slice(1).trim() : rawQ;
    let found = state.users.find((u) => {
      if (u.id === currentUser.id) return false;
      const uname = (u.username || '').trim().toLowerCase();
      const uemail = (u.email || '').trim().toLowerCase();
      const emailPrefix = uemail.includes('@') ? uemail.split('@')[0] : '';
      return (
        uname === normQ ||
        uemail === normQ ||
        uemail === `${normQ}@gmail.com` ||
        (emailPrefix && emailPrefix === normQ)
      );
    });
    if (!found) {
      found = state.users.find((u) => {
        if (u.id === currentUser.id) return false;
        const uname = (u.username || '').trim().toLowerCase();
        const uemail = (u.email || '').trim().toLowerCase();
        const fname = (u.fullName || '').trim().toLowerCase();
        return (
          uname.includes(normQ) ||
          normQ.includes(uname) ||
          uemail.includes(normQ) ||
          fname === normQ ||
          fname.includes(normQ)
        );
      });
    }
    const matchingUsers = state.users
      .filter((u) => {
        if (u.id === currentUser.id) return false;
        const uname = (u.username || '').trim().toLowerCase();
        const uemail = (u.email || '').trim().toLowerCase();
        const fname = (u.fullName || '').trim().toLowerCase();
        return (
          uname.includes(normQ) ||
          normQ.includes(uname) ||
          uemail.includes(normQ) ||
          fname.includes(normQ)
        );
      })
      .map((u) => toUserProfile(u, currentUser.id, state));

    if (!found) {
      const isSelfSearch =
        currentUser.username.toLowerCase() === normQ ||
        (currentUser.email && currentUser.email.toLowerCase() === normQ);
      if (isSelfSearch) {
        return jsonResponse(400, {
          error: 'This is your own account! Enter the other person’s username or Gmail to connect.',
        });
      }
      return jsonResponse(200, { result: null, results: [] });
    }
    return jsonResponse(200, {
      result: toUserProfile(found, currentUser.id, state),
      results: matchingUsers,
    });
  }

  // Contacts
  if (pathname === '/api/contacts' && method === 'GET') {
    const contactIds = new Set<string>();
    for (const c of state.contacts) {
      if (c.userId === currentUser.id) contactIds.add(c.contactUserId);
    }
    const contacts = Array.from(contactIds)
      .map((id) => state.users.find((u) => u.id === id))
      .filter((u): u is StoredUser => !!u)
      .map((u) => ({ ...toUserProfile(u, currentUser.id, state), isContact: true }));
    const blockedUsers = state.blocks
      .filter((b) => b.blockerId === currentUser.id)
      .map((b) => state.users.find((u) => u.id === b.blockedUserId))
      .filter((u): u is StoredUser => !!u)
      .map((u) => toUserProfile(u, currentUser.id, state));
    return jsonResponse(200, { contacts, blockedUsers });
  }

  if (pathname === '/api/contacts/add' && method === 'POST') {
    const { targetUserId, targetUser } = bodyObj;
    let target = state.users.find((u) => u.id === targetUserId);
    if (!target && targetUser && targetUser.id && targetUser.username) {
      const now = new Date().toISOString();
      target = {
        id: String(targetUser.id),
        fullName: String(targetUser.fullName || targetUser.username),
        username: String(targetUser.username).toLowerCase(),
        email: String(targetUser.email || `${targetUser.username}@gmail.com`).toLowerCase(),
        passwordDigest: '',
        recoveryDigest: '',
        bio: String(targetUser.bio || ''),
        avatarUrl: String(targetUser.avatarUrl || ''),
        createdAt: now,
        lastSeen: now,
        isOnline: Boolean(targetUser.isOnline),
        usernameChangeTimestamps: [],
        privacy: {
          profilePicVisibility: 'everyone',
          lastSeenVisibility: 'everyone',
          readReceipts: true,
          statusPrivacy: 'everyone',
          whoCanContact: 'everyone',
        },
        notifications: { messageAlerts: true, soundEnabled: true, previewText: true },
        chatSettings: { enterToSend: true, fontSize: 'medium', autoDownloadImages: true },
      };
      state.users.push(target);
    }
    if (!target) return jsonResponse(404, { error: 'User not found.' });
    if (
      !state.contacts.some(
        (c) => c.userId === currentUser.id && c.contactUserId === targetUserId
      )
    ) {
      state.contacts.push({ userId: currentUser.id, contactUserId: targetUserId });
      writeLocalState(state);
    }
    return jsonResponse(200, {
      contact: { ...toUserProfile(target, currentUser.id, state), isContact: true },
    });
  }

  if (pathname === '/api/contacts/remove' && method === 'POST') {
    const { targetUserId } = bodyObj;
    if (!targetUserId) {
      return jsonResponse(400, { error: 'Target user ID is required to unconnect.' });
    }
    state.contacts = state.contacts.filter(
      (c) => !(c.userId === currentUser.id && c.contactUserId === targetUserId)
    );
    writeLocalState(state);
    return jsonResponse(200, { success: true, targetUserId });
  }

  if (pathname === '/api/users/block' && method === 'POST') {
    const { targetUserId } = bodyObj;
    if (
      targetUserId &&
      !state.blocks.some(
        (b) => b.blockerId === currentUser.id && b.blockedUserId === targetUserId
      )
    ) {
      state.blocks.push({ blockerId: currentUser.id, blockedUserId: targetUserId });
      writeLocalState(state);
    }
    return jsonResponse(200, { success: true });
  }

  if (pathname === '/api/users/unblock' && method === 'POST') {
    const { targetUserId } = bodyObj;
    state.blocks = state.blocks.filter(
      (b) => !(b.blockerId === currentUser.id && b.blockedUserId === targetUserId)
    );
    writeLocalState(state);
    return jsonResponse(200, { success: true });
  }

  // Conversations
  if (pathname === '/api/conversations' && method === 'GET') {
    const list: ConversationItem[] = state.conversations
      .filter(
        (c) =>
          c.participantIds.includes(currentUser.id) && !c.deletedBy.includes(currentUser.id)
      )
      .map((c) => {
        const otherId =
          c.participantIds[0] === currentUser.id ? c.participantIds[1] : c.participantIds[0];
        const otherUser = state.users.find((u) => u.id === otherId);
        const clearedAfter = c.clearedAt[currentUser.id] || '';
        const msgs = state.messages
          .filter(
            (m) =>
              m.conversationId === c.id &&
              !m.deletedFor.includes(currentUser.id) &&
              (!clearedAfter || m.createdAt > clearedAfter)
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const lastMsgRaw = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        const lastMsg = lastMsgRaw
          ? ({
              ...lastMsgRaw,
              text: lastMsgRaw.deletedForEveryone ? 'This message was deleted' : lastMsgRaw.text,
              imageId: lastMsgRaw.deletedForEveryone ? undefined : lastMsgRaw.imageId,
              isDeletedPlaceholder: lastMsgRaw.deletedForEveryone,
            } as unknown as MessageItem)
          : null;
        const unreadCount = msgs.filter(
          (m) => m.senderId !== currentUser.id && m.status !== 'read' && !m.deletedForEveryone
        ).length;
        return {
          id: c.id,
          createdAt: c.createdAt,
          updatedAt: lastMsg ? lastMsg.createdAt : c.updatedAt,
          recipient: otherUser
            ? toUserProfile(otherUser, currentUser.id, state)
            : {
                id: otherId,
                fullName: 'Deleted Account',
                username: 'deleted',
                bio: '',
                avatarUrl: '',
                isOnline: false,
                lastSeen: null,
              },
          lastMessage: lastMsg,
          unreadCount,
          blockedByMe: state.blocks.some(
            (b) => b.blockerId === currentUser.id && b.blockedUserId === otherId
          ),
          blockedByThem: state.blocks.some(
            (b) => b.blockerId === otherId && b.blockedUserId === currentUser.id
          ),
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return jsonResponse(200, { conversations: list });
  }

  if (pathname === '/api/conversations/start' && method === 'POST') {
    const { recipientId, targetUser } = bodyObj;
    let recipient = state.users.find((u) => u.id === recipientId);
    if (!recipient && targetUser && targetUser.id && targetUser.username) {
      const now = new Date().toISOString();
      recipient = {
        id: String(targetUser.id),
        fullName: String(targetUser.fullName || targetUser.username),
        username: String(targetUser.username).toLowerCase(),
        email: String(targetUser.email || `${targetUser.username}@gmail.com`).toLowerCase(),
        passwordDigest: '',
        recoveryDigest: '',
        bio: String(targetUser.bio || ''),
        avatarUrl: String(targetUser.avatarUrl || ''),
        createdAt: now,
        lastSeen: now,
        isOnline: Boolean(targetUser.isOnline),
        usernameChangeTimestamps: [],
        privacy: {
          profilePicVisibility: 'everyone',
          lastSeenVisibility: 'everyone',
          readReceipts: true,
          statusPrivacy: 'everyone',
          whoCanContact: 'everyone',
        },
        notifications: { messageAlerts: true, soundEnabled: true, previewText: true },
        chatSettings: { enterToSend: true, fontSize: 'medium', autoDownloadImages: true },
      };
      state.users.push(recipient);
    }
    if (!recipient) return jsonResponse(404, { error: 'User not found.' });

    let conv = state.conversations.find(
      (c) =>
        c.participantIds.includes(currentUser.id) && c.participantIds.includes(recipient.id)
    );
    const now = new Date().toISOString();
    if (!conv) {
      const sortedPair = [currentUser.id, recipient.id].sort() as [string, string];
      const canonicalId = await getDeterministicClientConvId(currentUser.id, recipient.id);
      conv = {
        id: canonicalId,
        participantIds: sortedPair,
        createdAt: now,
        updatedAt: now,
        deletedBy: [],
        clearedAt: {},
      };
      state.conversations.push(conv);
    } else {
      conv.deletedBy = conv.deletedBy.filter((id) => id !== currentUser.id);
    }
    writeLocalState(state);
    notifyRealtimeSync('message:sync', { conversationId: conv.id });
    return jsonResponse(200, {
      conversation: {
        id: conv.id,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        recipient: toUserProfile(recipient, currentUser.id, state),
        lastMessage: null,
        unreadCount: 0,
        blockedByMe: false,
        blockedByThem: false,
      },
    });
  }

  const msgMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (msgMatch) {
    const requestedConvId = msgMatch[1];
    let conv = state.conversations.find((c) => c.id === requestedConvId);
    if (!conv && method === 'POST' && bodyObj.recipientId) {
      const recId = String(bodyObj.recipientId);
      const canonicalId = await getDeterministicClientConvId(currentUser.id, recId);
      conv = state.conversations.find(
        (c) =>
          c.id === canonicalId ||
          (c.participantIds.includes(currentUser.id) && c.participantIds.includes(recId))
      );
      if (!conv) {
        const nowStr = new Date().toISOString();
        const sortedPair = [currentUser.id, recId].sort() as [string, string];
        conv = {
          id: canonicalId,
          participantIds: sortedPair,
          createdAt: nowStr,
          updatedAt: nowStr,
          deletedBy: [],
          clearedAt: {},
        };
        state.conversations.push(conv);
      }
    }
    if (!conv || !conv.participantIds.includes(currentUser.id)) {
      return jsonResponse(403, { error: 'Unauthorized.' });
    }
    const convId = conv.id;
    if (method === 'GET') {
      const clearedAfter = conv.clearedAt[currentUser.id] || '';
      const messages = state.messages
        .filter(
          (m) =>
            m.conversationId === convId &&
            !m.deletedFor.includes(currentUser.id) &&
            (!clearedAfter || m.createdAt > clearedAfter)
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((m) => ({
          ...m,
          text: m.deletedForEveryone ? 'This message was deleted' : m.text,
          imageId: m.deletedForEveryone ? undefined : m.imageId,
          isDeletedPlaceholder: m.deletedForEveryone,
        }));
      return jsonResponse(200, { messages, conversationId: convId });
    }
    if (method === 'POST') {
      const { text, imageId, replyToMessageId, clientTempId } = bodyObj;
      const now = new Date();
      const nowIso = now.toISOString();
      const newMsg: StoredMessage = {
        id: `msg_${randomHex(8)}`,
        clientTempId: clientTempId ? String(clientTempId) : undefined,
        conversationId: convId,
        senderId: currentUser.id,
        text: String(text || '').trim(),
        imageId: imageId ? String(imageId) : undefined,
        replyToMessageId: replyToMessageId ? String(replyToMessageId) : undefined,
        createdAt: nowIso,
        expiresAt: new Date(now.getTime() + SEVEN_DAYS_MS).toISOString(),
        status: 'delivered',
        deliveredAt: nowIso,
        deletedFor: [],
        deletedForEveryone: false,
      };
      conv.updatedAt = nowIso;
      conv.deletedBy = [];
      state.messages.push(newMsg);
      writeLocalState(state);
      notifyRealtimeSync('message:new', { conversationId: convId, message: newMsg });
      return jsonResponse(201, { message: newMsg });
    }
  }

  const readMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/read$/);
  if (readMatch && method === 'POST') {
    const convId = readMatch[1];
    const nowIso = new Date().toISOString();
    let changed = false;
    for (const m of state.messages) {
      if (m.conversationId === convId && m.senderId !== currentUser.id && m.status !== 'read') {
        m.status = 'read';
        m.readAt = nowIso;
        changed = true;
      }
    }
    if (changed) writeLocalState(state);
    return jsonResponse(200, { success: true });
  }

  const clearMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/clear$/);
  if (clearMatch && method === 'POST') {
    const conv = state.conversations.find((c) => c.id === clearMatch[1]);
    if (conv) {
      conv.clearedAt[currentUser.id] = new Date().toISOString();
      writeLocalState(state);
    }
    return jsonResponse(200, { success: true });
  }

  const delConvMatch = pathname.match(/^\/api\/conversations\/([^/]+)$/);
  if (delConvMatch && method === 'DELETE') {
    const conv = state.conversations.find((c) => c.id === delConvMatch[1]);
    if (conv) {
      conv.clearedAt[currentUser.id] = new Date().toISOString();
      if (!conv.deletedBy.includes(currentUser.id)) {
        conv.deletedBy.push(currentUser.id);
      }
      writeLocalState(state);
    }
    return jsonResponse(200, { success: true });
  }

  const delMsgMatch = pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (delMsgMatch && method === 'DELETE') {
    const msg = state.messages.find((m) => m.id === delMsgMatch[1]);
    const mode = url.searchParams.get('mode') === 'everyone' ? 'everyone' : 'me';
    if (msg) {
      if (mode === 'everyone' && msg.senderId === currentUser.id) {
        msg.deletedForEveryone = true;
        msg.text = '';
        msg.imageId = undefined;
      } else if (!msg.deletedFor.includes(currentUser.id)) {
        msg.deletedFor.push(currentUser.id);
      }
      writeLocalState(state);
    }
    return jsonResponse(200, { success: true });
  }

  // Media
  if (pathname === '/api/media' && method === 'POST') {
    const { dataBase64, mimeType, conversationId, statusId } = bodyObj;
    const now = new Date();
    const rawStr = String(dataBase64 || '');
    const media: StoredMedia = {
      id: `med_${randomHex(8)}`,
      ownerId: currentUser.id,
      conversationId: conversationId ? String(conversationId) : undefined,
      statusId: statusId ? String(statusId) : undefined,
      mimeType: String(mimeType || 'image/jpeg'),
      dataBase64: rawStr,
      sizeBytes: Math.ceil((rawStr.length * 3) / 4),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SEVEN_DAYS_MS).toISOString(),
    };
    state.media.push(media);
    writeLocalState(state);
    return jsonResponse(201, { mediaId: media.id, sizeBytes: media.sizeBytes });
  }

  const getMediaMatch = pathname.match(/^\/api\/media\/([^/]+)$/);
  if (getMediaMatch && method === 'GET') {
    const med = state.media.find((m) => m.id === getMediaMatch[1]);
    if (!med) return jsonResponse(404, { error: 'Media not found.' });
    return jsonResponse(200, med);
  }

  // Statuses
  if (pathname === '/api/statuses' && method === 'GET') {
    const list: StatusItem[] = state.statuses.map((s) => {
      const owner = state.users.find((u) => u.id === s.userId);
      const viewedByMe = s.viewers.some((v) => v.viewerId === currentUser.id);
      return {
        id: s.id,
        userId: s.userId,
        type: s.type,
        text: s.text,
        backgroundColor: s.backgroundColor,
        textColor: s.textColor,
        imageId: s.imageId,
        privacy: s.privacy,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        user: owner ? toUserProfile(owner, currentUser.id, state) : null,
        viewedByMe,
        viewCount: s.userId === currentUser.id ? s.viewers.length : undefined,
      };
    });
    return jsonResponse(200, { statuses: list });
  }

  if (pathname === '/api/statuses' && method === 'POST') {
    const { type, text, backgroundColor, textColor, imageId, privacy } = bodyObj;
    const now = new Date();
    const newStatus: StoredStatus = {
      id: `sts_${randomHex(8)}`,
      userId: currentUser.id,
      type: type === 'image' ? 'image' : 'text',
      text: String(text || '').trim(),
      backgroundColor: String(backgroundColor || '#F2F2F7'),
      textColor: String(textColor || '#1C1C1E'),
      imageId: imageId ? String(imageId) : undefined,
      privacy: privacy === 'contacts' ? 'contacts' : 'everyone',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      viewers: [],
    };
    state.statuses.push(newStatus);
    writeLocalState(state);
    return jsonResponse(201, { status: newStatus });
  }

  if (pathname === '/api/storage/stats' && method === 'GET') {
    const myConvIds = new Set(
      state.conversations
        .filter((c) => c.participantIds.includes(currentUser.id))
        .map((c) => c.id)
    );
    return jsonResponse(200, {
      conversationsCount: myConvIds.size,
      messageCount: state.messages.filter((m) => myConvIds.has(m.conversationId)).length,
      mediaCount: state.media.filter((m) => m.ownerId === currentUser.id).length,
      totalMediaBytes: state.media
        .filter((m) => m.ownerId === currentUser.id)
        .reduce((acc, m) => acc + m.sizeBytes, 0),
      retentionDays: 7,
    });
  }

  if (pathname === '/api/users/account' && method === 'DELETE') {
    state.users = state.users.filter((u) => u.id !== currentUser.id);
    delete state.sessions[token];
    writeLocalState(state);
    return jsonResponse(200, { success: true });
  }

  return jsonResponse(200, { ok: true });
}
