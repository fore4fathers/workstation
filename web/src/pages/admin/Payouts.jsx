import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { money, typeLabel, when } from '../../format.js';

export default function AdminPayouts() {
  const [payouts, setPayouts] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  async function load() {
    const data = await api('/api/admin/payouts');
    setPayouts(data.payouts || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function act(id, action) {
    setBusy(`${id}-${action}`);
    setError('');
    try {
      await api(`/api/admin/payouts/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="section-h">
        <h2>Payouts</h2>
      </div>
      <p className="meta">Release pays the worker. Void does not.</p>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Task</th>
              <th>Amount</th>
              <th>Accuracy</th>
              <th>Submitted</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(payouts || []).map((p) => (
              <tr key={p.id}>
                <td>{p.display_name}<div className="meta">{p.email}</div></td>
                <td>{p.title}<div className="meta">{typeLabel(p.type)}</div></td>
                <td className="money">{money(p.pay_dollars)}</td>
                <td>{p.accuracy == null ? '—' : `${p.accuracy}%`}</td>
                <td>{when(p.submitted_at)}</td>
                <td className="row-actions">
                  <button
                    type="button"
                    className="primary small"
                    disabled={!!busy}
                    onClick={() => act(p.id, 'release')}
                  >
                    {busy === `${p.id}-release` ? '…' : 'Release'}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!!busy}
                    onClick={() => act(p.id, 'void')}
                  >
                    Void
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {payouts && !payouts.length ? <p className="meta">No pending payouts.</p> : null}
      </div>
    </>
  );
}
