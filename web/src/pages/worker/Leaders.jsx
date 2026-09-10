import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { IconBack } from '../../icons.jsx';

export default function Leaders() {
  const [leaders, setLeaders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/leaders')
      .then((data) => setLeaders(data.leaders || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <div className="topbar">
        <Link className="icon-btn" to="/" aria-label="Back"><IconBack /></Link>
        <h1>Leaders</h1>
        <span />
      </div>
      <div className="page">
        {error ? <p className="error">{error}</p> : null}
        <div className="card">
          <table className="table">
            <thead>
              <tr><th>#</th><th>Name</th><th>Done</th></tr>
            </thead>
            <tbody>
              {(leaders || []).map((l) => (
                <tr key={l.id} className={l.is_you ? 'you' : ''}>
                  <td>{l.rank}</td>
                  <td>{l.display_name}{l.is_you ? ' (you)' : ''}</td>
                  <td>{l.tasks_done}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {leaders && !leaders.length ? <p className="meta">No workers yet.</p> : null}
        </div>
      </div>
    </>
  );
}
