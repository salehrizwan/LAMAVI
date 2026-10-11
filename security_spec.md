# Security Specification — LAMAVI Firestore Rules

## 1. Data Invariants

1. **Identity & Verification Invariant**: Every write operation requires an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
2. **PII Isolation Invariant**: Personal Identifiable Information (`email`) is strictly isolated in `/users/{userId}/private/{docId}` and may only be read or written by the document owner (`request.auth.uid == userId`).
3. **Master Gate & Relational Sync Invariant**: Every message in `/conversations/{conversationId}/messages/{messageId}` must belong to an existing parent conversation `/conversations/{conversationId}` where `request.auth.uid` is either `userAId` or `userBId`.
4. **Strict Keys & Anti-Update-Gap Invariant**: Every `create` and `update` operation validates exact allowed keys via `hasAll` and `hasOnly`, enforces strict type and `.size()` bounds on all strings, and restricts updates to explicit action branches using `affectedKeys().hasOnly(...)`.
5. **Temporal Integrity & Immutability Invariant**: `createdAt` must equal `request.time` on creation and remain immutable on update; `updatedAt` must equal `request.time` on creation and update; ownership fields (`id`, `userId`, `senderId`, `recipientId`, `conversationId`, `userAId`, `userBId`) are strictly immutable.
6. **Terminal State Locking Invariant**: Once a `Message` reaches terminal status `'read'`, no further status updates are permitted.
7. **Secure List Queries Invariant**: All `list` rules enforce ownership or participant checks directly against `resource.data` without blanket `isSignedIn()` reads or expensive `get()` calls.

---

## 2. The "Dirty Dozen" Payloads

1. **Unverified Email Write**: Authenticated user with `email_verified: false` attempting to create `/users/user_1`.
2. **Identity Spoofing on User Create**: User `user_1` attempting to create `/users/user_2` or setting `data.id = 'user_2'`.
3. **Shadow Field Injection on User Create**: User `user_1` creating `/users/user_1` with an undeclared field `isAdmin: true`.
4. **PII Leak via Cross-User Get**: User `user_2` attempting `get` on `/users/user_1/private/info`.
5. **ID Poisoning Attack**: User `user_1` attempting to create a document with invalid characters or >128 chars in path ID.
6. **Value Poisoning on User Update**: User `user_1` updating `bio` with a 10,000-character string (exceeding `maxLength: 160`).
7. **Immortal Field Mutation**: User `user_1` attempting to change `createdAt` or `id` during a profile update.
8. **Client Timestamp Forgery**: User `user_1` supplying a past or future `updatedAt` timestamp instead of `request.time`.
9. **Orphaned Subcollection Write**: User `user_1` attempting to create a message in `/conversations/non_existent_conv/messages/msg_1`.
10. **Non-Participant Conversation Read/Write**: User `user_3` attempting to read or post a message in a conversation between `user_1` and `user_2`.
11. **Terminal State Bypass on Message**: Recipient attempting to downgrade a message `status` from `'read'` back to `'sent'` or `'delivered'`.
12. **Blanket List Scraping**: User `user_1` attempting an unconstrained `list` query on `/conversations` without filtering by `userAId == request.auth.uid` or `userBId == request.auth.uid`.
