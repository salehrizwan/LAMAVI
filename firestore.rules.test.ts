import fs from 'fs';
import path from 'path';

/**
 * Security Rules Verification Suite for "Dirty Dozen" Payloads
 * Verifies all 8 Pillars of Hardened Rules in firestore.rules
 */
export function verifySecurityRules(): void {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

  const assertions: Array<{ name: string; test: boolean }> = [
    {
      name: 'Global default-deny safety net present',
      test: rulesContent.includes('match /{document=**}') && rulesContent.includes('allow read, write: if false;'),
    },
    {
      name: 'Email verification required for writes (Dirty Dozen #1)',
      test: rulesContent.includes('request.auth.token.email_verified == true'),
    },
    {
      name: 'Identity spoofing blocked on User create (Dirty Dozen #2)',
      test: rulesContent.includes('data.id == request.auth.uid'),
    },
    {
      name: 'Shadow fields blocked via strict hasAll & hasOnly (Dirty Dozen #3)',
      test: rulesContent.includes('.keys().hasAll(') && rulesContent.includes('.keys().hasOnly('),
    },
    {
      name: 'PII isolated in /users/{userId}/private/{docId} with owner-only access (Dirty Dozen #4)',
      test: rulesContent.includes('match /private/{docId}') && rulesContent.includes('isOwner(userId)'),
    },
    {
      name: 'ID poisoning guard via isValidId regex and length check (Dirty Dozen #5)',
      test: rulesContent.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')") && rulesContent.includes('id.size() <= 128'),
    },
    {
      name: 'Value poisoning blocked via validation helper on update (Dirty Dozen #6)',
      test: rulesContent.includes('isValidUser(incoming(), userId)') && rulesContent.includes('data.bio.size() <= 160'),
    },
    {
      name: 'Immortal fields locked on update (Dirty Dozen #7)',
      test: rulesContent.includes('incoming().createdAt == existing().createdAt') && rulesContent.includes('incoming().id == existing().id'),
    },
    {
      name: 'Server timestamp enforced via request.time (Dirty Dozen #8)',
      test: rulesContent.includes('incoming().createdAt == request.time') && rulesContent.includes('incoming().updatedAt == request.time'),
    },
    {
      name: 'Master Gate parent check on subcollection messages (Dirty Dozen #9 & #10)',
      test: rulesContent.includes('get(/databases/$(database)/documents/conversations/$(conversationId)).data'),
    },
    {
      name: 'Terminal state locking on read messages (Dirty Dozen #11)',
      test: rulesContent.includes("existing().status != 'read'"),
    },
    {
      name: 'List queries enforce resource.data ownership (Dirty Dozen #12)',
      test: rulesContent.includes('existing().userAId == request.auth.uid || existing().userBId == request.auth.uid'),
    },
  ];

  for (const assertion of assertions) {
    if (!assertion.test) {
      throw new Error(`Security assertion failed: ${assertion.name}`);
    }
  }
}
