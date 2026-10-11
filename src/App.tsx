import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  CircleDot,
  Users,
  Settings,
  Search,
  SquarePen,
  WifiOff,
  Check,
  CheckCheck,
  Clock,
  Image as ImageIcon,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import {
  UserProfile,
  ConversationItem,
  MessageItem,
  StatusItem,
  OutgoingQueueItem,
} from './types';
import { AuthScreen } from './components/AuthScreen';
import { Avatar } from './components/Avatar';
import { ChatWindow } from './components/ChatWindow';
import { StatusView } from './components/StatusView';
import { ContactsView } from './components/ContactsView';
import { SettingsView } from './components/SettingsView';
import { UserSearchModal } from './components/UserSearchModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { FullScreenImageViewer } from './components/SecureImage';
import { formatRelativeTime } from './utils/media';
import './firebase';

type ActiveTab = 'chats' | 'status' | 'contacts' | 'settings';
const DEMO_USER_IDS = new Set(['usr_clara_vance', 'usr_julian_mercer', 'usr_sora_takahashi']);

export default function App() {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('lamavi_auth_token') || localStorage.getItem('nacre_auth_token');
    } catch {
      return null;
    }
  });
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const raw =
        localStorage.getItem('lamavi_current_user') || localStorage.getItem('nacre_current_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [authChecking, setAuthChecking] = useState<boolean>(() => !!token && !currentUser);
  const [activeTab, setActiveTab] = useState<ActiveTab>('chats');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [chatListSearch, setChatListSearch] = useState('');
  const [showUserSearchModal, setShowUserSearchModal] = useState(false);
  const [fullScreenDpPreview, setFullScreenDpPreview] = useState<{
    src: string;
    caption?: string;
  } | null>(null);

  // Real-time and cached state
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [messagesByConv, setMessagesByConv] = useState<Record<string, MessageItem[]>>({});
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const [contacts, setContacts] = useState<UserProfile[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<UserProfile[]>([]);
  const [typingByConv, setTypingByConv] = useState<Record<string, boolean>>({});

  // Connectivity & Offline Queue
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [outgoingQueue, setOutgoingQueue] = useState<OutgoingQueueItem[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const syncingRef = useRef<boolean>(false);

  const saveCache = useCallback((uid: string, key: string, data: unknown) => {
    try {
      localStorage.setItem(`lamavi_${key}_${uid}`, JSON.stringify(data));
    } catch {
      // Ignore quota errors
    }
  }, []);

  const loadCache = useCallback(<T,>(uid: string, key: string, fallback: T): T => {
    try {
      const raw = localStorage.getItem(`lamavi_${key}_${uid}`);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const cachedConvs = loadCache<ConversationItem[]>(currentUser.id, 'convs', []).filter(
      (c) => !DEMO_USER_IDS.has(c.recipient.id)
    );
    setConversations((prev) => (prev.length > 0 ? prev : cachedConvs));
    setMessagesByConv((prev) =>
      Object.keys(prev).length > 0
        ? prev
        : loadCache<Record<string, MessageItem[]>>(currentUser.id, 'msgs', {})
    );
    setOutgoingQueue(loadCache<OutgoingQueueItem[]>(currentUser.id, 'queue', []));
  }, [currentUser, loadCache]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setAuthChecking(false);
      return;
    }

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data && data.user) {
            setCurrentUser(data.user);
            localStorage.setItem('lamavi_current_user', JSON.stringify(data.user));
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setAuthChecking(false);
      });
  }, [token]);

  const fetchAllData = useCallback(async () => {
    if (!token || !currentUser) return;
    try {
      const [convRes, statusRes, contactsRes] = await Promise.all([
        fetch('/api/conversations', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/statuses', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/contacts', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (convRes.ok) {
        const convData = await convRes.json();
        const cleanConvs = (convData.conversations || []).filter(
          (c: ConversationItem) => !DEMO_USER_IDS.has(c.recipient.id)
        );
        setConversations(cleanConvs);
        saveCache(currentUser.id, 'convs', cleanConvs);
      }
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const cleanStatuses = (statusData.statuses || []).filter(
          (s: StatusItem) => !DEMO_USER_IDS.has(s.userId)
        );
        setStatuses(cleanStatuses);
      }
      if (contactsRes.ok) {
        const contactsData = await contactsRes.json();
        const cleanContacts = (contactsData.contacts || []).filter(
          (ct: UserProfile) => !DEMO_USER_IDS.has(ct.id)
        );
        setContacts(cleanContacts);
        setBlockedUsers(contactsData.blockedUsers || []);
      }
    } catch {
      // Offline fallback already loaded
    }
  }, [token, currentUser, saveCache]);

  useEffect(() => {
    if (token && currentUser && isOnline) {
      fetchAllData();
    }
  }, [token, currentUser?.id, isOnline, fetchAllData]);

  const fetchConversationMessages = useCallback(
    async (convId: string) => {
      if (!token || !currentUser) return;
      try {
        const res = await fetch(`/api/conversations/${convId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setMessagesByConv((prev) => {
            const next = { ...prev, [convId]: data.messages || [] };
            saveCache(currentUser.id, 'msgs', next);
            return next;
          });
        }

        await fetch(`/api/conversations/${convId}/read`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
        );
      } catch {
        // Offline fallback uses cached messagesByConv
      }
    },
    [token, currentUser, saveCache]
  );

  useEffect(() => {
    if (selectedConvId && isOnline) {
      fetchConversationMessages(selectedConvId);
    }
  }, [selectedConvId, isOnline, fetchConversationMessages]);

  // Real-time BroadcastChannel listener for instant multi-tab / multi-window synchronization
  useEffect(() => {
    if (!token || !currentUser || typeof BroadcastChannel === 'undefined') return;
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('lamavi_realtime_sync');
      bc.onmessage = (event) => {
        if (event.data && event.data.type === 'state_updated') {
          fetchAllData();
          if (selectedConvId) {
            fetchConversationMessages(selectedConvId);
          }
        }
      };
    } catch {
      // ignore if unsupported
    }
    return () => {
      if (bc) bc.close();
    };
  }, [token, currentUser?.id, selectedConvId, fetchAllData, fetchConversationMessages]);

  // Periodic sync fallback for serverless hosts (e.g. Vercel) where persistent WebSockets may not stay open
  useEffect(() => {
    if (!token || !currentUser || !isOnline) return;
    const interval = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        fetchAllData();
        if (selectedConvId) {
          fetchConversationMessages(selectedConvId);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [token, currentUser?.id, isOnline, selectedConvId, fetchAllData, fetchConversationMessages]);

  useEffect(() => {
    if (!token || !currentUser || !isOnline) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        const { event: evtType, payload } = packet;

        if (evtType === 'message:new') {
          const { conversationId, message } = payload as {
            conversationId: string;
            message: MessageItem;
          };

          setMessagesByConv((prev) => {
            const existingList = prev[conversationId] || [];
            const filtered = existingList.filter(
              (m) =>
                m.id !== message.id &&
                (!message.clientTempId || m.clientTempId !== message.clientTempId)
            );
            const nextList = [...filtered, message].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt)
            );
            const next = { ...prev, [conversationId]: nextList };
            saveCache(currentUser.id, 'msgs', next);
            return next;
          });

          if (selectedConvId === conversationId && message.senderId !== currentUser.id) {
            fetch(`/api/conversations/${conversationId}/read`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            }).catch(() => {});
          }

          fetchAllData();
        } else if (evtType === 'message:status') {
          const { conversationId, messageId, status, deliveredAt } = payload;
          setMessagesByConv((prev) => {
            const list = prev[conversationId] || [];
            const nextList = list.map((m) =>
              m.id === messageId ? { ...m, status, deliveredAt } : m
            );
            return { ...prev, [conversationId]: nextList };
          });
          fetchAllData();
        } else if (evtType === 'messages:read') {
          const { conversationId, messageIds, readAt } = payload as {
            conversationId: string;
            messageIds: string[];
            readAt: string;
          };
          const idSet = new Set(messageIds);
          setMessagesByConv((prev) => {
            const list = prev[conversationId] || [];
            const nextList = list.map((m) =>
              idSet.has(m.id) ? { ...m, status: 'read' as const, readAt } : m
            );
            return { ...prev, [conversationId]: nextList };
          });
          fetchAllData();
        } else if (evtType === 'message:deleted') {
          const { conversationId, messageId, mode } = payload;
          setMessagesByConv((prev) => {
            const list = prev[conversationId] || [];
            const nextList =
              mode === 'everyone'
                ? list.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          text: 'This message was deleted',
                          imageId: undefined,
                          localImageDataUrl: undefined,
                          isDeletedPlaceholder: true,
                        }
                      : m
                  )
                : list.filter((m) => m.id !== messageId);
            return { ...prev, [conversationId]: nextList };
          });
          fetchAllData();
        } else if (evtType === 'presence:update') {
          const { userId, isOnline: userOnline, lastSeen } = payload;
          setConversations((prev) =>
            prev.map((c) =>
              c.recipient.id === userId
                ? { ...c, recipient: { ...c.recipient, isOnline: userOnline, lastSeen } }
                : c
            )
          );
          setContacts((prev) =>
            prev.map((ct) =>
              ct.id === userId ? { ...ct, isOnline: userOnline, lastSeen } : ct
            )
          );
        } else if (evtType === 'typing') {
          const { conversationId, isTyping } = payload;
          setTypingByConv((prev) => ({ ...prev, [conversationId]: isTyping }));
        } else if (
          evtType === 'user:updated' ||
          evtType === 'status:updated' ||
          evtType === 'status:viewed'
        ) {
          fetchAllData();
        }
      } catch {
        // Ignore malformed WS message
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [token, currentUser?.id, isOnline, selectedConvId, fetchAllData, saveCache]);

  const flushOutgoingQueue = useCallback(async () => {
    if (!isOnline || !token || !currentUser || syncingRef.current) return;
    const currentQueue = loadCache<OutgoingQueueItem[]>(currentUser.id, 'queue', []);
    const pendingItems = currentQueue.filter((q) => q.status !== 'sending');
    if (pendingItems.length === 0) return;

    syncingRef.current = true;
    let remainingQueue = [...currentQueue];

    for (const item of pendingItems) {
      try {
        let uploadedMediaId: string | undefined;
        if (item.imageDataBase64) {
          const mediaRes = await fetch('/api/media', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              dataBase64: item.imageDataBase64,
              mimeType: item.imageMimeType || 'image/jpeg',
              conversationId: item.conversationId,
            }),
          });
          if (!mediaRes.ok) throw new Error('Media upload failed');
          const mediaData = await mediaRes.json();
          uploadedMediaId = mediaData.mediaId;
        }

        const msgRes = await fetch(`/api/conversations/${item.conversationId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            text: item.text,
            imageId: uploadedMediaId,
            replyToMessageId: item.replyToMessageId,
            clientTempId: item.clientTempId,
          }),
        });

        if (!msgRes.ok) throw new Error('Message send failed');
        const { message: savedMsg } = await msgRes.json();

        remainingQueue = remainingQueue.filter((q) => q.clientTempId !== item.clientTempId);
        setOutgoingQueue(remainingQueue);
        saveCache(currentUser.id, 'queue', remainingQueue);

        setMessagesByConv((prev) => {
          const list = prev[item.conversationId] || [];
          const nextList = list
            .filter((m) => m.clientTempId !== item.clientTempId && m.id !== savedMsg.id)
            .concat(savedMsg)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          const next = { ...prev, [item.conversationId]: nextList };
          saveCache(currentUser.id, 'msgs', next);
          return next;
        });
      } catch {
        remainingQueue = remainingQueue.map((q) =>
          q.clientTempId === item.clientTempId ? { ...q, status: 'failed' as const } : q
        );
        setOutgoingQueue(remainingQueue);
        saveCache(currentUser.id, 'queue', remainingQueue);
      }
    }

    syncingRef.current = false;
    fetchAllData();
  }, [isOnline, token, currentUser, loadCache, saveCache, fetchAllData]);

  useEffect(() => {
    if (isOnline && outgoingQueue.length > 0) {
      flushOutgoingQueue();
    }
  }, [isOnline, outgoingQueue.length, flushOutgoingQueue]);

  const handleSendMessage = async (
    conversationId: string,
    text: string,
    options?: {
      imageDataBase64?: string;
      imageMimeType?: string;
      replyToMessageId?: string;
      retryTempId?: string;
    }
  ) => {
    if (!currentUser || !token || !isOnline) return;

    const activeConvObj = conversations.find((c) => c.id === conversationId);
    const recipientId = activeConvObj?.recipient?.id;

    const clientTempId =
      options?.retryTempId || `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const optimisticMsg: MessageItem = {
      id: clientTempId,
      clientTempId,
      conversationId,
      senderId: currentUser.id,
      recipientId,
      text,
      localImageDataUrl: options?.imageDataBase64,
      replyToMessageId: options?.replyToMessageId,
      createdAt: now,
      status: 'sending',
    };

    setMessagesByConv((prev) => {
      const list = (prev[conversationId] || []).filter((m) => m.clientTempId !== clientTempId);
      const next = { ...prev, [conversationId]: [...list, optimisticMsg] };
      saveCache(currentUser.id, 'msgs', next);
      return next;
    });

    setConversations((prev) =>
      prev
        .map((c) =>
          c.id === conversationId ? { ...c, lastMessage: optimisticMsg, updatedAt: now } : c
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    );

    try {
      let uploadedMediaId: string | undefined;
      if (options?.imageDataBase64) {
        const mediaRes = await fetch('/api/media', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            dataBase64: options.imageDataBase64,
            mimeType: options.imageMimeType || 'image/jpeg',
            conversationId,
          }),
        });
        if (!mediaRes.ok) {
          const errPayload = await mediaRes.json().catch(() => ({}));
          throw new Error(errPayload.error || 'Image upload failed');
        }
        const mediaData = await mediaRes.json();
        uploadedMediaId = mediaData.mediaId;
      }

      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          imageId: uploadedMediaId,
          replyToMessageId: options?.replyToMessageId,
          clientTempId,
          recipientId,
          targetUser: activeConvObj?.recipient,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload.error || `Message send failed (HTTP ${res.status})`);
      }
      const { message: confirmedMsg } = payload;

      setMessagesByConv((prev) => {
        const list = (prev[conversationId] || []).filter(
          (m) => m.clientTempId !== clientTempId && m.id !== confirmedMsg.id
        );
        const next = {
          ...prev,
          [conversationId]: [...list, confirmedMsg].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt)
          ),
        };
        saveCache(currentUser.id, 'msgs', next);
        return next;
      });

      fetchAllData();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to deliver message.';
      setMessagesByConv((prev) => {
        const list = (prev[conversationId] || []).map((m) =>
          m.clientTempId === clientTempId
            ? { ...m, status: 'failed' as const, errorMessage }
            : m
        );
        return { ...prev, [conversationId]: list };
      });
    }
  };

  const handleStartConversation = async (targetUser: UserProfile) => {
    if (!token || !isOnline) return;
    setShowUserSearchModal(false);

    try {
      const res = await fetch('/api/conversations/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipientId: targetUser.id, targetUser }),
      });
      const data = await res.json();
      if (res.ok && data.conversation) {
        await fetchAllData();
        setActiveTab('chats');
        setSelectedConvId(data.conversation.id);
      }
    } catch {
      // Ignore if offline
    }
  };

  const handleAddContact = async (targetUser: UserProfile) => {
    if (!token || !isOnline) return;
    await fetch('/api/contacts/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ targetUserId: targetUser.id, targetUser }),
    });
    fetchAllData();
  };

  const handleRemoveContact = async (targetUserId: string) => {
    if (!token || !isOnline) return;
    await fetch('/api/contacts/remove', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ targetUserId }),
    });
    fetchAllData();
  };

  const handleDeleteMessage = async (messageId: string, mode: 'me' | 'everyone') => {
    if (!token || !selectedConvId || !isOnline) return;
    await fetch(`/api/messages/${messageId}?mode=${mode}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await fetchConversationMessages(selectedConvId);
    await fetchAllData();
  };

  const handleClearHistory = async (conversationId: string) => {
    if (!token || !currentUser || !isOnline) return;
    await fetch(`/api/conversations/${conversationId}/clear`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setMessagesByConv((prev) => {
      const next = { ...prev, [conversationId]: [] };
      saveCache(currentUser.id, 'msgs', next);
      return next;
    });
    await fetchAllData();
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (!token || !isOnline) return;
    await fetch(`/api/conversations/${conversationId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (selectedConvId === conversationId) {
      setSelectedConvId(null);
    }
    await fetchAllData();
  };

  const handleToggleBlockUser = async (targetUserId: string, currentlyBlocked: boolean) => {
    if (!token || !isOnline) return;
    const endpoint = currentlyBlocked ? '/api/users/unblock' : '/api/users/block';
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ targetUserId }),
    });
    await fetchAllData();
  };

  const handleUpdateProfile = async (updates: Partial<UserProfile>) => {
    if (!token) return;
    const res = await fetch('/api/users/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update profile.');
    }
    setCurrentUser(data.user);
    localStorage.setItem('lamavi_current_user', JSON.stringify(data.user));
    await fetchAllData();
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore
      }
    }
    localStorage.removeItem('lamavi_auth_token');
    localStorage.removeItem('lamavi_current_user');
    localStorage.removeItem('nacre_auth_token');
    localStorage.removeItem('nacre_current_user');
    setToken(null);
    setCurrentUser(null);
    setSelectedConvId(null);
  };

  const handleDeleteAccount = async () => {
    if (!token) return;
    await fetch('/api/users/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    localStorage.clear();
    setToken(null);
    setCurrentUser(null);
    setSelectedConvId(null);
  };

  const sendTypingSignal = (conversationId: string, isTyping: boolean) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          event: 'typing',
          payload: { conversationId, isTyping },
        })
      );
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen w-full bg-[#F8F9FA] flex flex-col items-center justify-center gap-3">
        <img src="/logo.png" alt="LAMAVI" className="w-20 h-20 object-contain rounded-2xl" />
        <div className="text-xs font-medium tracking-widest text-[#636366]">LAMAVI</div>
      </div>
    );
  }

  if (!token || !currentUser) {
    return (
      <AuthScreen
        onAuthenticated={(newToken, user) => {
          localStorage.setItem('lamavi_auth_token', newToken);
          localStorage.setItem('lamavi_current_user', JSON.stringify(user));
          setToken(newToken);
          setCurrentUser(user);
        }}
      />
    );
  }

  const activeConversation = conversations.find((c) => c.id === selectedConvId) || null;
  const activeMessages: MessageItem[] = selectedConvId ? messagesByConv[selectedConvId] || [] : [];

  const filteredConversations = conversations.filter((conv) => {
    if (!chatListSearch.trim()) return true;
    const q = chatListSearch.toLowerCase();
    return (
      conv.recipient.fullName.toLowerCase().includes(q) ||
      conv.recipient.username.toLowerCase().includes(q) ||
      (conv.lastMessage?.text && conv.lastMessage.text.toLowerCase().includes(q))
    );
  });

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);
  const unviewedStatusesCount = statuses.filter(
    (s) => s.userId !== currentUser.id && !s.viewedByMe
  ).length;
  const isProfileIncomplete = !currentUser.avatarUrl || !currentUser.bio?.trim();

  return (
    <div className="h-screen w-full bg-[#F8F9FA] text-[#1C1C1E] flex flex-col overflow-hidden">
      {/* Offline Connectivity Banner */}
      {!isOnline && (
        <div className="bg-[#FEF3C7] border-b border-[#FDE68A] px-4 py-2 flex items-center justify-center gap-2 text-xs font-medium text-[#B45309] shrink-0 z-40">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>
            You are offline — Connecting to users and sending messages is disabled until your internet connection returns.
          </span>
        </div>
      )}

      {/* Main Workspace Container (Full height above bottom tab bar) */}
      <div className="flex-1 flex flex-col overflow-hidden max-w-[1440px] w-full mx-auto bg-white pb-16">
        {/* Profile Setup Onboarding Banner when user has rough placeholder avatar or no bio */}
        {isProfileIncomplete && activeTab !== 'settings' && !selectedConvId && (
          <div className="px-4 py-2.5 bg-[#F8F9FA] border-b border-[#E5E5EA] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="w-4 h-4 text-[#2C2C2E] shrink-0" />
              <span className="text-xs text-[#1C1C1E] truncate">
                Welcome to <strong>LAMAVI</strong>! Go to Settings to upload your profile picture and set your personal bio bubble.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="px-3 py-1.5 rounded-xl bg-[#2C2C2E] text-white text-xs font-semibold flex items-center gap-1 shrink-0"
            >
              <span>Go to Settings</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* TAB 1: CHATS */}
        {activeTab === 'chats' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Conversation List Column */}
            <div
              className={`${
                selectedConvId ? 'hidden lg:flex' : 'flex'
              } w-full lg:w-[390px] xl:w-[420px] flex-col border-r border-[#E5E5EA] bg-white shrink-0`}
            >
              {/* Top Bar with LAMAVI Logo & Actions */}
              <div className="h-16 px-4 border-b border-[#E5E5EA] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <img
                    src="/logo.png"
                    alt="LAMAVI"
                    className="w-9 h-9 rounded-xl object-contain border border-[#E5E5EA] bg-[#F8F9FA] p-0.5"
                  />
                  <div>
                    <h1 className="font-display text-base font-bold tracking-[0.18em] text-[#1C1C1E]">
                      LAMAVI
                    </h1>
                    <p className="text-[10px] text-[#636366]">Let&apos;s connect each other</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <PWAInstallButton variant="compact" />
                  <button
                    type="button"
                    onClick={() => setShowUserSearchModal(true)}
                    className="min-h-[42px] min-w-[42px] rounded-xl hover:bg-[#F2F2F7] flex items-center justify-center text-[#1C1C1E] transition-colors"
                    title="Search users by username or Gmail"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowUserSearchModal(true)}
                    className="min-h-[42px] min-w-[42px] rounded-xl bg-[#F2F2F7] hover:bg-[#E5E5EA] border border-[#D1D1D6] flex items-center justify-center text-[#1C1C1E] transition-colors"
                    title="Start new conversation"
                  >
                    <SquarePen className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Search Conversations Bar */}
              <div className="p-3 border-b border-[#E5E5EA] bg-[#F8F9FA]/60">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#8E8E93] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={chatListSearch}
                    onChange={(e) => setChatListSearch(e.target.value)}
                    placeholder="Filter your conversations..."
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-[#E5E5EA] focus:border-[#8E8E93] text-xs text-[#1C1C1E] outline-none"
                  />
                </div>
              </div>

              {/* Conversation Rows */}
              <div className="flex-1 overflow-y-auto divide-y divide-[#E5E5EA]">
                {filteredConversations.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-sm font-medium text-[#1C1C1E]">No conversations yet</p>
                    <p className="text-xs text-[#636366] mt-1 leading-relaxed">
                      Search for a person&apos;s username or registered Gmail address to view their profile and start chatting.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowUserSearchModal(true)}
                      className="mt-4 h-10 px-4 rounded-xl bg-[#2C2C2E] text-white text-xs font-semibold"
                    >
                      Find User by Username or Gmail
                    </button>
                  </div>
                ) : (
                  filteredConversations.map((conv) => {
                    const isSelected = conv.id === selectedConvId;
                    const lastMsg = conv.lastMessage;
                    const isLastFromMe = lastMsg?.senderId === currentUser.id;
                    const isTyping = typingByConv[conv.id];
                    const showPreview = currentUser.notifications?.previewText ?? true;

                    return (
                      <div
                        key={conv.id}
                        onClick={() => setSelectedConvId(conv.id)}
                        className={`w-full px-4 py-3.5 flex items-center gap-3.5 text-left transition-colors cursor-pointer ${
                          isSelected ? 'bg-[#F2F2F7]' : 'hover:bg-[#F8F9FA]'
                        }`}
                      >
                        <div
                          onClick={(e) => {
                            if (conv.recipient.avatarUrl) {
                              e.stopPropagation();
                              setFullScreenDpPreview({
                                src: conv.recipient.avatarUrl,
                                caption: `${conv.recipient.fullName} (@${conv.recipient.username})`,
                              });
                            }
                          }}
                          title={conv.recipient.avatarUrl ? 'Tap to view DP' : undefined}
                        >
                          <Avatar
                            src={conv.recipient.avatarUrl}
                            name={conv.recipient.fullName}
                            size="lg"
                            isOnline={conv.recipient.isOnline}
                            showPresence
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display text-sm font-semibold text-[#1C1C1E] truncate">
                              {conv.recipient.fullName}
                            </span>
                            <span className="font-mono-num text-[11px] text-[#636366] shrink-0">
                              {formatRelativeTime(lastMsg?.createdAt || conv.updatedAt)}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-xs text-[#636366] truncate">
                              {isTyping ? (
                                <span className="text-[#1C1C1E] font-medium">typing...</span>
                              ) : !lastMsg ? (
                                <span className="text-[#8E8E93]">Tap to start chatting</span>
                              ) : !showPreview ? (
                                <span>New message</span>
                              ) : (
                                <>
                                  {isLastFromMe && (
                                    <span className="shrink-0">
                                      {lastMsg.status === 'pending' ||
                                      lastMsg.status === 'sending' ? (
                                        <Clock className="w-3.5 h-3.5 text-[#8E8E93]" />
                                      ) : lastMsg.status === 'read' ? (
                                        <CheckCheck className="w-3.5 h-3.5 text-[#1C1C1E]" />
                                      ) : lastMsg.status === 'delivered' ? (
                                        <CheckCheck className="w-3.5 h-3.5 text-[#636366]" />
                                      ) : (
                                        <Check className="w-3.5 h-3.5 text-[#8E8E93]" />
                                      )}
                                    </span>
                                  )}
                                  {lastMsg.imageId && !lastMsg.isDeletedPlaceholder && (
                                    <ImageIcon className="w-3.5 h-3.5 text-[#636366] shrink-0" />
                                  )}
                                  <span
                                    className={`truncate ${
                                      conv.unreadCount > 0
                                        ? 'font-semibold text-[#1C1C1E]'
                                        : 'text-[#636366]'
                                    }`}
                                  >
                                    {lastMsg.text || (lastMsg.imageId ? 'Photo' : '')}
                                  </span>
                                </>
                              )}
                            </div>

                            {conv.unreadCount > 0 && (
                              <span className="font-mono-num text-xs font-bold text-[#1C1C1E] shrink-0">
                                {conv.unreadCount} unread
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Active Chat Detail Pane */}
            <div
              className={`${
                selectedConvId ? 'flex' : 'hidden lg:flex'
              } flex-1 flex-col bg-[#F8F9FA]`}
            >
              {activeConversation ? (
                <ChatWindow
                  conversation={activeConversation}
                  currentUser={currentUser}
                  messages={activeMessages}
                  token={token}
                  isOnline={isOnline}
                  isRecipientTyping={!!typingByConv[activeConversation.id]}
                  onBack={() => setSelectedConvId(null)}
                  onSendMessage={handleSendMessage}
                  onDeleteMessage={handleDeleteMessage}
                  onClearHistory={handleClearHistory}
                  onDeleteConversation={handleDeleteConversation}
                  onToggleBlockUser={handleToggleBlockUser}
                  onRemoveContact={handleRemoveContact}
                  onAddContact={handleAddContact}
                  onTyping={sendTypingSignal}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="w-28 h-28 rounded-3xl bg-white border border-[#E5E5EA] shadow-2xs flex items-center justify-center p-2 mb-4">
                    <img
                      src="/logo.png"
                      alt="LAMAVI"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <h2 className="font-display text-xl font-bold tracking-[0.22em] text-[#1C1C1E]">
                    LAMAVI
                  </h2>
                  <p className="text-xs font-medium text-[#636366] mt-1">
                    Let&apos;s connect each other
                  </p>
                  <p className="text-xs text-[#8E8E93] mt-3 max-w-sm leading-relaxed">
                    Search by exact username or registered Gmail address to view a user&apos;s profile and start a private conversation.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowUserSearchModal(true)}
                    className="mt-5 h-11 px-5 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white text-xs font-semibold flex items-center gap-2 transition-colors"
                  >
                    <SquarePen className="w-4 h-4" />
                    <span>Find User to Connect</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: STATUS */}
        {activeTab === 'status' && (
          <StatusView
            currentUser={currentUser}
            statuses={statuses}
            token={token}
            onRefreshStatuses={fetchAllData}
            onMarkViewed={async (statusId) => {
              await fetch(`/api/statuses/${statusId}/view`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              });
              fetchAllData();
            }}
            onDeleteStatus={async (statusId) => {
              await fetch(`/api/statuses/${statusId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              });
              fetchAllData();
            }}
          />
        )}

        {/* TAB 3: CONTACTS */}
        {activeTab === 'contacts' && (
          <ContactsView
            currentUser={currentUser}
            contacts={contacts}
            blockedUsers={blockedUsers}
            token={token}
            onOpenSearchModal={() => setShowUserSearchModal(true)}
            onStartConversation={handleStartConversation}
            onRemoveContact={handleRemoveContact}
            onToggleBlock={handleToggleBlockUser}
            onUpdateWhoCanContact={async (setting) => {
              await handleUpdateProfile({
                privacy: {
                  profilePicVisibility: currentUser.privacy?.profilePicVisibility || 'everyone',
                  lastSeenVisibility: currentUser.privacy?.lastSeenVisibility || 'everyone',
                  readReceipts: currentUser.privacy?.readReceipts ?? true,
                  statusPrivacy: currentUser.privacy?.statusPrivacy || 'everyone',
                  whoCanContact: setting,
                },
              });
            }}
          />
        )}

        {/* TAB 4: SETTINGS */}
        {activeTab === 'settings' && (
          <SettingsView
            currentUser={currentUser}
            blockedUsers={blockedUsers}
            token={token}
            queuedCount={outgoingQueue.length}
            onUpdateProfile={handleUpdateProfile}
            onUnblockUser={(uid) => handleToggleBlockUser(uid, true)}
            onClearLocalCache={() => {
              localStorage.removeItem(`lamavi_convs_${currentUser.id}`);
              localStorage.removeItem(`lamavi_msgs_${currentUser.id}`);
            }}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
          />
        )}
      </div>

      {/* Unified Bottom Navigation Bar across Mobile & Desktop (Chats, Status, Contacts, Settings) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 h-16 bg-white/95 backdrop-blur-md border-t border-[#E5E5EA]">
        <div className="max-w-xl mx-auto h-full grid grid-cols-4 items-center px-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('chats');
              setSelectedConvId(null);
            }}
            className={`min-h-[44px] flex flex-col items-center justify-center relative transition-colors ${
              activeTab === 'chats' ? 'text-[#1C1C1E] font-semibold' : 'text-[#8E8E93] hover:text-[#3A3A3C]'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-[10px] mt-1">Chats</span>
            {totalUnread > 0 && (
              <span className="absolute top-0.5 right-6 font-mono-num text-[10px] font-bold text-[#1C1C1E]">
                {totalUnread}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`min-h-[44px] flex flex-col items-center justify-center relative transition-colors ${
              activeTab === 'status' ? 'text-[#1C1C1E] font-semibold' : 'text-[#8E8E93] hover:text-[#3A3A3C]'
            }`}
          >
            <CircleDot className="w-5 h-5" />
            <span className="text-[10px] mt-1">Status</span>
            {unviewedStatusesCount > 0 && (
              <span className="absolute top-0.5 right-6 font-mono-num text-[10px] font-bold text-[#1C1C1E]">
                {unviewedStatusesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('contacts')}
            className={`min-h-[44px] flex flex-col items-center justify-center transition-colors ${
              activeTab === 'contacts' ? 'text-[#1C1C1E] font-semibold' : 'text-[#8E8E93] hover:text-[#3A3A3C]'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] mt-1">Contacts</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`min-h-[44px] flex flex-col items-center justify-center relative transition-colors ${
              activeTab === 'settings' ? 'text-[#1C1C1E] font-semibold' : 'text-[#8E8E93] hover:text-[#3A3A3C]'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[10px] mt-1">Settings</span>
            {isProfileIncomplete && (
              <span className="w-2 h-2 rounded-full bg-[#2C2C2E] absolute top-1.5 right-8" />
            )}
          </button>
        </div>
      </nav>

      {/* User Directory Search Modal */}
      {showUserSearchModal && (
        <UserSearchModal
          token={token}
          isOnline={isOnline}
          onClose={() => setShowUserSearchModal(false)}
          onStartConversation={handleStartConversation}
          onAddContact={handleAddContact}
        />
      )}

      {/* Full Screen DP Preview from Chat List */}
      {fullScreenDpPreview && (
        <FullScreenImageViewer
          src={fullScreenDpPreview.src}
          caption={fullScreenDpPreview.caption}
          onClose={() => setFullScreenDpPreview(null)}
        />
      )}
    </div>
  );
}
