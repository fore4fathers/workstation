import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { ledgerLabel, money, paymentMethodLabel, when } from '../../format.js';
import { IconBack } from '../../icons.jsx';
import { Spinner } from '../../ui.jsx';

const METHODS = [
  { id: 'usdt_trc20', label: 'USDT · TRC20', crypto: 'USDT', network: 'TRC20' },
  { id: 'usdt_erc20', label: 'USDT · ERC20', crypto: 'USDT', network: 'ERC20' },
  { id: 'usdt_bep20', label: 'USDT · BEP20', crypto: 'USDT', network: 'BEP20' },
  { id: 'btc', label: 'BTC', crypto: 'BTC', network: 'BTC' },
];

export default function Wallet() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [formErr, setFormErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [wdMethod, setWdMethod] = useState('usdt_trc20');

  async function load() {
    try {
      setData(await api('/api/wallet'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  const acct = data?.account || { balance: 0, pending: 0, frozen: 0 };
  const methodMeta = METHODS.find((m) => m.id === wdMethod);
  const addrs = (data?.addresses || []).filter((a) => (
    methodMeta?.crypto
      ? a.cryptocurrency === methodMeta.crypto && a.network === methodMeta.network
      : false
  ));

  async function onWithdraw(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    setFormErr('');
    setBusy(true);
    try {
      const body = {
        amount: Number(fd.get('amount')),
        method: wdMethod,
      };
      if (methodMeta?.crypto) body.address_id = Number(fd.get('address_id'));
      else body.address = fd.get('address');
      await api('/api/wallet/withdraw', { method: 'POST', body });
      e.target.reset();
      await load();
    } catch (err) {
      setFormErr(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onAddress(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    setFormErr('');
    setBusy(true);
    try {
      const [cryptocurrency, network] = String(fd.get('pair')).split(':');
      await api('/api/wallet/addresses', {
        method: 'POST',
        body: {
          cryptocurrency,
          network,
          address: fd.get('new_address'),
          label: fd.get('label'),
        },
      });
      e.target.reset();
      await load();
    } catch (err) {
      setFormErr(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <Link className="icon-btn" to="/" aria-label="Back"><IconBack /></Link>
        <h1>Wallet</h1>
        <span />
      </div>
      <div className="page tm-dash">
        <header className="dash-head">
          <h1>Earnings</h1>
          <p>Available balance, deposits, and withdrawals.</p>
        </header>
        {error ? <p className="error">{error}</p> : null}
        <div className="landing-ctas" style={{ marginBottom: 16 }}>
          <Link className="primary small" to="/wallet/deposit">Cash in</Link>
          <Link className="ghost" to="/wallet/withdraw">Cash out</Link>
        </div>
        <div className="dash-kpis">
          <div className="dash-kpi">
            <div>
              <div className="meta">Available</div>
              <div className="dash-kpi-n">{money(acct.balance)}</div>
            </div>
          </div>
          <div className="dash-kpi">
            <div>
              <div className="meta">Pending</div>
              <div className="dash-kpi-n">{money(acct.pending)}</div>
            </div>
          </div>
          <div className="dash-kpi">
            <div>
              <div className="meta">On hold</div>
              <div className="dash-kpi-n">{money(acct.frozen)}</div>
            </div>
          </div>
        </div>

        {formErr ? <p className="error">{formErr}</p> : null}

        <div className="dash-grid">
          <div className="card">
            <h2>Deposit</h2>
            <p className="meta">Choose how to deposit and attach a transfer screenshot when requested.</p>
            <Link className="primary small" to="/wallet/deposit">Start deposit</Link>
          </div>

          <form className="card" onSubmit={onWithdraw}>
            <h2>Withdraw</h2>
            <label htmlFor="amount">Amount</label>
            <input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
            <label htmlFor="wd_method">Method</label>
            <select id="wd_method" value={wdMethod} onChange={(e) => setWdMethod(e.target.value)}>
              {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            {methodMeta?.crypto ? (
              <>
                <label htmlFor="address_id">Address</label>
                <select id="address_id" name="address_id" required={addrs.length > 0}>
                  {addrs.map((a) => (
                    <option key={a.id} value={a.id}>{a.label || a.address}</option>
                  ))}
                </select>
                {!addrs.length ? <p className="meta">Save an address first.</p> : null}
              </>
            ) : (
              <>
                <label htmlFor="address">Memo</label>
                <input id="address" name="address" placeholder="optional" />
              </>
            )}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? <Spinner size={18} /> : null}
              Request
            </button>
          </form>
        </div>

        <form className="card" style={{ marginTop: 16 }} onSubmit={onAddress}>
          <h2>Crypto addresses</h2>
          <label htmlFor="pair">Network</label>
          <select id="pair" name="pair">
            <option value="USDT:TRC20">USDT · TRC20</option>
            <option value="USDT:ERC20">USDT · ERC20</option>
            <option value="USDT:BEP20">USDT · BEP20</option>
            <option value="BTC:BTC">BTC</option>
          </select>
          <label htmlFor="new_address">Address</label>
          <input id="new_address" name="new_address" required />
          <label htmlFor="label">Label</label>
          <input id="label" name="label" placeholder="Main" />
          <button className="primary" type="submit" disabled={busy}>Save address</button>
          {(data?.addresses || []).map((a) => (
            <div key={a.id} className="task-card" style={{ marginTop: 10 }}>
              <div className="grow">
                <b>{a.cryptocurrency} · {a.network}</b>
                <div className="meta">{a.address}</div>
              </div>
            </div>
          ))}
        </form>

        <h2 className="section-title">Deposits</h2>
        {(data?.deposits || []).map((d) => (
          <div key={d.id} className="task-card">
            <div className="grow">
              <b>{money(d.amount)}</b>
              <div className="meta">{paymentMethodLabel(d.method)} · {when(d.created_at)}</div>
            </div>
            <span className={`pill ${d.status.toLowerCase()}`}>{d.status}</span>
          </div>
        ))}
        {data && !data.deposits.length ? <p className="meta">None yet.</p> : null}

        <h2 className="section-title">Withdrawals</h2>
        {(data?.withdrawals || []).map((w) => (
          <div key={w.id} className="task-card">
            <div className="grow">
              <b>{money(w.amount)}</b>
              <div className="meta">{paymentMethodLabel(w.method)} · {w.status} · {when(w.created_at)}</div>
            </div>
            <span className={`pill ${w.status.toLowerCase()}`}>{w.status}</span>
          </div>
        ))}

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
      </div>
    </>
  );
}
