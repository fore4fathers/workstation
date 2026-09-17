import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { ledgerLabel, money, when } from '../../format.js';
import { IconBack } from '../../icons.jsx';
import { Spinner } from '../../ui.jsx';

export default function Wallet() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await api('/api/wallet'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function onWithdraw(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    setFormErr('');
    setBusy(true);
    try {
      await api('/api/wallet/withdraw', {
        method: 'POST',
        body: { amount: Number(fd.get('amount')), address: fd.get('address') },
      });
      e.target.reset();
      await load();
    } catch (err) {
      setFormErr(err.message);
    } finally {
      setBusy(false);
    }
  }

  const acct = data?.account || { balance: 0, pending: 0, frozen: 0 };

  return (
    <>
      <div className="topbar">
        <Link className="icon-btn" to="/" aria-label="Back"><IconBack /></Link>
        <h1>Wallet</h1>
        <span />
      </div>
      <div className="page">
        {error ? <p className="error">{error}</p> : null}
        <div className="balance-card stacked">
          <div>
            <div className="meta on-blue">Available</div>
            <div className="amt">{money(acct.balance)}</div>
          </div>
          <div className="wallet-split">
            <div><div className="meta on-blue">Pending</div><b>{money(acct.pending)}</b></div>
            <div><div className="meta on-blue">On hold</div><b>{money(acct.frozen)}</b></div>
          </div>
        </div>
        <form className="card" style={{ marginTop: 16 }} onSubmit={onWithdraw}>
          <h2>Withdraw</h2>
          <label htmlFor="amount">Amount</label>
          <input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
          <label htmlFor="address">Memo</label>
          <input id="address" name="address" placeholder="optional" />
          {formErr ? <p className="error">{formErr}</p> : null}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? <Spinner size={18} /> : null}
            Request
          </button>
        </form>
        <h2 className="section-title">Withdrawals</h2>
        {(data?.withdrawals || []).map((w) => (
          <div key={w.id} className="task-card">
            <div className="grow">
              <b>{money(w.amount)}</b>
              <div className="meta">{w.status} · {when(w.created_at)}</div>
            </div>
            <span className={`pill ${w.status.toLowerCase()}`}>{w.status}</span>
          </div>
        ))}
        {data && !data.withdrawals.length ? <p className="meta">None yet.</p> : null}
        <h2 className="section-title">Ledger</h2>
        {(data?.ledger || []).map((l) => (
          <div key={l.id} className="task-card">
            <div className="grow">
              <b>{ledgerLabel(l.kind)}</b>
              <div className="meta">{when(l.created_at)}{l.note ? ` · ${l.note}` : ''}</div>
            </div>
            <span className="money">{money(l.amount)}</span>
          </div>
        ))}
        {data && !data.ledger.length ? <p className="meta">No entries.</p> : null}
      </div>
    </>
  );
}
