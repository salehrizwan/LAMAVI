import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  MoreVertical,
  Send,
  Image as ImageIcon,
  Smile,
  Reply,
  Copy,
  Trash2,
  X,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  RotateCcw,
  ShieldBan,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { ConversationItem, MessageItem, UserProfile } from '../types';
import { Avatar } from './Avatar';
import { SecureImage, FullScreenImageViewer } from './SecureImage';
import { compressImageFile, formatChatTimestamp, formatRelativeTime } from '../utils/media';

interface ChatWindowProps {
  conversation: ConversationItem;
  currentUser: UserProfile;
  messages: MessageItem[];
  token: string;
  isOnline: boolean;
  isRecipientTyping: boolean;
  onBack: () => void;
  onSendMessage: (
    conversationId: string,
    text: string,
    options?: {
      imageDataBase64?: string;
      imageMimeType?: string;
      replyToMessageId?: string;
      retryTempId?: string;
    }
  ) => Promise<void>;
  onDeleteMessage: (messageId: string, mode: 'me' | 'everyone') => Promise<void>;
  onClearHistory: (conversationId: string) => Promise<void>;
  onDeleteConversation: (conversationId: string) => Promise<void>;
  onToggleBlockUser: (targetUserId: string, currentlyBlocked: boolean) => Promise<void>;
  onRemoveContact?: (targetUserId: string) => Promise<void>;
  onAddContact?: (targetUser: UserProfile) => Promise<void>;
  onTyping: (conversationId: string, isTyping: boolean) => void;
}

const COMMON_EMOJIS = [
  '😊', '😂', '🤍', '✨', '👍', '🙏', '🎉', '🔥',
  '👏', '💡', '📷', '☕', '🌿', '🏛️', '🎧', '🥂',
  '🤝', '👋', '💯', '🚀', '🥳', '😌', '🤔', '👀',
];

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversation,
  currentUser,
  messages,
  token,
  isOnline,
  isRecipientTyping,
  onBack,
  onSendMessage,
  onDeleteMessage,
  onClearHistory,
  onDeleteConversation,
  onToggleBlockUser,
  onRemoveContact,
  onAddContact,
  onTyping,
}) => {
  const draftStorageKey = `nacre_draft_${currentUser.id}_${conversation.id}`;
  const [inputText, setInputText] = useState<string>(() => {
    try {
      return localStorage.getItem(draftStorageKey) || '';
    } catch {
      return '';
    }
  });

  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [selectedMsgMenu, setSelectedMsgMenu] = useState<MessageItem | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showContactInfoModal, setShowContactInfoModal] = useState(false);
  const [copiedUsername, setCopiedUsername] = useState(false);
  const [confirmClearModal, setConfirmClearModal] = useState(false);
  const [confirmDeleteConvModal, setConfirmDeleteConvModal] = useState(false);
  const [confirmUnconnectModal, setConfirmUnconnectModal] = useState(false);
  const [confirmConnectModal, setConfirmConnectModal] = useState(false);

  // Image preview before sending
  const [pendingImage, setPendingImage] = useState<{
    dataUrl: string;
    mimeType: string;
    caption: string;
  } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Full screen viewer
  const [fullScreenImage, setFullScreenImage] = useState<{ src: string; caption?: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  // Persist draft whenconversation changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftStorageKey) || '';
      setInputText(saved);
    } catch {
      setInputText('');
    }
    setReplyTo(null);
    setSelectedMsgMenu(null);
    setShowEmojiPicker(false);
    setShowContactInfoModal(false);
  }, [conversation.id, draftStorageKey]);

  const handleInputChange = (val: string) => {
    setInputText(val);
    try {
      if (val) {
        localStorage.setItem(draftStorageKey, val);
      } else {
        localStorage.removeItem(draftStorageKey);
      }
    } catch {
      // Ignore storage quota
    }

    onTyping(conversation.id, val.trim().length > 0);
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      onTyping(conversation.id, false);
    }, 2200);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isRecipientTyping]);

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    const currentReplyId = replyTo?.id;
    setInputText('');
    setReplyTo(null);
    setShowEmojiPicker(false);
    try {
      localStorage.removeItem(draftStorageKey);
    } catch {
      // ignore
    }
    onTyping(conversation.id, false);

    await onSendMessage(conversation.id, trimmed, {
      replyToMessageId: currentReplyId,
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImageError(null);

    try {
      const compressed = await compressImageFile(file, 1280, 0.82);
      setPendingImage({
        dataUrl: compressed.dataUrl,
        mimeType: compressed.mimeType,
        caption: inputText.trim(),
      });
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Could not process selected image.');
    }
  };

  const handleConfirmSendImage = async () => {
    if (!pendingImage) return;
    setUploadingImage(true);
    const { dataUrl, mimeType, caption } = pendingImage;
    const currentReplyId = replyTo?.id;

    setPendingImage(null);
    setReplyTo(null);
    setInputText('');
    try {
      localStorage.removeItem(draftStorageKey);
    } catch {
      // ignore
    }

    try {
      await onSendMessage(conversation.id, caption.trim(), {
        imageDataBase64: dataUrl,
        imageMimeType: mimeType,
        replyToMessageId: currentReplyId,
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const fontSizeClass =
    currentUser.chatSettings?.fontSize === 'small'
      ? 'text-xs'
      : currentUser.chatSettings?.fontSize === 'large'
      ? 'text-base'
      : 'text-sm';

  const recipient = conversation.recipient;

  const handleCopyUsername = () => {
    navigator.clipboard.writeText(`@${recipient.username}`);
    setCopiedUsername(true);
    setTimeout(() => setCopiedUsername(false), 1800);
  };

  const renderDeliveryIcon = (msg: MessageItem) => {
    if (msg.senderId !== currentUser.id) return null;
    if (msg.status === 'pending' || msg.status === 'sending') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-[#8E8E93]" title="Pending sync">
          <Clock className="w-3 h-3" />
          <span>{msg.status === 'sending' ? 'Sending' : 'Pending'}</span>
        </span>
      );
    }
    if (msg.status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] text-[#B91C1C]" title="Delivery failed">
          <AlertCircle className="w-3 h-3" />
          <span>Failed</span>
        </span>
      );
    }
    if (msg.status === 'read') {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-[#1C1C1E] font-medium" title="Read">
          <CheckCheck className="w-3.5 h-3.5 text-[#1C1C1E]" />
          <span>Read</span>
        </span>
      );
    }
    if (msg.status === 'delivered') {
      return (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-[#636366]" title="Delivered">
          <CheckCheck className="w-3.5 h-3.5 text-[#636366]" />
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-[#8E8E93]" title="Sent">
        <Check className="w-3.5 h-3.5" />
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#F8F9FA] relative">
      {/* Sticky iOS Chat Top Header */}
      <header className="h-15 px-3 sm:px-5 bg-white/90 backdrop-blur-md border-b border-[#E5E5EA] flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            className="lg:hidden min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-[#1C1C1E] hover:bg-[#F2F2F7] rounded-full transition-colors shrink-0"
            aria-label="Back to chats"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Clicking the DP directly opens full-screen DP viewer (or Contact Info if no photo) */}
          <button
            type="button"
            onClick={() => {
              if (recipient.avatarUrl) {
                setFullScreenImage({
                  src: recipient.avatarUrl,
                  caption: `${recipient.fullName} (@${recipient.username})`,
                });
              } else {
                setShowContactInfoModal(true);
              }
            }}
            className="shrink-0 rounded-full focus:outline-none cursor-pointer transition-transform active:scale-95"
            title="Tap to view profile picture"
          >
            <Avatar
              src={recipient.avatarUrl}
              name={recipient.fullName}
              size="md"
              isOnline={recipient.isOnline}
              showPresence
            />
          </button>

          {/* Clicking the header bar / name / status opens WhatsApp-style Contact Info sheet */}
          <button
            type="button"
            onClick={() => setShowContactInfoModal(true)}
            className="min-w-0 flex-1 text-left py-1 px-1.5 rounded-xl hover:bg-[#F2F2F7]/70 transition-colors cursor-pointer"
            title="Tap here for contact info"
          >
            <div className="flex items-center gap-1.5">
              <h2 className="font-display text-sm sm:text-base font-semibold text-[#1C1C1E] truncate">
                {recipient.fullName}
              </h2>
              <span className="text-xs text-[#8E8E93] truncate">@{recipient.username}</span>
            </div>
            <p className="text-[11px] text-[#636366] truncate">
              {isRecipientTyping
                ? 'typing...'
                : recipient.isOnline
                ? 'Online · tap for contact info'
                : recipient.lastSeen
                ? `Last seen ${formatRelativeTime(recipient.lastSeen)} · tap for info`
                : 'Tap here for contact info'}
            </p>
          </button>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowHeaderMenu(!showHeaderMenu)}
            className="min-h-[44px] min-w-[44px] rounded-full hover:bg-[#F2F2F7] flex items-center justify-center text-[#3A3A3C] transition-colors"
            aria-label="Conversation options"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {showHeaderMenu && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setShowHeaderMenu(false)} />
              <div className="absolute right-0 mt-1 w-56 rounded-2xl bg-white border border-[#E5E5EA] shadow-lg py-1.5 z-30">
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setShowContactInfoModal(true);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#1C1C1E] hover:bg-[#F8F9FA] flex items-center gap-2.5"
                >
                  <ImageIcon className="w-4 h-4 text-[#636366]" />
                  <span>View Contact Profile & Bio</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleCopyUsername();
                    setShowHeaderMenu(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#1C1C1E] hover:bg-[#F8F9FA] flex items-center gap-2.5"
                >
                  <Copy className="w-4 h-4 text-[#636366]" />
                  <span>Copy Username (@{recipient.username})</span>
                </button>
                {recipient.isContact && onRemoveContact && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowHeaderMenu(false);
                      setConfirmUnconnectModal(true);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#1C1C1E] hover:bg-[#F8F9FA] flex items-center gap-2.5"
                  >
                    <UserMinus className="w-4 h-4 text-[#636366]" />
                    <span>Unconnect</span>
                  </button>
                )}
                {!recipient.isContact && onAddContact && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowHeaderMenu(false);
                      setConfirmConnectModal(true);
                    }}
                    className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#1C1C1E] hover:bg-[#F8F9FA] flex items-center gap-2.5"
                  >
                    <UserPlus className="w-4 h-4 text-[#636366]" />
                    <span>Connect Contact</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setConfirmClearModal(true);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#1C1C1E] hover:bg-[#F8F9FA] flex items-center gap-2.5"
                >
                  <RotateCcw className="w-4 h-4 text-[#636366]" />
                  <span>Clear Chat History</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderMenu(false);
                    onToggleBlockUser(recipient.id, conversation.blockedByMe);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#1C1C1E] hover:bg-[#F8F9FA] flex items-center gap-2.5"
                >
                  <ShieldBan className="w-4 h-4 text-[#636366]" />
                  <span>{conversation.blockedByMe ? 'Unblock User' : 'Block User'}</span>
                </button>
                <div className="my-1 border-t border-[#E5E5EA]" />
                <button
                  type="button"
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setConfirmDeleteConvModal(true);
                  }}
                  className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2] flex items-center gap-2.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Conversation</span>
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Image Error Banner */}
      {imageError && (
        <div className="px-4 py-2.5 bg-[#FEF2F2] border-b border-[#FECACA] flex items-center justify-between text-xs text-[#B91C1C]">
          <span>{imageError}</span>
          <button onClick={() => setImageError(null)} className="p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Scrollable Message Stream */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-2.5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 rounded-2xl bg-white border border-[#E5E5EA] flex items-center justify-center text-[#8E8E93] mb-3 shadow-2xs">
              <Send className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-[#1C1C1E]">No messages yet</p>
            <p className="text-xs text-[#636366] mt-1 max-w-xs">
              Send a message or share a photo to start your conversation with {recipient.fullName}.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId === currentUser.id;
            const repliedMsg = msg.replyToMessageId
              ? messages.find((m) => m.id === msg.replyToMessageId)
              : null;

            return (
              <div
                key={msg.id || msg.clientTempId}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  onClick={() => {
                    if (!msg.isDeletedPlaceholder) {
                      setSelectedMsgMenu(selectedMsgMenu?.id === msg.id ? null : msg);
                    }
                  }}
                  className={`group relative max-w-[82%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 transition-all cursor-pointer ${
                    isMine
                      ? 'bg-[#E5E5EA] text-[#1C1C1E] rounded-br-xs border border-[#D1D1D6]'
                      : 'bg-white text-[#1C1C1E] rounded-bl-xs border border-[#E5E5EA] shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
                  }`}
                >
                  {/* Quoted Reply Header */}
                  {repliedMsg && !msg.isDeletedPlaceholder && (
                    <div className="mb-2 pl-2.5 py-1 rounded-lg bg-[#F8F9FA]/80 border border-[#D1D1D6] text-xs">
                      <div className="font-semibold text-[#3A3A3C] text-[11px]">
                        {repliedMsg.senderId === currentUser.id ? 'You' : recipient.fullName}
                      </div>
                      <div className="text-[#636366] truncate">
                        {repliedMsg.text || (repliedMsg.imageId ? 'Photo' : 'Message')}
                      </div>
                    </div>
                  )}

                  {/* Image Attachment */}
                  {!msg.isDeletedPlaceholder && (msg.imageId || msg.localImageDataUrl) && (
                    <div className="mb-2 overflow-hidden rounded-xl">
                      <SecureImage
                        mediaId={msg.imageId}
                        localDataUrl={msg.localImageDataUrl}
                        token={token}
                        autoDownload={currentUser.chatSettings?.autoDownloadImages ?? true}
                        onClickFullScreen={(src) =>
                          setFullScreenImage({ src, caption: msg.text || undefined })
                        }
                        className="max-h-72 w-auto object-cover"
                      />
                    </div>
                  )}

                  {/* Message Body Text */}
                  {msg.text && (
                    <p
                      className={`${fontSizeClass} whitespace-pre-wrap break-words leading-relaxed ${
                        msg.isDeletedPlaceholder ? 'italic text-[#8E8E93]' : 'text-[#1C1C1E]'
                      }`}
                    >
                      {msg.text}
                    </p>
                  )}

                  {/* Timestamp + Delivery State */}
                  <div className="mt-1 flex items-center justify-end gap-1.5 select-none">
                    <span className="font-mono-num text-[10px] text-[#636366]">
                      {formatChatTimestamp(msg.createdAt)}
                    </span>
                    {renderDeliveryIcon(msg)}
                  </div>
                </div>

                {/* Retry button if failed */}
                {msg.status === 'failed' && msg.clientTempId && (
                  <button
                    type="button"
                    onClick={() =>
                      onSendMessage(conversation.id, msg.text, {
                        imageDataBase64: msg.localImageDataUrl,
                        replyToMessageId: msg.replyToMessageId,
                        retryTempId: msg.clientTempId,
                      })
                    }
                    className="mt-1 text-[11px] font-medium text-[#B91C1C] underline flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Retry sending</span>
                  </button>
                )}

                {/* Contextual Action Bar when message is clicked */}
                {selectedMsgMenu?.id === msg.id && !msg.isDeletedPlaceholder && (
                  <div className="mt-1.5 flex items-center gap-1 p-1 rounded-xl bg-white border border-[#D1D1D6] shadow-md z-10">
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(msg);
                        setSelectedMsgMenu(null);
                      }}
                      className="px-2.5 py-1.5 rounded-lg hover:bg-[#F2F2F7] text-xs font-medium text-[#1C1C1E] flex items-center gap-1"
                    >
                      <Reply className="w-3.5 h-3.5" />
                      <span>Reply</span>
                    </button>
                    {msg.text && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(msg.text);
                          setCopiedId(msg.id);
                          setTimeout(() => setCopiedId(null), 1500);
                          setSelectedMsgMenu(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg hover:bg-[#F2F2F7] text-xs font-medium text-[#1C1C1E] flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>{copiedId === msg.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteMessage(msg.id, 'me');
                        setSelectedMsgMenu(null);
                      }}
                      className="px-2.5 py-1.5 rounded-lg hover:bg-[#FEF2F2] text-xs font-medium text-[#B91C1C] flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete for me</span>
                    </button>
                    {isMine && !msg.id.startsWith('temp_') && (
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteMessage(msg.id, 'everyone');
                          setSelectedMsgMenu(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg hover:bg-[#FEF2F2] text-xs font-medium text-[#B91C1C] flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete for all</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Blocked State Notice */}
      {(conversation.blockedByMe || conversation.blockedByThem) && (
        <div className="px-4 py-3 bg-[#F2F2F7] border-t border-[#E5E5EA] flex items-center justify-between text-xs text-[#636366]">
          <span>
            {conversation.blockedByMe
              ? 'You blocked this contact.'
              : 'You cannot reply to this conversation.'}
          </span>
          {conversation.blockedByMe && (
            <button
              type="button"
              onClick={() => onToggleBlockUser(recipient.id, true)}
              className="font-semibold text-[#1C1C1E] underline"
            >
              Unblock
            </button>
          )}
        </div>
      )}

      {/* Reply Banner */}
      {replyTo && (
        <div className="px-4 py-2.5 bg-white border-t border-[#E5E5EA] flex items-center justify-between">
          <div className="min-w-0 flex-1 pr-3">
            <div className="text-xs font-semibold text-[#1C1C1E]">
              Replying to {replyTo.senderId === currentUser.id ? 'yourself' : recipient.fullName}
            </div>
            <div className="text-xs text-[#636366] truncate">
              {replyTo.text || (replyTo.imageId ? 'Photo' : '')}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="w-8 h-8 rounded-full hover:bg-[#F2F2F7] flex items-center justify-center text-[#636366]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="px-4 py-3 bg-white border-t border-[#E5E5EA] flex items-center gap-2 flex-wrap">
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleInputChange(inputText + emoji)}
              className="w-9 h-9 rounded-xl hover:bg-[#F2F2F7] text-lg flex items-center justify-center transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Message Input Composer */}
      {!conversation.blockedByMe && !conversation.blockedByThem && (
        <div className="p-2.5 sm:p-3.5 bg-white border-t border-[#E5E5EA] flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            disabled={!isOnline}
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#F8F9FA] hover:bg-[#F2F2F7] disabled:opacity-40 border border-[#E5E5EA] flex items-center justify-center text-[#3A3A3C] shrink-0 transition-colors"
            title={isOnline ? 'Share photo' : 'Reconnect to share photos'}
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          <button
            type="button"
            disabled={!isOnline}
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className={`min-h-[44px] min-w-[44px] rounded-xl border disabled:opacity-40 flex items-center justify-center shrink-0 transition-colors ${
              showEmojiPicker
                ? 'bg-[#E5E5EA] border-[#D1D1D6] text-[#1C1C1E]'
                : 'bg-[#F8F9FA] hover:bg-[#F2F2F7] border-[#E5E5EA] text-[#3A3A3C]'
            }`}
            title="Emoji picker"
          >
            <Smile className="w-5 h-5" />
          </button>

          <div className="flex-1 relative">
            <textarea
              rows={1}
              disabled={!isOnline}
              value={inputText}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === 'Enter' &&
                  !e.shiftKey &&
                  isOnline &&
                  (currentUser.chatSettings?.enterToSend ?? true)
                ) {
                  e.preventDefault();
                  handleSendText();
                }
              }}
              placeholder={
                isOnline
                  ? 'Message...'
                  : 'Offline — Reconnect to the internet to talk'
              }
              className="w-full max-h-32 min-h-[44px] py-2.5 px-3.5 rounded-2xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white disabled:opacity-60 text-sm text-[#1C1C1E] outline-none resize-none leading-snug"
            />
          </div>

          <button
            type="button"
            disabled={!inputText.trim() || !isOnline}
            onClick={() => handleSendText()}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-[#2C2C2E] hover:bg-[#3A3A3C] disabled:opacity-35 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Image Preview & Caption Modal Before Sending */}
      {pendingImage && (
        <div className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-[#E5E5EA] shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5EA]">
              <h3 className="font-display text-base font-semibold text-[#1C1C1E]">Send Photo</h3>
              <button
                onClick={() => setPendingImage(null)}
                className="w-9 h-9 rounded-full hover:bg-[#F2F2F7] flex items-center justify-center text-[#636366]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 bg-[#F8F9FA] flex flex-col items-center">
              <img
                src={pendingImage.dataUrl}
                alt="Preview before sending"
                className="max-h-64 rounded-2xl object-contain border border-[#E5E5EA] bg-white"
              />
              <input
                type="text"
                value={pendingImage.caption}
                onChange={(e) => setPendingImage({ ...pendingImage, caption: e.target.value })}
                placeholder="Add an optional caption..."
                className="mt-4 w-full h-11 px-4 rounded-xl bg-white border border-[#E5E5EA] focus:border-[#8E8E93] text-sm text-[#1C1C1E] outline-none"
              />
            </div>
            <div className="px-5 py-4 bg-white border-t border-[#E5E5EA] flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPendingImage(null)}
                className="flex-1 h-11 rounded-xl bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploadingImage}
                onClick={handleConfirmSendImage}
                className="flex-1 h-11 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-xs font-semibold text-white flex items-center justify-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{uploadingImage ? 'Sending...' : 'Send Photo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Chat Confirmation Modal */}
      {confirmClearModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E5E5EA] p-6 shadow-xl">
            <h3 className="font-display text-base font-semibold text-[#1C1C1E]">Clear Chat History?</h3>
            <p className="text-xs text-[#636366] mt-2 leading-relaxed">
              This will remove all messages in this conversation from your view. The conversation will remain in your chat list.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <button
                onClick={() => setConfirmClearModal(false)}
                className="flex-1 h-11 rounded-xl bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setConfirmClearModal(false);
                  await onClearHistory(conversation.id);
                }}
                className="flex-1 h-11 rounded-xl bg-[#B91C1C] text-xs font-semibold text-white"
              >
                Clear History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Conversation Confirmation Modal */}
      {confirmDeleteConvModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E5E5EA] p-6 shadow-xl">
            <h3 className="font-display text-base font-semibold text-[#1C1C1E]">Delete Conversation?</h3>
            <p className="text-xs text-[#636366] mt-2 leading-relaxed">
              This conversation and its history will be permanently removed from your chats list.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <button
                onClick={() => setConfirmDeleteConvModal(false)}
                className="flex-1 h-11 rounded-xl bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setConfirmDeleteConvModal(false);
                  await onDeleteConversation(conversation.id);
                }}
                className="flex-1 h-11 rounded-xl bg-[#B91C1C] text-xs font-semibold text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unconnect Confirmation Modal */}
      {confirmUnconnectModal && onRemoveContact && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E5E5EA] p-6 shadow-xl">
            <h3 className="font-display text-base font-semibold text-[#1C1C1E]">
              Unconnect @{recipient.username}?
            </h3>
            <p className="text-xs text-[#636366] mt-2 leading-relaxed">
              Are you sure you want to remove <strong>{recipient.fullName}</strong> from your contacts? Your chat history will remain intact.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <button
                onClick={() => setConfirmUnconnectModal(false)}
                className="flex-1 h-11 rounded-xl bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setConfirmUnconnectModal(false);
                  await onRemoveContact(recipient.id);
                }}
                className="flex-1 h-11 rounded-xl bg-[#B91C1C] text-xs font-semibold text-white"
              >
                Unconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connect Confirmation Modal */}
      {confirmConnectModal && onAddContact && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E5E5EA] p-6 shadow-xl">
            <h3 className="font-display text-base font-semibold text-[#1C1C1E]">
              Connect with {recipient.fullName}
            </h3>
            <p className="text-xs text-[#636366] mt-2 leading-relaxed">
              Do you want to add this person to your contacts?
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <button
                onClick={() => setConfirmConnectModal(false)}
                className="flex-1 h-11 rounded-xl bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setConfirmConnectModal(false);
                  await onAddContact(recipient);
                }}
                className="flex-1 h-11 rounded-xl bg-[#2C2C2E] text-xs font-semibold text-white"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp / iOS Style Contact Info Modal (DP, Name, Bio, Copy Username, Block) */}
      {showContactInfoModal && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-[#E5E5EA] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5EA]">
              <h3 className="font-display text-base font-semibold text-[#1C1C1E]">Contact Info</h3>
              <button
                type="button"
                onClick={() => setShowContactInfoModal(false)}
                className="w-9 h-9 rounded-full hover:bg-[#F2F2F7] flex items-center justify-center text-[#636366]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 bg-[#F8F9FA] flex flex-col items-center text-center border-b border-[#E5E5EA]">
              {/* iOS Notes-style thought bubble for Bio above DP */}
              <div className="relative mb-3 max-w-[260px]">
                <div className="px-4 py-2 rounded-2xl bg-white border border-[#E5E5EA] shadow-2xs text-xs text-[#1C1C1E] leading-snug">
                  {recipient.bio ? recipient.bio : 'No bio added yet'}
                </div>
                <div className="w-3 h-3 rounded-full bg-white border-r border-b border-[#E5E5EA] mx-auto -mt-1.5 rotate-45" />
                <div className="w-1.5 h-1.5 rounded-full bg-white border border-[#E5E5EA] mx-auto mt-0.5" />
              </div>

              <button
                type="button"
                onClick={() => {
                  if (recipient.avatarUrl) {
                    setFullScreenImage({
                      src: recipient.avatarUrl,
                      caption: `${recipient.fullName} (@${recipient.username})`,
                    });
                  }
                }}
                className={`rounded-full focus:outline-none ${
                  recipient.avatarUrl ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
                }`}
                title={recipient.avatarUrl ? 'Tap to view full-screen DP' : undefined}
              >
                <Avatar
                  src={recipient.avatarUrl}
                  name={recipient.fullName}
                  size="2xl"
                  isOnline={recipient.isOnline}
                  showPresence
                />
              </button>
              {recipient.avatarUrl && (
                <button
                  type="button"
                  onClick={() =>
                    setFullScreenImage({
                      src: recipient.avatarUrl,
                      caption: `${recipient.fullName} (@${recipient.username})`,
                    })
                  }
                  className="mt-2 text-[11px] font-medium text-[#636366] hover:text-[#1C1C1E] underline"
                >
                  Tap to view full-size DP
                </button>
              )}

              <h4 className="font-display text-lg font-bold text-[#1C1C1E] mt-3">
                {recipient.fullName}
              </h4>
              <p className="text-xs text-[#636366] mt-0.5">@{recipient.username}</p>
              <p className="text-[11px] text-[#8E8E93] mt-1">
                {recipient.isOnline
                  ? 'Online now'
                  : recipient.lastSeen
                  ? `Last seen ${formatRelativeTime(recipient.lastSeen)}`
                  : 'Offline'}
              </p>
            </div>

            <div className="p-5 space-y-3 bg-white">
              {/* Bio Section Card */}
              <div className="p-3.5 rounded-2xl bg-[#F8F9FA] border border-[#E5E5EA]">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93]">
                  About / Bio
                </div>
                <p className="text-sm text-[#1C1C1E] mt-1 leading-relaxed">
                  {recipient.bio ? recipient.bio : 'No bio added yet.'}
                </p>
              </div>

              {/* Copy Username to Share */}
              <div className="p-3.5 rounded-2xl bg-[#F8F9FA] border border-[#E5E5EA] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E93]">
                    Username
                  </div>
                  <div className="text-sm font-medium text-[#1C1C1E] truncate mt-0.5">
                    @{recipient.username}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUsername}
                  className="h-9 px-3.5 rounded-xl bg-white hover:bg-[#F2F2F7] border border-[#D1D1D6] text-xs font-semibold text-[#1C1C1E] flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  {copiedUsername ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#15803D]" />
                      <span className="text-[#15803D]">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Username</span>
                    </>
                  )}
                </button>
              </div>

              {/* Action Buttons: Block User & Clear/Delete */}
              <div className="pt-1 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await onToggleBlockUser(recipient.id, conversation.blockedByMe);
                  }}
                  className="w-full h-11 rounded-xl bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] text-xs font-semibold text-[#B91C1C] flex items-center justify-center gap-2 transition-colors"
                >
                  <ShieldBan className="w-4 h-4" />
                  <span>
                    {conversation.blockedByMe
                      ? `Unblock ${recipient.fullName}`
                      : `Block ${recipient.fullName}`}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowContactInfoModal(false);
                      setConfirmClearModal(true);
                    }}
                    className="h-10 rounded-xl bg-[#F8F9FA] hover:bg-[#F2F2F7] border border-[#E5E5EA] text-xs font-medium text-[#1C1C1E] flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#636366]" />
                    <span>Clear Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowContactInfoModal(false);
                      setConfirmDeleteConvModal(true);
                    }}
                    className="h-10 rounded-xl bg-[#F8F9FA] hover:bg-[#FEF2F2] border border-[#E5E5EA] text-xs font-medium text-[#B91C1C] flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Chat</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Image Lightbox */}
      {fullScreenImage && (
        <FullScreenImageViewer
          src={fullScreenImage.src}
          caption={fullScreenImage.caption}
          onClose={() => setFullScreenImage(null)}
        />
      )}
    </div>
  );
};
