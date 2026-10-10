import { LocalizedText } from '../../i18n.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { money, typeLabel } from '../../format.js';

export default function AdminTasks() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/admin/tasks')
      .then((data) => setTasks(data.tasks || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <div className="section-h">
        <h2><LocalizedText source={"Tasks"} /></h2>
        <Link className="primary small" to="/tasks/new"><LocalizedText source={"New task"} /></Link>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th><LocalizedText source={"Title"} /></th>
              <th><LocalizedText source={"Type"} /></th>
              <th><LocalizedText source={"Pay"} /></th>
              <th><LocalizedText source={"Items"} /></th>
              <th><LocalizedText source={"Submissions"} /></th>
              <th><LocalizedText source={"Status"} /></th>
            </tr>
          </thead>
          <tbody>
            {(tasks || []).map((t) => (
              <tr key={t.id}>
                <td><Link to={`/tasks/${t.id}`}>{t.title}</Link></td>
                <td>{typeLabel(t.type)}</td>
                <td className="money">{money(t.pay_dollars)}</td>
                <td>{t.item_count}</td>
                <td>{t.submissions}</td>
                <td>{t.is_published ? (<LocalizedText source={"Published"} />) : (<LocalizedText source={"Hidden"} />)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks && !tasks.length ? <p className="meta"><LocalizedText source={"No tasks yet."} /></p> : null}
      </div>
    </>
  );
}
