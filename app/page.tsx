'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, LogOut } from 'lucide-react';
import { ConnectionDiagram, departments } from './connection-diagram';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Screen = 'login' | 'signup' | 'forgot' | 'account';

export default function Home() {
  const [screen, setScreen] = useState<Screen>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState<string | null>(null);
  const [departmentError, setDepartmentError] = useState(false);
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
    setDepartmentError(false);
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
      screen === 'signup' &&
      (!department || !departments.some((item) => item === department))
    ) {
      setDepartmentError(true);
      setError('Select your department.');
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
    setDepartment(null);
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
        <ConnectionDiagram selected={screen === 'signup' ? department : null} />
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
              {screen === 'signup' && (
                <div className="field">
                  <label id="department-label" htmlFor="department">
                    Department
                  </label>
                  <Select
                    value={department}
                    onValueChange={(value) => {
                      setDepartment(value);
                      setDepartmentError(false);
                      setError('');
                    }}
                    items={departments.map((value) => ({
                      label: value,
                      value,
                    }))}
                  >
                    <SelectTrigger
                      id="department"
                      className="department-select"
                      aria-labelledby="department-label"
                      aria-required="true"
                      aria-invalid={departmentError}
                      aria-describedby={
                        departmentError ? 'form-error' : undefined
                      }
                    >
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent
                      alignItemWithTrigger={false}
                      className="department-menu"
                    >
                      {departments.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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
                <p id="form-error" className="error" role="alert">
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
