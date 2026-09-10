import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { when } from '../../format.js';

export default function AdminHome() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api('/api/admin/stats'), api('/api/admin/recent')])
      .then(([s, r]) => {
        setStats(s);
        setRecent(r.recent || []);
      })
      .catch((err) => setError(err.message));
  }, []);

  const cards = stats
    ? [
        { n: stats.workers, l: 'Workers', to: '/workers' },
        { n: stats.open_tasks, l: 'Open tasks', to: '/tasks' },
        { n: stats.pending_payouts, l: 'Pending payouts', to: '/payouts' },
        { n: stats.pending_withdrawals, l: 'Withdrawals', to: '/wallet' },
        { n: stats.unread_chats, l: 'Unread chats', to: '/inbox' },
      ]
    : [];

  return (
    <>
      {error ? <p className="error">{error}</p> : null}
      <div className="grid-stats">
        {cards.map((c) => (
          <Link key={c.l} to={c.to} className="card">
            <div className="stat"><div className="n">{c.n}</div><div className="l">{c.l}</div></div>
          </Link>
        ))}
      </div>
      <div className="card">
        <h3>Recent submissions</h3>
        <table className="table">
          <thead>
            <tr><th>Worker</th><th>Task</th><th>Payout</th><th>When</th></tr>
          </thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id}>
                <td>{r.display_name}</td>
                <td>{r.title}</td>
                <td><span className={`pill ${r.payout_status}`}>{r.payout_status}</span></td>
                <td>{when(r.submitted_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!recent.length ? <p className="meta">None yet</p> : null}
      </div>
    </>
  );
}
