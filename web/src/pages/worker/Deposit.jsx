import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { IconBack } from '../../icons.jsx';
import { Spinner } from '../../ui.jsx';
import { money } from '../../format.js';

const METHODS = [
  { id: 'wise', label: 'Wise', desc: 'Email transfer' },
  { id: 'instant', label: 'USDT instant', desc: 'Fast USDT' },
  { id: 'crypto', label: 'Crypto', desc: 'On-chain transfer' },
  { id: 'bank', label: 'Bank', desc: 'Wire transfer' },
  { id: 'transfer', label: 'Peer', desc: 'From another account' },
];

const NETWORKS = {
  instant: ['TRC20', 'ERC20', 'BEP20'],
  crypto: { USDT: ['TRC20', 'ERC20', 'BEP20'], BTC: ['BTC'] },
};

export default function Deposit() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState('');
  const [amount, setAmount] = useState('');
  const [network, setNetwork] = useState('TRC20');
  const [coin, setCoin] = useState('USDT');
  const [txRef, setTxRef] = useState('');
  const [notes, setNotes] = useState('');
  const [extra, setExtra] = useState('');
  const [payIns, setPayIns] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/wallet/pay-in-addresses').then((d) => setPayIns(d.addresses || [])).catch(() => {});
  }, []);

  const payIn = payIns.find((a) => (
    method === 'crypto'
      ? a.cryptocurrency === coin && a.network === network
      : a.cryptocurrency === 'USDT' && a.network === network
  ));

  function canNext() {
    if (step === 0) return Boolean(method);
    if (step === 1) return Number(amount) >= 10;
    return true;
  }

  async function submit() {
    setError('');
    setBusy(true);
    try {
      await api('/api/wallet/deposit', {
        method: 'POST',
        body: {
          amount: Number(amount),
          method,
          tx_ref: txRef || null,
          notes: notes || null,
          details: { network, coin, extra },
        },
      });
      navigate('/wallet');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="topbar keep">
        <Link className="icon-btn" to="/wallet" aria-label="Back"><IconBack /></Link>
        <h1>Cash in</h1>
        <span className="meta">{step + 1}/3</span>
      </div>
      <div className="page">
        <div className="wiz-progress"><span style={{ width: `${((step + 1) / 3) * 100}%` }} /></div>
        {step === 0 && (
          <>
            <h2>Choose method</h2>
            <p className="meta">How funds will arrive.</p>
            <div className="wiz-options">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`wiz-option${method === m.id ? ' on' : ''}`}
                  onClick={() => setMethod(m.id)}
                >
                  <b>{m.label}</b>
                  <span className="meta">{m.desc}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h2>Details</h2>
            <label htmlFor="dep-amt">Amount (USD, min 10)</label>
            <input id="dep-amt" type="number" min="10" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {method === 'wise' && (
              <>
                <label htmlFor="wise">Wise email</label>
                <input id="wise" value={extra} onChange={(e) => setExtra(e.target.value)} />
              </>
            )}
            {method === 'bank' && (
              <>
                <label htmlFor="bank">Bank name</label>
                <input id="bank" value={extra} onChange={(e) => setExtra(e.target.value)} />
              </>
            )}
            {method === 'transfer' && (
              <>
                <label htmlFor="pea">Account email</label>
                <input id="pea" value={extra} onChange={(e) => setExtra(e.target.value)} />
              </>
            )}
            {(method === 'instant' || method === 'crypto') && (
              <>
                {method === 'crypto' && (
                  <>
                    <label htmlFor="coin">Coin</label>
                    <select id="coin" value={coin} onChange={(e) => { setCoin(e.target.value); setNetwork(e.target.value === 'BTC' ? 'BTC' : 'TRC20'); }}>
                      <option value="USDT">USDT</option>
                      <option value="BTC">BTC</option>
                    </select>
                  </>
                )}
                <label htmlFor="net">Network</label>
                <select id="net" value={network} onChange={(e) => setNetwork(e.target.value)}>
                  {(method === 'crypto' ? NETWORKS.crypto[coin] : NETWORKS.instant).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                {payIn ? (
                  <div className="card" style={{ marginTop: 12 }}>
                    <div className="meta">Send to</div>
                    <p className="payin-addr">{payIn.address}</p>
                  </div>
                ) : null}
                <label htmlFor="tx">Tx hash / proof</label>
                <input id="tx" value={txRef} onChange={(e) => setTxRef(e.target.value)} />
              </>
            )}
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </>
        )}
        {step === 2 && (
          <>
            <h2>Review</h2>
            <div className="card">
              <p><b>{money(amount)}</b> via {METHODS.find((m) => m.id === method)?.label}</p>
              {network && (method === 'crypto' || method === 'instant') ? <p className="meta">{coin} · {network}</p> : null}
              {txRef ? <p className="meta">{txRef}</p> : null}
              {extra ? <p className="meta">{extra}</p> : null}
              <p className="meta">Pending until an admin approves.</p>
            </div>
          </>
        )}
        {error ? <p className="error">{error}</p> : null}
        <div className="wiz-nav">
          {step > 0 ? <button type="button" className="ghost" onClick={() => setStep(step - 1)}>Back</button> : null}
          {step < 2 ? (
            <button type="button" className="primary" disabled={!canNext()} onClick={() => setStep(step + 1)}>Next</button>
          ) : (
            <button type="button" className="primary" disabled={busy} onClick={submit}>
              {busy ? <Spinner size={18} /> : null}
              Submit
            </button>
          )}
        </div>
      </div>
    </>
  );
}
