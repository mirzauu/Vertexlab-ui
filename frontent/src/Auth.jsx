import React, { useState } from 'react';
import './Auth.css';
import { api } from './services/api';

export default function Auth({ onLogin }) {
  const [email, setEmail] = useState('user@example.com');
  const [fullName, setFullName] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'error' });
  
  // Organization state
  const [step, setStep] = useState('login'); // 'login', 'login_verify', 'signup', 'signup_verify', 'select_org', 'create_org'
  const [organizations, setOrganizations] = useState([]);
  const [orgName, setOrgName] = useState('');
  const [orgWebsite, setOrgWebsite] = useState('');
  const [orgTimezone, setOrgTimezone] = useState('UTC');

  const showToast = (message, type = 'error') => {
    setToast({ show: true, message, type });
    setTimeout(() => {
      setToast({ show: false, message: '', type: 'error' });
    }, 4500);
  };

  const fetchOrganizations = async () => {
    try {
      setLoading(true);
      const response = await api('/api/v1/organizations/');
      if (!response.ok) throw new Error('Failed to fetch organizations.');
      const orgs = await response.json();
      
      if (orgs.length > 0) {
        setOrganizations(orgs);
        setStep('select_org');
      } else {
        setStep('create_org');
      }
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOrganization = (orgId) => {
    localStorage.setItem('organization_id', orgId);
    onLogin?.();
  };

  const handleCreateOrganization = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api('/api/v1/organizations/', {
        method: 'POST',
        body: JSON.stringify({ name: orgName, website: orgWebsite, timezone: orgTimezone }),
      });

      if (!response.ok) {
        throw new Error('Failed to create organization.');
      }

      const newOrg = await response.json();
      localStorage.setItem('organization_id', newOrg.id);
      showToast('Organization created successfully!', 'success');
      onLogin?.();
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestLoginOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api('/api/v1/auth/login/request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'No account associated with this email address.');
      }

      setOtp('');
      setStep('login_verify');
      showToast('Verification code sent to your email!', 'success');
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyLoginOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api('/api/v1/auth/login/verify', {
        method: 'POST',
        body: JSON.stringify({ email, code: otp }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Verification failed. Please check the code.');
      }

      const data = await response.json();
      if (data.access_token) {
        localStorage.setItem('bearer_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        showToast('Signed in successfully!', 'success');
        await fetchOrganizations();
      }
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestSignupOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const nameParts = fullName.trim().split(/\s+/);
      const first_name = nameParts[0] || 'User';
      const last_name = nameParts.slice(1).join(' ') || ' ';

      const response = await api('/api/v1/auth/signup/request', {
        method: 'POST',
        body: JSON.stringify({ email, first_name, last_name }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to request code. Check email or try again.');
      }

      setOtp('');
      setStep('signup_verify');
      showToast('Verification code sent to your email!', 'success');
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignupOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const nameParts = fullName.trim().split(/\s+/);
      const first_name = nameParts[0] || 'User';
      const last_name = nameParts.slice(1).join(' ') || ' ';

      const response = await api('/api/v1/auth/signup/verify', {
        method: 'POST',
        body: JSON.stringify({ email, code: otp, first_name, last_name }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Verification failed. Please check the code.');
      }

      const data = await response.json();
      if (data.access_token) {
        localStorage.setItem('bearer_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        showToast('Account registered successfully!', 'success');
        await fetchOrganizations();
      }
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      {/* Toast Notification */}
      {toast.show && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          backgroundColor: toast.type === 'error' ? '#FEE2E2' : '#D1FAE5',
          color: toast.type === 'error' ? '#991B1B' : '#065F46',
          border: `1px solid ${toast.type === 'error' ? '#FCA5A5' : '#A7F3D0'}`,
          padding: '16px 20px',
          borderRadius: '12px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          zIndex: 9999,
          fontSize: '0.875rem',
          fontWeight: '550',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}>
          {toast.type === 'error' ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          )}
          {toast.message}
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateY(-20px) scale(0.95);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
      `}</style>

      <div className="auth-container">
        {/* Left Side - Form */}
        <div className="auth-left">
          <div className="auth-header">
            <div className="auth-logo-text">VerbaLex AI</div>
          </div>
          
          <div className="auth-form-container">
            
            {step === 'login' && (
              <>
                <h1 className="auth-title">Get Started</h1>
                <p className="auth-subtitle">Welcome to VerbaLex AI - Let's login to your account</p>
                
                {error && <div className="auth-error" style={{color: 'red', marginBottom: '1rem', fontSize: '0.875rem'}}>{error}</div>}
                
                <form className="auth-form" onSubmit={handleRequestLoginOTP}>
                  <div className="form-group">
                    <label>Email</label>
                    <input 
                      type="email" 
                      placeholder="hi@fillianta.com" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  
                  <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? 'Sending code...' : 'Send Sign In OTP'}
                  </button>
                </form>
                
                <div className="auth-switch">
                  Don't have an account? <span onClick={() => { setError(''); setStep('signup'); }} style={{color: '#111827', fontWeight: 600, cursor: 'pointer'}}>Sign up</span>
                </div>
              </>
            )}

            {step === 'login_verify' && (
              <>
                <h1 className="auth-title">Verify Code</h1>
                <p className="auth-subtitle">We sent a 4-digit code to {email}</p>
                
                {error && <div className="auth-error" style={{color: 'red', marginBottom: '1rem', fontSize: '0.875rem'}}>{error}</div>}
                
                <form className="auth-form" onSubmit={handleVerifyLoginOTP}>
                  <div className="form-group">
                    <label>OTP Code</label>
                    <input 
                      type="text" 
                      placeholder="1234" 
                      maxLength="4"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      required
                    />
                  </div>
                  
                  <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign in'}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => { setError(''); setStep('login'); }} 
                    className="auth-submit" 
                    style={{marginTop: '0.5rem', backgroundColor: 'transparent', color: '#5B44E9', border: '1px solid #5B44E9'}}
                  >
                    Back
                  </button>
                </form>
              </>
            )}

            {step === 'signup' && (
              <>
                <h1 className="auth-title">Create Account</h1>
                <p className="auth-subtitle">Join VerbaLex AI - Create your account</p>
                
                {error && <div className="auth-error" style={{color: 'red', marginBottom: '1rem', fontSize: '0.875rem'}}>{error}</div>}
                
                <form className="auth-form" onSubmit={handleRequestSignupOTP}>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input 
                      type="text" 
                      placeholder="John Doe" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input 
                      type="email" 
                      placeholder="hi@example.com" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required 
                    />
                  </div>
                  <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? 'Sending code...' : 'Send Up OTP'}
                  </button>
                </form>
                
                <div className="auth-switch">
                  Already have an account? <span onClick={() => { setError(''); setStep('login'); }} style={{color: '#111827', fontWeight: 600, cursor: 'pointer'}}>Sign in</span>
                </div>
              </>
            )}

            {step === 'signup_verify' && (
              <>
                <h1 className="auth-title">Verify Code</h1>
                <p className="auth-subtitle">We sent a 4-digit code to {email}</p>
                
                {error && <div className="auth-error" style={{color: 'red', marginBottom: '1rem', fontSize: '0.875rem'}}>{error}</div>}
                
                <form className="auth-form" onSubmit={handleVerifySignupOTP}>
                  <div className="form-group">
                    <label>OTP Code</label>
                    <input 
                      type="text" 
                      placeholder="1234" 
                      maxLength="4"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      required
                    />
                  </div>
                  
                  <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? 'Creating...' : 'Verify & Create Account'}
                  </button>
                  <button 
                    type="button" 
                    onClick={() => { setError(''); setStep('signup'); }} 
                    className="auth-submit" 
                    style={{marginTop: '0.5rem', backgroundColor: 'transparent', color: '#5B44E9', border: '1px solid #5B44E9'}}
                  >
                    Back
                  </button>
                </form>
              </>
            )}

            {step === 'select_org' && (
              <>
                <h1 className="auth-title">Select Organization</h1>
                <p className="auth-subtitle">Choose an organization to continue</p>
                {error && <div className="auth-error" style={{color: 'red', marginBottom: '1rem', fontSize: '0.875rem'}}>{error}</div>}
                
                <div className="org-list" style={{display: 'flex', flexDirection: 'column', gap: '0.5rem'}}>
                  {organizations.map(org => (
                    <div 
                      key={org.id} 
                      className="org-card" 
                      onClick={() => handleSelectOrganization(org.id)} 
                      style={{
                        padding: '1rem', 
                        border: '1px solid #e5e7eb', 
                        borderRadius: '0.5rem', 
                        cursor: 'pointer',
                        backgroundColor: '#F9FAFB',
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.borderColor = '#5B44E9'; e.currentTarget.style.backgroundColor = '#F3F4F6'; }}
                      onMouseOut={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.backgroundColor = '#F9FAFB'; }}
                    >
                      <h3 style={{margin: 0, fontSize: '1rem', color: '#111827'}}>{org.name}</h3>
                      {org.website && <p style={{margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280'}}>{org.website}</p>}
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => { setError(''); setStep('create_org'); }} 
                  className="auth-submit" 
                  style={{marginTop: '1.5rem', backgroundColor: 'transparent', color: '#5B44E9', border: '1px solid #5B44E9'}}
                >
                  Create New Organization
                </button>
              </>
            )}

            {step === 'create_org' && (
              <>
                <h1 className="auth-title">Create Organization</h1>
                <p className="auth-subtitle">Set up your workspace</p>
                {error && <div className="auth-error" style={{color: 'red', marginBottom: '1rem', fontSize: '0.875rem'}}>{error}</div>}
                
                <form className="auth-form" onSubmit={handleCreateOrganization}>
                  <div className="form-group">
                    <label>Organization Name</label>
                    <input type="text" value={orgName} onChange={e => setOrgName(e.target.value)} required placeholder="Acme Corp" />
                  </div>
                  <div className="form-group">
                    <label>Website (Optional)</label>
                    <input type="text" value={orgWebsite} onChange={e => setOrgWebsite(e.target.value)} placeholder="https://example.com" />
                  </div>
                  <div className="form-group">
                    <label>Timezone</label>
                    <input type="text" value={orgTimezone} onChange={e => setOrgTimezone(e.target.value)} required />
                  </div>
                  <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? 'Creating...' : 'Create & Continue'}
                  </button>
                  {organizations.length > 0 && (
                    <button 
                      type="button" 
                      onClick={() => { setError(''); setStep('select_org'); }} 
                      className="auth-submit" 
                      style={{marginTop: '0.75rem', backgroundColor: 'transparent', color: '#6b7280'}}
                    >
                      Back to Selection
                    </button>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
        
        {/* Right Side - Visual */}
        <div className="auth-right">
          <div className="auth-right-bg-effect"></div>
          <div className="auth-right-content">
            <h2 className="auth-right-title">
              <span className="italic-serif">Enter the Future</span><br/>
              <span className="sans-serif">of Legal AI,<br/>today</span>
            </h2>
            
            <div className="auth-card-wrapper">
               {/* Floating toolbar */}
               <div className="auth-floating-toolbar">
                  <div className="toolbar-top">
                    <div className="toolbar-icon active">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                    </div>
                    <div className="toolbar-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
                    </div>
                    <div className="toolbar-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                    </div>
                  </div>
                  
                  <div className="toolbar-bottom-icon">
                    <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect width="48" height="48" rx="12" fill="white" />
                      <path d="M30.5 18C30.5 18 25.5 15 19.5 18C13.5 21 13 28.5 13 28.5C13 28.5 15.5 24.5 19.5 24.5C23.5 24.5 29 27.5 30.5 33.5C30.5 33.5 33.5 28.5 30.5 18Z" fill="#5B44E9" />
                      <path d="M16 32C16 32 21 35 27 32C33 29 33.5 21.5 33.5 21.5C33.5 21.5 31 25.5 27 25.5C23 25.5 17.5 22.5 16 16.5C16 16.5 13 21.5 16 32Z" fill="#5B44E9" />
                    </svg>
                  </div>
               </div>

               {/* Legal Transcription Widget */}
               <div className="auth-credit-card">
                  <div className="card-top-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5B44E9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                    <span style={{ fontSize: '0.85rem', fontWeight: '750', color: '#5B44E9', letterSpacing: '0.5px' }}>AUDIO ENGINE</span>
                  </div>
                  
                  <div className="card-balance-section">
                    <div className="card-balance">99.8%</div>
                    <div className="card-balance-label">STT transcription accuracy</div>
                  </div>
                  
                  <div className="card-primary" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                    <div className="card-primary-info">
                      <div className="card-primary-label">Current Deposition</div>
                      <div className="card-primary-number">Smith_v_Jones_final.mp3</div>
                    </div>
                    <div className="card-primary-amount" style={{ color: '#5B44E9', fontSize: '0.75rem', padding: '4px 8px', backgroundColor: 'rgba(91, 68, 233, 0.1)', borderRadius: '6px', fontWeight: 'bold' }}>Active</div>
                  </div>
                  
                  <div className="card-footer" style={{ marginTop: '12px' }}>
                    <div className="card-brand" style={{ fontSize: '0.8rem', color: '#111827', fontWeight: '700' }}>VerbaLex AI</div>
                    <button className="card-view-all" style={{ backgroundColor: '#5B44E9', color: 'white' }}>View Task</button>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
