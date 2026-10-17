import { LocalizedText } from '../i18n.jsx';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { Spinner } from '../ui.jsx';
import AuthLayout from '../layouts/AuthLayout.jsx';
import { useLanguage } from '../i18n.jsx';

export default function SignIn({ onLogin }) {
  const { t: trText } = useLanguage();
  const { t } = useLanguage();
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
      const me = await api('/api/me');
      onLogin(me);
      navigate('/');
    } catch (err) {
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
      <AuthLayout title={trText("Reset password")} subtitle="Enter the email on the account.">
        <form onSubmit={sendReset}>
          <label htmlFor="email"><LocalizedText source={"Email"} /></label>
          <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" type="submit" disabled={busy}>{busy ? <Spinner size={18} /> : null}{' '}<LocalizedText source={"Send code"} /></button>
          <button type="button" className="text-btn" onClick={() => setForgot(false)}><LocalizedText source={"Back"} /></button>
        </form>
      </AuthLayout>
    );
  }

  if (forgot === 'code') {
    return (
      <AuthLayout title={trText("Enter code")} subtitle="Check your inbox for a 6-digit code.">
        {devCode ? <p className="verification-hint"><LocalizedText source={"Verification code:"} />{' '}<b>{devCode}</b></p> : null}
        <form onSubmit={doReset}>
          <label htmlFor="code"><LocalizedText source={"Code"} /></label>
          <input id="code" value={resetCode} onChange={(e) => setResetCode(e.target.value)} maxLength={6} required />
          <label htmlFor="np"><LocalizedText source={"New password"} /></label>
          <input id="np" type="password" value={resetPass} onChange={(e) => setResetPass(e.target.value)} minLength={8} required />
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" type="submit" disabled={busy}><LocalizedText source={"Update password"} /></button>
          <button type="button" className="text-btn" onClick={() => setForgot(false)}><LocalizedText source={"Back"} /></button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={trText("Sign in")} subtitle="Use your work email.">
      <form onSubmit={onSubmit}>
        <label htmlFor="email">{t('auth.email')}</label>
        <input id="email" name="email" type="email" defaultValue={email} autoComplete="username" required />
        <label htmlFor="password">{t('auth.password')}</label>
        <div className="password-field">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
          />
          <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)}>
            {showPassword ? (<LocalizedText source={"Hide"} />) : (<LocalizedText source={"Show"} />)}
          </button>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          {t('auth.rememberEmail')}
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? <Spinner size={18} /> : null}<LocalizedText source={"Sign in"} /></button>
        <button type="button" className="text-btn" onClick={() => setForgot(true)}>{t('auth.forgotPassword')}</button>
        <p className="meta" style={{ textAlign: 'center' }}>
          {t('auth.noAccount')} <Link to="/register">{t('auth.createOne')}</Link>
        </p>
      </form>
    </AuthLayout>
  );
}
