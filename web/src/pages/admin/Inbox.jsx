import { LocalizedText } from '../../i18n.jsx';
import { useLanguage } from '../../i18n.jsx';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { getSocket } from '../../socket.js';
import { mergeMessage } from '../../chat.js';

export default function AdminInbox() {
  const { t: trText } = useLanguage();
  const [conversations, setConversations] = useState([]);
  const [current, setCurrent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [supportContact, setSupportContact] = useState('https://t.me/aiworkstation_support');
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportError, setSupportError] = useState('');
  const logRef = useRef(null);
  const currentRef = useRef(null);

  async function loadList() {
    const data = await api('/api/admin/chat');
    setConversations(data.conversations || []);
    return data.conversations || [];
  }

  async function open(id) {
    currentRef.current = id;
    setCurrent(id);
    const socket = getSocket();
    if (socket && id) socket.emit('join_conv', id);
    const detail = await api(`/api/admin/chat/${id}`);
    setMessages(detail.messages || []);
  }

  useEffect(() => {
    api('/api/admin/support-contact')
      .then((data) => setSupportContact(data.contact || ''))
      .catch((err) => setSupportError(err.message));
    let socket;
    loadList()
      .then((list) => {
        if (list[0]) return open(list[0].id);
        return null;
      })
      .catch((err) => setError(err.message));
    socket = getSocket();
    const onNew = (payload) => {
      setConversations((prev) => prev.map((c) => (
        c.id === payload.conversation_id
          ? { ...c, last_message: payload.message.content }
          : c
      )));
      if (currentRef.current === payload.conversation_id) {
        setMessages((prev) => mergeMessage(prev, payload.message));
      }
    };
    if (socket) socket.on('message:new', onNew);
    return () => {
      if (socket) socket.off('message:new', onNew);
    };
  }, []);

  async function saveSupportContact(e) {
    e.preventDefault();
    setSupportBusy(true);
    setSupportError('');
    try {
      const data = await api('/api/admin/support-contact', {
        method: 'PUT',
        body: { contact: supportContact },
      });
      setSupportContact(data.contact);
    } catch (err) {
      setSupportError(err.message);
    } finally {
      setSupportBusy(false);
    }
  }

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    if (!current) return;
    const content = text.trim();
    if (!content) return;
    setText('');
    try {
      const sent = await api(`/api/admin/chat/${current}`, { method: 'POST', body: { content } });
      setMessages((prev) => mergeMessage(prev, { ...sent.message, role: 'admin' }));
      setConversations((prev) => prev.map((c) => (
        c.id === current ? { ...c, last_message: content } : c
      )));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      {error ? <p className="error">{error}</p> : null}
      <form className="card" onSubmit={saveSupportContact} style={{ marginBottom: 18 }}>
        <h2><LocalizedText source={"Telegram customer support"} /></h2>
        <p className="meta"><LocalizedText source={"Set the Telegram contact shown to workers."} /></p>
        <label htmlFor="telegram-support-contact"><LocalizedText source={"Telegram username or link"} /></label>
        <div className="row">
          <input
            id="telegram-support-contact"
            value={supportContact}
            onChange={(e) => setSupportContact(e.target.value)}
            placeholder="https://t.me/your_support"
          />
          <button className="primary small" type="submit" disabled={supportBusy}>
            {supportBusy ? <LocalizedText source={"Saving..."} /> : <LocalizedText source={"Save contact"} />}
          </button>
        </div>
        {supportError ? <p className="error">{supportError}</p> : null}
      </form>
      <div className="card inbox">
        <div className="list">
          {conversations.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`conv ${c.id === current ? 'active' : ''}`}
              onClick={() => open(c.id).catch((err) => setError(err.message))}
            >
              <b>{c.display_name}</b>
              {c.unread ? <span className="badge">{c.unread}</span> : null}
              <div className="meta">{c.last_message || ''}</div>
            </button>
          ))}
          {!conversations.length ? <p className="meta" style={{ padding: 12 }}><LocalizedText source={"No conversations"} /></p> : null}
        </div>
        <div>
          <div className="chat-log admin-log" ref={logRef}>
            {messages.map((m) => (
              <div key={m.id} className={`bubble ${m.role === 'admin' ? 'me' : 'them'}`}>{m.content}</div>
            ))}
          </div>
          {current ? (
            <form className="chat-input static" onSubmit={send}>
              <input
                name="content"
                placeholder={trText("Reply")}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button className="primary small" type="submit"><LocalizedText source={"Send"} /></button>
            </form>
          ) : null}
        </div>
      </div>
    </>
  );
}
