import { LocalizedText } from '../../i18n.jsx';
import { useLanguage } from '../../i18n.jsx';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { ledgerLabel, money, paymentMethodLabel, when } from '../../format.js';

export default function AdminWorkerDetail() {
  const { t } = useLanguage();
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/admin/workers/${id}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <><Link className="ghost small" to="/workers"><LocalizedText source={"Back to workers"} /></Link><p className="error">{error}</p></>;
  if (!data) return <p className="meta"><LocalizedText source={"Loading account…"} /></p>;

  const { worker, account, addresses, deposits, withdrawals, ledger } = data;
  return (
    <div className="admin-worker-account">
      <div className="section-h">
        <div>
          <h2>{worker.display_name}</h2>
          <p className="meta">{worker.email}{worker.phone ? ` · ${worker.phone}` : ''}</p>
        </div>
        <Link className="ghost small" to="/workers"><LocalizedText source={"Back to workers"} /></Link>
      </div>

      <div className="admin-account-kpis">
        <div className="card"><span className="meta"><LocalizedText source={"Available"} /></span><b>{money(account.balance || 0)}</b></div>
        <div className="card"><span className="meta"><LocalizedText source={"Pending"} /></span><b>{money(account.pending || 0)}</b></div>
        <div className="card"><span className="meta"><LocalizedText source={"On hold"} /></span><b>{money(account.frozen || 0)}</b></div>
      </div>

      <section className="card">
        <h3><LocalizedText source={"Account details"} /></h3>
        <p><LocalizedText source={"Status:"} />{' '}{worker.is_active ? (<LocalizedText source={"Active"} />) : (<LocalizedText source={"Disabled"} />)}{' '}<LocalizedText source={"· Tier:"} />{' '}{worker.tier_name}</p>
        <p className="meta"><LocalizedText source={"Joined"} />{' '}{when(worker.created_at)} · {worker.lifetime_completed}{' '}<LocalizedText source={"tasks completed"} /></p>
        <b><LocalizedText source={"Deposit crypto address"} /></b>
        <div className="wallet-address">
          {worker.deposit_address
            ? `${worker.deposit_cryptocurrency} · ${worker.deposit_network} · ${worker.deposit_address}`
            : (<LocalizedText source={"No deposit address assigned"} />)}
        </div>
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
            <b>{ledgerLabel(entry.kind)} · {money(entry.amount)}</b>
            <span>{when(entry.created_at)}{entry.note ? ` · ${entry.note}` : ''}</span>
          </div>
        )) : <p className="meta"><LocalizedText source={"No account activity."} /></p>}
      </section>
    </div>
  );
}
