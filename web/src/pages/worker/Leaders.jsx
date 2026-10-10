import { LocalizedText } from '../../i18n.jsx';
import { useLanguage } from '../../i18n.jsx';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { IconBack } from '../../icons.jsx';

export default function Leaders() {
  const { t: trText } = useLanguage();
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
        <Link className="icon-btn" to="/" aria-label={trText("Back")}><IconBack /></Link>
        <h1><LocalizedText source={"Leaders"} /></h1>
        <span />
      </div>
      <div className="page">
        {error ? <p className="error">{error}</p> : null}
        <div className="card">
          <table className="table">
            <thead>
              <tr><th>#</th><th><LocalizedText source={"Name"} /></th><th><LocalizedText source={"Done"} /></th></tr>
            </thead>
            <tbody>
              {(leaders || []).map((l) => (
                <tr key={l.id} className={l.is_you ? 'you' : ''}>
                  <td>{l.rank}</td>
                  <td>{l.display_name}{l.is_you ? (<LocalizedText source={" (you)"} />) : ''}</td>
                  <td>{l.tasks_done}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {leaders && !leaders.length ? <p className="meta"><LocalizedText source={"No workers yet."} /></p> : null}
        </div>
      </div>
    </>
  );
}
