'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Eye,
  EyeOff,
  LogOut,
  Users,
  Workflow,
  Wallet,
  ChartNoAxesCombined,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Screen = 'login' | 'signup' | 'forgot' | 'account';

export default function Home() {
  const [screen, setScreen] = useState<Screen>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [signedOut, setSignedOut] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);

  // An explicit design-review URL only; this does not establish a session.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'account') {
      setScreen('account');
    }
  }, []);
  useEffect(() => {
    if (mounted.current) heading.current?.focus();
    mounted.current = true;
  }, [screen]);

  function go(next: Screen) {
    setScreen(next);
    setError('');
    setPassword('');
    setVisible(false);
    setSignedOut(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (screen === 'signup' && !name.trim()) {
      setError('Enter your full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (
      screen !== 'forgot' &&
      password.length < (screen === 'signup' ? 12 : 1)
    ) {
      setError(
        screen === 'signup'
          ? 'Use at least 12 characters.'
          : 'Enter your password.',
      );
      return;
    }
    // No auth backend exists yet. Never simulate a successful account creation,
    // sign-in or email delivery, and never persist or transmit credentials.
    setPassword('');
    setVisible(false);
    setError(
      screen === 'signup'
        ? 'Account creation is currently unavailable.'
        : screen === 'forgot'
          ? 'Password reset is currently unavailable.'
          : 'Sign in is currently unavailable.',
    );
  }

  function signOut() {
    go('login');
    setEmail('');
    setName('');
    setSignedOut(true);
    window.history.replaceState(null, '', window.location.pathname);
  }

  return (
    <main className="auth-page">
      <aside className="context-panel" aria-label="Tool connections">
        <div className="brand">
          <img src="/notion.svg" width="34" height="34" alt="Notion" />
          <span>toolhub</span>
        </div>
        <div
          className="map"
          role="img"
          aria-label="Toolhub connects Sales, Operations, Data and Finance. Illustrative diagram."
        >
          <svg
            className="map-lines"
            viewBox="0 0 440 280"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <g fill="none" stroke="#c8c4be" strokeWidth="1.4">
              <path d="M85 54H155Q178 54 178 78V140H220" />
              <path d="M355 54H285Q262 54 262 78V140H220" />
              <path d="M85 226H155Q178 226 178 202V140H220" />
              <path d="M355 226H285Q262 226 262 202V140H220" />
            </g>
          </svg>
          <div className="mini-node node-sales">
            <span className="node-icon peach">
              <Users size={19} />
            </span>
            Sales
          </div>
          <div className="mini-node node-ops">
            <span className="node-icon mint">
              <Workflow size={19} />
            </span>
            Operations
          </div>
          <div className="mini-node node-main">
            <img src="/notion.svg" width="24" height="24" alt="" />
            <strong>toolhub</strong>
          </div>
          <div className="mini-node node-data">
            <span className="node-icon sky">
              <ChartNoAxesCombined size={19} />
            </span>
            Data
          </div>
          <div className="mini-node node-finance">
            <span className="node-icon yellow">
              <Wallet size={19} />
            </span>
            Finance
          </div>
        </div>
      </aside>
      <div className="form-region">
        <section className="auth-panel" aria-label="Toolhub account">
          <h1 ref={heading} tabIndex={-1}>
            {screen === 'signup'
              ? 'Create an account'
              : screen === 'forgot'
                ? 'Reset password'
                : screen === 'account'
                  ? 'Account'
                  : 'Sign in to Toolhub'}
          </h1>
          {screen === 'forgot' && (
            <p className="description">
              Enter the email associated with your account.
            </p>
          )}
          {signedOut && (
            <p className="notice" role="status">
              Signed out.
            </p>
          )}
          {screen === 'account' ? (
            <Button className="submit-button" onClick={signOut}>
              <LogOut size={16} />
              Sign out
            </Button>
          ) : (
            <form onSubmit={submit} noValidate>
              {screen === 'signup' && (
                <div className="field">
                  <label htmlFor="name">Full name</label>
                  <Input
                    id="name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="field">
                <label htmlFor="email">Email</label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              {screen !== 'forgot' && (
                <div className="field">
                  <div className="field-heading">
                    <label htmlFor="password">Password</label>
                    {screen === 'login' && (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => go('forgot')}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="password-input">
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
                      required
                      aria-describedby={
                        screen === 'signup' ? 'password-help' : undefined
                      }
                    />
                    <button
                      className="visibility-button"
                      type="button"
                      onClick={() => setVisible((v) => !v)}
                      aria-label={visible ? 'Hide password' : 'Show password'}
                      aria-pressed={visible}
                    >
                      {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                  {screen === 'signup' && (
                    <p className="field-help" id="password-help">
                      At least 12 characters.
                    </p>
                  )}
                </div>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <Button className="submit-button" type="submit">
                {screen === 'signup'
                  ? 'Create account'
                  : screen === 'forgot'
                    ? 'Send reset link'
                    : 'Sign in'}
              </Button>
            </form>
          )}
          {screen !== 'account' && (
            <div className="account-switch">
              {screen === 'login' ? (
                <>
                  <span>Don’t have an account?</span>
                  <button className="text-button" onClick={() => go('signup')}>
                    Sign up
                  </button>
                </>
              ) : screen === 'signup' ? (
                <>
                  <span>Already have an account?</span>
                  <button className="text-button" onClick={() => go('login')}>
                    Sign in
                  </button>
                </>
              ) : (
                <button className="text-button" onClick={() => go('login')}>
                  Back to sign in
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
