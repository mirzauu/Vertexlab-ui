import React, { useState } from 'react';
import './Auth.css';

export default function Auth({ onLogin }) {
  const [email, setEmail] = useState('user@example.com');
  const [password, setPassword] = useState('my111122');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Organization state
  const [step, setStep] = useState('login'); // 'login', 'select_org', 'create_org'
  const [organizations, setOrganizations] = useState([]);
  const [orgName, setOrgName] = useState('');
  const [orgWebsite, setOrgWebsite] = useState('');
  const [orgTimezone, setOrgTimezone] = useState('UTC');

  const fetchOrganizations = async (token) => {
    try {
      setLoading(true);
      const response = await fetch('http://127.0.0.1:8000/api/v1/organizations/', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
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
    const token = localStorage.getItem('bearer_token');

    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/organizations/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: orgName, website: orgWebsite, timezone: orgTimezone }),
      });

      if (!response.ok) {
        throw new Error('Failed to create organization.');
      }

      const newOrg = await response.json();
      localStorage.setItem('organization_id', newOrg.id);
      onLogin?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error('Login failed. Please check your credentials.');
      }

      const data = await response.json();
      if (data.access_token) {
        localStorage.setItem('bearer_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
        await fetchOrganizations(data.access_token);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        {/* Left Side - Form */}
        <div className="auth-left">
          <div className="auth-header">
            <div className="auth-logo-text">Fillianta</div>
          </div>
          
          <div className="auth-form-container">
            <div className="auth-form-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="48" height="48" rx="12" fill="#1A4D39" />
                <path d="M30.5 18C30.5 18 25.5 15 19.5 18C13.5 21 13 28.5 13 28.5C13 28.5 15.5 24.5 19.5 24.5C23.5 24.5 29 27.5 30.5 33.5C30.5 33.5 33.5 28.5 30.5 18Z" fill="white" />
                <path d="M16 32C16 32 21 35 27 32C33 29 33.5 21.5 33.5 21.5C33.5 21.5 31 25.5 27 25.5C23 25.5 17.5 22.5 16 16.5C16 16.5 13 21.5 16 32Z" fill="white" />
              </svg>
            </div>
            
            {step === 'login' && (
              <>
                <h1 className="auth-title">Get Started</h1>
                <p className="auth-subtitle">Welcome to Fillianta - Let's login to your account</p>
                
                {error && <div className="auth-error" style={{color: 'red', marginBottom: '1rem', fontSize: '0.875rem'}}>{error}</div>}
                
                <form className="auth-form" onSubmit={handleLogin}>
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
                  
                  <div className="form-group">
                    <div className="label-row">
                      <label>Password</label>
                      <a href="#" className="forgot-link">Forgot?</a>
                    </div>
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  
                  <button type="submit" className="auth-submit" disabled={loading}>
                    {loading ? 'Signing in...' : 'Sign in'}
                  </button>
                </form>
                
                <div className="auth-switch">
                  Don't have an account? <span style={{color: '#111827', fontWeight: 600, cursor: 'pointer'}}>Sign up</span>
                </div>
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
                        transition: 'all 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.borderColor = '#1A4D39'}
                      onMouseOut={(e) => e.currentTarget.style.borderColor = '#e5e7eb'}
                    >
                      <h3 style={{margin: 0, fontSize: '1rem', color: '#111827'}}>{org.name}</h3>
                      {org.website && <p style={{margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280'}}>{org.website}</p>}
                    </div>
                  ))}
                </div>
                <button 
                  onClick={() => { setError(''); setStep('create_org'); }} 
                  className="auth-submit" 
                  style={{marginTop: '1.5rem', backgroundColor: 'transparent', color: '#1A4D39', border: '1px solid #1A4D39'}}
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
              <span className="sans-serif">of Payments,<br/>today</span>
            </h2>
            
            <div className="auth-card-wrapper">
               {/* Floating toolbar */}
               <div className="auth-floating-toolbar">
                  <div className="toolbar-top">
                    <div className="toolbar-icon active">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    </div>
                    <div className="toolbar-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                    </div>
                    <div className="toolbar-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    </div>
                  </div>
                  
                  <div className="toolbar-bottom-icon">
                    <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect width="48" height="48" rx="12" fill="white" />
                      <path d="M30.5 18C30.5 18 25.5 15 19.5 18C13.5 21 13 28.5 13 28.5C13 28.5 15.5 24.5 19.5 24.5C23.5 24.5 29 27.5 30.5 33.5C30.5 33.5 33.5 28.5 30.5 18Z" fill="#1A4D39" />
                      <path d="M16 32C16 32 21 35 27 32C33 29 33.5 21.5 33.5 21.5C33.5 21.5 31 25.5 27 25.5C23 25.5 17.5 22.5 16 16.5C16 16.5 13 21.5 16 32Z" fill="#1A4D39" />
                    </svg>
                  </div>
               </div>

               {/* Credit Card Dashboard */}
               <div className="auth-credit-card">
                 <div className="card-top-logo">
                    <svg width="28" height="28" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M30.5 18C30.5 18 25.5 15 19.5 18C13.5 21 13 28.5 13 28.5C13 28.5 15.5 24.5 19.5 24.5C23.5 24.5 29 27.5 30.5 33.5C30.5 33.5 33.5 28.5 30.5 18Z" fill="#B0B5B3" />
                      <path d="M16 32C16 32 21 35 27 32C33 29 33.5 21.5 33.5 21.5C33.5 21.5 31 25.5 27 25.5C23 25.5 17.5 22.5 16 16.5C16 16.5 13 21.5 16 32Z" fill="#B0B5B3" />
                    </svg>
                 </div>
                 
                 <div className="card-balance-section">
                   <div className="card-balance">12,347.23 $</div>
                   <div className="card-balance-label">Combined balance</div>
                 </div>
                 
                 <div className="card-primary">
                   <div className="card-primary-info">
                     <div className="card-primary-label">Primary Card</div>
                     <div className="card-primary-number">3495 **** **** 6917</div>
                   </div>
                   <div className="card-primary-amount">2,546.64$</div>
                 </div>
                 
                 <div className="card-footer">
                   <div className="card-brand">VISA</div>
                   <button className="card-view-all">View All</button>
                 </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
