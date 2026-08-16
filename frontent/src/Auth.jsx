import React, { useState } from 'react';
import './Auth.css';
import { api } from './services/api';
import loginImage from './assets/login-image.jpg';

export default function Auth({ onLogin }) {
  const [email, setEmail] = useState('');
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
          padding: '14px 20px',
          borderRadius: '12px',
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
          fontSize: '0.875rem',
          fontWeight: '500',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}>
          {toast.type === 'error' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          )}
          {toast.message}
        </div>
      )}

      {/* Top Left Navigation Logo */}
      <header className="auth-top-nav">
        <div className="auth-brand-logo">
          <span className="auth-brand-name">VerbaLex AI</span>
        </div>
      </header>

      {/* Main Two-Column View */}
      <div className="auth-container">
        
        {/* Left Side - Login Box */}
        <div className="auth-left">
          <div className="auth-left-content">
            
            {step === 'login' && (
              <>
                <h1 className="auth-heading">Welcome to VerbaLex AI</h1>
                <p className="auth-subheading">Your thinking partner for legal AI</p>
                
                <div className="auth-card-box">


                  {error && <div style={{ color: '#F87171', fontSize: '0.82rem', textAlign: 'left' }}>{error}</div>}

                  <form className="auth-form" onSubmit={handleRequestLoginOTP}>
                    <input 
                      type="email" 
                      className="auth-input-field"
                      placeholder="Enter your email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    <button type="submit" className="auth-submit-btn" disabled={loading}>
                      {loading ? 'Sending code...' : 'Send Sign In OTP'}
                    </button>
                  </form>

                  <div className="auth-switch-text">
                    Don't have an account? 
                    <span className="auth-switch-action" onClick={() => { setError(''); setStep('signup'); }}>
                      Sign up
                    </span>
                  </div>
                </div>
              </>
            )}

            {step === 'login_verify' && (
              <>
                <h1 className="auth-heading">Verify Code</h1>
                <p className="auth-subheading">We sent a 4-digit code to {email}</p>

                <div className="auth-card-box">
                  {error && <div style={{ color: '#F87171', fontSize: '0.82rem', textAlign: 'left' }}>{error}</div>}

                  <form className="auth-form" onSubmit={handleVerifyLoginOTP}>
                    <input 
                      type="text" 
                      className="auth-input-field"
                      maxLength="4"
                      placeholder="Enter 4-digit OTP"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      required
                      autoFocus
                    />
                    <button type="submit" className="auth-submit-btn" disabled={loading}>
                      {loading ? 'Signing in...' : 'Sign in'}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setError(''); setStep('login'); }} 
                      className="auth-secondary-btn"
                    >
                      Back
                    </button>
                  </form>
                </div>
              </>
            )}

            {step === 'signup' && (
              <>
                <h1 className="auth-heading">Create Account</h1>
                <p className="auth-subheading">Join VerbaLex AI - Create your account</p>

                <div className="auth-card-box">
                  {error && <div style={{ color: '#F87171', fontSize: '0.82rem', textAlign: 'left' }}>{error}</div>}

                  <form className="auth-form" onSubmit={handleRequestSignupOTP}>
                    <input 
                      type="text" 
                      className="auth-input-field"
                      placeholder="Full Name" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required 
                    />
                    <input 
                      type="email" 
                      className="auth-input-field"
                      placeholder="Enter your email" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required 
                    />
                    <button type="submit" className="auth-submit-btn" disabled={loading}>
                      {loading ? 'Sending code...' : 'Send Up OTP'}
                    </button>
                  </form>

                  <div className="auth-switch-text">
                    Already have an account? 
                    <span className="auth-switch-action" onClick={() => { setError(''); setStep('login'); }}>
                      Sign in
                    </span>
                  </div>
                </div>
              </>
            )}

            {step === 'signup_verify' && (
              <>
                <h1 className="auth-heading">Verify Code</h1>
                <p className="auth-subheading">We sent a 4-digit code to {email}</p>

                <div className="auth-card-box">
                  {error && <div style={{ color: '#F87171', fontSize: '0.82rem', textAlign: 'left' }}>{error}</div>}

                  <form className="auth-form" onSubmit={handleVerifySignupOTP}>
                    <input 
                      type="text" 
                      className="auth-input-field"
                      maxLength="4"
                      placeholder="Enter 4-digit OTP"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      required
                      autoFocus
                    />
                    <button type="submit" className="auth-submit-btn" disabled={loading}>
                      {loading ? 'Creating...' : 'Verify & Create Account'}
                    </button>
                    <button 
                      type="button" 
                      onClick={() => { setError(''); setStep('signup'); }} 
                      className="auth-secondary-btn"
                    >
                      Back
                    </button>
                  </form>
                </div>
              </>
            )}

            {step === 'select_org' && (
              <>
                <h1 className="auth-heading">Select Organization</h1>
                <p className="auth-subheading">Choose an organization to continue</p>

                <div className="auth-card-box">
                  {error && <div style={{ color: '#F87171', fontSize: '0.82rem', textAlign: 'left' }}>{error}</div>}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                    {organizations.map(org => (
                      <div 
                        key={org.id} 
                        className="org-card-item"
                        onClick={() => handleSelectOrganization(org.id)}
                      >
                        <div style={{ fontSize: '0.92rem', fontWeight: '600', color: '#FAF8F5' }}>{org.name}</div>
                        {org.website && <div style={{ fontSize: '0.78rem', color: '#9E9A91', marginTop: '2px' }}>{org.website}</div>}
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={() => { setError(''); setStep('create_org'); }} 
                    className="auth-secondary-btn"
                    style={{ marginTop: '6px' }}
                  >
                    + Create New Organization
                  </button>
                </div>
              </>
            )}

            {step === 'create_org' && (
              <>
                <h1 className="auth-heading">Create Organization</h1>
                <p className="auth-subheading">Set up your workspace</p>

                <div className="auth-card-box">
                  {error && <div style={{ color: '#F87171', fontSize: '0.82rem', textAlign: 'left' }}>{error}</div>}

                  <form className="auth-form" onSubmit={handleCreateOrganization}>
                    <input 
                      type="text" 
                      className="auth-input-field"
                      placeholder="Organization Name"
                      value={orgName} 
                      onChange={e => setOrgName(e.target.value)} 
                      required 
                    />
                    <input 
                      type="text" 
                      className="auth-input-field"
                      placeholder="Website (Optional)"
                      value={orgWebsite} 
                      onChange={e => setOrgWebsite(e.target.value)} 
                    />
                    <input 
                      type="text" 
                      className="auth-input-field"
                      placeholder="Timezone"
                      value={orgTimezone} 
                      onChange={e => setOrgTimezone(e.target.value)} 
                      required 
                    />
                    <button type="submit" className="auth-submit-btn" disabled={loading}>
                      {loading ? 'Creating...' : 'Create & Continue'}
                    </button>
                    {organizations.length > 0 && (
                      <button 
                        type="button" 
                        onClick={() => { setError(''); setStep('select_org'); }} 
                        className="auth-secondary-btn"
                      >
                        Back to Selection
                      </button>
                    )}
                  </form>
                </div>
              </>
            )}

          </div>
        </div>

        {/* Right Side - Animated Scrolling Text */}
        <div className="auth-right">
          <div className="auth-image-card black-bg">
            <div className="scrolling-text-container">
              <div className="scrolling-row">
                <div className="scrolling-text">VERBALEX AI • LEGAL INTELLIGENCE • SMART CONTRACTS • VERBALEX AI • LEGAL INTELLIGENCE • SMART CONTRACTS •</div>
                <div className="scrolling-text">VERBALEX AI • LEGAL INTELLIGENCE • SMART CONTRACTS • VERBALEX AI • LEGAL INTELLIGENCE • SMART CONTRACTS •</div>
              </div>
              <div className="scrolling-row">
                <div className="scrolling-text reverse">AUTOMATED RESEARCH • PREDICTIVE OUTCOMES • AUTOMATED RESEARCH • PREDICTIVE OUTCOMES •</div>
                <div className="scrolling-text reverse">AUTOMATED RESEARCH • PREDICTIVE OUTCOMES • AUTOMATED RESEARCH • PREDICTIVE OUTCOMES •</div>
              </div>
              <div className="scrolling-row">
                <div className="scrolling-text">PRECISION • COMPLIANCE • DOCUMENT ANALYSIS • PRECISION • COMPLIANCE • DOCUMENT ANALYSIS •</div>
                <div className="scrolling-text">PRECISION • COMPLIANCE • DOCUMENT ANALYSIS • PRECISION • COMPLIANCE • DOCUMENT ANALYSIS •</div>
              </div>
            </div>
            <div className="auth-right-content">
              <h2>The Future of Legal Work</h2>
              <p>Experience the most advanced AI tailored specifically for legal professionals.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
