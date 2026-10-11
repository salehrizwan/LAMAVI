import React, { useState } from 'react';
import {
  UserPlus,
  UserMinus,
  MoreVertical,
  MessageSquare,
  ShieldBan,
  Flag,
  Check,
  X,
  Lock,
} from 'lucide-react';
import { UserProfile } from '../types';
import { Avatar } from './Avatar';
import { FullScreenImageViewer } from './SecureImage';

interface ContactsViewProps {
  currentUser: UserProfile;
  contacts: UserProfile[];
  blockedUsers: UserProfile[];
  token: string;
  onOpenSearchModal: () => void;
  onStartConversation: (user: UserProfile) => void;
  onRemoveContact: (userId: string) => Promise<void>;
  onToggleBlock: (userId: string, currentlyBlocked: boolean) => Promise<void>;
  onUpdateWhoCanContact: (setting: 'everyone' | 'contacts') => Promise<void>;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  currentUser,
  contacts,
  blockedUsers,
  token,
  onOpenSearchModal,
  onStartConversation,
  onRemoveContact,
  onToggleBlock,
  onUpdateWhoCanContact,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [openMenuUserId, setOpenMenuUserId] = useState<string | null>(null);
  const [confirmUnconnectUser, setConfirmUnconnectUser] = useState<UserProfile | null>(null);
  const [unconnecting, setUnconnecting] = useState(false);
  const [reportingUser, setReportingUser] = useState<UserProfile | null>(null);
  const [reportReason, setReportReason] = useState('Spam or unsolicited messages');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState<string | null>(null);
  const [fullScreenDp, setFullScreenDp] = useState<{ src: string; caption?: string } | null>(null);

  const filteredContacts = contacts.filter(
    (c) =>
      c.fullName.toLowerCase().includes(filterQuery.toLowerCase()) ||
      c.username.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const handleConfirmUnconnect = async () => {
    if (!confirmUnconnectUser) return;
    setUnconnecting(true);
    try {
      await onRemoveContact(confirmUnconnectUser.id);
      setConfirmUnconnectUser(null);
    } finally {
      setUnconnecting(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingUser) return;
    try {
      const res = await fetch('/api/users/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUserId: reportingUser.id,
          reason: reportReason,
          details: reportDetails,
        }),
      });
      const data = await res.json();
      setReportSubmitted(data.message || 'Account report submitted.');
      setReportingUser(null);
      setReportDetails('');
      setTimeout(() => setReportSubmitted(null), 4000);
    } catch {
      setReportingUser(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-3xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-[#1C1C1E]">Contacts & Connections</h1>
          <p className="text-xs text-[#636366] mt-0.5">
            Manage your connected users, privacy permissions, and blocked accounts
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSearchModal}
          className="min-h-[44px] px-4 rounded-xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white text-xs font-semibold flex items-center gap-2 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          <span>Find User</span>
        </button>
      </div>

      {reportSubmitted && (
        <div className="p-3.5 rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] flex items-center gap-2 text-xs text-[#15803D]">
          <Check className="w-4 h-4 shrink-0" />
          <span>{reportSubmitted}</span>
        </div>
      )}

      {/* Manage Who Can Contact Me */}
      <section className="bg-white rounded-2xl border border-[#E5E5EA] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] flex items-center justify-center text-[#1C1C1E]">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#1C1C1E]">Who Can Start a Chat With Me</h2>
            <p className="text-xs text-[#636366]">
              Control whether anyone who knows your username or only saved contacts can message you
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#F2F2F7] rounded-xl self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => onUpdateWhoCanContact('everyone')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              (currentUser.privacy?.whoCanContact || 'everyone') === 'everyone'
                ? 'bg-white text-[#1C1C1E] shadow-2xs'
                : 'text-[#636366]'
            }`}
          >
            Everyone
          </button>
          <button
            type="button"
            onClick={() => onUpdateWhoCanContact('contacts')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              currentUser.privacy?.whoCanContact === 'contacts'
                ? 'bg-white text-[#1C1C1E] shadow-2xs'
                : 'text-[#636366]'
            }`}
          >
            Contacts Only
          </button>
        </div>
      </section>

      {/* Filter existing connections */}
      <div>
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Filter your connected contacts..."
          className="w-full h-11 px-4 rounded-xl bg-white border border-[#E5E5EA] focus:border-[#8E8E93] text-sm text-[#1C1C1E] outline-none"
        />
      </div>

      {/* Connected Users List */}
      <section className="space-y-2.5">
        <h3 className="text-xs font-semibold text-[#636366] px-1">
          Connected Users ({filteredContacts.length})
        </h3>

        {filteredContacts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5E5EA] p-8 text-center">
            <p className="text-sm font-medium text-[#1C1C1E]">No connected contacts yet</p>
            <p className="text-xs text-[#636366] mt-1">
              Use the Find User button to search by username or registered Gmail and click Connect.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#E5E5EA] divide-y divide-[#E5E5EA]">
            {filteredContacts.map((contact) => (
              <div
                key={contact.id}
                className="p-4 flex items-center justify-between gap-3 hover:bg-[#F8F9FA] transition-colors relative"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <Avatar
                    src={contact.avatarUrl}
                    name={contact.fullName}
                    size="md"
                    isOnline={contact.isOnline}
                    showPresence
                    onClick={
                      contact.avatarUrl
                        ? () =>
                            setFullScreenDp({
                              src: contact.avatarUrl!,
                              caption: `${contact.fullName} (@${contact.username})`,
                            })
                        : undefined
                    }
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-sm font-semibold text-[#1C1C1E] truncate">
                        {contact.fullName}
                      </span>
                      <span className="text-xs text-[#8E8E93]">@{contact.username}</span>
                    </div>
                    {contact.bio && (
                      <p className="text-xs text-[#636366] truncate mt-0.5">{contact.bio}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onStartConversation(contact)}
                    className="min-h-[40px] px-3 rounded-xl bg-[#F2F2F7] hover:bg-[#E5E5EA] text-xs font-semibold text-[#1C1C1E] flex items-center gap-1.5 transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Message</span>
                  </button>

                  {/* Three-Dot Menu for Unconnect, Block, and Report */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenuUserId(openMenuUserId === contact.id ? null : contact.id)
                      }
                      className="min-h-[40px] min-w-[40px] rounded-xl bg-white border border-[#E5E5EA] hover:bg-[#F2F2F7] text-[#3A3A3C] flex items-center justify-center transition-colors"
                      aria-label={`Options for ${contact.fullName}`}
                      title="More options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {openMenuUserId === contact.id && (
                      <>
                        <div
                          className="fixed inset-0 z-20"
                          onClick={() => setOpenMenuUserId(null)}
                        />
                        <div className="absolute right-0 mt-1.5 w-48 rounded-2xl bg-white border border-[#E5E5EA] shadow-lg py-1.5 z-30">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuUserId(null);
                              setConfirmUnconnectUser(contact);
                            }}
                            className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#B91C1C] hover:bg-[#FEF2F2] flex items-center gap-2.5"
                          >
                            <UserMinus className="w-4 h-4" />
                            <span>Unconnect</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuUserId(null);
                              onToggleBlock(contact.id, !!contact.isBlocked);
                            }}
                            className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#1C1C1E] hover:bg-[#F8F9FA] flex items-center gap-2.5"
                          >
                            <ShieldBan className="w-4 h-4 text-[#636366]" />
                            <span>{contact.isBlocked ? 'Unblock User' : 'Block User'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setOpenMenuUserId(null);
                              setReportingUser(contact);
                            }}
                            className="w-full px-4 py-2.5 text-left text-xs font-medium text-[#1C1C1E] hover:bg-[#F8F9FA] flex items-center gap-2.5"
                          >
                            <Flag className="w-4 h-4 text-[#636366]" />
                            <span>Report Account</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Blocked Accounts Section */}
      {blockedUsers.length > 0 && (
        <section className="space-y-2.5">
          <h3 className="text-xs font-semibold text-[#636366] px-1">
            Blocked Users ({blockedUsers.length})
          </h3>
          <div className="bg-white rounded-2xl border border-[#E5E5EA] divide-y divide-[#E5E5EA] overflow-hidden">
            {blockedUsers.map((b) => (
              <div key={b.id} className="p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar src={b.avatarUrl} name={b.fullName} size="sm" />
                  <div>
                    <div className="text-sm font-medium text-[#1C1C1E]">{b.fullName}</div>
                    <div className="text-xs text-[#8E8E93]">@{b.username}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleBlock(b.id, true)}
                  className="px-3 py-1.5 rounded-xl bg-[#F2F2F7] hover:bg-[#E5E5EA] text-xs font-semibold text-[#1C1C1E]"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Unconnect Confirmation Dialog */}
      {confirmUnconnectUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E5E5EA] p-6 shadow-xl">
            <h3 className="font-display text-base font-semibold text-[#1C1C1E]">
              Unconnect @{confirmUnconnectUser.username}?
            </h3>
            <p className="text-xs text-[#636366] mt-2 leading-relaxed">
              Are you sure you want to remove <strong>{confirmUnconnectUser.fullName}</strong> from your connected contacts? Your existing conversation history will not be deleted.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <button
                type="button"
                disabled={unconnecting}
                onClick={() => setConfirmUnconnectUser(null)}
                className="flex-1 h-11 rounded-xl bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={unconnecting}
                onClick={handleConfirmUnconnect}
                className="flex-1 h-11 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-xs font-semibold text-white"
              >
                {unconnecting ? 'Removing...' : 'Unconnect'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Account Modal */}
      {reportingUser && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-[#E5E5EA] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-[#1C1C1E]">
                Report @{reportingUser.username}
              </h3>
              <button
                onClick={() => setReportingUser(null)}
                className="w-8 h-8 rounded-full hover:bg-[#F2F2F7] flex items-center justify-center text-[#636366]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitReport} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#3A3A3C] mb-1.5">Reason</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] text-sm text-[#1C1C1E] outline-none"
                >
                  <option value="Spam or unsolicited messages">Spam or unsolicited messages</option>
                  <option value="Harassment or abusive behavior">Harassment or abusive behavior</option>
                  <option value="Impersonation">Impersonation</option>
                  <option value="Inappropriate status or media">Inappropriate status or media</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#3A3A3C] mb-1.5">
                  Additional Details (Optional)
                </label>
                <textarea
                  rows={3}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Describe the issue..."
                  className="w-full p-3 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] text-sm text-[#1C1C1E] outline-none resize-none"
                />
              </div>
              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setReportingUser(null)}
                  className="flex-1 h-11 rounded-xl bg-[#F2F2F7] text-xs font-semibold text-[#1C1C1E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 h-11 rounded-xl bg-[#B91C1C] text-xs font-semibold text-white"
                >
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {fullScreenDp && (
        <FullScreenImageViewer
          src={fullScreenDp.src}
          caption={fullScreenDp.caption}
          onClose={() => setFullScreenDp(null)}
        />
      )}
    </div>
  );
};
