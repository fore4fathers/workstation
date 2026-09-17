import { useState } from 'react';
import { api } from '../../api.js';
import { Spinner } from '../../ui.jsx';

export default function AdminProfile({ session }) {
  const u = session?.user || {};
  const [name, setName] = useState(u.display_name || '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSave(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    setBusy(true);
    try {
      await api('/api/me', { method: 'PATCH', body: { display_name: name.trim() } });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
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
      {saved ? <p className="meta">Saved.</p> : null}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? <Spinner size={18} /> : null}
        Save
      </button>
    </form>
  );
}
