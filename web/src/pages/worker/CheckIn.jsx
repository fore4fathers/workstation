import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { IconBack } from '../../icons.jsx';
import { Spinner } from '../../ui.jsx';
import { money } from '../../format.js';

export default function CheckIn() {
  const [stats, setStats] = useState(null);
  const [cal, setCal] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  async function load() {
    const [s, c] = await Promise.all([
      api('/api/checkin/stats'),
      api(`/api/checkin/calendar/${year}/${month}`),
    ]);
    setStats(s);
    setCal(c.checkins || []);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  async function checkIn() {
    setBusy(true);
    setError('');
    try {
      await api('/api/checkin', { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const marked = new Set((cal || []).map((d) => new Date(d.checkin_date).getUTCDate()));
  const daysInMonth = new Date(year, month, 0).getDate();
  const startWeekday = new Date(year, month - 1, 1).getDay();

  return (
    <>
      <div className="topbar keep">
        <Link className="icon-btn" to="/" aria-label="Back"><IconBack /></Link>
        <h1>Check-in</h1>
        <span />
      </div>
      <div className="page">
        {error ? <p className="error">{error}</p> : null}
        <div className="dash-kpis">
          <div className="dash-kpi"><div><div className="meta">Streak</div><div className="dash-kpi-n">{stats?.current_streak ?? 0}</div></div></div>
          <div className="dash-kpi"><div><div className="meta">Longest</div><div className="dash-kpi-n">{stats?.longest_streak ?? 0}</div></div></div>
          <div className="dash-kpi"><div><div className="meta">Total</div><div className="dash-kpi-n">{stats?.total_checkins ?? 0}</div></div></div>
        </div>
        <p className="meta">Check in once a day for {money(0.1)}. Submitting a task also counts.</p>
        <button className="primary" type="button" disabled={busy || stats?.checked_in_today} onClick={checkIn}>
          {busy ? <Spinner size={18} /> : null}
          {stats?.checked_in_today ? 'Done for today' : 'Check in'}
        </button>
        <div className="cal" style={{ marginTop: 20 }}>
          {Array.from({ length: startWeekday }).map((_, i) => <span key={`e${i}`} className="cal-cell empty" />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const on = marked.has(day);
            return <span key={day} className={`cal-cell${on ? ' on' : ''}`}>{day}</span>;
          })}
        </div>
      </div>
    </>
  );
}
