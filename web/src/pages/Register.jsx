import { LocalizedText } from '../i18n.jsx';
import { useLanguage } from '../i18n.jsx';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { connectSocket } from '../socket.js';
import { Spinner } from '../ui.jsx';
import AuthLayout from '../layouts/AuthLayout.jsx';

export default function Register({ onLogin }) {
  const { t: trText } = useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(params.get('verify') ? 3 : 1);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: params.get('email') || '',
    phone: '',
    access_code: '',
    password: '',
    confirm: '',
    code: '',
  });
  const [devCode, setDevCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submitRegister(e) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: {
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone: form.phone,
          access_code: form.access_code,
          password: form.password,
        },
      });
      setDevCode(data.dev_code || '');
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api('/api/auth/verify-email', {
        method: 'POST',
        body: { email: form.email, code: form.code },
      });
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

  async function resend() {
    setBusy(true);
    setError('');
    try {
      const data = await api('/api/auth/resend-code', { method: 'POST', body: { email: form.email } });
      setDevCode(data.dev_code || '');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (step === 3) {
    return (
      <AuthLayout title={trText("Check your email")} subtitle={`We sent a 6-digit code to ${form.email || 'your inbox'}.`}>
        {devCode ? <p className="verification-hint"><LocalizedText source={"Verification code:"} />{' '}<b>{devCode}</b></p> : null}
        <form onSubmit={verify}>
          <label htmlFor="code"><LocalizedText source={"Verification code"} /></label>
          <input id="code" maxLength={6} value={form.code} onChange={(e) => set('code', e.target.value)} required />
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" type="submit" disabled={busy}>{busy ? <Spinner size={18} /> : null}{' '}<LocalizedText source={"Verify"} /></button>
          <button type="button" className="text-btn" onClick={resend} disabled={busy}><LocalizedText source={"Resend code"} /></button>
          <p className="meta"><LocalizedText source={"Contact admin if the code never arrives."} /></p>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={trText("Create account")} subtitle={`Step ${step} of 2`}>
      <div className="wiz-progress"><span style={{ width: `${(step / 2) * 100}%` }} /></div>
      {step === 1 && (
        <form onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
          <div className="two-col">
            <div>
              <label htmlFor="fn"><LocalizedText source={"First name"} /></label>
              <input id="fn" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} required />
            </div>
            <div>
              <label htmlFor="ln"><LocalizedText source={"Last name"} /></label>
              <input id="ln" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} required />
            </div>
          </div>
          <label htmlFor="em"><LocalizedText source={"Email"} /></label>
          <input id="em" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
          <label htmlFor="ph"><LocalizedText source={"Mobile"} /></label>
          <input id="ph" value={form.phone} onChange={(e) => set('phone', e.target.value)} required />
          <label htmlFor="ac"><LocalizedText source={"Access code"} /></label>
          <input id="ac" value={form.access_code} onChange={(e) => set('access_code', e.target.value)} placeholder={trText("AW-BETA")} required />
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" type="submit"><LocalizedText source={"Next"} /></button>
          <p className="meta" style={{ textAlign: 'center' }}><LocalizedText source={"Have an account?"} />{' '}<Link to="/sign-in"><LocalizedText source={"Sign in"} /></Link>
          </p>
        </form>
      )}
      {step === 2 && (
        <form onSubmit={submitRegister}>
          <label htmlFor="pw"><LocalizedText source={"Password"} /></label>
          <div className="password-field">
            <input id="pw" type={showPassword ? 'text' : 'password'} value={form.password} onChange={(e) => set('password', e.target.value)} minLength={8} required />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((v) => !v)}>{showPassword ? (<LocalizedText source={"Hide"} />) : (<LocalizedText source={"Show"} />)}</button>
          </div>
          <label htmlFor="cf"><LocalizedText source={"Confirm password"} /></label>
          <input id="cf" type={showPassword ? 'text' : 'password'} value={form.confirm} onChange={(e) => set('confirm', e.target.value)} minLength={8} required />
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" type="submit" disabled={busy}>{busy ? <Spinner size={18} /> : null}{' '}<LocalizedText source={"Create account"} /></button>
          <button type="button" className="text-btn" onClick={() => setStep(1)}><LocalizedText source={"Back"} /></button>
        </form>
      )}
    </AuthLayout>
  );
}
