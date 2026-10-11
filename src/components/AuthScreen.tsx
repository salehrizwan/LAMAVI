import React, { useState } from 'react';
import { Eye, EyeOff, Check, AlertCircle, KeyRound, ShieldCheck, Copy, ArrowRight } from 'lucide-react';
import { UserProfile } from '../types';

interface AuthScreenProps {
  onAuthenticated: (token: string, user: UserProfile) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'welcome' | 'login' | 'register' | 'recover'>('welcome');

  // Login state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPw, setShowLoginPw] = useState(false);

  // Register state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRegPw, setShowRegPw] = useState(false);
  const [showRegConfirmPw, setShowRegConfirmPw] = useState(false);

  // Recovery state
  const [recIdentifier, setRecIdentifier] = useState('');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [recNewPassword, setRecNewPassword] = useState('');
  const [showRecPw, setShowRecPw] = useState(false);

  // Generated Recovery Code Modal after registration
  const [createdSession, setCreatedSession] = useState<{
    token: string;
    user: UserProfile;
    recoveryCode: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const activePw = mode === 'register' ? password : recNewPassword;
  const isExactly8 = activePw.length === 8;
  const hasLetter = /[a-zA-Z]/.test(activePw);
  const hasDigit = /[0-9]/.test(activePw);
  const isPasswordValid = isExactly8 && hasLetter && hasDigit;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!loginIdentifier.trim() || !loginPassword) {
      setErrorMsg('Please enter your username or Gmail address and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: loginIdentifier.trim(),
          password: loginPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to log in.');
      } else {
        onAuthenticated(data.token, data.user);
      }
    } catch {
      setErrorMsg('Network error. Please verify your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (fullName.trim().length < 2) {
      setErrorMsg('Full real name is required (at least 2 characters).');
      return;
    }
    if (!/^[a-zA-Z0-9_.]{3,24}$/.test(username.trim())) {
      setErrorMsg('Username must be 3–24 characters using letters, numbers, underscores, or periods.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('A valid Gmail / email address is required.');
      return;
    }
    if (!isExactly8) {
      setErrorMsg('Password must be exactly 8 characters long.');
      return;
    }
    if (!hasLetter) {
      setErrorMsg('Password must contain at least one alphabet letter.');
      return;
    }
    if (!hasDigit) {
      setErrorMsg('Password must contain at least one numerical digit.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Password confirmation does not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          username: username.trim().toLowerCase(),
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Account creation failed.');
      } else {
        setCreatedSession({
          token: data.token,
          user: data.user,
          recoveryCode: data.recoveryCode,
        });
      }
    } catch {
      setErrorMsg('Network error while creating account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!recIdentifier.trim() || !recoveryCodeInput.trim()) {
      setErrorMsg('Please provide your username/email and recovery code.');
      return;
    }
    if (!isPasswordValid) {
      setErrorMsg('New password must be 8 characters with at least one letter and one digit.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: recIdentifier.trim(),
          recoveryCode: recoveryCodeInput.trim(),
          newPassword: recNewPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not recover account.');
      } else {
        setSuccessMsg(data.message || 'Password updated! You can now log in.');
        setTimeout(() => {
          setMode('login');
          setLoginIdentifier(recIdentifier.trim());
          setSuccessMsg(null);
        }, 1600);
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderBrandLogo = (size: 'large' | 'compact') => (
    <div className="flex flex-col items-center text-center">
      <div
        className={`${
          size === 'large' ? 'w-44 h-44 sm:w-52 sm:h-52' : 'w-28 h-28'
        } rounded-3xl overflow-hidden bg-[#F8F9FA] border border-[#E5E5EA] shadow-[0_12px_36px_rgba(0,0,0,0.04)] flex items-center justify-center p-2`}
      >
        {!logoError ? (
          <img
            src="/logo.png"
            alt="LAMAVI Logo"
            onError={() => setLogoError(true)}
            className="w-full h-full object-contain"
          />
        ) : (
          <span className="font-display text-2xl font-bold tracking-[0.28em] text-[#2C2C2E]">
            LAMAVI
          </span>
        )}
      </div>
      <h1
        className={`font-display ${
          size === 'large' ? 'text-2xl sm:text-3xl mt-5' : 'text-xl mt-3'
        } font-bold tracking-[0.25em] text-[#1C1C1E]`}
      >
        LAMAVI
      </h1>
      <p className="text-xs sm:text-sm font-medium text-[#636366] tracking-wide mt-1.5">
        Let&apos;s connect each other
      </p>
    </div>
  );

  if (createdSession) {
    return (
      <div className="min-h-screen w-full bg-[#F8F9FA] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-[#E5E5EA] shadow-sm p-6 sm:p-8">
          <div className="w-12 h-12 rounded-2xl bg-[#F2F2F7] border border-[#E5E5EA] flex items-center justify-center text-[#1C1C1E] mb-5">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#1C1C1E] tracking-tight">
            Save Your Recovery Key
          </h1>
          <p className="mt-2 text-sm text-[#636366] leading-relaxed">
            Welcome to <strong className="text-[#1C1C1E]">LAMAVI</strong>,{' '}
            <strong className="text-[#1C1C1E]">{createdSession.user.fullName}</strong>. Keep this personal recovery key safe so you can always reset your password.
          </p>

          <div className="mt-6 p-4 rounded-2xl bg-[#F8F9FA] border border-[#D1D1D6] flex items-center justify-between">
            <code className="font-mono-num text-base font-semibold tracking-wider text-[#1C1C1E]">
              {createdSession.recoveryCode}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(createdSession.recoveryCode);
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 2000);
              }}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white border border-[#E5E5EA] text-xs font-medium text-[#1C1C1E] flex items-center gap-1.5 hover:bg-[#F2F2F7] transition-colors"
            >
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-[#15803D]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedCode ? 'Copied' : 'Copy'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onAuthenticated(createdSession.token, createdSession.user)}
            className="mt-6 w-full h-12 rounded-2xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          >
            <span>Continue to LAMAVI</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#F8F9FA] flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border border-[#E5E5EA] shadow-[0_12px_40px_rgba(0,0,0,0.04)] p-6 sm:p-8">
        {mode === 'welcome' ? (
          <div className="py-4 flex flex-col items-center">
            {renderBrandLogo('large')}

            <div className="w-full mt-8 space-y-3">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setMode('login');
                }}
                className="w-full h-12 rounded-2xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white text-sm font-semibold transition-colors cursor-pointer shadow-xs"
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setMode('register');
                }}
                className="w-full h-12 rounded-2xl bg-[#F8F9FA] hover:bg-[#F2F2F7] border border-[#D1D1D6] text-[#1C1C1E] text-sm font-semibold transition-colors cursor-pointer"
              >
                Create Account
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6">{renderBrandLogo('compact')}</div>

            {errorMsg && (
              <div className="mb-5 p-3.5 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] flex items-start gap-2.5 text-xs text-[#B91C1C]">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="mb-5 p-3.5 rounded-2xl bg-[#F0FDF4] border border-[#BBF7D0] flex items-start gap-2.5 text-xs text-[#15803D]">
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#3A3A3C] mb-1.5">
                    Username or Gmail Address
                  </label>
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="Enter your username or Gmail"
                    autoComplete="username"
                    className="w-full h-11 px-4 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none transition-colors"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-[#3A3A3C]">Password</label>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setMode('recover');
                      }}
                      className="text-xs text-[#636366] hover:text-[#1C1C1E] underline underline-offset-2"
                    >
                      Use recovery code
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showLoginPw ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="8-character password"
                      autoComplete="current-password"
                      className="w-full h-11 pl-4 pr-11 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPw(!showLoginPw)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-[#636366] hover:text-[#1C1C1E]"
                      aria-label={showLoginPw ? 'Hide password' : 'Show password'}
                    >
                      {showLoginPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 mt-2 rounded-2xl bg-[#2C2C2E] hover:bg-[#3A3A3C] disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  {loading ? 'Signing In...' : 'Log In'}
                </button>

                <div className="pt-4 border-t border-[#E5E5EA] text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      setMode('register');
                    }}
                    className="text-xs font-medium text-[#3A3A3C] hover:text-[#1C1C1E]"
                  >
                    Don&apos;t have an account?{' '}
                    <span className="underline underline-offset-4 font-semibold">Create Account</span>
                  </button>
                </div>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-[#3A3A3C] mb-1">
                    Full Real Name <span className="text-[#B91C1C]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your full real name"
                    className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#3A3A3C] mb-1">
                    Unique Username <span className="text-[#B91C1C]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))
                    }
                    placeholder="your_username"
                    className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#3A3A3C] mb-1">
                    Gmail / Email Address <span className="text-[#B91C1C]">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="yourname@gmail.com"
                    className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#3A3A3C] mb-1">
                    Password <span className="text-[#B91C1C]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showRegPw ? 'text' : 'password'}
                      required
                      maxLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Exactly 8 characters"
                      className="w-full h-11 pl-3.5 pr-11 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPw(!showRegPw)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-[#636366] hover:text-[#1C1C1E]"
                    >
                      {showRegPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="mt-2 p-2.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] space-y-1 text-[11px]">
                    <div
                      className={`flex items-center gap-1.5 ${
                        isExactly8 ? 'text-[#15803D] font-medium' : 'text-[#636366]'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>Exactly 8 characters ({password.length}/8)</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 ${
                        hasLetter ? 'text-[#15803D] font-medium' : 'text-[#636366]'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>At least one alphabet letter (A–Z)</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 ${
                        hasDigit ? 'text-[#15803D] font-medium' : 'text-[#636366]'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>At least one numerical digit (0–9)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#3A3A3C] mb-1">
                    Confirm Password <span className="text-[#B91C1C]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showRegConfirmPw ? 'text' : 'password'}
                      required
                      maxLength={8}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter 8-character password"
                      className="w-full h-11 pl-3.5 pr-11 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegConfirmPw(!showRegConfirmPw)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-[#636366] hover:text-[#1C1C1E]"
                    >
                      {showRegConfirmPw ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 mt-2 rounded-2xl bg-[#2C2C2E] hover:bg-[#3A3A3C] disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  {loading ? 'Creating Account...' : 'Create Account'}
                </button>

                <div className="pt-3 border-t border-[#E5E5EA] text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      setMode('login');
                    }}
                    className="text-xs font-medium text-[#3A3A3C] hover:text-[#1C1C1E]"
                  >
                    Already have an account?{' '}
                    <span className="underline underline-offset-4 font-semibold">Log In</span>
                  </button>
                </div>
              </form>
            )}

            {mode === 'recover' && (
              <form onSubmit={handleRecover} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#3A3A3C] mb-1">
                    Username or Registered Gmail
                  </label>
                  <input
                    type="text"
                    required
                    value={recIdentifier}
                    onChange={(e) => setRecIdentifier(e.target.value)}
                    placeholder="Your username or Gmail"
                    className="w-full h-11 px-3.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#3A3A3C] mb-1">
                    Recovery Code
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={recoveryCodeInput}
                      onChange={(e) => setRecoveryCodeInput(e.target.value.toUpperCase())}
                      placeholder="LAMAVI-XXXX-XXXX"
                      className="w-full h-11 pl-9 pr-3.5 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white font-mono-num text-sm text-[#1C1C1E] outline-none"
                    />
                    <KeyRound className="w-4 h-4 text-[#636366] absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#3A3A3C] mb-1">
                    New Password (8 characters, 1 letter, 1 digit)
                  </label>
                  <div className="relative">
                    <input
                      type={showRecPw ? 'text' : 'password'}
                      required
                      maxLength={8}
                      value={recNewPassword}
                      onChange={(e) => setRecNewPassword(e.target.value)}
                      placeholder="New 8-char password"
                      className="w-full h-11 pl-3.5 pr-11 rounded-xl bg-[#F8F9FA] border border-[#E5E5EA] focus:border-[#8E8E93] focus:bg-white text-sm text-[#1C1C1E] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRecPw(!showRecPw)}
                      className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-[#636366]"
                    >
                      {showRecPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-2xl bg-[#2C2C2E] hover:bg-[#3A3A3C] text-white text-sm font-semibold transition-colors"
                >
                  {loading ? 'Resetting Password...' : 'Reset Password'}
                </button>

                <div className="pt-3 border-t border-[#E5E5EA] text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      setMode('login');
                    }}
                    className="text-xs font-medium text-[#636366] hover:text-[#1C1C1E]"
                  >
                    Back to Log In
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
};
