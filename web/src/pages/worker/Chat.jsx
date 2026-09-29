import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { getSocket } from '../../socket.js';
import { mergeMessage } from '../../chat.js';

function whenShort(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function Chat({ session }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [started, setStarted] = useState(false);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const uid = session?.user?.id;

  useEffect(() => {
    let socket;
    api('/api/chat')
      .then((data) => {
        setConversation(data.conversation);
        setMessages(data.messages || []);
        if ((data.messages || []).length) setStarted(true);
        socket = getSocket();
        if (!socket) return;
        const onNew = (payload) => {
          if (payload.conversation_id !== data.conversation.id) return;
          setMessages((prev) => mergeMessage(prev, payload.message));
          setStarted(true);
        };
        socket.on('message:new', onNew);
        socket._offChat = () => socket.off('message:new', onNew);
      })
      .catch((err) => setError(err.message));
    return () => {
      if (socket?._offChat) socket._offChat();
    };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, started]);

  const last = messages[messages.length - 1];
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return 'support'.includes(q) || (last?.content || '').toLowerCase().includes(q);
  }, [query, last]);

  async function send(e) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText('');
    setStarted(true);
    try {
      const sent = await api('/api/chat', { method: 'POST', body: { content } });
      setMessages((prev) => mergeMessage(prev, sent.message));
    } catch (err) {
      setError(err.message);
    }
  }

  function begin() {
    setStarted(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div className="page msg-wrap">
      {error ? <p className="error">{error}</p> : null}
      <div className="msg-app">
        <aside className="msg-list">
          <div className="msg-list-head">
            <h2>Messages</h2>
          </div>
          <input
            className="msg-search"
            placeholder="Search messages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {visible && (
            <button type="button" className={`msg-row${started || messages.length ? ' on' : ''}`} onClick={begin}>
              <span className="msg-avatar">S</span>
              <span className="msg-row-text">
                <b>Support</b>
                <span>{last?.content || 'Message the support team'}</span>
              </span>
              <span className="msg-time">{whenShort(last?.created_at)}</span>
            </button>
          )}
          {!conversation ? <p className="meta" style={{ padding: 12 }}>Loading…</p> : null}
        </aside>
        <section className="msg-main">
          {!started && !messages.length ? (
            <div className="msg-empty">
              <div className="msg-empty-icon" aria-hidden="true">✉</div>
              <p>Message someone and chat<br />right now!</p>
              <button type="button" className="primary small" onClick={begin}>Start message</button>
            </div>
          ) : (
            <>
              <div className="msg-thread-head">
                <span className="msg-avatar">S</span>
                <div>
                  <b>Support</b>
                  <div className="meta">EngageSphere</div>
                </div>
              </div>
              <div className="chat-log msg-log" ref={logRef}>
                {messages.map((m) => (
                  <div key={m.id || `${m.created_at}-${m.content}`} className={`bubble ${m.sender_id === uid ? 'me' : 'them'}`}>
                    {m.content}
                  </div>
                ))}
              </div>
              <form className="chat-input static msg-compose" onSubmit={send}>
                <input
                  ref={inputRef}
                  placeholder="Write a message"
                  autoComplete="off"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button className="primary small" type="submit">Send</button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
