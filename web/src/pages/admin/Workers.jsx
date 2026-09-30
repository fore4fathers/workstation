import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { money } from '../../format.js';

export default function AdminWorkers() {
  const [workers, setWorkers] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [addressDrafts, setAddressDrafts] = useState({});

  async function load() {
    const data = await api('/api/admin/workers');
    setWorkers(data.workers || []);
    setAddressDrafts((current) => Object.fromEntries((data.workers || []).map((worker) => [
      worker.id,
      current[worker.id] ?? {
        address: worker.deposit_address || '',
        pair: `${worker.deposit_cryptocurrency || 'USDT'}:${worker.deposit_network || 'TRC20'}`,
      },
    ])));
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function setTier(id, tier) {
    setBusy(id);
    setError('');
    try {
      await api(`/api/admin/workers/${id}/tier`, { method: 'POST', body: { tier } });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

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

  async function saveDepositAddress(id) {
    setBusy(id);
    setError('');
    try {
      await api(`/api/admin/workers/${id}/deposit-address`, {
        method: 'POST',
        body: {
          address: addressDrafts[id]?.address || '',
          cryptocurrency: String(addressDrafts[id]?.pair || 'USDT:TRC20').split(':')[0],
          network: String(addressDrafts[id]?.pair || 'USDT:TRC20').split(':')[1],
        },
      });
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
              <th>Tier</th>
              <th>Deposit address for client</th>
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
                <td>
                  <select
                    value={w.tier}
                    disabled={busy === w.id}
                    onChange={(e) => setTier(w.id, Number(e.target.value))}
                  >
                    <option value={1}>Basic</option>
                    <option value={2}>Bronze</option>
                    <option value={3}>Gold</option>
                    <option value={4}>Platinum</option>
                  </select>
                </td>
                <td>
                  <div className="worker-address-editor">
                    <select
                      aria-label={`Deposit currency and network for ${w.display_name}`}
                      value={addressDrafts[w.id]?.pair ?? 'USDT:TRC20'}
                      onChange={(e) => setAddressDrafts((current) => ({
                        ...current,
                        [w.id]: { ...current[w.id], pair: e.target.value },
                      }))}
                    >
                      <option value="USDT:TRC20">USDT · TRC20</option>
                      <option value="USDT:ERC20">USDT · ERC20</option>
                      <option value="USDT:BEP20">USDT · BEP20</option>
                      <option value="BTC:BTC">BTC · Bitcoin</option>
                    </select>
                    <input
                      aria-label={`Deposit crypto address for ${w.display_name}`}
                      value={addressDrafts[w.id]?.address ?? ''}
                      onChange={(e) => setAddressDrafts((current) => ({
                        ...current,
                        [w.id]: { ...current[w.id], address: e.target.value },
                      }))}
                      placeholder="Crypto address"
                      maxLength={500}
                    />
                    <button type="button" className="primary small" disabled={busy === w.id}
                      onClick={() => saveDepositAddress(w.id)}>Save</button>
                  </div>
                </td>
                <td>{w.is_active ? 'Active' : 'Disabled'}</td>
                <td>
                  <Link className="ghost small" to={`/workers/${w.id}`}>Open account</Link>
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
