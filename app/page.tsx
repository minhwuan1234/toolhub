'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Eye,
  EyeOff,
  GitBranch,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  Network,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  Workflow,
  ChartNoAxesCombined,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Screen =
  | 'login'
  | 'signup'
  | 'forgot'
  | 'email'
  | 'registered'
  | 'account';
const demoEmail = 'demo@example.com';
export default function Home() {
  const [screen, setScreen] = useState<Screen>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (mounted.current) heading.current?.focus();
    mounted.current = true;
  }, [screen]);
  function go(next: Screen) {
    setScreen(next);
    setError('');
    setPassword('');
    setVisible(false);
    setBusy(false);
    setLoggedOut(false);
    if (timer.current) clearTimeout(timer.current);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const normalized = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError('Enter a valid email address.');
      return;
    }
    if (screen === 'signup' && !name.trim()) {
      setError('Enter your full name.');
      return;
    }
    if (
      screen !== 'forgot' &&
      password.length < (screen === 'signup' ? 12 : 1)
    ) {
      setError(
        screen === 'signup'
          ? 'Use at least 12 characters for your password.'
          : 'Enter your password to continue.',
      );
      return;
    }
    setBusy(true);
    timer.current = setTimeout(() => {
      setBusy(false);
      setPassword('');
      setVisible(false);
      setEmail(normalized);
      if (screen === 'signup') setScreen('registered');
      else if (screen === 'forgot') setScreen('email');
      else if (normalized.toLowerCase() === demoEmail) setScreen('account');
      else
        setError(
          'This prototype supports demo@example.com only. Select “Use demo details” below.',
        );
    }, 600);
  }
  function logout() {
    setScreen('login');
    setEmail('');
    setName('');
    setPassword('');
    setVisible(false);
    setError('');
    setLoggedOut(true);
  }
  const isForm = ['login', 'signup', 'forgot'].includes(screen);
  return (
    <main className="auth-layout">
      <aside className="brand-side" aria-label="About Toolhub">
        <div className="brand">
          <span className="brand-mark">
            <GitBranch size={22} />
          </span>
          toolhub<span className="internal-label">INTERNAL WORKSPACE</span>
        </div>
        <div className="brand-content">
          <div className="eyebrow">
            <i /> Your shared workspace
          </div>
          <h2>
            Every tool.
            <br />
            One connected place.
          </h2>
          <p className="brand-description">
            A shared view of your tools and the way your team works together.
          </p>
          <div
            className="map"
            role="img"
            aria-label="Illustrative connections between Toolhub, Sales, Operations, Finance and Data. Not live data."
          >
            <svg
              className="map-lines"
              viewBox="0 0 440 242"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <g fill="none" stroke="#c7c1d5" strokeWidth="1.4">
                <path d="M95 46H160Q180 46 180 66V110H220" />
                <path d="M345 42H280Q260 42 260 62V115H220" />
                <path d="M95 202H160Q180 202 180 182V132H220" />
                <path d="M345 206H280Q260 206 260 186V132H220" />
              </g>
            </svg>
            <div className="mini-node node-sales">
              <span
                className="mini-icon"
                style={{ background: '#ffe8d4', color: '#793400' }}
              >
                <Users size={17} />
              </span>
              <span>
                Sales<small>People & customers</small>
              </span>
            </div>
            <div className="mini-node node-ops">
              <span
                className="mini-icon"
                style={{ background: '#d9f3e1', color: '#236b3b' }}
              >
                <Workflow size={17} />
              </span>
              <span>
                Operations<small>Processes & tasks</small>
              </span>
            </div>
            <div className="mini-node node-main">
              <span
                className="mini-icon"
                style={{ background: '#e6e0f5', color: '#5645d4' }}
              >
                <Network size={19} />
              </span>
              <strong>toolhub</strong>
            </div>
            <div className="mini-node node-data">
              <span
                className="mini-icon"
                style={{ background: '#dcecfa', color: '#005bab' }}
              >
                <ChartNoAxesCombined size={17} />
              </span>
              <span>
                Data<small>Insights & reports</small>
              </span>
            </div>
            <div className="mini-node node-finance">
              <span
                className="mini-icon"
                style={{ background: '#fef7d6', color: '#793400' }}
              >
                <Wallet size={17} />
              </span>
              <span>
                Finance<small>Resources & costs</small>
              </span>
            </div>
          </div>
          <p className="map-caption">
            <GitBranch size={14} /> Connected tools. A clearer picture of your
            work.
          </p>
        </div>
        <div className="brand-footer">
          <span>Toolhub · Internal workspace</span>
          <span>01 / Account</span>
        </div>
      </aside>
      <section className="form-side" aria-label="Account">
        <div className="top-switch">
          {screen === 'login' ? (
            <>
              <span>New to Toolhub?</span>
              <button className="text-action" onClick={() => go('signup')}>
                Create an account
              </button>
            </>
          ) : screen === 'signup' ? (
            <>
              <span>Already have an account?</span>
              <button className="text-action" onClick={() => go('login')}>
                Sign in
              </button>
            </>
          ) : (
            <span>Toolhub account</span>
          )}
        </div>
        <div className="auth-form">
          {isForm ? (
            <>
              {screen === 'forgot' && (
                <button className="back" onClick={() => go('login')}>
                  <ArrowLeft size={16} /> Back to sign in
                </button>
              )}
              <div className="form-icon">
                {screen === 'signup' ? (
                  <UserRound size={22} />
                ) : screen === 'forgot' ? (
                  <KeyRound size={22} />
                ) : (
                  <LogOut size={22} style={{ transform: 'rotate(180deg)' }} />
                )}
              </div>
              {loggedOut && (
                <div className="success-banner" role="status">
                  <CircleCheck size={16} /> You’ve signed out of the preview
                  session.
                </div>
              )}
              <h1 ref={heading} tabIndex={-1}>
                {screen === 'signup'
                  ? 'Create your account'
                  : screen === 'forgot'
                    ? 'Forgot password?'
                    : 'Welcome back.'}
              </h1>
              <p className="subtext">
                {screen === 'signup'
                  ? 'A dedicated account for your work, all in one place.'
                  : screen === 'forgot'
                    ? 'Enter your email to request a password reset.'
                    : 'Sign in to your team’s shared workspace.'}
              </p>
              <form onSubmit={submit} noValidate aria-busy={busy}>
                {screen === 'signup' && (
                  <div className="field">
                    <label className="field-label" htmlFor="full-name">
                      Full name
                    </label>
                    <Input
                      id="full-name"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex Morgan"
                      required
                      disabled={busy}
                    />
                  </div>
                )}
                <div className="field">
                  <label className="field-label" htmlFor="email">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="username"
                    spellCheck={false}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    aria-describedby={error ? 'form-error' : undefined}
                    required
                    disabled={busy}
                  />
                </div>
                {screen !== 'forgot' && (
                  <div className="field">
                    <div className="field-header">
                      <label className="field-label" htmlFor="password">
                        Password
                      </label>
                      {screen === 'login' && (
                        <button
                          type="button"
                          className="forgot"
                          onClick={() => go('forgot')}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="input-wrap">
                      <Input
                        id="password"
                        type={visible ? 'text' : 'password'}
                        autoComplete={
                          screen === 'signup'
                            ? 'new-password'
                            : 'current-password'
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={
                          screen === 'signup'
                            ? 'Create a password'
                            : 'Enter your password'
                        }
                        required
                        disabled={busy}
                        aria-describedby={
                          screen === 'signup' ? 'password-help' : undefined
                        }
                      />
                      <button
                        className="eye"
                        type="button"
                        onClick={() => setVisible((v) => !v)}
                        aria-label={visible ? 'Hide password' : 'Show password'}
                        aria-pressed={visible}
                      >
                        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {screen === 'signup' && (
                      <p className="helper" id="password-help">
                        At least 12 characters. Choose a unique password.
                      </p>
                    )}
                  </div>
                )}
                {error && (
                  <p id="form-error" role="alert" className="error">
                    {error}
                  </p>
                )}
                <Button
                  className="primary-button"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? (
                    <>
                      <LoaderCircle size={16} className="spin" /> Please wait…
                    </>
                  ) : (
                    <>
                      {screen === 'signup'
                        ? 'Create account'
                        : screen === 'forgot'
                          ? 'Send reset instructions'
                          : 'Sign in'}
                      <ArrowRight size={16} />
                    </>
                  )}
                </Button>
              </form>
              <div className="access-note">
                <ShieldCheck size={16} />
                <p>
                  {screen === 'signup'
                    ? 'New accounts require email verification and access approval from an administrator.'
                    : screen === 'forgot'
                      ? 'If an account exists for this email, you’ll receive password reset instructions.'
                      : 'For team members with approved access to Toolhub.'}
                </p>
              </div>
            </>
          ) : screen === 'account' ? (
            <>
              <div className="form-icon success-icon">
                <Check size={23} />
              </div>
              <h1 ref={heading} tabIndex={-1}>
                You’re in.
              </h1>
              <p className="subtext">Welcome to your account space.</p>
              <dl className="account-info">
                <div>
                  <dt>Account</dt>
                  <dd>Demo member</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{demoEmail}</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>
                    <span className="status">UI preview</span>
                  </dd>
                </div>
              </dl>
              <p className="subtext">
                Your workspace will take shape in the next phase.
              </p>
              <Button
                className="plain-button"
                variant="outline"
                onClick={logout}
              >
                <LogOut size={16} /> Sign out
              </Button>
            </>
          ) : (
            <>
              <div className="form-icon">
                <Mail size={23} />
              </div>
              <h1 ref={heading} tabIndex={-1}>
                {screen === 'registered'
                  ? 'Check your inbox'
                  : 'Request received'}
              </h1>
              <p className="subtext">
                {screen === 'registered'
                  ? 'Once connected, you’ll receive a verification link. An administrator can then approve your access.'
                  : 'Once connected, an email with reset instructions will be sent if an account exists.'}
              </p>
              <div className="email-box">{email}</div>
              <div className="access-note" style={{ marginBottom: 24 }}>
                <Mail size={16} />
                <p>
                  Preview only. No account has been created and no email has
                  been sent.
                </p>
              </div>
              <Button className="primary-button" onClick={() => go('login')}>
                Back to sign in
                <ArrowRight size={16} />
              </Button>
            </>
          )}
          <div className="prototype-note">
            UI prototype · Authentication is not connected.
            <br />
            Do not enter a real password.{' '}
            {isForm && (
              <button
                onClick={() => {
                  setEmail(demoEmail);
                  setPassword('Toolhub-Demo-2026');
                  setName('Demo member');
                  setError('');
                }}
              >
                Use demo details
              </button>
            )}
          </div>
        </div>
        <footer className="form-footer">
          <LockKeyhole size={12} />
          <span>Your own account. Your shared workspace.</span>
        </footer>
      </section>
    </main>
  );
}
