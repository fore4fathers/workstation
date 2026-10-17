import { LocalizedText } from '../i18n.jsx';
import { useLanguage } from '../i18n.jsx';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, setToken } from '../api.js';
import { Spinner } from '../ui.jsx';
import AuthLayout from '../layouts/AuthLayout.jsx';

export default function Register({ onLogin }) {
  const { t: trText } = useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: params.get('email') || '',
    phone: '',
    password: '',
    confirm: '',
  });
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
          password: form.password,
        },
      });
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
