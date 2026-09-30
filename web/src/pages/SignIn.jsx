import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { connectSocket } from '../socket.js';
import { Spinner } from '../ui.jsx';
import AuthLayout from '../layouts/AuthLayout.jsx';

export default function SignIn({ onLogin }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(!!localStorage.getItem('aw_email'));
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState(localStorage.getItem('aw_email') || '');
  const [resetCode, setResetCode] = useState('');
  const [resetPass, setResetPass] = useState('');
  const [devCode, setDevCode] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    setError('');
    setBusy(true);
    try {
      const mail = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      const data = await api('/api/auth/login', { method: 'POST', body: { email: mail, password } });
      if (remember) localStorage.setItem('aw_email', mail);
      else localStorage.removeItem('aw_email');
      setToken(data.token);
      connectSocket();
      const me = await api('/api/me');
      onLogin(me);
      navigate('/');
    } catch (err) {
      if (err.status === 403 && err.data?.requiresVerification) {
        navigate(`/register?verify=1&email=${encodeURIComponent(err.data.email || '')}`);
        return;
      }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendReset(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api('/api/auth/forgot', { method: 'POST', body: { email } });
      setDevCode(data.dev_code || '');
      setForgot('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function doReset(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/api/auth/reset', {
        method: 'POST',
        body: { email, code: resetCode, password: resetPass },
      });
      setForgot(false);
      setDevCode('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (forgot === true) {
    return (
      <AuthLayout title="Reset password" subtitle="Enter the email on the account.">
        <form onSubmit={sendReset}>
          <label htmlFor="email">Email</label>
          <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" type="submit" disabled={busy}>{busy ? <Spinner size={18} /> : null} Send code</button>
          <button type="button" className="text-btn" onClick={() => setForgot(false)}>Back</button>
        </form>
      </AuthLayout>
    );
  }

  if (forgot === 'code') {
    return (
      <AuthLayout title="Enter code" subtitle="Check your inbox for a 6-digit code.">
        {devCode ? <p className="verification-hint">Verification code: <b>{devCode}</b></p> : null}
        <form onSubmit={doReset}>
          <label htmlFor="code">Code</label>
          <input id="code" value={resetCode} onChange={(e) => setResetCode(e.target.value)} maxLength={6} required />
          <label htmlFor="np">New password</label>
          <input id="np" type="password" value={resetPass} onChange={(e) => setResetPass(e.target.value)} minLength={8} required />
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" type="submit" disabled={busy}>Update password</button>
          <button type="button" className="text-btn" onClick={() => setForgot(false)}>Back</button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Sign in" subtitle="Use your work email.">
      <form onSubmit={onSubmit}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" defaultValue={email} autoComplete="username" required />
        <label htmlFor="password">Password</label>
        <div className="password-field">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            defaultValue="john123"
            autoComplete="current-password"
            required
          />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)}>
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember email
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? <Spinner size={18} /> : null}
          Sign in
        </button>
        <button type="button" className="text-btn" onClick={() => setForgot(true)}>Forgot password</button>
        <p className="meta" style={{ textAlign: 'center' }}>
          No account? <Link to="/register">Create one</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
