import { LocalizedText } from '../../i18n.jsx';
import { Link } from 'react-router-dom';
import { money } from '../../format.js';

export default function Account({ session }) {
  const s = session || { user: {}, account: {}, stats: {} };
  const u = s.user || {};
  const a = s.account || {};
  return (
    <>
      <div className="topbar">
        <span />
        <h1><LocalizedText source={"Account"} /></h1>
        <span />
      </div>
      <div className="page">
        <div className="card">
          <h2>{u.display_name}</h2>
          <p className="meta">{u.email}</p>
          {u.phone ? <p className="meta">{u.phone}</p> : null}
          <p className="meta">{u.tier_name || (<LocalizedText source={"Bronze"} />)} · {s.stats?.accuracy ?? 0}<LocalizedText source={"% quality"} /></p>
        </div>
        <div className="dash-kpis" style={{ marginTop: 16 }}>
          <div className="dash-kpi">
            <div>
              <div className="meta"><LocalizedText source={"Available"} /></div>
              <div className="dash-kpi-n">{money(a.balance)}</div>
            </div>
          </div>
          <div className="dash-kpi">
            <div>
              <div className="meta"><LocalizedText source={"Pending"} /></div>
              <div className="dash-kpi-n">{money(a.pending)}</div>
            </div>
          </div>
          <div className="dash-kpi">
            <div>
              <div className="meta"><LocalizedText source={"On hold"} /></div>
              <div className="dash-kpi-n">{money(a.frozen)}</div>
            </div>
          </div>
        </div>
        <div className="card" style={{ marginTop: 16 }}>
          <Link className="primary small inline" to="/wallet"><LocalizedText source={"Wallet"} /></Link>
          <Link className="ghost" to="/wallet/deposit" style={{ marginLeft: 8 }}><LocalizedText source={"Cash in"} /></Link>
          <Link className="ghost" to="/wallet/withdraw" style={{ marginLeft: 8 }}><LocalizedText source={"Cash out"} /></Link>
          <div style={{ marginTop: 12 }}>
            <Link to="/check-in"><LocalizedText source={"Daily check-in"} /></Link>
            {' · '}
            <Link to="/profile"><LocalizedText source={"Edit profile"} /></Link>
          </div>
        </div>
      </div>
    </>
  );
}
