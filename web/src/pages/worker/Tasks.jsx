import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { money, typeIcon } from '../../format.js';
import { IconBack } from '../../icons.jsx';

export default function WorkerTasks() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/tasks')
      .then((data) => setTasks(data.tasks || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <div className="topbar">
        <Link className="icon-btn" to="/" aria-label="Back"><IconBack /></Link>
        <h1>Tasks</h1>
        <span />
      </div>
      <div className="page">
        {error ? <p className="error">{error}</p> : null}
        {tasks == null ? <p className="meta">Loading…</p> : null}
        {tasks && tasks.length === 0 ? (
          <div className="empty">
            <h2>No tasks</h2>
          </div>
        ) : null}
        {(tasks || []).map((t) => {
          const done = t.assignment_status === 'submitted';
          return (
            <Link key={t.id} className={`task-card${done ? ' done' : ''}`} to={done ? '/tasks' : `/tasks/${t.id}`}>
              <div className={`task-icon ${t.type}`}>{typeIcon(t.type)}</div>
              <div className="grow">
                <h3>{t.title}</h3>
                <div className="meta">{t.description || `${t.item_count} items`}</div>
              </div>
              <div className="task-pay">
                <b>{money(t.pay_dollars)}</b>
                <div className="meta">{t.est_minutes} min{done ? ' · done' : ''}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
