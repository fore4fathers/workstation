import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { logout } from '../../session.js';
import { Spinner } from '../../ui.jsx';

export default function Profile({ session }) {
  const navigate = useNavigate();
  const u = session?.user || {};
  const [name, setName] = useState(u.display_name || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSave(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/api/me', { method: 'PATCH', body: { display_name: name.trim() } });
      navigate('/');
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
      <div className="page">
        <form className="card" onSubmit={onSave}>
          <p className="meta">{u.email}</p>
          <label htmlFor="display_name">Name</label>
          <input
            id="display_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? <Spinner size={18} /> : null}
            Save
          </button>
          <button className="text-btn" type="button" onClick={() => logout(navigate)}>Log out</button>
        </form>
      </div>
    </>
  );
}
