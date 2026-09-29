import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { money, when } from '../../format.js';

export default function AdminDeposits() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  async function load() {
    const data = await api('/api/admin/deposits');
    setRows(data.deposits || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function act(id, action) {
    setBusy(`${id}-${action}`);
    setError('');
    try {
      await api(`/api/admin/deposits/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h2>Deposits</h2>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>User</th><th>Amount</th><th>Method</th><th>Status</th><th>When</th><th /></tr>
          </thead>
          <tbody>
            {(rows || []).map((d) => (
              <tr key={d.id}>
                <td>{d.display_name}<div className="meta">{d.email}</div></td>
                <td className="money">{money(d.amount)}</td>
                <td>{d.method}{d.tx_ref ? <div className="meta">{d.tx_ref}</div> : null}</td>
                <td><span className={`pill ${d.status.toLowerCase()}`}>{d.status}</span></td>
                <td>{when(d.created_at)}</td>
                <td className="row-actions">
                  {d.status === 'PENDING' ? (
                    <>
                      <button type="button" className="primary small" disabled={!!busy} onClick={() => act(d.id, 'approve')}>
                        Approve
                      </button>
                      <button type="button" className="ghost" disabled={!!busy} onClick={() => act(d.id, 'reject')}>
                        Reject
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && !rows.length ? <p className="meta">No deposits.</p> : null}
      </div>
    </>
  );
}
