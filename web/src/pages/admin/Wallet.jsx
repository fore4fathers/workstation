import { LocalizedText } from '../../i18n.jsx';
import { useLanguage } from '../../i18n.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { money, when } from '../../format.js';

export default function AdminWallet() {
  const { t } = useLanguage();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  async function load() {
    const data = await api('/api/admin/withdrawals');
    setRows(data.withdrawals || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function act(id, action) {
    setBusy(`${id}-${action}`);
    setError('');
    try {
      await api(`/api/admin/withdrawals/${id}/${action}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <h2><LocalizedText source={"Withdrawals"} /></h2>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <table className="table">
          <thead>
            <tr><th><LocalizedText source={"User"} /></th><th><LocalizedText source={"Amount"} /></th><th><LocalizedText source={"Withdrawal wallet"} /></th><th><LocalizedText source={"Status"} /></th><th><LocalizedText source={"When"} /></th><th><LocalizedText source={"Account"} /></th><th /></tr>
          </thead>
          <tbody>
            {(rows || []).map((w) => (
              <tr key={w.id}>
                <td>{w.display_name}<div className="meta">{w.email}</div></td>
                <td className="money">{money(w.amount)}</td>
                <td><span className="wallet-address">{w.address || '—'}</span></td>
                <td><span className={`pill ${w.status.toLowerCase()}`}>{t(w.status, w.status)}</span></td>
                <td>{when(w.created_at)}</td>
                <td><Link className="ghost small" to={`/workers/${w.user_id}`}><LocalizedText source={"Open account"} /></Link></td>
                <td className="row-actions">
                  {w.status === 'PENDING' ? (
                    <>
                      <button type="button" className="primary small" disabled={!!busy} onClick={() => act(w.id, 'approve')}><LocalizedText source={"Approve"} /></button>
                      <button type="button" className="ghost" disabled={!!busy} onClick={() => act(w.id, 'reject')}><LocalizedText source={"Reject"} /></button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && !rows.length ? <p className="meta"><LocalizedText source={"No withdrawals."} /></p> : null}
      </div>
    </>
  );
}
