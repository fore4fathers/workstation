import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { money, typeIcon } from '../../format.js';

export default function WorkerHome({ session }) {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');
  const s = session || { user: {}, account: {}, stats: {} };

  useEffect(() => {
    api('/api/tasks')
      .then((data) => setTasks(data.tasks || []))
      .catch((err) => setError(err.message));
  }, []);

  const rec = (tasks || []).filter((t) => t.assignment_status !== 'submitted').slice(0, 3);

  return (
    <>
      <div className="topbar">
        <span className="icon-btn" aria-hidden="true" />
        <h1>AI Workstation</h1>
        <span className="icon-btn" aria-hidden="true" />
      </div>
      <div className="page">
        <div className="hello">Hi, {s.user.display_name}</div>
        <div className="balance-card">
          <div>
            <div className="meta on-blue">Available</div>
            <div className="amt">{money(s.account.balance)}</div>
            {Number(s.account.pending) > 0 ? (
              <div className="meta on-blue">Pending {money(s.account.pending)}</div>
            ) : null}
          </div>
          <Link className="withdraw-btn" to="/wallet">Withdraw</Link>
        </div>
        <div className="stats">
          <div className="stat"><div className="n">{s.stats.tasks_done ?? 0}</div><div className="l">Tasks done</div></div>
          <div className="stat"><div className="n">{s.stats.accuracy ?? 0}%</div><div className="l">Accuracy</div></div>
          <div className="stat"><div className="n">Top {s.stats.rank_pct ?? 100}%</div><div className="l">Rank</div></div>
        </div>
        <div className="section-h">
          <h2>Tasks</h2>
          <Link to="/tasks" className="meta">View all</Link>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {tasks == null ? (
          <div className="task-card"><div className="skeleton" style={{ height: 44, width: '100%' }} /></div>
        ) : null}
        {tasks && rec.length === 0 ? (
          <div className="empty">
            <h2>Caught up</h2>
            <p className="meta">No open tasks.</p>
          </div>
        ) : null}
        {rec.map((t) => (
          <Link key={t.id} className="task-card" to={`/tasks/${t.id}`}>
            <div className={`task-icon ${t.type}`}>{typeIcon(t.type)}</div>
            <div className="grow">
              <h3>{t.title}</h3>
              <div className="meta">{t.description || `${t.item_count} items`}</div>
            </div>
            <div className="task-pay">
              <b>{money(t.pay_dollars)}</b>
              <div className="meta">{t.est_minutes} min</div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
