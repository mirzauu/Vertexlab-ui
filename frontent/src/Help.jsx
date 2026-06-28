import React, { useState, useEffect, useRef } from 'react';
import './Help.css';
import { Send, MessageSquare, Loader2, AlertCircle, Bot, Shield, User } from 'lucide-react';
import { api } from './services/api';

export function HelpChat({ isWidget }) {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  
  const chatEndRef = useRef(null);

  const orgId = localStorage.getItem('organization_id');

  useEffect(() => {
    if (!orgId) {
      setError('Missing organization scope.');
      setLoading(false);
      return;
    }

    const loadMessages = async () => {
      try {
        const res = await api(`/api/v1/organizations/${orgId}/help/messages`);
        if (!res.ok) {
          throw new Error('Failed to load message history.');
        }
        const data = await res.json();
        setMessages(data);
      } catch (err) {
        console.error('Error fetching support messages:', err);
        setError(err.message || 'Failed to load messages.');
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [orgId]);

  // Scroll to bottom on message load or new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || sending || !orgId) return;

    const messageText = inputMessage.trim();
    setInputMessage('');
    setSending(true);

    try {
      const res = await api(`/api/v1/organizations/${orgId}/help/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: messageText }),
      });

      if (!res.ok) {
        throw new Error('Failed to send message.');
      }

      const newMsgData = await res.json();
      if (Array.isArray(newMsgData)) {
        setMessages((prev) => [...prev, ...newMsgData]);
      } else {
        setMessages((prev) => [...prev, newMsgData]);
      }
    } catch (err) {
      console.error('Error sending support message:', err);
      // Put back input text on failure
      setInputMessage(messageText);
      alert(err.message || 'Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className={`chat-card skeleton-card ${isWidget ? 'widget-mode' : ''}`} style={{ height: isWidget ? '100%' : '500px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" size={32} style={{ color: '#5B44E9' }} />
      </div>
    );
  }

  return (
    <>
      {error ? (
        <div className="error-alert">
          <AlertCircle size={20} />
          <span>Error: {error}</span>
        </div>
      ) : (
        <div className={`chat-card ${isWidget ? 'widget-mode' : ''}`}>
          <div className="chat-history">
            {messages.length === 0 ? (
              <div className="empty-chat-state">
                <div className="empty-chat-icon-wrapper">
                  <MessageSquare size={36} />
                </div>
                <h3>Start a Conversation</h3>
                <p>Send a message to our technicians. You will receive an email notice when they reply, and the reply history will appear here.</p>
              </div>
            ) : (
              <div className="messages-flow">
                {messages.map((msg, idx) => {
                  const isUser = msg.sender_type === 'user';
                  const showDateSeparator = idx === 0 || 
                    new Date(messages[idx - 1].created_at).toDateString() !== new Date(msg.created_at).toDateString();
                  
                  return (
                    <React.Fragment key={msg.id}>
                      {showDateSeparator && (
                        <div className="date-separator">
                          <span>{formatDate(msg.created_at)}</span>
                        </div>
                      )}
                      
                      <div className={`message-row ${isUser ? 'user-row' : msg.sender_type === 'ai' ? 'ai-row' : 'support-row'}`}>
                        <div className="message-bubble-wrapper">
                          {isUser ? (
                            <>
                              <div className="message-content">
                                <div className="message-header-info user-info">
                                  <span className="message-time-meta">{formatTime(msg.created_at)}</span>
                                  <span className="message-sender-name">{msg.user_name}</span>
                                </div>
                                <div className="message-bubble">
                                  <div className="message-text-content">{msg.content}</div>
                                </div>
                              </div>
                              <div className="sender-avatar-icon user-avatar">
                                <User size={15} />
                              </div>
                            </>
                          ) : (
                            <>
                              <div className={`sender-avatar-icon ${msg.sender_type}-avatar`}>
                                {msg.sender_type === 'ai' ? <Bot size={15} /> : <Shield size={15} />}
                              </div>
                              <div className="message-content">
                                <div className="message-header-info support-info">
                                  <span className="message-sender-name">{msg.user_name}</span>
                                  <span className="message-time-meta">{formatTime(msg.created_at)}</span>
                                </div>
                                <div className="message-bubble">
                                  <div className="message-text-content">{msg.content}</div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          <form onSubmit={handleSendMessage} className="chat-input-wrapper">
            <input
              type="text"
              placeholder="Describe your issue, suggestion, or question here..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              disabled={sending}
              required
            />
            <button type="submit" disabled={sending || !inputMessage.trim()} className="chat-send-btn">
              {sending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

export default function Help() {
  return (
    <div className="help-page-container">
      <div className="help-header">
        <div className="header-title-block">
          <div className="header-icon-wrapper" style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)' }}>
            <MessageSquare size={24} color="white" />
          </div>
          <div className="header-text-info">
            <h1>Help & Technical Support</h1>
            <p>Report issues, ask technical questions, or leave feedback. Our engineering team will review and reply directly here.</p>
          </div>
        </div>
      </div>
      <HelpChat isWidget={false} />
    </div>
  );
}
