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

export interface UserProfile {
  id: string;
  fullName: string;
  username: string;
  email?: string;
  bio: string;
  avatarUrl: string;
  isOnline: boolean;
  lastSeen: string | null;
  createdAt?: string;
  usernameChangesRemaining?: number;
  privacy?: PrivacySettings;
  notifications?: NotificationSettings;
  chatSettings?: ChatSettings;
  isContact?: boolean;
  isBlocked?: boolean;
}

export type MessageDeliveryState = 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageItem {
  id: string;
  clientTempId?: string;
  conversationId: string;
  senderId: string;
  recipientId?: string;
  text: string;
  imageId?: string;
  localImageDataUrl?: string; // used while offline/uploading
  replyToMessageId?: string;
  createdAt: string;
  status: MessageDeliveryState;
  deliveredAt?: string;
  readAt?: string;
  isDeletedPlaceholder?: boolean;
  errorMessage?: string;
}

export interface ConversationItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  recipient: UserProfile;
  lastMessage: MessageItem | null;
  unreadCount: number;
  blockedByMe: boolean;
  blockedByThem: boolean;
}

export interface StatusViewer {
  viewerId: string;
  fullName: string;
  username: string;
  avatarUrl: string;
  viewedAt: string;
}

export interface StatusItem {
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
  user: UserProfile | null;
  viewedByMe: boolean;
  viewCount?: number;
  viewers?: StatusViewer[];
}

export interface OutgoingQueueItem {
  clientTempId: string;
  conversationId: string;
  text: string;
  imageDataBase64?: string;
  imageMimeType?: string;
  replyToMessageId?: string;
  createdAt: string;
  status: 'pending' | 'sending' | 'failed';
}
