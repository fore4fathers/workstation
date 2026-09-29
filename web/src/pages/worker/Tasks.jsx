import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { money, typeIcon, when } from '../../format.js';
import { IconBack } from '../../icons.jsx';
import { Spinner } from '../../ui.jsx';

const TELEGRAM = 'https://t.me/aiworkstation_support';

export default function WorkerTasks({ session }) {
  const [tasks, setTasks] = useState(null);
  const [panel, setPanel] = useState(null);
  const [filter, setFilter] = useState('all');
  const [checkin, setCheckin] = useState(null);
  const [cal, setCal] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const s = session || { user: {}, account: {}, stats: {} };
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    api('/api/tasks').then((d) => setTasks(d.tasks || [])).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (panel !== 'checkin') return;
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    Promise.all([api('/api/checkin/stats'), api(`/api/checkin/calendar/${year}/${month}`)])
      .then(([st, c]) => {
        setCheckin(st);
        setCal(c.checkins || []);
      })
      .catch((err) => setError(err.message));
  }, [panel, now]);

  async function doCheckin() {
    setBusy(true);
    setError('');
    try {
      await api('/api/checkin', { method: 'POST' });
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const [st, c] = await Promise.all([
        api('/api/checkin/stats'),
        api(`/api/checkin/calendar/${year}/${month}`),
      ]);
      setCheckin(st);
      setCal(c.checkins || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const orders = (tasks || []).filter((t) => t.assignment_status);
  const shown = orders.filter((t) => {
    if (filter === 'processing') return t.assignment_status === 'in_progress' || t.payout_status === 'pending';
    if (filter === 'completed') return t.assignment_status === 'submitted' && t.payout_status !== 'pending';
    return true;
  });

  return (
    <>
      <div className="topbar">
        <Link className="icon-btn" to="/" aria-label="Back"><IconBack /></Link>
        <h1>Tasks</h1>
        <span />
      </div>
      <div className="page">
        {error ? <p className="error">{error}</p> : null}
        <h2 className="section-title">Quick access</h2>
        <div className="qa-grid">
          <button type="button" className="qa-card" onClick={() => setPanel('details')}>
            <b>Details</b>
            <span>Balance and training requirements</span>
          </button>
          <button type="button" className="qa-card" onClick={() => setPanel('packages')}>
            <b>Packages</b>
            <span>Current and previous orders</span>
          </button>
          <button type="button" className="qa-card" onClick={() => setPanel('checkin')}>
            <b>Check-in bonus</b>
            <span>Daily check-in rewards</span>
          </button>
          <button type="button" className="qa-card" onClick={() => setPanel('support')}>
            <b>Customer service</b>
            <span>Telegram and live chat</span>
          </button>
        </div>

        {panel === 'details' && (
          <section className="qa-panel">
            <div className="section-h">
              <h2>Wallet balance</h2>
              <button type="button" className="ghost" onClick={() => setPanel(null)}>Close</button>
            </div>
            <p className="meta">Your earnings and credits. Secure.</p>
            <div className="bal-hero">
              <div className="meta">Available balance</div>
              <div className="bal-hero-n">{money(s.account?.balance)}</div>
              <span className="bal-chip">USD · US Dollar</span>
            </div>
            <ul className="bal-rows">
              <li><span>Rewards earned<span className="meta">Total released pay</span></span><b>{money(s.stats?.total_earned)}</b></li>
              <li><span>Current status<span className="meta">Available now</span></span><b>{money(s.account?.balance)}</b></li>
              <li><span>Pending returns<span className="meta">Waiting on release</span></span><b>{money(s.account?.pending)}</b></li>
              <li><span>Welcome credit<span className="meta">Check-in bonuses</span></span><b>{money(s.stats?.welcome_credit)}</b></li>
            </ul>
            <p className="meta">Released pay is added to your available balance. You can withdraw it any time.</p>
            <button type="button" className="text-btn" onClick={() => setPanel('checkin')}>Daily sign-in reward</button>
          </section>
        )}

        {panel === 'packages' && (
          <section className="qa-panel">
            <div className="section-h">
              <h2>Packages</h2>
              <button type="button" className="ghost" onClick={() => setPanel(null)}>Close</button>
            </div>
            <div className="pkg-tabs">
              {['all', 'processing', 'completed'].map((k) => (
                <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
                  {k[0].toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
            {shown.map((t) => {
              const img = t.image_url || `https://picsum.photos/seed/aw${t.id}/640/360`;
              const done = t.assignment_status === 'submitted' && t.payout_status !== 'pending';
              return (
                <article key={t.id} className="pkg-card">
                  <div className="pkg-photos">
                    <img src={img} alt="" />
                    <img src={`https://picsum.photos/seed/awb${t.id}/320/180`} alt="" />
                    <img src={`https://picsum.photos/seed/awc${t.id}/320/180`} alt="" />
                  </div>
                  <p className="meta">Order {t.assignment_id || t.id}</p>
                  <h3>{t.title}</h3>
                  <p className="meta">{when(t.submitted_at || t.created_at)} · {typeIcon(t.type)} {t.type}</p>
                  <div className="pkg-nums">
                    <div><span className="meta">Total return</span><b>{money(t.pay_dollars)}</b></div>
                    <div><span className="meta">Commission</span><b>{s.user?.commission_rate || '1.00%'}</b></div>
                    <div><span className="meta">On hold</span><b>{money(t.payout_status === 'pending' ? t.pay_dollars : 0)}</b></div>
                  </div>
                  <span className={`pill ${done ? 'released' : 'pending'}`}>{done ? 'Completed' : 'Processing'}</span>
                </article>
              );
            })}
            {!shown.length ? <p className="meta">No orders in this tab.</p> : null}
          </section>
        )}

        {panel === 'checkin' && <CheckPanel stats={checkin} cal={cal} now={now} busy={busy} onCheck={doCheckin} onClose={() => setPanel(null)} />}

        {panel === 'support' && (
          <section className="qa-panel">
            <div className="section-h">
              <h2>Customer service</h2>
              <button type="button" className="ghost" onClick={() => setPanel(null)}>Close</button>
            </div>
            <a className="qa-card" href={TELEGRAM} target="_blank" rel="noreferrer">
              <b>Telegram</b>
              <span>Message the support channel</span>
            </a>
            <Link className="qa-card" to="/chat">
              <b>Live chat</b>
              <span>Talk to an admin in the app</span>
            </Link>
          </section>
        )}

        <h2 className="section-title">Open tasks</h2>
        {(tasks || []).filter((t) => t.assignment_status !== 'submitted').map((t) => (
          <Link key={t.id} className="task-card" to={`/tasks/${t.id}`}>
            <div className={`task-icon ${t.type}`}>{typeIcon(t.type)}</div>
            <div className="grow">
              <h3>{t.title}</h3>
              <div className="meta">{t.description || `${t.item_count} items`}</div>
            </div>
            <div className="task-pay"><b>{money(t.pay_dollars)}</b></div>
          </Link>
        ))}
      </div>
    </>
  );
}

function CheckPanel({ stats, cal, now, busy, onCheck, onClose }) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const marked = new Set((cal || []).map((d) => new Date(d.checkin_date).getUTCDate()));
  const days = new Date(year, month + 1, 0).getDate();
  const start = new Date(year, month, 1).getDay();
  return (
    <section className="qa-panel">
      <div className="section-h">
        <h2>Check-in bonus</h2>
        <button type="button" className="ghost" onClick={onClose}>Close</button>
      </div>
      <div className="dash-kpis">
        <div className="dash-kpi"><div><div className="meta">Streak</div><div className="dash-kpi-n">{stats?.current_streak ?? 0}</div></div></div>
        <div className="dash-kpi"><div><div className="meta">Longest</div><div className="dash-kpi-n">{stats?.longest_streak ?? 0}</div></div></div>
        <div className="dash-kpi"><div><div className="meta">Bonus</div><div className="dash-kpi-n">{money(0.1)}</div></div></div>
      </div>
      <p className="meta">One check-in a day adds {money(0.1)} to your welcome credit.</p>
      <button className="primary" type="button" disabled={busy || stats?.checked_in_today} onClick={onCheck}>
        {busy ? <Spinner size={18} /> : null}
        {stats?.checked_in_today ? 'Done for today' : 'Check in'}
      </button>
      <div className="cal" style={{ marginTop: 16 }}>
        {Array.from({ length: start }).map((_, i) => <span key={`e${i}`} className="cal-cell empty" />)}
        {Array.from({ length: days }).map((_, i) => (
          <span key={i + 1} className={`cal-cell${marked.has(i + 1) ? ' on' : ''}`}>{i + 1}</span>
        ))}
      </div>
    </section>
  );
}
