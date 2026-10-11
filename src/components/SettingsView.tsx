import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Trash2,
  Check,
  AlertCircle,
  Lock,
  Bell,
  MessageSquare,
  Database,
  HelpCircle,
  LogOut,
  UserX,
  KeyRound,
  Shield,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Pencil,
} from 'lucide-react';
import {
  UserProfile,
  PrivacySettings,
  NotificationSettings,
  ChatSettings,
} from '../types';
import { Avatar } from './Avatar';
import { ImageCropperModal } from './ImageCropperModal';
import { PWAInstallButton } from './PWAInstallButton';
import { formatBytes } from '../utils/media';

interface SettingsViewProps {
  currentUser: UserProfile;
  blockedUsers: UserProfile[];
  token: string;
  queuedCount: number;
  onUpdateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  onUnblockUser: (userId: string) => Promise<void>;
  onClearLocalCache: () => void;
  onLogout: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

type SettingsScreenPage =
  | 'main'
  | 'profile'
  | 'privacy'
  | 'chats'
  | 'notifications'
  | 'security'
  | 'blocked'
  | 'storage'
  | 'help';

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  blockedUsers,
  token,
  onUpdateProfile,
  onUnblockUser,
  onClearLocalCache,
  onLogout,
  onDeleteAccount,
}) => {
  const [subPage, setSubPage] = useState<SettingsScreenPage>('main');

  // Profile edit state
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [username, setUsername] = useState(currentUser.username);
  const [email, setEmail] = useState(currentUser.email || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || '');
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  // Storage stats
  const [storageStats, setStorageStats] = useState<{
    conversationsCount: number;
    messageCount: number;
    mediaCount: number;
    totalMediaBytes: number;
    retentionDays?: number;
  } | null>(null);

  // Confirmation dialogs
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setFullName(currentUser.fullName);
    setUsername(currentUser.username);
    setEmail(currentUser.email || '');
    setBio(currentUser.bio || '');
    setAvatarUrl(currentUser.avatarUrl || '');
  }, [currentUser]);

  useEffect(() => {
    fetch('/api/storage/stats', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setStorageStats(data);
      })
      .catch(() => {});
  }, [token]);

  const handlePhotoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropperSrc(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await onUpdateProfile({
        fullName: fullName.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        bio: bio.trim(),
        avatarUrl,
      });
      setFeedback({ type: 'success', text: 'Your LAMAVI profile has been saved.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not update profile.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePrivacyChange = async (patch: Partial<PrivacySettings>) => {
    const updated: PrivacySettings = {
      profilePicVisibility: currentUser.privacy?.profilePicVisibility || 'everyone',
      lastSeenVisibility: currentUser.privacy?.lastSeenVisibility || 'everyone',
      readReceipts: currentUser.privacy?.readReceipts ?? true,
      statusPrivacy: currentUser.privacy?.statusPrivacy || 'everyone',
      whoCanContact: currentUser.privacy?.whoCanContact || 'everyone',
      ...patch,
    };
    await onUpdateProfile({ privacy: updated });
  };

  const handleNotificationChange = async (patch: Partial<NotificationSettings>) => {
    const updated: NotificationSettings = {
      messageAlerts: currentUser.notifications?.messageAlerts ?? true,
      soundEnabled: currentUser.notifications?.soundEnabled ?? true,
      previewText: currentUser.notifications?.previewText ?? true,
      ...patch,
    };
    await onUpdateProfile({ notifications: updated });
  };

  const handleChatSettingsChange = async (patch: Partial<ChatSettings>) => {
    const updated: ChatSettings = {
      enterToSend: currentUser.chatSettings?.enterToSend ?? true,
      fontSize: currentUser.chatSettings?.fontSize || 'medium',
      autoDownloadImages: currentUser.chatSettings?.autoDownloadImages ?? true,
      ...patch,
    };
    await onUpdateProfile({ chatSettings: updated });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwSuccess(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', text: data.error || 'Could not change password.' });
      } else {
        setPwSuccess('Password updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
      }
    } catch {
      setFeedback({ type: 'error', text: 'Network error while updating password.' });
    }
  };

  const isProfileIncomplete = !currentUser.avatarUrl || !currentUser.bio?.trim();
  const remainingUsernameChanges = currentUser.usernameChangesRemaining ?? 3;

  const renderSubPageHeader = (title: string) => (
    <div className="flex items-center gap-2 pb-4 border-b border-[#E5E5EA] mb-5">
      <button
        type="button"
        onClick={() => {
          setFeedback(null);
          setSubPage('main');
        }}
        className="min-h-[44px] px-2 -ml-2 rounded-xl hover:bg-[#F2F2F7] flex items-center gap-1 text-xs font-semibold text-[#1C1C1E] transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
        <span>Settings</span>
      </button>
      <h1 className="font-display text-lg font-bold text-[#1C1C1E] ml-1">{title}</h1>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-2xl mx-auto w-full pb-28">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handlePhotoFileSelect}
        className="hidden"
      />

      {feedback && (
        <div
          className={`mb-4 p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs ${
            feedback.type === 'success'
              ? 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
              : 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
          }`}
        >
          {feedback.type === 'success' ? (
            <Check className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* MAIN WHATSAPP-IOS CATEGORIZED SETTINGS MENU */}
      {subPage === 'main' && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#1C1C1E]">Settings</h1>
            <p className="text-xs text-[#636366] mt-0.5">
              Manage your LAMAVI ID, iOS bio bubble, privacy, and categories
            </p>
          </div>

          {/* Prompt if user has not set their photo or bio yet */}
          {isProfileIncomplete && (
            <div className="p-4 rounded-2xl bg-white border border-[#D1D1D6] shadow-2xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F2F2F7] border border-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-[#1C1C1E]">Complete Your LAMAVI ID</h2>
                  <p className="text-[11px] text-[#636366] mt-0.5">
                    Upload your profile picture and write your personal bio bubble above your photo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubPage('profile')}
                className="px-3.5 py-2 rounded-xl bg-[#2C2C2E] text-white text-xs font-semibold shrink-0"
              >
                Set Up Now
              </button>
            </div>
          )}

          {/* Top iOS Profile Card with Speech Bubble Bio Over Avatar */}
          <div className="bg-white rounded-3xl border border-[#E5E5EA] p-6 shadow-2xs flex flex-col items-center text-center">
            {/* iPhone / Instagram Notes Style Speech Bubble Above Avatar */}
            <button
              type="button"
              onClick={() => setSubPage('profile')}
              className="group relative mb-3 max-w-[240px] cursor-pointer"
              title="Tap to edit your bio bubble"
            >
              <div className="px-4 py-2 rounded-2xl bg-[#F8F9FA] group-hover:bg-[#F2F2F7] border border-[#D1D1D6] shadow-2xs text-xs font-medium text-[#1C1C1E] flex items-center gap-1.5 transition-colors">
                <span className="line-clamp-2">
                  {currentUser.bio?.trim() ? currentUser.bio : 'Add a personal bio note...'}
                </span>
                <Pencil className="w-3 h-3 text-[#8E8E93] shrink-0" />
              </div>
              <div className="w-3 h-3 rounded-full bg-[#F8F9FA] border-r border-b border-[#D1D1D6] mx-auto -mt-1.5 rotate-45" />
              <div className="w-1.5 h-1.5 rounded-full bg-[#F8F9FA] border border-[#D1D1D6] mx-auto mt-0.5" />
            </button>

            {/* Profile Picture with Camera Badge */}
            <div className="relative">
              <Avatar
                src={currentUser.avatarUrl}
                name={currentUser.fullName}
                size="2xl"
                onClick={() => fileInputRef.current?.click()}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white flex items-center justify-center ring-2 ring-white shadow-md cursor-pointer"
                title="Upload profile picture"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <h2 className="font-display text-lg font-bold text-[#1C1C1E] mt-3">
              {currentUser.fullName}
            </h2>
            <p className="text-xs text-[#636366] mt-0.5">@{currentUser.username}</p>
            {currentUser.email && (
              <p className="text-[11px] text-[#8E8E93] mt-0.5">{currentUser.email}</p>
            )}

            <button
              type="button"
              onClick={() => setSubPage('profile')}
              className="mt-4 h-10 px-5 rounded-xl bg-[#F2F2F7] hover:bg-[#E5E5EA] border border-[#D1D1D6] text-xs font-semibold text-[#1C1C1E] transition-colors"
            >
              Edit Profile & Bio Bubble
            </button>
          </div>

          {/* PWA Install Row when opened in browser */}
          <PWAInstallButton variant="row" />

          {/* Categorized WhatsApp-iOS Style Rows */}
          <div className="bg-white rounded-3xl border border-[#E5E5EA] divide-y divide-[#E5E5EA] overflow-hidden shadow-2xs">
            <button
              type="button"
              onClick={() => setSubPage('profile')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F8F9FA] active:bg-[#F2F2F7] transition-colors text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] flex items-center justify-center text-[#1C1C1E]">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#1C1C1E]">
                    Edit Profile & Username
                  </div>
                  <div className="text-xs text-[#636366]">
                    Photo, bio bubble, full name, and username ({remainingUsernameChanges}/3 monthly changes left)
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setSubPage('privacy')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F8F9FA] active:bg-[#F2F2F7] transition-colors text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] flex items-center justify-center text-[#1C1C1E]">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#1C1C1E]">Privacy Controls</div>
                  <div className="text-xs text-[#636366]">
                    Profile photo, last seen, status audience, and read receipts
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setSubPage('chats')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F8F9FA] active:bg-[#F2F2F7] transition-colors text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] flex items-center justify-center text-[#1C1C1E]">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#1C1C1E]">Chat Settings</div>
                  <div className="text-xs text-[#636366]">
                    Enter key behavior, text size, and photo auto-download
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setSubPage('notifications')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F8F9FA] active:bg-[#F2F2F7] transition-colors text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] flex items-center justify-center text-[#1C1C1E]">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#1C1C1E]">Notifications</div>
                  <div className="text-xs text-[#636366]">
                    Alert tones and message preview visibility
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-[#E5E5EA] divide-y divide-[#E5E5EA] overflow-hidden shadow-2xs">
            <button
              type="button"
              onClick={() => setSubPage('security')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F8F9FA] active:bg-[#F2F2F7] transition-colors text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] flex items-center justify-center text-[#1C1C1E]">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#1C1C1E]">Account Security</div>
                  <div className="text-xs text-[#636366]">Update your 8-character password</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setSubPage('blocked')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F8F9FA] active:bg-[#F2F2F7] transition-colors text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] flex items-center justify-center text-[#1C1C1E]">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#1C1C1E]">
                    Blocked Users ({blockedUsers.length})
                  </div>
                  <div className="text-xs text-[#636366]">Manage blocked accounts</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setSubPage('storage')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F8F9FA] active:bg-[#F2F2F7] transition-colors text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] flex items-center justify-center text-[#1C1C1E]">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#1C1C1E]">
                    Storage & 7-Day Auto-Retention
                  </div>
                  <div className="text-xs text-[#636366]">
                    Messages and media are saved for up to 7 days
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => setSubPage('help')}
              className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-[#F8F9FA] active:bg-[#F2F2F7] transition-colors text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] flex items-center justify-center text-[#1C1C1E]">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#1C1C1E]">Help & Support</div>
                  <div className="text-xs text-[#636366]">About LAMAVI & real-time messaging</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8E8E93] shrink-0" />
            </button>
          </div>

          {/* Log Out & Delete Account */}
          <div className="bg-white rounded-3xl border border-[#E5E5EA] p-4 flex flex-col sm:flex-row items-center gap-3 shadow-2xs">
            <button
              type="button"
              onClick={() => setConfirmLogout(true)}
              className="w-full sm:w-auto flex-1 h-11 rounded-xl bg-[#F2F2F7] hover:bg-[#E5E5EA] text-xs font-semibold text-[#1C1C1E] flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Log Out</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteAccount(true)}
              className="w-full sm:w-auto flex-1 h-11 rounded-xl bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] text-xs font-semibold text-[#B91C1C] flex items-center justify-center gap-2 transition-colors"
            >
              <UserX className="w-4 h-4" />
              <span>Delete Account</span>
            </button>
          </div>
        </div>
      )}

      {/* SUBPAGE: EDIT PROFILE & BIO BUBBLE */}
      {subPage === 'profile' && (
        <div>
          {renderSubPageHeader('Edit Profile & Bio')}

          <div className="bg-white rounded-3xl border border-[#E5E5EA] p-6 space-y-6">
            {/* Live Preview of iPhone Bio Bubble Over Avatar */}
            <div className="flex flex-col items-center pb-5 border-b border-[#E5E5EA]">
              <div className="relative mb-3 max-w-[240px]">
                <div className="px-4 py-2 rounded-2xl bg-[#F8F9FA] border border-[#D1D1D6] shadow-2xs text-xs font-medium text-[#1C1C1E] text-center">
                  {bio.trim() ? bio : 'Your bio note appears here...'}
                </div>
                <div className="w-3 h-3 rounded-full bg-[#F8F9FA] border-r border-b border-[#D1D1D6] mx-auto -mt-1.5 rotate-45" />
                <div className="w-1.5 h-1.5 rounded-full bg-[#F8F9FA] border border-[#D1D1D6] mx-auto mt-0.5" />
              </div>

              <Avatar src={avatarUrl} name={fullName} size="2xl" />

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-10 px-4 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Upload & Crop Photo</span>
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl('')}
                    className="h-10 px-3.5 rounded-xl bg-[#F2F2F7] hover:bg-[#E5E5EA] text-xs font-semibold text-[#B91C1C] flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1C1C1E] mb-1">
                  Personal Bio Bubble (Shown above your photo)
                </label>
                <input
                  type="text"
                  maxLength={90}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Share a short thought or status bio..."
                  className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none"
                />
                <p className="text-[11px] text-[#8E8E93] mt-1">
                  Styled like an iOS note bubble directly over your profile photo ({bio.length}/90)
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1C1E] mb-1">
                  Full Real Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[#1C1C1E]">
                    Unique Username
                  </label>
                  <span className="text-[11px] font-medium text-[#636366]">
                    {remainingUsernameChanges} of 3 monthly changes remaining
                  </span>
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))
                  }
                  className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none"
                />
                <p className="text-[11px] text-[#8E8E93] mt-1">
                  You can change your username up to 3 times within a 30-day period.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1C1E] mb-1">
                  Registered Gmail / Email Address <span className="text-[#B91C1C]">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full h-12 rounded-2xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                {saving ? 'Saving Profile...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SUBPAGE: PRIVACY CONTROLS */}
      {subPage === 'privacy' && (
        <div>
          {renderSubPageHeader('Privacy Controls')}
          <div className="bg-white rounded-3xl border border-[#E5E5EA] p-5 divide-y divide-[#E5E5EA] text-xs">
            <div className="py-3.5 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[#1C1C1E]">Profile Picture Visibility</div>
                <div className="text-[#636366] mt-0.5">Choose who can see your profile photo</div>
              </div>
              <select
                value={currentUser.privacy?.profilePicVisibility || 'everyone'}
                onChange={(e) =>
                  handlePrivacyChange({
                    profilePicVisibility: e.target.value as 'everyone' | 'contacts' | 'nobody',
                  })
                }
                className="h-10 px-3 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] text-[#1C1C1E] font-medium outline-none"
              >
                <option value="everyone">Everyone</option>
                <option value="contacts">My Contacts</option>
                <option value="nobody">Nobody</option>
              </select>
            </div>

            <div className="py-3.5 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[#1C1C1E]">Last Seen & Online Presence</div>
                <div className="text-[#636366] mt-0.5">Control visibility of your online status</div>
              </div>
              <select
                value={currentUser.privacy?.lastSeenVisibility || 'everyone'}
                onChange={(e) =>
                  handlePrivacyChange({
                    lastSeenVisibility: e.target.value as 'everyone' | 'contacts' | 'nobody',
                  })
                }
                className="h-10 px-3 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] text-[#1C1C1E] font-medium outline-none"
              >
                <option value="everyone">Everyone</option>
                <option value="contacts">My Contacts</option>
                <option value="nobody">Nobody</option>
              </select>
            </div>

            <div className="py-3.5 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[#1C1C1E]">Status Privacy</div>
                <div className="text-[#636366] mt-0.5">Default audience for 24-hour status updates</div>
              </div>
              <select
                value={currentUser.privacy?.statusPrivacy || 'everyone'}
                onChange={(e) =>
                  handlePrivacyChange({
                    statusPrivacy: e.target.value as 'everyone' | 'contacts',
                  })
                }
                className="h-10 px-3 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] text-[#1C1C1E] font-medium outline-none"
              >
                <option value="everyone">Everyone</option>
                <option value="contacts">Contacts Only</option>
              </select>
            </div>

            <div className="py-3.5 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[#1C1C1E]">Read Receipts</div>
                <div className="text-[#636366] mt-0.5">
                  Send and receive Read indicators on messages
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  handlePrivacyChange({
                    readReceipts: !(currentUser.privacy?.readReceipts ?? true),
                  })
                }
                className={`w-12 h-7 rounded-full transition-colors p-1 ${
                  currentUser.privacy?.readReceipts ?? true ? 'bg-[#2C2C2E]' : 'bg-[#D1D1D6]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    currentUser.privacy?.readReceipts ?? true ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBPAGE: CHAT SETTINGS */}
      {subPage === 'chats' && (
        <div>
          {renderSubPageHeader('Chat Settings')}
          <div className="bg-white rounded-3xl border border-[#E5E5EA] p-5 divide-y divide-[#E5E5EA] text-xs">
            <div className="py-3.5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[#1C1C1E]">Press Enter to Send</div>
                <div className="text-[#636366] mt-0.5">Send message when pressing Enter key</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleChatSettingsChange({
                    enterToSend: !(currentUser.chatSettings?.enterToSend ?? true),
                  })
                }
                className={`w-12 h-7 rounded-full p-1 transition-colors ${
                  currentUser.chatSettings?.enterToSend ?? true ? 'bg-[#2C2C2E]' : 'bg-[#D1D1D6]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    currentUser.chatSettings?.enterToSend ?? true
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="py-3.5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[#1C1C1E]">Message Text Size</div>
                <div className="text-[#636366] mt-0.5">Adjust chat bubble font scaling</div>
              </div>
              <select
                value={currentUser.chatSettings?.fontSize || 'medium'}
                onChange={(e) =>
                  handleChatSettingsChange({
                    fontSize: e.target.value as 'small' | 'medium' | 'large',
                  })
                }
                className="h-10 px-3 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] font-medium"
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>

            <div className="py-3.5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[#1C1C1E]">Auto-Download Photos</div>
                <div className="text-[#636366] mt-0.5">Automatically load shared images in chats</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleChatSettingsChange({
                    autoDownloadImages: !(currentUser.chatSettings?.autoDownloadImages ?? true),
                  })
                }
                className={`w-12 h-7 rounded-full p-1 transition-colors ${
                  currentUser.chatSettings?.autoDownloadImages ?? true
                    ? 'bg-[#2C2C2E]'
                    : 'bg-[#D1D1D6]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    currentUser.chatSettings?.autoDownloadImages ?? true
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBPAGE: NOTIFICATIONS */}
      {subPage === 'notifications' && (
        <div>
          {renderSubPageHeader('Notifications')}
          <div className="bg-white rounded-3xl border border-[#E5E5EA] p-5 divide-y divide-[#E5E5EA] text-xs">
            <div className="py-3.5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[#1C1C1E]">In-App Message Alerts</div>
                <div className="text-[#636366] mt-0.5">Show real-time alerts for new messages</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleNotificationChange({
                    messageAlerts: !(currentUser.notifications?.messageAlerts ?? true),
                  })
                }
                className={`w-12 h-7 rounded-full p-1 transition-colors ${
                  currentUser.notifications?.messageAlerts ?? true ? 'bg-[#2C2C2E]' : 'bg-[#D1D1D6]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    currentUser.notifications?.messageAlerts ?? true
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="py-3.5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[#1C1C1E]">Notification Sound</div>
                <div className="text-[#636366] mt-0.5">Play subtle chime on incoming messages</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleNotificationChange({
                    soundEnabled: !(currentUser.notifications?.soundEnabled ?? true),
                  })
                }
                className={`w-12 h-7 rounded-full p-1 transition-colors ${
                  currentUser.notifications?.soundEnabled ?? true ? 'bg-[#2C2C2E]' : 'bg-[#D1D1D6]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    currentUser.notifications?.soundEnabled ?? true
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="py-3.5 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[#1C1C1E]">Message Preview in List</div>
                <div className="text-[#636366] mt-0.5">Show latest message text in chat list</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleNotificationChange({
                    previewText: !(currentUser.notifications?.previewText ?? true),
                  })
                }
                className={`w-12 h-7 rounded-full p-1 transition-colors ${
                  currentUser.notifications?.previewText ?? true ? 'bg-[#2C2C2E]' : 'bg-[#D1D1D6]'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    currentUser.notifications?.previewText ?? true
                      ? 'translate-x-5'
                      : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUBPAGE: ACCOUNT SECURITY */}
      {subPage === 'security' && (
        <div>
          {renderSubPageHeader('Account Security')}
          <div className="bg-white rounded-3xl border border-[#E5E5EA] p-6 space-y-4">
            {pwSuccess && <p className="text-xs text-[#15803D] font-medium">{pwSuccess}</p>}
            <form onSubmit={handleChangePassword} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#1C1C1E] mb-1">Current Password</label>
                <input
                  type="password"
                  required
                  maxLength={8}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current 8-character password"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#1C1C1E] mb-1">
                  New Password (8 chars, 1 letter, 1 digit)
                </label>
                <input
                  type="password"
                  required
                  maxLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New 8-character password"
                  className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full h-11 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] font-semibold text-white transition-colors"
              >
                Update Password
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SUBPAGE: BLOCKED USERS */}
      {subPage === 'blocked' && (
        <div>
          {renderSubPageHeader('Blocked Users')}
          <div className="bg-white rounded-3xl border border-[#E5E5EA] p-5">
            {blockedUsers.length === 0 ? (
              <p className="text-xs text-[#636366] text-center py-6">
                You have not blocked any accounts.
              </p>
            ) : (
              <div className="divide-y divide-[#E5E5EA]">
                {blockedUsers.map((bu) => (
                  <div key={bu.id} className="flex items-center justify-between text-xs py-3">
                    <div className="flex items-center gap-3">
                      <Avatar src={bu.avatarUrl} name={bu.fullName} size="sm" />
                      <div>
                        <div className="font-semibold text-[#1C1C1E]">{bu.fullName}</div>
                        <div className="text-[#8E8E93]">@{bu.username}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUnblockUser(bu.id)}
                      className="px-3 py-1.5 rounded-xl bg-[#F2F2F7] text-[#1C1C1E] font-semibold"
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBPAGE: STORAGE & 7-DAY RETENTION */}
      {subPage === 'storage' && (
        <div>
          {renderSubPageHeader('Storage & 7-Day Retention')}
          <div className="bg-white rounded-3xl border border-[#E5E5EA] p-6 space-y-4">
            <div className="p-3.5 rounded-2xl bg-[#F8F9FA] border border-[#E5E5EA] text-xs text-[#3A3A3C] leading-relaxed">
              To keep your cloud database fast and cost-free, LAMAVI automatically stores messages and shared photos in the database for up to <strong className="text-[#1C1C1E]">7 days</strong> before cleaning up older history.
            </div>
            <div className="text-xs text-[#636366] space-y-2.5 font-mono-num">
              <div className="flex justify-between py-1 border-b border-[#E5E5EA]">
                <span>Active Conversations:</span>
                <span className="text-[#1C1C1E] font-semibold">
                  {storageStats?.conversationsCount ?? 0}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E5E5EA]">
                <span>Messages in Last 7 Days:</span>
                <span className="text-[#1C1C1E] font-semibold">
                  {storageStats?.messageCount ?? 0}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#E5E5EA]">
                <span>Media Storage (7-Day Window):</span>
                <span className="text-[#1C1C1E] font-semibold">
                  {formatBytes(storageStats?.totalMediaBytes ?? 0)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                onClearLocalCache();
                setFeedback({ type: 'success', text: 'Local device cache cleared.' });
              }}
              className="w-full h-11 rounded-xl bg-[#F2F2F7] hover:bg-[#E5E5EA] text-xs font-semibold text-[#1C1C1E] transition-colors"
            >
              Clear Local Device Cache
            </button>
          </div>
        </div>
      )}

      {/* SUBPAGE: HELP & SUPPORT */}
      {subPage === 'help' && (
        <div>
          {renderSubPageHeader('Help & Support')}
          <div className="bg-white rounded-3xl border border-[#E5E5EA] p-6 space-y-3 text-xs text-[#636366] leading-relaxed">
            <h3 className="font-display text-sm font-bold text-[#1C1C1E]">
              LAMAVI — Let&apos;s connect each other
            </h3>
            <p>
              Search for friends or colleagues using their exact username or registered Gmail address. An active internet connection is required to connect and send messages.
            </p>
            <p>
              Your profile features an iOS-inspired bio bubble right above your avatar, and your username can be updated up to 3 times per month.
            </p>
          </div>
        </div>
      )}

      {/* Cropper Modal */}
      {cropperSrc && (
        <ImageCropperModal
          imageSrc={cropperSrc}
          onCancel={() => setCropperSrc(null)}
          onSave={async (croppedDataUrl) => {
            setAvatarUrl(croppedDataUrl);
            setCropperSrc(null);
            await onUpdateProfile({ avatarUrl: croppedDataUrl });
            setFeedback({ type: 'success', text: 'Profile picture updated.' });
          }}
        />
      )}

      {/* Confirm Logout Modal */}
      {confirmLogout && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E5E5EA] p-6 shadow-xl">
            <h3 className="font-display text-base font-semibold text-[#1C1C1E]">
              Log Out of LAMAVI?
            </h3>
            <p className="text-xs text-[#636366] mt-2 leading-relaxed">
              You can sign back in anytime using your username or registered Gmail address.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <button
                onClick={() => setConfirmLogout(false)}
                className="flex-1 h-11 rounded-xl bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E]"
              >
                Cancel
              </button>
              <button
                onClick={onLogout}
                className="flex-1 h-11 rounded-xl bg-[#2C2C2E] text-xs font-semibold text-white"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Account Modal */}
      {confirmDeleteAccount && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E5E5EA] p-6 shadow-xl">
            <h3 className="font-display text-base font-semibold text-[#B91C1C]">
              Permanently Delete Account?
            </h3>
            <p className="text-xs text-[#636366] mt-2 leading-relaxed">
              This action is irreversible. Your profile, conversations, messages, and statuses will be permanently deleted.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <button
                onClick={() => setConfirmDeleteAccount(false)}
                className="flex-1 h-11 rounded-xl bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E]"
              >
                Cancel
              </button>
              <button
                onClick={onDeleteAccount}
                className="flex-1 h-11 rounded-xl bg-[#B91C1C] text-xs font-semibold text-white"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
