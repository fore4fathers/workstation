import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { logout } from '../../session.js';
import { Spinner } from '../../ui.jsx';
import { PAY_METHODS, TIERS } from '../../tiers.js';

export default function Profile({ session }) {
  const navigate = useNavigate();
  const u = session?.user || {};
  const [name, setName] = useState(u.display_name || '');
  const [phone, setPhone] = useState(u.phone || '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [upgrade, setUpgrade] = useState(null);

  async function onSave(e) {
    e.preventDefault();
    setError('');
    setSaved('');
    setBusy(true);
    try {
      await api('/api/me', { method: 'PATCH', body: { display_name: name.trim(), phone } });
      setSaved('Profile saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onPassword(e) {
    e.preventDefault();
    setError('');
    setSaved('');
    if (next !== confirm) {
      setError('New passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api('/api/me/password', { method: 'POST', body: { current, next } });
      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved('Password updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <span />
        <h1>Profile</h1>
        <span />
      </div>
      <div className="page tm-dash">
        <header className="dash-head">
          <h1>Profile</h1>
          <p>Contact details, password, and your tier.</p>
        </header>
        <p className="meta"><Link to="/account">Account</Link></p>
        {error ? <p className="error">{error}</p> : null}
        {saved ? <p className="meta">{saved}</p> : null}
        <form className="card" onSubmit={onSave}>
          <p className="meta">{u.email}</p>
          <label htmlFor="display_name">Name</label>
          <input id="display_name" value={name} onChange={(e) => setName(e.target.value)} required />
          <label htmlFor="phone">Mobile</label>
          <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="optional" />
          <button className="primary" type="submit" disabled={busy}>
            {busy ? <Spinner size={18} /> : null}
            Save
          </button>
        </form>
        <form className="card" style={{ marginTop: 16 }} onSubmit={onPassword}>
          <h2>Password</h2>
          <label htmlFor="cur">Current</label>
          <div className="password-field">
            <input id="cur" type={show ? 'text' : 'password'} value={current} onChange={(e) => setCurrent(e.target.value)} required />
            <button type="button" className="password-toggle" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
          </div>
          <label htmlFor="nw">New</label>
          <input id="nw" type={show ? 'text' : 'password'} value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
          <label htmlFor="cf">Confirm</label>
          <input id="cf" type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
          <button className="primary" type="submit" disabled={busy}>Update password</button>
        </form>
        <h2 className="section-title">Your tier</h2>
        <p className="meta">You start on Bronze. An admin can change this.</p>
        <div className="tier-row">
          {TIERS.map((t) => {
            const current = (u.tier || 2) === t.id;
            return (
              <article key={t.id} className={`tier-card ${t.tone}${current ? ' is-current' : ''}`}>
                <div className={`tier-gem ${t.tone}`} aria-hidden="true" />
                <h3>{t.name}</h3>
                <span className="tier-tag">{t.tag}</span>
                <p className="tier-offer">{t.offer}</p>
                {t.note ? <p className="meta">{t.note}</p> : null}
                <div className="meta">Commission rate</div>
                <div className="tier-rate">{t.rate}</div>
                <button
                  type="button"
                  className="tier-cta"
                  disabled={current}
                  onClick={() => { if (!current) setUpgrade(t.name); }}
                >
                  {current ? 'Current' : t.cta}
                </button>
                <div className="meta">We accept</div>
                <div className="tier-pays">
                  {PAY_METHODS.map((p) => <span key={p}>{p}</span>)}
                </div>
              </article>
            );
          })}
        </div>
        <button className="text-btn" type="button" onClick={() => logout(navigate)}>Log out</button>
        {upgrade ? (
          <div className="gate-back" role="presentation" onClick={() => setUpgrade(null)}>
            <div className="gate-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <h2>Upgrade to {upgrade}</h2>
              <p>Contact support to change your tier.</p>
              <div className="gate-actions">
                <a className="primary small" href="https://t.me/aiworkstation_support" target="_blank" rel="noreferrer">Telegram</a>
                <Link className="ghost" to="/chat">Direct chat</Link>
              </div>
              <button type="button" className="text-btn" onClick={() => setUpgrade(null)}>Close</button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
