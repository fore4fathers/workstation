import { LocalizedText } from '../../i18n.jsx';
import { useLanguage } from '../../i18n.jsx';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { IconBack } from '../../icons.jsx';
import { Spinner } from '../../ui.jsx';
import { money } from '../../format.js';

const METHODS = [
  { id: 'wise', label: 'Wise', desc: 'Email payout' },
  { id: 'bank', label: 'Bank', desc: 'Wire' },
  { id: 'usdt_trc20', label: 'USDT · TRC20', crypto: 'USDT', network: 'TRC20' },
  { id: 'usdt_erc20', label: 'USDT · ERC20', crypto: 'USDT', network: 'ERC20' },
  { id: 'usdt_bep20', label: 'USDT · BEP20', crypto: 'USDT', network: 'BEP20' },
  { id: 'btc', label: 'BTC', crypto: 'BTC', network: 'BTC' },
];

export default function Withdraw() {
  const { t: trText } = useLanguage();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState('');
  const [amount, setAmount] = useState('');
  const [addressId, setAddressId] = useState('');
  const [memo, setMemo] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/wallet').then(setData).catch((err) => setError(err.message));
  }, []);

  const acct = data?.account || { balance: 0, frozen: 0 };
  const available = Number(acct.balance) - Number(acct.frozen);
  const meta = METHODS.find((m) => m.id === method);
  const addrs = (data?.addresses || []).filter((a) => (
    meta?.crypto ? a.cryptocurrency === meta.crypto && a.network === meta.network : false
  ));

  function canNext() {
    if (step === 0) return Boolean(method);
    if (step === 1) {
      const n = Number(amount);
      if (!n || n <= 0 || n > available) return false;
      if (meta?.crypto && !addressId && addrs.length) return false;
      if (meta?.crypto && !addrs.length) return false;
      return true;
    }
    return true;
  }

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const body = { amount: Number(amount), method };
      if (meta?.crypto) body.address_id = Number(addressId);
      else body.address = memo;
      await api('/api/wallet/withdraw', { method: 'POST', body });
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
        <Link className="icon-btn" to="/wallet" aria-label={trText("Back")}><IconBack /></Link>
        <h1><LocalizedText source={"Cash out"} /></h1>
        <span className="meta">{step + 1}/3</span>
      </div>
      <div className="page">
        <div className="wiz-progress"><span style={{ width: `${((step + 1) / 3) * 100}%` }} /></div>
        <p className="meta"><LocalizedText source={"Available"} />{' '}{money(available)}</p>
        {step === 0 && (
          <>
            <h2><LocalizedText source={"Choose method"} /></h2>
            <div className="wiz-options">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`wiz-option${method === m.id ? ' on' : ''}`}
                  onClick={() => setMethod(m.id)}
                >
                  <b>{trText(m.label, m.label)}</b>
                  <span className="meta">{m.desc ? trText(m.desc, m.desc) : `${m.crypto} ${m.network}`}</span>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <h2><LocalizedText source={"Details"} /></h2>
            <label htmlFor="wd-amt"><LocalizedText source={"Amount"} /></label>
            <input id="wd-amt" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {meta?.crypto ? (
              <>
                <label htmlFor="wd-addr"><LocalizedText source={"Saved address"} /></label>
                {addrs.length ? (
                  <select id="wd-addr" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
                    <option value=""><LocalizedText source={"Select"} /></option>
                    {addrs.map((a) => <option key={a.id} value={a.id}>{a.label || a.address}</option>)}
                  </select>
                ) : (
                  <p className="meta"><LocalizedText source={"Save a"} />{' '}{meta.crypto} {meta.network}{' '}<LocalizedText source={"address on Wallet first."} /></p>
                )}
              </>
            ) : (
              <>
                <label htmlFor="wd-memo"><LocalizedText source={"Destination / memo"} /></label>
                <input id="wd-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
              </>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <h2><LocalizedText source={"Review"} /></h2>
            <div className="card">
              <p><b>{money(amount)}</b>{' '}<LocalizedText source={"via"} />{' '}{meta?.label}</p>
              <p className="meta"><LocalizedText source={"Held until an admin approves. Rejected funds return to available."} /></p>
            </div>
          </>
        )}
        {error ? <p className="error">{error}</p> : null}
        <div className="wiz-nav">
          {step > 0 ? <button type="button" className="ghost" onClick={() => setStep(step - 1)}><LocalizedText source={"Back"} /></button> : null}
          {step < 2 ? (
            <button type="button" className="primary" disabled={!canNext()} onClick={() => setStep(step + 1)}><LocalizedText source={"Next"} /></button>
          ) : (
            <button type="button" className="primary" disabled={busy} onClick={submit}>
              {busy ? <Spinner size={18} /> : null}<LocalizedText source={"Submit"} /></button>
          )}
        </div>
      </div>
    </>
  );
}
