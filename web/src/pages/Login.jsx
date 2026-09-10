import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { connectSocket } from '../socket.js';
import { Spinner } from '../ui.jsx';

export default function Login({ onLogin }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get('register') ? 'register' : 'login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    setError('');
    setBusy(true);
    try {
      const path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const body = {
        email: String(fd.get('email') || '').trim(),
        password: String(fd.get('password') || ''),
      };
      if (mode === 'register') body.display_name = String(fd.get('display_name') || '').trim();
      const data = await api(path, { method: 'POST', body });
      setToken(data.token);
      connectSocket();
      const me = await api('/api/me');
      onLogin(me);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>AI Workstation</h1>
        <p className="meta">
          {mode === 'login'
            ? 'john@demo.local / john123 · admin@demo.local / admin123'
            : 'Worker accounts only.'}
        </p>
        {mode === 'register' && (
          <>
            <label htmlFor="display_name">Name</label>
            <input id="display_name" name="display_name" autoComplete="name" required />
          </>
        )}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={mode === 'login' ? 'john@demo.local' : ''}
          autoComplete="username"
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          defaultValue={mode === 'login' ? 'john123' : ''}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          minLength={mode === 'register' ? 8 : undefined}
          required
        />
        {error ? <p className="error">{error}</p> : null}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? <Spinner size={18} /> : null}
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError('');
          }}
        >
          {mode === 'login' ? 'Register' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
