import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { ledgerLabel, money, paymentMethodLabel, when } from '../../format.js';

export default function AdminWorkerDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/admin/workers/${id}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <><Link className="ghost small" to="/workers">Back to workers</Link><p className="error">{error}</p></>;
  if (!data) return <p className="meta">Loading account…</p>;

  const { worker, account, addresses, deposits, withdrawals, ledger } = data;
  return (
    <div className="admin-worker-account">
      <div className="section-h">
        <div>
          <h2>{worker.display_name}</h2>
          <p className="meta">{worker.email}{worker.phone ? ` · ${worker.phone}` : ''}</p>
        </div>
        <Link className="ghost small" to="/workers">Back to workers</Link>
      </div>

      <div className="admin-account-kpis">
        <div className="card"><span className="meta">Available</span><b>{money(account.balance || 0)}</b></div>
        <div className="card"><span className="meta">Pending</span><b>{money(account.pending || 0)}</b></div>
        <div className="card"><span className="meta">On hold</span><b>{money(account.frozen || 0)}</b></div>
      </div>

      <section className="card">
        <h3>Account details</h3>
        <p>Status: {worker.is_active ? 'Active' : 'Disabled'} · Tier: {worker.tier_name}</p>
        <p className="meta">Joined {when(worker.created_at)} · {worker.lifetime_completed} tasks completed</p>
        <b>Deposit crypto address</b>
        <div className="wallet-address">
          {worker.deposit_address
            ? `${worker.deposit_cryptocurrency} · ${worker.deposit_network} · ${worker.deposit_address}`
            : 'No deposit address assigned'}
        </div>
      </section>

      <section className="card">
        <h3>Saved withdrawal wallets</h3>
        {addresses.length ? addresses.map((address) => (
          <div className="admin-account-row" key={address.id}>
            <b>{address.cryptocurrency} · {address.network}</b>
            <span className="wallet-address">{address.address}</span>
          </div>
        )) : <p className="meta">No saved wallets.</p>}
      </section>

      <section className="card">
        <h3>Recent withdrawals</h3>
        {withdrawals.length ? withdrawals.map((withdrawal) => (
          <div className="admin-account-row" key={withdrawal.id}>
            <b>{money(withdrawal.amount)} · {withdrawal.status}</b>
            <span>{paymentMethodLabel(withdrawal.method)} · {when(withdrawal.created_at)}</span>
            <span className="wallet-address">{withdrawal.address || 'No wallet supplied'}</span>
          </div>
        )) : <p className="meta">No withdrawals.</p>}
      </section>

      <section className="card">
        <h3>Recent deposits</h3>
        {deposits.length ? deposits.map((deposit) => (
          <div className="admin-account-row" key={deposit.id}>
            <b>{money(deposit.amount)} · {deposit.status}</b>
            <span>{paymentMethodLabel(deposit.method)} · {when(deposit.created_at)}{deposit.tx_ref ? ` · ${deposit.tx_ref}` : ''}</span>
            {deposit.details?.proof_filename ? <Link to={`/deposits`} className="meta">View payment proof in Deposits</Link> : null}
          </div>
        )) : <p className="meta">No deposits.</p>}
      </section>

      <section className="card">
        <h3>Recent account activity</h3>
        {ledger.length ? ledger.map((entry) => (
          <div className="admin-account-row" key={entry.id}>
            <b>{ledgerLabel(entry.kind)} · {money(entry.amount)}</b>
            <span>{when(entry.created_at)}{entry.note ? ` · ${entry.note}` : ''}</span>
          </div>
        )) : <p className="meta">No account activity.</p>}
      </section>
    </div>
  );
}
