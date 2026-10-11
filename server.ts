import express from 'express';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// --- TYPES & DATA MODEL ---
export interface PrivacySettings {
  profilePicVisibility: 'everyone' | 'contacts' | 'nobody';
  lastSeenVisibility: 'everyone' | 'contacts' | 'nobody';
  readReceipts: boolean;
  statusPrivacy: 'everyone' | 'contacts';
  whoCanContact: 'everyone' | 'contacts';
}

export interface NotificationSettings {
  messageAlerts: boolean;
  soundEnabled: boolean;
  previewText: boolean;
}

export interface ChatSettings {
  enterToSend: boolean;
  fontSize: 'small' | 'medium' | 'large';
  autoDownloadImages: boolean;
}

export interface UserRecord {
  id: string;
  fullName: string;
  username: string;
  email: string; // Required Gmail / Email
  passwordSalt: string;
  passwordHash: string;
  recoveryCodeSalt: string;
  recoveryCodeHash: string;
  bio: string;
  avatarUrl: string;
  createdAt: string;
  lastSeen: string;
  isOnline: boolean;
  usernameChangeTimestamps: string[]; // Track timestamps of username changes (max 3 per 30 days)
  privacy: PrivacySettings;
  notifications: NotificationSettings;
  chatSettings: ChatSettings;
}

export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export interface ConversationRecord {
  id: string;
  participantIds: [string, string];
  createdAt: string;
  updatedAt: string;
  deletedBy: string[];
  clearedAt: Record<string, string>;
}

export interface MessageRecord {
  id: string;
  clientTempId?: string;
  conversationId: string;
  senderId: string;
  text: string;
  imageId?: string;
  replyToMessageId?: string;
  createdAt: string;
  expiresAt: string; // 7-day automatic retention
  status: 'sent' | 'delivered' | 'read';
  deliveredAt?: string;
  readAt?: string;
  deletedFor: string[];
  deletedForEveryone: boolean;
}

export interface MediaRecord {
  id: string;
  ownerId: string;
  conversationId?: string;
  statusId?: string;
  mimeType: string;
  dataBase64: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string; // 7-day automatic retention
}

export interface StatusRecord {
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
}

export interface StatusViewRecord {
  id: string;
  statusId: string;
  viewerId: string;
  viewedAt: string;
}

export interface BlockRecord {
  id: string;
  blockerId: string;
  blockedUserId: string;
  createdAt: string;
}

export interface ReportRecord {
  id: string;
  reporterId: string;
  reportedUserId: string;
  reason: string;
  details: string;
  createdAt: string;
}

export interface ContactRecord {
  id: string;
  userId: string;
  contactUserId: string;
  createdAt: string;
}

interface DatabaseSchema {
  users: UserRecord[];
  sessions: SessionRecord[];
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  media: MediaRecord[];
  statuses: StatusRecord[];
  statusViews: StatusViewRecord[];
  blocks: BlockRecord[];
  reports: ReportRecord[];
  contacts: ContactRecord[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const DEMO_USER_IDS = new Set(['usr_clara_vance', 'usr_julian_mercer', 'usr_sora_takahashi']);

function hashSecret(secret: string, salt?: string): { salt: string; hash: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(secret, actualSalt, 64).toString('hex');
  return { salt: actualSalt, hash };
}

function verifySecret(secret: string, salt: string, expectedHash: string): boolean {
  const { hash } = hashSecret(secret, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function generateRecoveryCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) {
    p1 += chars[crypto.randomInt(0, chars.length)];
    p2 += chars[crypto.randomInt(0, chars.length)];
  }
  return `LAMAVI-${p1}-${p2}`;
}

function loadDatabase(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as DatabaseSchema;

      // Remove any pre-populated demo accounts (Clara, Julian, Sora) and their messages/conversations/statuses
      parsed.users = (parsed.users || [])
        .filter((u) => !DEMO_USER_IDS.has(u.id))
        .map((u) => ({
          ...u,
          email: u.email || `${u.username}@gmail.com`,
          usernameChangeTimestamps: Array.isArray(u.usernameChangeTimestamps)
            ? u.usernameChangeTimestamps
            : [],
        }));

      const removedConvIds = new Set(
        (parsed.conversations || [])
          .filter((c) => c.participantIds.some((id) => DEMO_USER_IDS.has(id)))
          .map((c) => c.id)
      );

      parsed.conversations = (parsed.conversations || []).filter((c) => !removedConvIds.has(c.id));
      parsed.messages = (parsed.messages || [])
        .filter((m) => !removedConvIds.has(m.conversationId) && !DEMO_USER_IDS.has(m.senderId))
        .map((m) => ({
          ...m,
          expiresAt:
            m.expiresAt ||
            new Date(new Date(m.createdAt).getTime() + SEVEN_DAYS_MS).toISOString(),
        }));
      parsed.statuses = (parsed.statuses || []).filter((s) => !DEMO_USER_IDS.has(s.userId));
      parsed.contacts = (parsed.contacts || []).filter(
        (ct) => !DEMO_USER_IDS.has(ct.userId) && !DEMO_USER_IDS.has(ct.contactUserId)
      );
      parsed.media = (parsed.media || []).map((med) => ({
        ...med,
        expiresAt:
          med.expiresAt ||
          new Date(new Date(med.createdAt).getTime() + SEVEN_DAYS_MS).toISOString(),
      }));

      saveDatabase(parsed);
      return parsed;
    } catch (e) {
      console.error('Failed to parse database.json, initializing fresh DB', e);
    }
  }

  const initialDb: DatabaseSchema = {
    users: [],
    sessions: [],
    conversations: [],
    messages: [],
    media: [],
    statuses: [],
    statusViews: [],
    blocks: [],
    reports: [],
    contacts: [],
  };

  saveDatabase(initialDb);
  return initialDb;
}

let db: DatabaseSchema = loadDatabase();

function saveDatabase(data: DatabaseSchema = db) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (e) {
    console.error('Failed to save database:', e);
  }
}

// Automatically purge expired statuses (24h) and client messages/media older than 7 days
function purgeExpiredRecords() {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const sevenDaysAgoIso = new Date(nowMs - SEVEN_DAYS_MS).toISOString();

  let changed = false;

  // 1. Purge 24-hour statuses
  const validStatuses = db.statuses.filter((s) => s.expiresAt > nowIso);
  if (validStatuses.length !== db.statuses.length) {
    const validStatusIds = new Set(validStatuses.map((s) => s.id));
    db.statuses = validStatuses;
    db.statusViews = db.statusViews.filter((sv) => validStatusIds.has(sv.statusId));
    changed = true;
  }

  // 2. Purge messages older than 7 days
  const validMessages = db.messages.filter(
    (m) => (m.expiresAt ? m.expiresAt > nowIso : m.createdAt > sevenDaysAgoIso)
  );
  if (validMessages.length !== db.messages.length) {
    db.messages = validMessages;
    changed = true;
  }

  // 3. Purge conversation/status media older than 7 days
  const validMedia = db.media.filter(
    (med) => (med.expiresAt ? med.expiresAt > nowIso : med.createdAt > sevenDaysAgoIso)
  );
  if (validMedia.length !== db.media.length) {
    db.media = validMedia;
    changed = true;
  }

  if (changed) {
    saveDatabase();
  }
}

function areUsersConnected(userA: string, userB: string): boolean {
  if (userA === userB) return true;
  const hasContact = db.contacts.some(
    (c) =>
      (c.userId === userA && c.contactUserId === userB) ||
      (c.userId === userB && c.contactUserId === userA)
  );
  if (hasContact) return true;
  const hasConv = db.conversations.some(
    (conv) => conv.participantIds.includes(userA) && conv.participantIds.includes(userB)
  );
  return hasConv;
}

function isBlockedBetween(
  userA: string,
  userB: string
): { blocked: boolean; blockedByMe: boolean; blockedByThem: boolean } {
  const blockedByMe = db.blocks.some((b) => b.blockerId === userA && b.blockedUserId === userB);
  const blockedByThem = db.blocks.some((b) => b.blockerId === userB && b.blockedUserId === userA);
  return { blocked: blockedByMe || blockedByThem, blockedByMe, blockedByThem };
}

function getRemainingUsernameChanges(user: UserRecord): number {
  const thirtyDaysAgoIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
  const recentChanges = (user.usernameChangeTimestamps || []).filter((ts) => ts > thirtyDaysAgoIso);
  return Math.max(0, 3 - recentChanges.length);
}

function sanitizeUserForViewer(target: UserRecord, viewerId: string) {
  const isSelf = target.id === viewerId;
  const isConnected = areUsersConnected(target.id, viewerId);
  const { blocked } = isBlockedBetween(viewerId, target.id);

  let canSeeAvatar = true;
  if (!isSelf) {
    if (blocked || target.privacy.profilePicVisibility === 'nobody') {
      canSeeAvatar = false;
    } else if (target.privacy.profilePicVisibility === 'contacts' && !isConnected) {
      canSeeAvatar = false;
    }
  }

  let canSeePresence = true;
  if (!isSelf) {
    if (blocked || target.privacy.lastSeenVisibility === 'nobody') {
      canSeePresence = false;
    } else if (target.privacy.lastSeenVisibility === 'contacts' && !isConnected) {
      canSeePresence = false;
    }
  }

  return {
    id: target.id,
    fullName: target.fullName,
    username: target.username,
    email: isSelf ? target.email : undefined,
    bio: target.bio,
    avatarUrl: canSeeAvatar ? target.avatarUrl : '',
    isOnline: canSeePresence ? target.isOnline : false,
    lastSeen: canSeePresence ? target.lastSeen : null,
    createdAt: target.createdAt,
    usernameChangesRemaining: isSelf ? getRemainingUsernameChanges(target) : undefined,
    privacy: isSelf ? target.privacy : undefined,
    notifications: isSelf ? target.notifications : undefined,
    chatSettings: isSelf ? target.chatSettings : undefined,
  };
}

function validatePasswordRules(password: string): string | null {
  if (typeof password !== 'string' || password.length !== 8) {
    return 'Password must be exactly 8 characters long.';
  }
  if (!/[a-zA-Z]/.test(password)) {
    return 'Password must contain at least one alphabet letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one numerical digit.';
  }
  return null;
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);

  app.use(express.json({ limit: '12mb' }));

  // Run 7-day retention cleanup on boot and every 15 minutes
  purgeExpiredRecords();
  setInterval(purgeExpiredRecords, 15 * 60 * 1000);

  const userSockets = new Map<string, Set<WebSocket>>();

  function sendToUser(userId: string, event: string, payload: unknown) {
    const sockets = userSockets.get(userId);
    if (!sockets) return;
    const message = JSON.stringify({ event, payload });
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  function broadcastPresenceChange(userId: string) {
    const user = db.users.find((u) => u.id === userId);
    if (!user) return;
    for (const [viewerId] of userSockets.entries()) {
      if (viewerId === userId) continue;
      const sanitized = sanitizeUserForViewer(user, viewerId);
      sendToUser(viewerId, 'presence:update', {
        userId: user.id,
        isOnline: sanitized.isOnline,
        lastSeen: sanitized.lastSeen,
      });
    }
  }

  function getAuthenticatedUser(req: express.Request): UserRecord | null {
    const authHeader = req.headers.authorization;
    const tokenFromQuery = typeof req.query.token === 'string' ? req.query.token : undefined;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : tokenFromQuery;
    if (!token) return null;

    const now = new Date().toISOString();
    const session = db.sessions.find((s) => s.token === token && s.expiresAt > now);
    if (!session) return null;

    return db.users.find((u) => u.id === session.userId) || null;
  }

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required. Please log in.' });
      return;
    }
    (req as express.Request & { user: UserRecord }).user = user;
    next();
  }

  // --- AUTHENTICATION ROUTES ---

  app.post('/api/auth/register', (req, res) => {
    const { fullName, username, email, password } = req.body || {};

    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      res.status(400).json({ error: 'Full real name is required (minimum 2 characters).' });
      return;
    }

    const cleanUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
    if (!cleanUsername || !/^[a-z0-9_.]{3,24}$/.test(cleanUsername)) {
      res.status(400).json({
        error: 'Username must be 3–24 characters and contain only letters, numbers, underscores, or periods.',
      });
      return;
    }

    if (db.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      res.status(409).json({ error: 'This username is already taken. Please choose another.' });
      return;
    }

    // Gmail / Email is strictly mandatory
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'A valid Gmail / email address is required to create an account.' });
      return;
    }

    if (db.users.some((u) => u.email && u.email.toLowerCase() === cleanEmail)) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    const pwError = validatePasswordRules(password);
    if (pwError) {
      res.status(400).json({ error: pwError });
      return;
    }

    const { salt: passwordSalt, hash: passwordHash } = hashSecret(password);
    const plainRecoveryCode = generateRecoveryCode();
    const { salt: recoveryCodeSalt, hash: recoveryCodeHash } = hashSecret(plainRecoveryCode);

    const now = new Date().toISOString();
    const newUser: UserRecord = {
      id: `usr_${crypto.randomBytes(8).toString('hex')}`,
      fullName: fullName.trim(),
      username: cleanUsername,
      email: cleanEmail,
      passwordSalt,
      passwordHash,
      recoveryCodeSalt,
      recoveryCodeHash,
      bio: '', // Empty initially so user is prompted to set up their profile photo & bio
      avatarUrl: '', // Empty initially so rough placeholder avatar is shown
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
      notifications: {
        messageAlerts: true,
        soundEnabled: true,
        previewText: true,
      },
      chatSettings: {
        enterToSend: true,
        fontSize: 'medium',
        autoDownloadImages: true,
      },
    };

    // Do NOT pre-populate any fake contacts or conversations!
    db.users.push(newUser);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    db.sessions.push({
      token,
      userId: newUser.id,
      createdAt: now,
      expiresAt,
    });

    saveDatabase();

    res.status(201).json({
      token,
      user: sanitizeUserForViewer(newUser, newUser.id),
      recoveryCode: plainRecoveryCode,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body || {};
    if (!identifier || typeof identifier !== 'string' || !password || typeof password !== 'string') {
      res.status(400).json({ error: 'Please enter your username/email and password.' });
      return;
    }

    const cleanId = identifier.trim().toLowerCase();
    const user = db.users.find(
      (u) => u.username.toLowerCase() === cleanId || (u.email && u.email.toLowerCase() === cleanId)
    );

    if (!user || !verifySecret(password, user.passwordSalt, user.passwordHash)) {
      res.status(401).json({ error: 'Incorrect username/email or password.' });
      return;
    }

    const now = new Date().toISOString();
    user.lastSeen = now;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();

    db.sessions.push({
      token,
      userId: user.id,
      createdAt: now,
      expiresAt,
    });
    saveDatabase();

    res.json({
      token,
      user: sanitizeUserForViewer(user, user.id),
    });
  });

  app.post('/api/auth/recover', (req, res) => {
    const { identifier, recoveryCode, newPassword } = req.body || {};
    if (!identifier || !recoveryCode || !newPassword) {
      res.status(400).json({ error: 'Username/email, recovery code, and new password are required.' });
      return;
    }

    const pwError = validatePasswordRules(newPassword);
    if (pwError) {
      res.status(400).json({ error: pwError });
      return;
    }

    const cleanId = String(identifier).trim().toLowerCase();
    const user = db.users.find(
      (u) => u.username.toLowerCase() === cleanId || (u.email && u.email.toLowerCase() === cleanId)
    );

    if (
      !user ||
      !verifySecret(String(recoveryCode).trim().toUpperCase(), user.recoveryCodeSalt, user.recoveryCodeHash)
    ) {
      res.status(401).json({ error: 'Invalid account identifier or recovery code.' });
      return;
    }

    const { salt, hash } = hashSecret(newPassword);
    user.passwordSalt = salt;
    user.passwordHash = hash;
    saveDatabase();

    res.json({ message: 'Password updated successfully. You can now log in.' });
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    db.sessions = db.sessions.filter((s) => s.token !== token);
    saveDatabase();
    res.json({ success: true });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    res.json({ user: sanitizeUserForViewer(user, user.id) });
  });

  // --- PROFILE & ACCOUNT SETTINGS ---

  app.put('/api/users/profile', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const { fullName, username, email, bio, avatarUrl, privacy, notifications, chatSettings } =
      req.body || {};

    if (fullName !== undefined) {
      if (typeof fullName !== 'string' || fullName.trim().length < 2) {
        res.status(400).json({ error: 'Full name must be at least 2 characters.' });
        return;
      }
      user.fullName = fullName.trim();
    }

    // Username can only be changed up to 3 times within a 30-day rolling window
    if (username !== undefined) {
      const cleanUsername = typeof username === 'string' ? username.trim().toLowerCase() : '';
      if (cleanUsername !== user.username.toLowerCase()) {
        if (!/^[a-z0-9_.]{3,24}$/.test(cleanUsername)) {
          res.status(400).json({
            error: 'Username must be 3–24 characters (letters, numbers, underscores, periods).',
          });
          return;
        }
        if (db.users.some((u) => u.id !== user.id && u.username.toLowerCase() === cleanUsername)) {
          res.status(409).json({ error: 'Username is already taken by another user.' });
          return;
        }

        const thirtyDaysAgoIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
        const recentChanges = (user.usernameChangeTimestamps || []).filter(
          (ts) => ts > thirtyDaysAgoIso
        );
        if (recentChanges.length >= 3) {
          res.status(429).json({
            error:
              'You can only change your username 3 times per month (30 days). You have reached your monthly limit.',
          });
          return;
        }

        user.username = cleanUsername;
        user.usernameChangeTimestamps = [...recentChanges, new Date().toISOString()];
      }
    }

    if (email !== undefined) {
      const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        res.status(400).json({ error: 'A valid Gmail / email address is required.' });
        return;
      }
      if (db.users.some((u) => u.id !== user.id && u.email && u.email.toLowerCase() === cleanEmail)) {
        res.status(409).json({ error: 'Email address is already registered to another account.' });
        return;
      }
      user.email = cleanEmail;
    }

    if (bio !== undefined && typeof bio === 'string') {
      user.bio = bio.trim().slice(0, 160);
    }

    if (avatarUrl !== undefined && typeof avatarUrl === 'string') {
      user.avatarUrl = avatarUrl;
    }

    if (privacy && typeof privacy === 'object') {
      user.privacy = { ...user.privacy, ...privacy };
    }

    if (notifications && typeof notifications === 'object') {
      user.notifications = { ...user.notifications, ...notifications };
    }

    if (chatSettings && typeof chatSettings === 'object') {
      user.chatSettings = { ...user.chatSettings, ...chatSettings };
    }

    saveDatabase();

    for (const [viewerId] of userSockets.entries()) {
      sendToUser(viewerId, 'user:updated', sanitizeUserForViewer(user, viewerId));
    }

    res.json({ user: sanitizeUserForViewer(user, user.id) });
  });

  app.post('/api/users/change-password', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !verifySecret(currentPassword, user.passwordSalt, user.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    const pwError = validatePasswordRules(newPassword);
    if (pwError) {
      res.status(400).json({ error: pwError });
      return;
    }

    const { salt, hash } = hashSecret(newPassword);
    user.passwordSalt = salt;
    user.passwordHash = hash;
    saveDatabase();
    res.json({ message: 'Password updated successfully.' });
  });

  app.delete('/api/users/account', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const uid = user.id;

    db.users = db.users.filter((u) => u.id !== uid);
    db.sessions = db.sessions.filter((s) => s.userId !== uid);
    db.statuses = db.statuses.filter((s) => s.userId !== uid);
    db.statusViews = db.statusViews.filter((sv) => sv.viewerId !== uid);
    db.blocks = db.blocks.filter((b) => b.blockerId !== uid && b.blockedUserId !== uid);
    db.contacts = db.contacts.filter((c) => c.userId !== uid && c.contactUserId !== uid);
    const convIds = new Set(
      db.conversations.filter((c) => c.participantIds.includes(uid)).map((c) => c.id)
    );
    db.conversations = db.conversations.filter((c) => !convIds.has(c.id));
    db.messages = db.messages.filter((m) => !convIds.has(m.conversationId));

    saveDatabase();
    res.json({ success: true });
  });

  // --- EXACT USERNAME & REGISTERED EMAIL SEARCH ---

  app.get('/api/users/search', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    if (!rawQuery) {
      res.status(400).json({ error: 'Please enter a username or email address to search.' });
      return;
    }

    const normalizedQuery = rawQuery.startsWith('@') ? rawQuery.slice(1) : rawQuery;

    const found = db.users.find(
      (u) =>
        u.username.toLowerCase() === normalizedQuery ||
        (u.email && u.email.toLowerCase() === rawQuery)
    );

    if (!found) {
      res.json({ result: null });
      return;
    }

    if (found.id === user.id) {
      res.status(400).json({ error: 'You cannot start a conversation with yourself.' });
      return;
    }

    const { blockedByThem } = isBlockedBetween(user.id, found.id);
    if (blockedByThem) {
      res.json({ result: null });
      return;
    }

    const sanitized = sanitizeUserForViewer(found, user.id);
    const isContact = db.contacts.some((c) => c.userId === user.id && c.contactUserId === found.id);
    const isBlocked = db.blocks.some((b) => b.blockerId === user.id && b.blockedUserId === found.id);

    res.json({
      result: {
        ...sanitized,
        isContact,
        isBlocked,
      },
    });
  });

  // --- CONTACTS, BLOCKING, AND REPORTING ---

  app.get('/api/contacts', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;

    const contactUserIds = new Set<string>();
    for (const c of db.contacts) {
      if (c.userId === user.id) contactUserIds.add(c.contactUserId);
    }
    for (const conv of db.conversations) {
      if (conv.participantIds.includes(user.id) && !conv.deletedBy.includes(user.id)) {
        const otherId =
          conv.participantIds[0] === user.id ? conv.participantIds[1] : conv.participantIds[0];
        contactUserIds.add(otherId);
      }
    }

    const contacts = Array.from(contactUserIds)
      .map((id) => db.users.find((u) => u.id === id))
      .filter((u): u is UserRecord => !!u)
      .map((u) => ({
        ...sanitizeUserForViewer(u, user.id),
        isBlocked: db.blocks.some((b) => b.blockerId === user.id && b.blockedUserId === u.id),
      }));

    const blockedUsers = db.blocks
      .filter((b) => b.blockerId === user.id)
      .map((b) => db.users.find((u) => u.id === b.blockedUserId))
      .filter((u): u is UserRecord => !!u)
      .map((u) => sanitizeUserForViewer(u, user.id));

    res.json({ contacts, blockedUsers });
  });

  app.post('/api/contacts/add', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const { targetUserId } = req.body || {};

    if (!targetUserId || targetUserId === user.id) {
      res.status(400).json({ error: 'Invalid user selected.' });
      return;
    }

    const target = db.users.find((u) => u.id === targetUserId);
    if (!target) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const exists = db.contacts.some((c) => c.userId === user.id && c.contactUserId === target.id);
    if (!exists) {
      db.contacts.push({
        id: `cnt_${crypto.randomBytes(6).toString('hex')}`,
        userId: user.id,
        contactUserId: target.id,
        createdAt: new Date().toISOString(),
      });
      saveDatabase();
    }

    res.json({ contact: sanitizeUserForViewer(target, user.id) });
  });

  app.post('/api/users/block', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const { targetUserId } = req.body || {};
    if (!targetUserId || targetUserId === user.id) {
      res.status(400).json({ error: 'Invalid user to block.' });
      return;
    }
    const existing = db.blocks.find(
      (b) => b.blockerId === user.id && b.blockedUserId === targetUserId
    );
    if (!existing) {
      db.blocks.push({
        id: `blk_${crypto.randomBytes(6).toString('hex')}`,
        blockerId: user.id,
        blockedUserId: targetUserId,
        createdAt: new Date().toISOString(),
      });
      saveDatabase();
    }
    res.json({ success: true });
  });

  app.post('/api/users/unblock', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const { targetUserId } = req.body || {};
    db.blocks = db.blocks.filter(
      (b) => !(b.blockerId === user.id && b.blockedUserId === targetUserId)
    );
    saveDatabase();
    res.json({ success: true });
  });

  app.post('/api/users/report', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const { targetUserId, reason, details } = req.body || {};
    if (!targetUserId || !reason) {
      res.status(400).json({ error: 'Please select a reason for reporting.' });
      return;
    }
    db.reports.push({
      id: `rep_${crypto.randomBytes(6).toString('hex')}`,
      reporterId: user.id,
      reportedUserId: targetUserId,
      reason: String(reason),
      details: String(details || ''),
      createdAt: new Date().toISOString(),
    });
    saveDatabase();
    res.json({ message: 'Report submitted. Our trust & safety team will review this account.' });
  });

  // --- SECURE MEDIA UPLOAD & ACCESS (7-DAY RETENTION) ---

  app.post('/api/media', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const { dataBase64, mimeType, conversationId, statusId } = req.body || {};

    if (!dataBase64 || typeof dataBase64 !== 'string') {
      res.status(400).json({ error: 'Image data is required.' });
      return;
    }

    const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!mimeType || !validMimeTypes.includes(mimeType)) {
      res.status(400).json({ error: 'Unsupported image format. Please use JPEG, PNG, WEBP, or GIF.' });
      return;
    }

    const base64Clean = dataBase64.replace(/^data:image\/\w+;base64,/, '');
    const sizeBytes = Math.ceil((base64Clean.length * 3) / 4);
    if (sizeBytes > 8 * 1024 * 1024) {
      res.status(413).json({ error: 'Image exceeds the 8MB maximum file size limit.' });
      return;
    }

    if (conversationId) {
      const conv = db.conversations.find((c) => c.id === conversationId);
      if (!conv || !conv.participantIds.includes(user.id)) {
        res.status(403).json({ error: 'Not authorized to upload media to this conversation.' });
        return;
      }
    }

    const now = new Date();
    const media: MediaRecord = {
      id: `med_${crypto.randomBytes(8).toString('hex')}`,
      ownerId: user.id,
      conversationId,
      statusId,
      mimeType,
      dataBase64: dataBase64.startsWith('data:')
        ? dataBase64
        : `data:${mimeType};base64,${base64Clean}`,
      sizeBytes,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SEVEN_DAYS_MS).toISOString(),
    };

    db.media.push(media);
    saveDatabase();

    res.status(201).json({
      mediaId: media.id,
      sizeBytes: media.sizeBytes,
    });
  });

  app.get('/api/media/:mediaId', requireAuth, (req, res) => {
    purgeExpiredRecords();
    const user = (req as express.Request & { user: UserRecord }).user;
    const media = db.media.find((m) => m.id === req.params.mediaId);
    if (!media) {
      res.status(404).json({ error: 'Media not found or expired after 7 days.' });
      return;
    }

    let authorized = media.ownerId === user.id;
    if (!authorized && media.conversationId) {
      const conv = db.conversations.find((c) => c.id === media.conversationId);
      if (conv && conv.participantIds.includes(user.id)) {
        authorized = true;
      }
    }
    if (!authorized && media.statusId) {
      const status = db.statuses.find((s) => s.id === media.statusId);
      if (status) {
        const owner = db.users.find((u) => u.id === status.userId);
        if (owner && !isBlockedBetween(user.id, owner.id).blocked) {
          if (status.privacy === 'everyone' || areUsersConnected(user.id, owner.id)) {
            authorized = true;
          }
        }
      }
    }

    if (!authorized) {
      res.status(403).json({ error: 'Forbidden: You do not have access to this private media.' });
      return;
    }

    res.json({
      id: media.id,
      mimeType: media.mimeType,
      dataBase64: media.dataBase64,
      sizeBytes: media.sizeBytes,
      createdAt: media.createdAt,
      expiresAt: media.expiresAt,
    });
  });

  // --- CONVERSATIONS & REAL-TIME MESSAGING (7-DAY RETENTION) ---

  function formatMessageForUser(msg: MessageRecord, _viewerId: string) {
    if (msg.deletedForEveryone) {
      return {
        ...msg,
        text: 'This message was deleted',
        imageId: undefined,
        isDeletedPlaceholder: true,
      };
    }
    return msg;
  }

  function getConversationsForUser(userId: string) {
    purgeExpiredRecords();
    const userConvs = db.conversations.filter(
      (c) => c.participantIds.includes(userId) && !c.deletedBy.includes(userId)
    );

    return userConvs
      .map((conv) => {
        const otherId =
          conv.participantIds[0] === userId ? conv.participantIds[1] : conv.participantIds[0];
        const otherUser = db.users.find((u) => u.id === otherId);
        const clearedAfter = conv.clearedAt[userId] || '';

        const visibleMessages = db.messages
          .filter(
            (m) =>
              m.conversationId === conv.id &&
              !m.deletedFor.includes(userId) &&
              (!clearedAfter || m.createdAt > clearedAfter)
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

        const lastMessage =
          visibleMessages.length > 0
            ? formatMessageForUser(visibleMessages[visibleMessages.length - 1], userId)
            : null;

        const unreadCount = visibleMessages.filter(
          (m) => m.senderId !== userId && m.status !== 'read' && !m.deletedForEveryone
        ).length;

        const blockInfo = isBlockedBetween(userId, otherId);

        return {
          id: conv.id,
          createdAt: conv.createdAt,
          updatedAt: lastMessage ? lastMessage.createdAt : conv.updatedAt,
          recipient: otherUser
            ? sanitizeUserForViewer(otherUser, userId)
            : {
                id: otherId,
                fullName: 'Deleted Account',
                username: 'deleted',
                bio: '',
                avatarUrl: '',
                isOnline: false,
                lastSeen: null,
              },
          lastMessage,
          unreadCount,
          blockedByMe: blockInfo.blockedByMe,
          blockedByThem: blockInfo.blockedByThem,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  app.get('/api/conversations', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;

    const now = new Date().toISOString();
    let anyDelivered = false;
    const myConvIds = new Set(
      db.conversations.filter((c) => c.participantIds.includes(user.id)).map((c) => c.id)
    );

    for (const msg of db.messages) {
      if (
        myConvIds.has(msg.conversationId) &&
        msg.senderId !== user.id &&
        msg.status === 'sent'
      ) {
        msg.status = 'delivered';
        msg.deliveredAt = now;
        anyDelivered = true;
        sendToUser(msg.senderId, 'message:status', {
          conversationId: msg.conversationId,
          messageId: msg.id,
          status: 'delivered',
          deliveredAt: now,
        });
      }
    }
    if (anyDelivered) saveDatabase();

    res.json({ conversations: getConversationsForUser(user.id) });
  });

  app.post('/api/conversations/start', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const { recipientId } = req.body || {};

    if (!recipientId || typeof recipientId !== 'string') {
      res.status(400).json({ error: 'Recipient user ID is required.' });
      return;
    }

    if (recipientId === user.id) {
      res.status(400).json({ error: 'You cannot message yourself.' });
      return;
    }

    const recipient = db.users.find((u) => u.id === recipientId);
    if (!recipient) {
      res.status(404).json({ error: 'No user found.' });
      return;
    }

    const { blocked, blockedByMe } = isBlockedBetween(user.id, recipient.id);
    if (blocked) {
      res.status(403).json({
        error: blockedByMe
          ? 'You have blocked this user. Unblock them first to start a conversation.'
          : 'You cannot message this user due to their privacy settings.',
      });
      return;
    }

    if (recipient.privacy.whoCanContact === 'contacts' && !areUsersConnected(user.id, recipient.id)) {
      res.status(403).json({ error: 'This user only accepts messages from existing contacts.' });
      return;
    }

    let conv = db.conversations.find(
      (c) => c.participantIds.includes(user.id) && c.participantIds.includes(recipient.id)
    );

    const now = new Date().toISOString();
    if (!conv) {
      conv = {
        id: `conv_${crypto.randomBytes(8).toString('hex')}`,
        participantIds: [user.id, recipient.id],
        createdAt: now,
        updatedAt: now,
        deletedBy: [],
        clearedAt: {},
      };
      db.conversations.push(conv);
    } else {
      conv.deletedBy = conv.deletedBy.filter((id) => id !== user.id);
    }

    if (!db.contacts.some((c) => c.userId === user.id && c.contactUserId === recipient.id)) {
      db.contacts.push({
        id: `cnt_${crypto.randomBytes(6).toString('hex')}`,
        userId: user.id,
        contactUserId: recipient.id,
        createdAt: now,
      });
    }

    saveDatabase();
    const formattedList = getConversationsForUser(user.id);
    const formatted = formattedList.find((c) => c.id === conv!.id);
    res.json({ conversation: formatted });
  });

  app.get('/api/conversations/:conversationId/messages', requireAuth, (req, res) => {
    purgeExpiredRecords();
    const user = (req as express.Request & { user: UserRecord }).user;
    const conv = db.conversations.find((c) => c.id === req.params.conversationId);

    if (!conv || !conv.participantIds.includes(user.id)) {
      res.status(403).json({ error: 'Unauthorized access to conversation.' });
      return;
    }

    const clearedAfter = conv.clearedAt[user.id] || '';
    const messages = db.messages
      .filter(
        (m) =>
          m.conversationId === conv.id &&
          !m.deletedFor.includes(user.id) &&
          (!clearedAfter || m.createdAt > clearedAfter)
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => formatMessageForUser(m, user.id));

    res.json({ messages });
  });

  app.post('/api/conversations/:conversationId/messages', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const conv = db.conversations.find((c) => c.id === req.params.conversationId);

    if (!conv || !conv.participantIds.includes(user.id)) {
      res.status(403).json({ error: 'Unauthorized access to conversation.' });
      return;
    }

    const otherId =
      conv.participantIds[0] === user.id ? conv.participantIds[1] : conv.participantIds[0];

    const { blocked, blockedByMe } = isBlockedBetween(user.id, otherId);
    if (blocked) {
      res.status(403).json({
        error: blockedByMe
          ? 'You have blocked this user. Unblock them to send messages.'
          : 'Message could not be delivered due to recipient privacy settings.',
      });
      return;
    }

    const { text, imageId, replyToMessageId, clientTempId } = req.body || {};
    const cleanText = typeof text === 'string' ? text.trim() : '';

    if (!cleanText && !imageId) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    if (clientTempId && typeof clientTempId === 'string') {
      const existingMsg = db.messages.find(
        (m) =>
          m.conversationId === conv.id &&
          m.senderId === user.id &&
          m.clientTempId === clientTempId
      );
      if (existingMsg) {
        res.json({ message: formatMessageForUser(existingMsg, user.id) });
        return;
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAtIso = new Date(now.getTime() + SEVEN_DAYS_MS).toISOString();
    const isRecipientOnline =
      userSockets.has(otherId) && (userSockets.get(otherId)?.size || 0) > 0;

    const newMessage: MessageRecord = {
      id: `msg_${crypto.randomBytes(8).toString('hex')}`,
      clientTempId: typeof clientTempId === 'string' ? clientTempId : undefined,
      conversationId: conv.id,
      senderId: user.id,
      text: cleanText,
      imageId: typeof imageId === 'string' ? imageId : undefined,
      replyToMessageId: typeof replyToMessageId === 'string' ? replyToMessageId : undefined,
      createdAt: nowIso,
      expiresAt: expiresAtIso,
      status: isRecipientOnline ? 'delivered' : 'sent',
      deliveredAt: isRecipientOnline ? nowIso : undefined,
      deletedFor: [],
      deletedForEveryone: false,
    };

    conv.updatedAt = nowIso;
    conv.deletedBy = [];
    db.messages.push(newMessage);
    saveDatabase();

    sendToUser(otherId, 'message:new', {
      conversationId: conv.id,
      message: formatMessageForUser(newMessage, otherId),
      sender: sanitizeUserForViewer(user, otherId),
    });

    sendToUser(user.id, 'message:new', {
      conversationId: conv.id,
      message: formatMessageForUser(newMessage, user.id),
    });

    res.status(201).json({ message: formatMessageForUser(newMessage, user.id) });
  });

  app.post('/api/conversations/:conversationId/read', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const conv = db.conversations.find((c) => c.id === req.params.conversationId);
    if (!conv || !conv.participantIds.includes(user.id)) {
      res.status(403).json({ error: 'Unauthorized.' });
      return;
    }

    const otherId =
      conv.participantIds[0] === user.id ? conv.participantIds[1] : conv.participantIds[0];
    const otherUser = db.users.find((u) => u.id === otherId);
    const now = new Date().toISOString();

    const allowReadReceipts =
      user.privacy.readReceipts && (otherUser ? otherUser.privacy.readReceipts : true);

    const updatedIds: string[] = [];
    for (const msg of db.messages) {
      if (msg.conversationId === conv.id && msg.senderId !== user.id && msg.status !== 'read') {
        msg.status = 'read';
        msg.readAt = now;
        if (!msg.deliveredAt) msg.deliveredAt = now;
        updatedIds.push(msg.id);
      }
    }

    if (updatedIds.length > 0) {
      saveDatabase();
      if (allowReadReceipts) {
        sendToUser(otherId, 'messages:read', {
          conversationId: conv.id,
          messageIds: updatedIds,
          readAt: now,
        });
      }
    }

    res.json({ updatedCount: updatedIds.length });
  });

  app.delete('/api/messages/:messageId', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const mode = req.query.mode === 'everyone' ? 'everyone' : 'me';
    const msg = db.messages.find((m) => m.id === req.params.messageId);

    if (!msg) {
      res.status(404).json({ error: 'Message not found.' });
      return;
    }

    const conv = db.conversations.find((c) => c.id === msg.conversationId);
    if (!conv || !conv.participantIds.includes(user.id)) {
      res.status(403).json({ error: 'Unauthorized.' });
      return;
    }

    if (mode === 'everyone') {
      if (msg.senderId !== user.id) {
        res.status(403).json({ error: 'You can only delete your own messages for everyone.' });
        return;
      }
      msg.deletedForEveryone = true;
      msg.text = '';
      msg.imageId = undefined;
      saveDatabase();

      for (const pid of conv.participantIds) {
        sendToUser(pid, 'message:deleted', {
          conversationId: conv.id,
          messageId: msg.id,
          mode: 'everyone',
        });
      }
    } else {
      if (!msg.deletedFor.includes(user.id)) {
        msg.deletedFor.push(user.id);
        saveDatabase();
      }
      sendToUser(user.id, 'message:deleted', {
        conversationId: conv.id,
        messageId: msg.id,
        mode: 'me',
      });
    }

    res.json({ success: true });
  });

  app.post('/api/conversations/:conversationId/clear', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const conv = db.conversations.find((c) => c.id === req.params.conversationId);
    if (!conv || !conv.participantIds.includes(user.id)) {
      res.status(403).json({ error: 'Unauthorized.' });
      return;
    }

    conv.clearedAt[user.id] = new Date().toISOString();
    saveDatabase();
    res.json({ success: true });
  });

  app.delete('/api/conversations/:conversationId', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const conv = db.conversations.find((c) => c.id === req.params.conversationId);
    if (!conv || !conv.participantIds.includes(user.id)) {
      res.status(403).json({ error: 'Unauthorized.' });
      return;
    }

    conv.clearedAt[user.id] = new Date().toISOString();
    if (!conv.deletedBy.includes(user.id)) {
      conv.deletedBy.push(user.id);
    }
    saveDatabase();
    res.json({ success: true });
  });

  // --- 24-HOUR STATUS FEATURE ---

  app.get('/api/statuses', requireAuth, (req, res) => {
    purgeExpiredRecords();
    const user = (req as express.Request & { user: UserRecord }).user;

    // Only show user's own statuses or statuses from actual connected contacts
    const visibleStatuses = db.statuses.filter((s) => {
      if (s.userId === user.id) return true;
      if (isBlockedBetween(user.id, s.userId).blocked) return false;
      const owner = db.users.find((u) => u.id === s.userId);
      if (!owner) return false;
      return areUsersConnected(user.id, s.userId);
    });

    const formatted = visibleStatuses.map((s) => {
      const owner = db.users.find((u) => u.id === s.userId);
      const viewsForStatus = db.statusViews.filter((sv) => sv.statusId === s.id);
      const viewedByMe = viewsForStatus.some((sv) => sv.viewerId === user.id);

      const viewers =
        s.userId === user.id
          ? viewsForStatus.map((sv) => {
              const viewerUser = db.users.find((u) => u.id === sv.viewerId);
              return {
                viewerId: sv.viewerId,
                fullName: viewerUser?.fullName || 'User',
                username: viewerUser?.username || 'user',
                avatarUrl: viewerUser
                  ? sanitizeUserForViewer(viewerUser, user.id).avatarUrl
                  : '',
                viewedAt: sv.viewedAt,
              };
            })
          : [];

      return {
        ...s,
        user: owner ? sanitizeUserForViewer(owner, user.id) : null,
        viewedByMe,
        viewCount: s.userId === user.id ? viewers.length : undefined,
        viewers: s.userId === user.id ? viewers : undefined,
      };
    });

    res.json({ statuses: formatted });
  });

  app.post('/api/statuses', requireAuth, (req, res) => {
    purgeExpiredRecords();
    const user = (req as express.Request & { user: UserRecord }).user;
    const { type, text, backgroundColor, textColor, imageId, privacy } = req.body || {};

    if (type !== 'text' && type !== 'image') {
      res.status(400).json({ error: 'Invalid status type.' });
      return;
    }

    if (type === 'text' && (!text || typeof text !== 'string' || !text.trim())) {
      res.status(400).json({ error: 'Status text is required.' });
      return;
    }

    if (type === 'image' && (!imageId || typeof imageId !== 'string')) {
      res.status(400).json({ error: 'Status image is required.' });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const newStatus: StatusRecord = {
      id: `sts_${crypto.randomBytes(8).toString('hex')}`,
      userId: user.id,
      type,
      text: typeof text === 'string' ? text.trim().slice(0, 500) : '',
      backgroundColor: typeof backgroundColor === 'string' ? backgroundColor : '#F2F2F7',
      textColor: typeof textColor === 'string' ? textColor : '#1C1C1E',
      imageId: type === 'image' ? imageId : undefined,
      privacy: privacy === 'contacts' ? 'contacts' : user.privacy.statusPrivacy,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    if (newStatus.imageId) {
      const media = db.media.find((m) => m.id === newStatus.imageId && m.ownerId === user.id);
      if (media) {
        media.statusId = newStatus.id;
      }
    }

    db.statuses.push(newStatus);
    saveDatabase();

    for (const [viewerId] of userSockets.entries()) {
      sendToUser(viewerId, 'status:updated', { userId: user.id });
    }

    res.status(201).json({ status: newStatus });
  });

  app.post('/api/statuses/:statusId/view', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const status = db.statuses.find((s) => s.id === req.params.statusId);
    if (!status) {
      res.status(404).json({ error: 'Status not found or expired.' });
      return;
    }

    if (status.userId !== user.id) {
      const existing = db.statusViews.find(
        (sv) => sv.statusId === status.id && sv.viewerId === user.id
      );
      if (!existing) {
        const now = new Date().toISOString();
        db.statusViews.push({
          id: `stv_${crypto.randomBytes(6).toString('hex')}`,
          statusId: status.id,
          viewerId: user.id,
          viewedAt: now,
        });
        saveDatabase();
        sendToUser(status.userId, 'status:viewed', {
          statusId: status.id,
          viewer: sanitizeUserForViewer(user, status.userId),
          viewedAt: now,
        });
      }
    }

    res.json({ success: true });
  });

  app.delete('/api/statuses/:statusId', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: UserRecord }).user;
    const status = db.statuses.find((s) => s.id === req.params.statusId);
    if (!status || status.userId !== user.id) {
      res.status(403).json({ error: 'You can only delete your own statuses.' });
      return;
    }

    db.statuses = db.statuses.filter((s) => s.id !== status.id);
    db.statusViews = db.statusViews.filter((sv) => sv.statusId !== status.id);
    saveDatabase();

    for (const [viewerId] of userSockets.entries()) {
      sendToUser(viewerId, 'status:updated', { userId: user.id });
    }

    res.json({ success: true });
  });

  // --- STORAGE USAGE METRICS ---
  app.get('/api/storage/stats', requireAuth, (req, res) => {
    purgeExpiredRecords();
    const user = (req as express.Request & { user: UserRecord }).user;
    const myConvIds = new Set(
      db.conversations.filter((c) => c.participantIds.includes(user.id)).map((c) => c.id)
    );
    const messageCount = db.messages.filter((m) => myConvIds.has(m.conversationId)).length;
    const mediaItems = db.media.filter(
      (m) => m.ownerId === user.id || (m.conversationId && myConvIds.has(m.conversationId))
    );
    const totalMediaBytes = mediaItems.reduce((acc, item) => acc + item.sizeBytes, 0);

    res.json({
      conversationsCount: myConvIds.size,
      messageCount,
      mediaCount: mediaItems.length,
      totalMediaBytes,
      retentionDays: 7,
    });
  });

  // --- WEBSOCKET SERVER FOR REAL-TIME PRESENCE, TYPING, AND MESSAGES ---
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const token = url.searchParams.get('token') || '';
    const now = new Date().toISOString();
    const session = db.sessions.find((s) => s.token === token && s.expiresAt > now);
    if (!session) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const user = db.users.find((u) => u.id === session.userId);
    if (!user) {
      ws.close(4001, 'User not found');
      return;
    }

    const userId = user.id;
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(ws);

    user.isOnline = true;
    user.lastSeen = new Date().toISOString();
    saveDatabase();
    broadcastPresenceChange(userId);

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(String(raw));
        if (data.event === 'typing' && data.payload?.conversationId) {
          const conv = db.conversations.find((c) => c.id === data.payload.conversationId);
          if (conv && conv.participantIds.includes(userId)) {
            const otherId =
              conv.participantIds[0] === userId
                ? conv.participantIds[1]
                : conv.participantIds[0];
            if (!isBlockedBetween(userId, otherId).blocked) {
              sendToUser(otherId, 'typing', {
                conversationId: conv.id,
                userId,
                isTyping: !!data.payload.isTyping,
              });
            }
          }
        }
      } catch {
        // Ignore malformed WS packets
      }
    });

    ws.on('close', () => {
      const set = userSockets.get(userId);
      if (set) {
        set.delete(ws);
        if (set.size === 0) {
          userSockets.delete(userId);
          const u = db.users.find((usr) => usr.id === userId);
          if (u) {
            u.isOnline = false;
            u.lastSeen = new Date().toISOString();
            saveDatabase();
            broadcastPresenceChange(userId);
          }
        }
      }
    });
  });

  // --- VITE MIDDLEWARE OR PRODUCTION STATIC ASSETS ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true' ? { server: httpServer } : false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`LAMAVI server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
