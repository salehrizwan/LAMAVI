import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db as clientDb } from '../firebase';
import {
  UserProfile,
  ConversationItem,
  MessageItem,
  StatusItem,
  PrivacySettings,
  NotificationSettings,
  ChatSettings,
} from '../types';

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

interface CloudState {
  users: StoredUser[];
  sessions: Record<string, string>; // token -> userId
  conversations: StoredConversation[];
  messages: StoredMessage[];
  media: StoredMedia[];
  statuses: StoredStatus[];
  contacts: { userId: string; contactUserId: string }[];
  blocks: { blockerId: string; blockedUserId: string }[];
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const LOCAL_CLOUD_KEY = 'lamavi_cloud_fallback_state_v2';

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

function emptyState(): CloudState {
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

function mergeCloudStates(a: CloudState, b: CloudState): CloudState {
  const userMap = new Map<string, StoredUser>();
  for (const u of [...(a.users || []), ...(b.users || [])]) {
    const key = (u.username || '').toLowerCase();
    if (!key) continue;
    const prev = userMap.get(key);
    if (!prev) {
      userMap.set(key, u);
    } else {
      userMap.set(key, {
        ...prev,
        ...u,
        id: prev.id || u.id,
        avatarUrl: u.avatarUrl || prev.avatarUrl,
        bio: u.bio || prev.bio,
        fullName: u.fullName || prev.fullName,
        passwordDigest: u.passwordDigest || prev.passwordDigest,
        recoveryDigest: u.recoveryDigest || prev.recoveryDigest,
      });
    }
  }

  const sessions: Record<string, string> = {
    ...(a.sessions || {}),
    ...(b.sessions || {}),
  };

  const convMap = new Map<string, StoredConversation>();
  for (const c of [...(a.conversations || []), ...(b.conversations || [])]) {
    convMap.set(c.id, c);
  }

  const msgMap = new Map<string, StoredMessage>();
  for (const m of [...(a.messages || []), ...(b.messages || [])]) {
    msgMap.set(m.id, m);
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
    conversations: Array.from(convMap.values()),
    messages: Array.from(msgMap.values()),
    media: Array.from(mediaMap.values()),
    statuses: Array.from(statusMap.values()),
    contacts,
    blocks,
  };
}

function normalizeParsedCloudState(rawObj: Record<string, unknown>): CloudState {
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

async function readCloudState(): Promise<CloudState> {
  let cloudState: CloudState = emptyState();
  let localState: CloudState = emptyState();

  try {
    const raw = localStorage.getItem(LOCAL_CLOUD_KEY);
    if (raw) {
      localState = normalizeParsedCloudState(JSON.parse(raw));
    }
  } catch {
    // ignore
  }

  try {
    const snap = await getDoc(doc(clientDb, 'lamavi_public', 'app_state'));
    if (snap.exists()) {
      const data = snap.data();
      if (data && typeof data.stateJson === 'string') {
        cloudState = normalizeParsedCloudState(JSON.parse(data.stateJson));
      }
    }
  } catch {
    // Fallback to localStorage if offline
  }

  const resolved = mergeCloudStates(cloudState, localState);
  const nowIso = new Date().toISOString();

  // Enforce 7-day message/media expiration & 24-hour status expiration
  resolved.messages = (resolved.messages || []).filter((m) => !m.expiresAt || m.expiresAt > nowIso);
  resolved.media = (resolved.media || []).filter((med) => !med.expiresAt || med.expiresAt > nowIso);
  resolved.statuses = (resolved.statuses || []).filter((s) => !s.expiresAt || s.expiresAt > nowIso);

  // If local had users that weren't in cloud yet, push merged state back to cloud
  if (resolved.users.length > cloudState.users.length) {
    writeCloudState(resolved).catch(() => {});
  }

  return resolved;
}

async function writeCloudState(state: CloudState): Promise<void> {
  try {
    localStorage.setItem(LOCAL_CLOUD_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
  try {
    const trimmedState: CloudState = {
      ...state,
      media: state.media.slice(-8),
    };
    const stateJson = JSON.stringify(trimmedState);
    if (stateJson.length < 950000) {
      await setDoc(doc(clientDb, 'lamavi_public', 'app_state'), {
        stateJson,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch {
    // ignore if offline
  }
}

function toUserProfile(u: StoredUser, viewerId: string, state: CloudState): UserProfile {
  const isSelf = u.id === viewerId;
  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const recentChanges = (u.usernameChangeTimestamps || []).filter((ts) => ts > thirtyDaysAgo);
  const isBlocked = (state.blocks || []).some(
    (b) => b.blockerId === viewerId && b.blockedUserId === u.id
  );
  const isContact = (state.contacts || []).some(
    (c) => c.userId === viewerId && c.contactUserId === u.id
  );

  return {
    id: u.id,
    fullName: u.fullName,
    username: u.username,
    email: isSelf ? u.email : undefined,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    isOnline: u.isOnline,
    lastSeen: u.lastSeen,
    createdAt: u.createdAt,
    usernameChangesRemaining: isSelf ? Math.max(0, 3 - recentChanges.length) : undefined,
    privacy: isSelf ? u.privacy : undefined,
    notifications: isSelf ? u.notifications : undefined,
    chatSettings: isSelf ? u.chatSettings : undefined,
    isContact,
    isBlocked,
  };
}

// Intercept `/api/*` calls automatically when running on a static host where the backend returns 404/HTML or throws a network error, and also sync any local device accounts up to Firestore on boot
export function installServerlessFallbackInterceptor() {
  // Immediately sync any locally stored accounts on this device to Firestore so other devices can find them
  readCloudState().catch(() => {});

  const originalFetch = window.fetch.bind(window);

  const wrappedFetch: typeof window.fetch = async (input, init) => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!urlStr.startsWith('/api/')) {
      return originalFetch(input, init);
    }

    try {
      const response = await originalFetch(input, init);
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        // If this was a user search that returned null on the backend, also check client cloud state as a safety net
        if (urlStr.startsWith('/api/users/search') && response.ok) {
          const clone = response.clone();
          const data = await clone.json();
          if (data && data.result) {
            return response;
          }
          // Try client cloud fallback if server returned null
          const fallbackRes = await handleFallbackApiRequest(urlStr, init);
          const fallbackData = await fallbackRes.clone().json();
          if (fallbackData && fallbackData.result) {
            return fallbackRes;
          }
        }
        return response;
      }
    } catch {
      // Network error reaching `/api/*` -> fall through to Firebase Cloud handler
    }

    return handleFallbackApiRequest(urlStr, init);
  };

  try {
    window.fetch = wrappedFetch;
  } catch {
    // ignore if locked by extension
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

  const state = await readCloudState();
  const currentUserId = token ? state.sessions[token] : undefined;
  const currentUser = currentUserId ? state.users.find((u) => u.id === currentUserId) : undefined;

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
    const passwordDigest = await sha256Hex(password);
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

    const newToken = randomHex(24);
    state.users.push(newUser);
    state.sessions[newToken] = newUser.id;
    await writeCloudState(state);

    return jsonResponse(201, {
      token: newToken,
      user: toUserProfile(newUser, newUser.id, state),
      recoveryCode,
    });
  }

  // 2. Login
  if (pathname === '/api/auth/login' && method === 'POST') {
    const { identifier, password } = bodyObj;
    const cleanId = String(identifier || '').trim().toLowerCase();
    const pwDigest = await sha256Hex(String(password || ''));
    const user = state.users.find(
      (u) => u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId
    );
    if (!user || user.passwordDigest !== pwDigest) {
      return jsonResponse(401, { error: 'Incorrect username/Gmail or password.' });
    }
    user.lastSeen = new Date().toISOString();
    user.isOnline = true;
    const newToken = randomHex(24);
    state.sessions[newToken] = user.id;
    await writeCloudState(state);
    return jsonResponse(200, {
      token: newToken,
      user: toUserProfile(user, user.id, state),
    });
  }

  // 3. Recover
  if (pathname === '/api/auth/recover' && method === 'POST') {
    const { identifier, recoveryCode, newPassword } = bodyObj;
    const cleanId = String(identifier || '').trim().toLowerCase();
    const recDigest = await sha256Hex(String(recoveryCode || '').trim().toUpperCase());
    const user = state.users.find(
      (u) => u.username.toLowerCase() === cleanId || u.email.toLowerCase() === cleanId
    );
    if (!user || user.recoveryDigest !== recDigest) {
      return jsonResponse(401, { error: 'Invalid account identifier or recovery code.' });
    }
    user.passwordDigest = await sha256Hex(String(newPassword));
    await writeCloudState(state);
    return jsonResponse(200, { message: 'Password updated! You can now log in.' });
  }

  if (!currentUser) {
    return jsonResponse(401, { error: 'Authentication required.' });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    currentUser.lastSeen = new Date().toISOString();
    currentUser.isOnline = true;
    await writeCloudState(state);
    return jsonResponse(200, { user: toUserProfile(currentUser, currentUser.id, state) });
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    delete state.sessions[token];
    await writeCloudState(state);
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

    await writeCloudState(state);
    return jsonResponse(200, { user: toUserProfile(currentUser, currentUser.id, state) });
  }

  // Search
  if (pathname === '/api/users/search' && method === 'GET') {
    const rawQ = (url.searchParams.get('q') || '').trim().toLowerCase();
    const normQ = rawQ.startsWith('@') ? rawQ.slice(1).trim() : rawQ;
    const found = state.users.find((u) => {
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
    if (!found) return jsonResponse(200, { result: null });
    if (found.id === currentUser.id) {
      return jsonResponse(400, { error: 'You cannot start a conversation with yourself.' });
    }
    return jsonResponse(200, { result: toUserProfile(found, currentUser.id, state) });
  }

  // Contacts
  if (pathname === '/api/contacts' && method === 'GET') {
    const contactIds = new Set<string>();
    for (const c of state.contacts) {
      if (c.userId === currentUser.id) contactIds.add(c.contactUserId);
    }
    for (const conv of state.conversations) {
      if (conv.participantIds.includes(currentUser.id)) {
        const other =
          conv.participantIds[0] === currentUser.id
            ? conv.participantIds[1]
            : conv.participantIds[0];
        contactIds.add(other);
      }
    }
    const contacts = Array.from(contactIds)
      .map((id) => state.users.find((u) => u.id === id))
      .filter((u): u is StoredUser => !!u)
      .map((u) => toUserProfile(u, currentUser.id, state));
    const blockedUsers = state.blocks
      .filter((b) => b.blockerId === currentUser.id)
      .map((b) => state.users.find((u) => u.id === b.blockedUserId))
      .filter((u): u is StoredUser => !!u)
      .map((u) => toUserProfile(u, currentUser.id, state));
    return jsonResponse(200, { contacts, blockedUsers });
  }

  if (pathname === '/api/contacts/add' && method === 'POST') {
    const { targetUserId } = bodyObj;
    const target = state.users.find((u) => u.id === targetUserId);
    if (!target) return jsonResponse(404, { error: 'User not found.' });
    if (
      !state.contacts.some(
        (c) => c.userId === currentUser.id && c.contactUserId === targetUserId
      )
    ) {
      state.contacts.push({ userId: currentUser.id, contactUserId: targetUserId });
      await writeCloudState(state);
    }
    return jsonResponse(200, { contact: toUserProfile(target, currentUser.id, state) });
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
        const lastMsg = msgs.length > 0 ? (msgs[msgs.length - 1] as unknown as MessageItem) : null;
        const unreadCount = msgs.filter(
          (m) => m.senderId !== currentUser.id && m.status !== 'read'
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
    const { recipientId } = bodyObj;
    const recipient = state.users.find((u) => u.id === recipientId);
    if (!recipient) return jsonResponse(404, { error: 'No user found.' });
    let conv = state.conversations.find(
      (c) =>
        c.participantIds.includes(currentUser.id) && c.participantIds.includes(recipientId)
    );
    const now = new Date().toISOString();
    if (!conv) {
      conv = {
        id: `conv_${randomHex(8)}`,
        participantIds: [currentUser.id, recipientId],
        createdAt: now,
        updatedAt: now,
        deletedBy: [],
        clearedAt: {},
      };
      state.conversations.push(conv);
    } else {
      conv.deletedBy = conv.deletedBy.filter((id) => id !== currentUser.id);
    }
    if (
      !state.contacts.some(
        (c) => c.userId === currentUser.id && c.contactUserId === recipientId
      )
    ) {
      state.contacts.push({ userId: currentUser.id, contactUserId: recipientId });
    }
    await writeCloudState(state);
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
    const convId = msgMatch[1];
    const conv = state.conversations.find((c) => c.id === convId);
    if (!conv) return jsonResponse(404, { error: 'Conversation not found.' });
    if (method === 'GET') {
      const clearedAfter = conv.clearedAt[currentUser.id] || '';
      const messages = state.messages
        .filter(
          (m) =>
            m.conversationId === convId &&
            !m.deletedFor.includes(currentUser.id) &&
            (!clearedAfter || m.createdAt > clearedAfter)
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return jsonResponse(200, { messages });
    }
    if (method === 'POST') {
      const { text, imageId, replyToMessageId, clientTempId } = bodyObj;
      const now = new Date();
      const newMsg: StoredMessage = {
        id: `msg_${randomHex(8)}`,
        clientTempId,
        conversationId: convId,
        senderId: currentUser.id,
        text: String(text || '').trim(),
        imageId,
        replyToMessageId,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + SEVEN_DAYS_MS).toISOString(),
        status: 'delivered',
        deliveredAt: now.toISOString(),
        deletedFor: [],
        deletedForEveryone: false,
      };
      conv.updatedAt = now.toISOString();
      state.messages.push(newMsg);
      await writeCloudState(state);
      return jsonResponse(201, { message: newMsg });
    }
  }

  const readMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/read$/);
  if (readMatch && method === 'POST') {
    const convId = readMatch[1];
    let count = 0;
    const now = new Date().toISOString();
    for (const m of state.messages) {
      if (m.conversationId === convId && m.senderId !== currentUser.id && m.status !== 'read') {
        m.status = 'read';
        m.readAt = now;
        count++;
      }
    }
    if (count > 0) await writeCloudState(state);
    return jsonResponse(200, { updatedCount: count });
  }

  if (pathname === '/api/statuses' && method === 'GET') {
    const statuses: StatusItem[] = state.statuses
      .filter((s) => s.userId === currentUser.id || state.contacts.some((c) => c.userId === currentUser.id && c.contactUserId === s.userId))
      .map((s) => {
        const owner = state.users.find((u) => u.id === s.userId);
        return {
          ...s,
          user: owner ? toUserProfile(owner, currentUser.id, state) : null,
          viewedByMe: s.viewers.some((v) => v.viewerId === currentUser.id),
          viewCount: s.viewers.length,
          viewers: s.viewers.map((v) => {
            const vu = state.users.find((u) => u.id === v.viewerId);
            return {
              viewerId: v.viewerId,
              fullName: vu?.fullName || 'User',
              username: vu?.username || 'user',
              avatarUrl: vu?.avatarUrl || '',
              viewedAt: v.viewedAt,
            };
          }),
        };
      });
    return jsonResponse(200, { statuses });
  }

  if (pathname === '/api/statuses' && method === 'POST') {
    const { type, text, backgroundColor, textColor, imageId, privacy } = bodyObj;
    const now = new Date();
    const st: StoredStatus = {
      id: `sts_${randomHex(8)}`,
      userId: currentUser.id,
      type,
      text: String(text || '').trim(),
      backgroundColor: backgroundColor || '#F2F2F7',
      textColor: textColor || '#1C1C1E',
      imageId,
      privacy: privacy || 'everyone',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      viewers: [],
    };
    state.statuses.push(st);
    await writeCloudState(state);
    return jsonResponse(201, { status: st });
  }

  if (pathname === '/api/media' && method === 'POST') {
    const { dataBase64, mimeType, conversationId, statusId } = bodyObj;
    const now = new Date();
    const med: StoredMedia = {
      id: `med_${randomHex(8)}`,
      ownerId: currentUser.id,
      conversationId,
      statusId,
      mimeType: mimeType || 'image/jpeg',
      dataBase64,
      sizeBytes: Math.ceil((String(dataBase64).length * 3) / 4),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SEVEN_DAYS_MS).toISOString(),
    };
    state.media.push(med);
    await writeCloudState(state);
    return jsonResponse(201, { mediaId: med.id, sizeBytes: med.sizeBytes });
  }

  const mediaGetMatch = pathname.match(/^\/api\/media\/([^/]+)$/);
  if (mediaGetMatch && method === 'GET') {
    const med = state.media.find((m) => m.id === mediaGetMatch[1]);
    if (!med) return jsonResponse(404, { error: 'Media not found.' });
    return jsonResponse(200, med);
  }

  if (pathname === '/api/storage/stats' && method === 'GET') {
    const myConvIds = new Set(
      state.conversations
        .filter((c) => c.participantIds.includes(currentUser.id))
        .map((c) => c.id)
    );
    const messageCount = state.messages.filter((m) => myConvIds.has(m.conversationId)).length;
    const mediaItems = state.media.filter((m) => m.ownerId === currentUser.id);
    return jsonResponse(200, {
      conversationsCount: myConvIds.size,
      messageCount,
      mediaCount: mediaItems.length,
      totalMediaBytes: mediaItems.reduce((sum, item) => sum + item.sizeBytes, 0),
      retentionDays: 7,
    });
  }

  return jsonResponse(200, { success: true });
}
