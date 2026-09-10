import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { money } from '../../format.js';

export default function AdminWorkers() {
  const [workers, setWorkers] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  async function load() {
    const data = await api('/api/admin/workers');
    setWorkers(data.workers || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function setActive(id, is_active) {
    setBusy(id);
    setError('');
    try {
      await api(`/api/admin/workers/${id}/active`, { method: 'POST', body: { is_active } });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h2>Workers</h2>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Available</th>
              <th>Pending</th>
              <th>Submitted</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(workers || []).map((w) => (
              <tr key={w.id}>
                <td>{w.display_name}<div className="meta">{w.email}</div></td>
                <td className="money">{money(w.balance)}</td>
                <td className="money">{money(w.pending)}</td>
                <td>{w.submitted}</td>
                <td>{w.is_active ? 'Active' : 'Disabled'}</td>
                <td>
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy === w.id}
                    onClick={() => setActive(w.id, !w.is_active)}
                  >
                    {w.is_active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
