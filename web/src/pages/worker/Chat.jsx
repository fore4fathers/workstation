import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { getSocket } from '../../socket.js';
import { IconBack } from '../../icons.jsx';

export default function Chat({ session }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const logRef = useRef(null);
  const uid = session?.user?.id;

  useEffect(() => {
    let socket;
    api('/api/chat')
      .then((data) => {
        setConversation(data.conversation);
        setMessages(data.messages || []);
        socket = getSocket();
        if (!socket) return;
        const onNew = (payload) => {
          if (payload.conversation_id !== data.conversation.id) return;
          setMessages((prev) => {
            if (payload.message?.id && prev.some((m) => m.id === payload.message.id)) return prev;
            return [...prev, payload.message];
          });
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
  }, [messages]);

  async function send(e) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setText('');
    try {
      const sent = await api('/api/chat', { method: 'POST', body: { content } });
      setMessages((prev) => [...prev, sent.message]);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="topbar">
        <Link className="icon-btn" to="/profile" aria-label="Back"><IconBack /></Link>
        <h1>Support</h1>
        <span />
      </div>
      <div className="page chat-page">
        {error ? <p className="error">{error}</p> : null}
        {!conversation ? <p className="meta">Loading…</p> : null}
        <div className="chat-log" id="log" ref={logRef}>
          {messages.map((m) => (
            <div key={m.id || `${m.created_at}-${m.content}`} className={`bubble ${m.sender_id === uid ? 'me' : 'them'}`}>
              {m.content}
            </div>
          ))}
        </div>
      </div>
      <form className="chat-input" onSubmit={send}>
        <input
          name="content"
          placeholder="Message"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="primary small" type="submit">Send</button>
      </form>
    </>
  );
}
