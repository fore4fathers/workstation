import { LocalizedText } from '../../i18n.jsx';
import { useLanguage } from '../../i18n.jsx';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getToken, setToken } from '../../api.js';
import { ledgerLabel, money, paymentMethodLabel, when } from '../../format.js';

export default function AdminWorkerDetail() {
  const { t, t: trText } = useLanguage();
  const navigate = useNavigate();
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [actionModal, setActionModal] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deleteEmail, setDeleteEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [tierDraft, setTierDraft] = useState(2);
  const [addressDraft, setAddressDraft] = useState('');
  const [addressPair, setAddressPair] = useState('USDT:TRC20');
  const [balanceDraft, setBalanceDraft] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const [balanceBusy, setBalanceBusy] = useState(false);

  useEffect(() => {
    api(`/api/admin/workers/${id}`)
      .then((result) => {
        setData(result);
        setTierDraft(result.worker.tier);
        setAddressDraft(result.worker.deposit_address || '');
        setAddressPair(`${result.worker.deposit_cryptocurrency || 'USDT'}:${result.worker.deposit_network || 'TRC20'}`);
        setBalanceDraft(Number(result.account.balance || 0).toFixed(2));
      })
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <><Link className="ghost small" to="/workers"><LocalizedText source={"Back to workers"} /></Link><p className="error">{error}</p></>;
  if (!data) return <p className="meta"><LocalizedText source={"Loading account…"} /></p>;

  const { worker, account, addresses, deposits, withdrawals, ledger } = data;

  async function resetPassword(event) {
    event.preventDefault();
    setActionError('');
    if (newPassword !== confirmPassword) {
      setActionError('Passwords do not match');
      return;
    }
    setActionBusy(true);
    try {
      await api(`/api/admin/workers/${id}/password`, { method: 'POST', body: { password: newPassword } });
      setActionModal(null);
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Password reset successfully.');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function deleteAccount() {
    setActionError('');
    setActionBusy(true);
    try {
      await api(`/api/admin/workers/${id}`, { method: 'DELETE' });
      navigate('/workers');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function saveTier() {
    setSettingsBusy(true);
    setSettingsError('');
    try {
      const result = await api(`/api/admin/workers/${id}/tier`, { method: 'POST', body: { tier: Number(tierDraft) } });
      setData((current) => ({ ...current, worker: { ...current.worker, ...result.user } }));
      setNotice('Settings saved.');
    } catch (err) {
      setSettingsError(err.message);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function toggleVerification() {
    setSettingsBusy(true);
    setSettingsError('');
    try {
      const result = await api(`/api/admin/workers/${id}/active`, { method: 'POST', body: { is_active: !worker.is_verified } });
      setData((current) => ({ ...current, worker: { ...current.worker, ...result.user } }));
      setNotice('Settings saved.');
    } catch (err) {
      setSettingsError(err.message);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function saveDepositAddress(event) {
    event.preventDefault();
    setSettingsBusy(true);
    setSettingsError('');
    try {
      const [cryptocurrency, network] = addressPair.split(':');
      const result = await api(`/api/admin/workers/${id}/deposit-address`, {
        method: 'POST', body: { address: addressDraft, cryptocurrency, network },
      });
      setData((current) => ({ ...current, worker: { ...current.worker, ...result.worker } }));
      setNotice('Settings saved.');
    } catch (err) {
      setSettingsError(err.message);
    } finally {
      setSettingsBusy(false);
    }
  }

  async function saveBalance(event) {
    event.preventDefault();
    setBalanceBusy(true);
    setBalanceError('');
    try {
      const result = await api(`/api/admin/workers/${id}/balance`, {
        method: 'POST',
        body: { balance: balanceDraft, reason: balanceReason },
      });
      setData((current) => ({
        ...current,
        account: { ...current.account, ...result.account },
        ledger: [result.adjustment, ...current.ledger.filter((entry) => entry.id !== result.adjustment.id)].slice(0, 30),
      }));
      setBalanceDraft(Number(result.account.balance).toFixed(2));
      setBalanceReason('');
      setNotice('Wallet balance updated.');
    } catch (err) {
      setBalanceError(err.message);
    } finally {
      setBalanceBusy(false);
    }
  }

  async function viewAsWorker() {
    setSettingsBusy(true);
    setSettingsError('');
    try {
      const result = await api(`/api/admin/workers/${id}/impersonate`, { method: 'POST' });
      sessionStorage.setItem('aw_admin_token', getToken());
      setToken(result.token);
      navigate('/');
    } catch (err) {
      setSettingsError(err.message);
      setSettingsBusy(false);
    }
  }

  return (
    <div className="admin-worker-account">
      <div className="section-h">
        <div>
          <h2>{worker.display_name}</h2>
          <p className="meta">{worker.email}{worker.phone ? ` · ${worker.phone}` : ''}</p>
        </div>
        <div className="admin-worker-actions">
          <button type="button" className="primary small" disabled={settingsBusy} onClick={viewAsWorker}>
            <LocalizedText source={settingsBusy ? "Opening account..." : "View as client"} />
          </button>
          <Link className="ghost small" to="/workers"><LocalizedText source={"Back to workers"} /></Link>
        </div>
      </div>
      {notice ? <p className="admin-action-success"><LocalizedText source={notice} /></p> : null}
      {actionModal === 'password' ? (
        <div className="admin-action-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !actionBusy) setActionModal(null); }}>
          <form className="admin-action-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-worker-password-title" onSubmit={resetPassword}>
            <h2 id="reset-worker-password-title"><LocalizedText source={"Reset password"} /></h2>
            <label htmlFor="worker-new-password"><LocalizedText source={"New password"} /></label>
            <input id="worker-new-password" type="password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            <label htmlFor="worker-confirm-password"><LocalizedText source={"Confirm password"} /></label>
            <input id="worker-confirm-password" type="password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            {actionError ? <p className="error">{['Passwords do not match', 'password must be at least 8 characters', 'worker not found'].includes(actionError) ? <LocalizedText source={actionError} /> : actionError}</p> : null}
            <div className="admin-action-buttons">
              <button type="button" className="ghost" disabled={actionBusy} onClick={() => setActionModal(null)}><LocalizedText source={"Cancel"} /></button>
              <button type="submit" className="primary" disabled={actionBusy}>{actionBusy ? <LocalizedText source={"Saving..."} /> : <LocalizedText source={"Save new password"} />}</button>
            </div>
          </form>
        </div>
      ) : null}
      {actionModal === 'delete' ? (
        <div className="admin-action-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget && !actionBusy) setActionModal(null); }}>
          <section className="admin-action-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-worker-title">
            <h2 id="delete-worker-title"><LocalizedText source={"Delete account"} /></h2>
            <p><LocalizedText source={"Delete this worker account? This action cannot be undone."} /></p>
            <label htmlFor="delete-worker-email"><LocalizedText source={"Type the account email to confirm deletion:"} /></label>
            <input id="delete-worker-email" type="email" autoComplete="off" placeholder={t('Enter the account email')} value={deleteEmail} onChange={(event) => setDeleteEmail(event.target.value)} />
            {actionError ? <p className="error">{actionError === 'worker not found' ? <LocalizedText source={actionError} /> : actionError}</p> : null}
            <div className="admin-action-buttons">
              <button type="button" className="ghost" disabled={actionBusy} onClick={() => setActionModal(null)}><LocalizedText source={"Cancel"} /></button>
              <button type="button" className="danger-btn" disabled={actionBusy || deleteEmail.trim().toLowerCase() !== worker.email.toLowerCase()} onClick={deleteAccount}>
                {actionBusy ? <LocalizedText source={"Deleting..."} /> : <LocalizedText source={"Delete account"} />}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <div className="admin-account-kpis">
        <div className="card"><span className="meta"><LocalizedText source={"Available"} /></span><b>{money(account.balance || 0)}</b></div>
        <div className="card"><span className="meta"><LocalizedText source={"Pending"} /></span><b>{money(account.pending || 0)}</b></div>
        <div className="card"><span className="meta"><LocalizedText source={"On hold"} /></span><b>{money(account.frozen || 0)}</b></div>
      </div>

      <form className="card admin-worker-balance-editor" onSubmit={saveBalance}>
        <div>
          <h3><LocalizedText source={"Edit wallet balance"} /></h3>
          <p className="meta"><LocalizedText source={"Set the worker’s wallet balance. Any change is recorded in account activity."} />{' '}<LocalizedText source={"Funds on hold and pending amounts are unchanged."} /></p>
          <p className="admin-worker-balance-current"><LocalizedText source={"Current wallet balance"} />: <b>{money(account.balance || 0)}</b></p>
        </div>
        <div className="admin-worker-balance-fields">
          <label htmlFor="worker-wallet-balance"><LocalizedText source={"New balance"} /></label>
          <input id="worker-wallet-balance" type="number" min={Number(account.frozen || 0)} step="0.01" required value={balanceDraft} onChange={(event) => setBalanceDraft(event.target.value)} disabled={balanceBusy} />
          <label htmlFor="worker-wallet-balance-reason"><LocalizedText source={"Reason for adjustment"} /></label>
          <input id="worker-wallet-balance-reason" type="text" minLength={3} maxLength={500} required value={balanceReason} onChange={(event) => setBalanceReason(event.target.value)} placeholder={trText("Enter a reason for this balance change")} disabled={balanceBusy} />
        </div>
        {balanceError ? <p className="error">{t(balanceError, balanceError)}</p> : null}
        <button type="submit" className="primary small" disabled={balanceBusy || !balanceReason.trim() || Number(balanceDraft) === Number(account.balance)}>
          {balanceBusy ? <LocalizedText source={"Saving..."} /> : <LocalizedText source={"Save balance"} />}
        </button>
      </form>

      <section className="card">
        <h3><LocalizedText source={"Account details"} /></h3>
        <p><LocalizedText source={"Status:"} />{' '}{worker.is_verified ? (<LocalizedText source={"Verified"} />) : (<LocalizedText source={"Awaiting verification"} />)}{' '}<LocalizedText source={"· Tier:"} />{' '}{worker.tier_name}</p>
        <p className="meta"><LocalizedText source={"Joined"} />{' '}{when(worker.created_at)} · {worker.lifetime_completed}{' '}<LocalizedText source={"tasks completed"} /></p>
      </section>

      <section className="card admin-worker-settings">
        <div><h3><LocalizedText source={"Worker settings"} /></h3><p className="meta"><LocalizedText source={"Manage account access, tier, and deposit details."} /></p></div>
        <div className="admin-worker-setting-row">
          <div><b><LocalizedText source={"Account access"} /></b><span className="meta"><LocalizedText source={worker.is_verified ? "Verified" : "Awaiting verification"} /></span></div>
          <button type="button" className={worker.is_verified ? 'ghost small' : 'primary small'} disabled={settingsBusy} onClick={toggleVerification}>
            <LocalizedText source={worker.is_verified ? "Remove verification" : "Verify account"} />
          </button>
        </div>
        <div className="admin-worker-setting-row">
          <label htmlFor="worker-tier"><LocalizedText source={"Tier"} /></label>
          <div className="admin-worker-setting-control">
            <select id="worker-tier" value={tierDraft} disabled={settingsBusy} onChange={(event) => setTierDraft(Number(event.target.value))}>
              <option value={1}><LocalizedText source={"Basic"} /></option>
              <option value={2}><LocalizedText source={"Bronze"} /></option>
              <option value={3}><LocalizedText source={"Gold"} /></option>
              <option value={4}><LocalizedText source={"Platinum"} /></option>
            </select>
            <button type="button" className="ghost small" disabled={settingsBusy || Number(tierDraft) === Number(worker.tier)} onClick={saveTier}><LocalizedText source={"Save"} /></button>
          </div>
        </div>
        <form className="admin-worker-deposit-form" onSubmit={saveDepositAddress}>
          <b><LocalizedText source={"Deposit address for client"} /></b>
          <div className="admin-worker-setting-control">
            <select aria-label={trText("Deposit currency and network")} value={addressPair} disabled={settingsBusy} onChange={(event) => setAddressPair(event.target.value)}>
              <option value="USDT:TRC20"><LocalizedText source={"USDT · TRC20"} /></option>
              <option value="USDT:ERC20"><LocalizedText source={"USDT · ERC20"} /></option>
              <option value="USDT:BEP20"><LocalizedText source={"USDT · BEP20"} /></option>
              <option value="BTC:BTC"><LocalizedText source={"BTC · Bitcoin"} /></option>
            </select>
            <input aria-label={trText("Crypto address")} value={addressDraft} onChange={(event) => setAddressDraft(event.target.value)} placeholder={trText("Crypto address")} maxLength={500} />
            <button type="submit" className="ghost small" disabled={settingsBusy}><LocalizedText source={"Save"} /></button>
          </div>
          {!addressDraft ? <span className="meta"><LocalizedText source={"No deposit address assigned"} /></span> : null}
        </form>
        {settingsError ? <p className="error">{settingsError}</p> : null}
      </section>

      <section className="card admin-worker-security">
        <div><h3><LocalizedText source={"Password"} /></h3><p className="meta"><LocalizedText source={"Set a new password for this worker account."} /></p></div>
        <button type="button" className="ghost small" onClick={() => { setActionError(''); setActionModal('password'); }}><LocalizedText source={"Reset password"} /></button>
      </section>

      <section className="card admin-worker-danger-zone">
        <div><h3><LocalizedText source={"Delete account"} /></h3><p className="meta"><LocalizedText source={"Permanently remove this worker and their account data."} /></p></div>
        <button type="button" className="danger-btn small" onClick={() => { setActionError(''); setDeleteEmail(''); setActionModal('delete'); }}><LocalizedText source={"Delete account"} /></button>
      </section>

      <section className="card">
        <h3><LocalizedText source={"Saved withdrawal wallets"} /></h3>
        {addresses.length ? addresses.map((address) => (
          <div className="admin-account-row" key={address.id}>
            <b>{address.cryptocurrency} · {address.network}</b>
            <span className="wallet-address">{address.address}</span>
          </div>
        )) : <p className="meta"><LocalizedText source={"No saved wallets."} /></p>}
      </section>

      <section className="card">
        <h3><LocalizedText source={"Recent withdrawals"} /></h3>
        {withdrawals.length ? withdrawals.map((withdrawal) => (
          <div className="admin-account-row" key={withdrawal.id}>
            <b>{money(withdrawal.amount)} · {t(withdrawal.status, withdrawal.status)}</b>
            <span>{paymentMethodLabel(withdrawal.method)} · {when(withdrawal.created_at)}</span>
            <span className="wallet-address">{withdrawal.address || (<LocalizedText source={"No wallet supplied"} />)}</span>
          </div>
        )) : <p className="meta"><LocalizedText source={"No withdrawals."} /></p>}
      </section>

      <section className="card">
        <h3><LocalizedText source={"Recent deposits"} /></h3>
        {deposits.length ? deposits.map((deposit) => (
          <div className="admin-account-row" key={deposit.id}>
            <b>{money(deposit.amount)} · {t(deposit.status, deposit.status)}</b>
            <span>{paymentMethodLabel(deposit.method)} · {when(deposit.created_at)}{deposit.tx_ref ? ` · ${deposit.tx_ref}` : ''}</span>
            {deposit.details?.proof_filename ? <Link to={`/deposits`} className="meta"><LocalizedText source={"View payment proof in Deposits"} /></Link> : null}
          </div>
        )) : <p className="meta"><LocalizedText source={"No deposits."} /></p>}
      </section>

      <section className="card">
        <h3><LocalizedText source={"Recent account activity"} /></h3>
        {ledger.length ? ledger.map((entry) => (
          <div className="admin-account-row" key={entry.id}>
            <b>{t(ledgerLabel(entry.kind), ledgerLabel(entry.kind))} · {money(entry.amount)}</b>
            <span>{when(entry.created_at)}{entry.note ? ` · ${entry.note}` : ''}</span>
          </div>
        )) : <p className="meta"><LocalizedText source={"No account activity."} /></p>}
      </section>
    </div>
  );
}
