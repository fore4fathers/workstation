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

function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

function hideAddress(address) {
  if (!address || address.length < 14) return '••••••••••••';
  return `${address.slice(0, 6)}${'•'.repeat(Math.min(address.length - 12, 24))}${address.slice(-6)}`;
}

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
  const [workerDepositWallet, setWorkerDepositWallet] = useState(null);
  const [showDepositAddress, setShowDepositAddress] = useState(false);
  const [proofFile, setProofFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/wallet').then((d) => setWorkerDepositWallet({
      address: d.account?.deposit_address || '',
      cryptocurrency: d.account?.deposit_cryptocurrency || '',
      network: d.account?.deposit_network || '',
    })).catch(() => {});
  }, []);
  const depositAddress = workerDepositWallet?.address || '';
  const needsProof = method === 'crypto' || method === 'instant';
  const requestedCoin = method === 'instant' ? 'USDT' : coin;
  const addressMatches = Boolean(depositAddress
    && workerDepositWallet?.cryptocurrency === requestedCoin
    && workerDepositWallet?.network === network);

  function canNext() {
    if (step === 0) return Boolean(method);
    if (step === 1) return Number(amount) >= 10
      && (!needsProof || (Boolean(proofFile) && addressMatches));
    return true;
  }

  function chooseProof(file) {
    setError('');
    if (!file) {
      setProofFile(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG, GIF, or WebP image for the transfer proof.');
      setProofFile(null);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('The image must be 5 MB or smaller.');
      setProofFile(null);
      return;
    }
    setProofFile(file);
  }

  async function submit() {
    setError('');
    setBusy(true);
    try {
      const proof = proofFile ? {
        name: proofFile.name,
        mime: proofFile.type,
        data: await fileDataUrl(proofFile),
      } : null;
      await api('/api/wallet/deposit', {
        method: 'POST',
        body: {
          amount: Number(amount),
          method,
          tx_ref: txRef || null,
          notes: notes || null,
          details: { network, coin, extra, deposit_address: depositAddress || null },
          proof_image: proof,
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
      <div className="page deposit-page">
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
                  onClick={() => {
                    setMethod(m.id);
                    setProofFile(null);
                    setShowDepositAddress(false);
                    if (m.id === 'instant') {
                      setCoin('USDT');
                      if (!NETWORKS.instant.includes(network)) setNetwork('TRC20');
                    }
                  }}
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
                {addressMatches ? (
                  <div className="card" style={{ marginTop: 12 }}>
                    <div className="deposit-address-heading">
                      <div className="meta">Send to this address</div>
                      <button type="button" className="text-btn" aria-pressed={showDepositAddress}
                        onClick={() => setShowDepositAddress((value) => !value)}>
                        {showDepositAddress ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <p className="payin-addr">{showDepositAddress ? depositAddress : hideAddress(depositAddress)}</p>
                  </div>
                ) : <p className="meta deposit-address-missing">
                  {depositAddress
                    ? `Your assigned address is for ${workerDepositWallet.cryptocurrency} · ${workerDepositWallet.network}. Choose that network or contact support.`
                    : 'No deposit address is assigned to your account yet. Contact support before sending funds.'}
                </p>}
                <label htmlFor="tx">Transaction hash</label>
                <input id="tx" value={txRef} onChange={(e) => setTxRef(e.target.value)} />
                <label htmlFor="deposit-proof">Transfer screenshot</label>
                <input id="deposit-proof" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(e) => chooseProof(e.target.files?.[0])}
                  aria-describedby="deposit-proof-hint" required={needsProof} />
                <p id="deposit-proof-hint" className="meta">Attach an image of the completed transfer (up to 5 MB).</p>
                {proofFile ? <p className="meta">Selected: {proofFile.name}</p> : null}
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
              {proofFile ? <p className="meta">Transfer proof attached: {proofFile.name}</p> : null}
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
