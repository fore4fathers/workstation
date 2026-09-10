import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { getSocket } from '../../socket.js';

export default function AdminInbox() {
  const [conversations, setConversations] = useState([]);
  const [current, setCurrent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
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
      setMessages((prev) => {
        if (payload.message?.id && prev.some((m) => m.id === payload.message.id)) return prev;
        return currentRef.current === payload.conversation_id ? [...prev, payload.message] : prev;
      });
    };
    if (socket) socket.on('message:new', onNew);
    return () => {
      if (socket) socket.off('message:new', onNew);
    };
  }, []);

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
      setMessages((prev) => [...prev, { ...sent.message, role: 'admin' }]);
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
          {!conversations.length ? <p className="meta" style={{ padding: 12 }}>No conversations</p> : null}
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
                placeholder="Reply"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <button className="primary small" type="submit">Send</button>
            </form>
          ) : null}
        </div>
      </div>
    </>
  );
}
