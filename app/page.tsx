'use client';

import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import Image from 'next/image';
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

import { WorkspaceShell } from './workspace-shell';
import { UserRound } from 'lucide-react';
import { AdminUsers } from './admin-users';

type User = { id: string; name: string; email: string; department: string; role?: string };
type Screen = 'login' | 'signup' | 'forgot' | 'account';

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
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

  async function loadSession() {
    const response = await fetch('/api/me', { cache: 'no-store' });
    if (response.status === 401) { setUser(null); setScreen('login'); return; }
    if (!response.ok) throw new Error('Account service is temporarily unavailable.');
    const data = await response.json() as {user:User}; setUser(data.user); setScreen('account');
  }
  useEffect(() => {
    Promise.resolve().then(loadSession).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (mounted.current) heading.current?.focus();
    mounted.current = true;
  }, [screen]);

  function go(next: Screen) {
    setScreen(next);
    setNotice('');
    setError('');
    setDepartmentError(false);
    setPassword('');
    setVisible(false);
    setSignedOut(false);
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    if (busy) { event.preventDefault(); return; }
    setError('');
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
    if (screen === 'forgot') { setError('Contact your administrator for account assistance.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${screen === 'signup' ? 'sign-up' : 'sign-in'}/email`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:email.trim().toLowerCase(),password,...(screen === 'signup' ? {name:name.trim(),department} : {})}),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as {message?:string};
        throw new Error(response.status === 429 ? 'Too many attempts. Try again in a minute.' : data.message || 'Unable to sign in. Please try again.');
      }
      setPassword(''); setVisible(false);
      if (screen === 'signup') { go('login'); setNotice('Continue by signing in with your account.'); }
      else await loadSession();
    } catch(e) { setError(e instanceof Error ? e.message : 'Connection failed. Please try again.'); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true); setError('');
    try {
      const response=await fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      if (!response.ok) throw new Error('Unable to sign out. Try again.');
      setUser(null); setShowAdmin(false); go('login'); setSignedOut(true);
      setEmail(''); setName(''); setDepartment(null);
    } catch(e) { setError(e instanceof Error ? e.message : 'Connection failed.'); }
    finally { setBusy(false); }
  }

  if (loading) return <main className="loading-state"><output>Loading…</output></main>;
  if (user) return <WorkspaceShell user={user} active={showAdmin && user.role==='admin'?'members':'account'} onNavigate={page=>{setError('');setShowAdmin(page==='members' && user.role==='admin');}} onSignOut={signOut} busy={busy}>
    {error && <p className="workspace-error error" role="alert">{error}</p>}
    {showAdmin && user.role==='admin'?<AdminUsers currentUserId={user.id}/>:<section className="accounts-content profile-content" aria-labelledby="profile-heading">
      <div className="accounts-heading"><div className="page-icon"><UserRound size={28} strokeWidth={1.5}/></div><h1 id="profile-heading">My account</h1><p>Your profile and workspace membership.</p></div>
      <div className="profile-heading"><span className="profile-avatar" aria-hidden="true">{user.name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()}</span><div><strong>{user.name}</strong><span>{user.email}</span></div></div>
      <dl className="profile-fields"><div><dt>Full name</dt><dd>{user.name}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Department</dt><dd><span className="profile-department">{user.department}</span></dd></div><div><dt>Role</dt><dd>{user.role==='admin'?'Admin':'Member'}</dd></div></dl>
      <Button variant="outline" className="profile-signout" disabled={busy} onClick={signOut}><LogOut size={15}/>{busy?'Signing out…':'Sign out'}</Button>
    </section>}
  </WorkspaceShell>;

  return (
    <main className="auth-page">
      <aside className="context-panel" aria-label="Tool connections">
        <div className="brand">
          <Image src="/notion.svg" width="34" height="34" alt="Notion" />
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
          {notice && <output className="notice">{notice}</output>}
          {signedOut && (
            <output className="notice">
              Signed out.
            </output>
          )}
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
              <Button className="submit-button" type="submit" disabled={busy}>
                {busy ? 'Please wait…' : screen === 'signup'
                  ? 'Create account'
                  : screen === 'forgot'
                    ? 'Send reset link'
                    : 'Sign in'}
              </Button>
            </form>
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
