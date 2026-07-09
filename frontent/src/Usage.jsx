import React, { useState, useEffect } from 'react';
import './Usage.css';
import { 
  CreditCard, Calendar, ArrowUpRight, FileText, Tag, 
  HelpCircle, Loader2, TrendingUp, Shield, BarChart3, AlertCircle 
} from 'lucide-react';
import { api } from './services/api';

// Module-level trackers for deduplication across StrictMode double-mounts
const activeBillingSessions = new Map();

const registerBillingSession = (orgId) => {
  let session = activeBillingSessions.get(orgId);
  if (session) {
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
      session.timeoutId = null;
    }
    session.count += 1;
    return session;
  }

  const controller = new AbortController();
  session = {
    controller,
    count: 1,
    overviewPromise: null,
    recordsPromise: null,
    summariesPromise: null,
    timeoutId: null
  };
  activeBillingSessions.set(orgId, session);
  return session;
};

const deregisterBillingSession = (orgId) => {
  const session = activeBillingSessions.get(orgId);
  if (!session) return;

  session.count -= 1;
  if (session.count <= 0) {
    session.timeoutId = setTimeout(() => {
      session.controller.abort();
      activeBillingSessions.delete(orgId);
    }, 100);
  }
};

export default function Usage() {
  const [activeTab, setActiveTab] = useState('records');
  const [overview, setOverview] = useState(null);
  const [records, setRecords] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const orgId = localStorage.getItem('organization_id');
    const token = localStorage.getItem('bearer_token');

    if (!orgId || !token) {
      setError('Missing organization scope or authentication token.');
      setLoading(false);
      return;
    }

    const session = registerBillingSession(orgId);
    const signal = session.controller.signal;

    // Eagerly resolve API calls sharing the same promise across double-mounts
    if (!session.overviewPromise) {
      session.overviewPromise = api(`/api/v1/organizations/${orgId}/billing/overview`, { signal })
        .then(res => {
          if (!res.ok) throw new Error('Failed to load overview');
          return res.json();
        });
    }

    if (!session.recordsPromise) {
      session.recordsPromise = api(`/api/v1/organizations/${orgId}/billing/records`, { signal })
        .then(res => {
          if (!res.ok) throw new Error('Failed to load records');
          return res.json();
        });
    }

    if (!session.summariesPromise) {
      session.summariesPromise = api(`/api/v1/organizations/${orgId}/billing/summaries`, { signal })
        .then(res => {
          if (!res.ok) throw new Error('Failed to load monthly statements');
          return res.json();
        });
    }

    const loadAllBillingData = async () => {
      try {
        const [overviewData, recordsData, summariesData] = await Promise.all([
          session.overviewPromise,
          session.recordsPromise,
          session.summariesPromise
        ]);

        if (!signal.aborted) {
          setOverview(overviewData);
          setRecords(recordsData || []);
          setSummaries(summariesData || []);
        }
      } catch (err) {
        if (!signal.aborted) {
          console.error('[BILLING API ERROR]:', err);
          setError(err.message || 'An unexpected error occurred loading billing records.');
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadAllBillingData();

    return () => {
      deregisterBillingSession(orgId);
    };
  }, []);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(val || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const totalPagesCount = records.reduce((acc, curr) => acc + (curr.pages_processed || 0), 0);

  if (loading) {
    return (
      <div className="usage-page-container skeleton">
        <div className="usage-header">
          <div className="skeleton-title" style={{ height: '36px', width: '280px', marginBottom: '8px' }}></div>
          <div className="skeleton-text" style={{ width: '450px' }}></div>
        </div>

        <div className="overview-cards-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="overview-stat-card skeleton-card">
              <div className="skeleton-icon" style={{ width: '40px', height: '40px', borderRadius: '50%' }}></div>
              <div className="skeleton-text" style={{ width: '80px', height: '14px', marginTop: '16px' }}></div>
              <div className="skeleton-title small" style={{ width: '120px', height: '24px', marginTop: '8px' }}></div>
            </div>
          ))}
        </div>

        <div className="usage-tabs-container">
          <div className="skeleton-bar" style={{ width: '240px', height: '40px', borderRadius: '8px' }}></div>
          <div className="details-card" style={{ marginTop: '24px', height: '300px' }}>
            <div className="skeleton-title small" style={{ width: '180px', marginBottom: '20px' }}></div>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton-bar long" style={{ marginBottom: '16px', height: '20px' }}></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="usage-page-container">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '20px',
          color: '#dc2626',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '16px',
          margin: '2rem 0',
          fontSize: '0.95rem'
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <span>Error loading billing records: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="usage-page-container">
      <div className="usage-header" style={{ justifyContent: 'flex-end', marginBottom: '16px' }}>
        <div className="pricing-tier-badge">
          <Shield size={16} />
          <span>Enterprise Pay-As-You-Go ($0.50/page)</span>
        </div>
      </div>
      
      {/* Beta Free Usage Banner */}
      <div className="beta-banner-container">
        <div className="beta-banner-icon-wrap">
          <AlertCircle size={20} />
        </div>
        <div className="beta-banner-content">
          <h4>Beta Preview Mode — Free of Charge</h4>
          <p>
            VerbaLex AI is currently in active development. During this beta phase, you can process tasks, run speech transcriptions, and utilize all platform features completely free of charge. No actual charges will be processed, and no invoices will be generated.
          </p>
        </div>
      </div>

      {/* Aggregate Overview Metrics Cards */}
      <div className="overview-cards-grid">
        <div className="overview-stat-card indigo-glow">
          <div className="stat-card-header">
            <div className="stat-icon-wrap" style={{ backgroundColor: 'rgba(249, 115, 22, 0.1)', color: '#F97316' }}>
              <BarChart3 size={20} />
            </div>
            <span className="stat-card-label">Active Plan</span>
          </div>
          <div className="stat-card-value" style={{ textTransform: 'capitalize', fontSize: '1.25rem', fontWeight: 700 }}>
            {overview?.active_plan || 'Pay-As-You-Go'}
          </div>
          <p className="stat-card-desc">Charged automatically per task</p>
        </div>

        <div className="overview-stat-card green-glow">
          <div className="stat-card-header">
            <div className="stat-icon-wrap" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
              <TrendingUp size={20} />
            </div>
            <span className="stat-card-label">Total Cumulative Cost</span>
          </div>
          <div className="stat-card-value">
            {formatCurrency(overview?.total_cumulative_usage)}
          </div>
          <p className="stat-card-desc">Overall sales flow billing volume</p>
        </div>

        <div className="overview-stat-card paid-glow">
          <div className="stat-card-header">
            <div className="stat-icon-wrap" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
              <CreditCard size={20} />
            </div>
            <span className="stat-card-label">Total Amount Paid</span>
          </div>
          <div className="stat-card-value">
            {formatCurrency(overview?.total_amount_paid)}
          </div>
          <p className="stat-card-desc">Fully settled billing summaries</p>
        </div>

        <div className="overview-stat-card due-glow">
          <div className="stat-card-header">
            <div className="stat-icon-wrap" style={{ 
              backgroundColor: (overview?.outstanding_due_balance > 0) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(243, 244, 246, 0.1)', 
              color: (overview?.outstanding_due_balance > 0) ? '#ef4444' : '#6b7280' 
            }}>
              <Calendar size={20} />
            </div>
            <span className="stat-card-label">Outstanding Balance</span>
          </div>
          <div className="stat-card-value" style={{ color: (overview?.outstanding_due_balance > 0) ? '#ef4444' : 'inherit' }}>
            {formatCurrency(overview?.outstanding_due_balance)}
          </div>
          <p className="stat-card-desc">Net outstanding due amount</p>
        </div>
      </div>

      {/* Interactive Tabs Menu */}
      <div className="usage-tabs-container">
        <div className="usage-tabs-nav">
          <button 
            className={`usage-tab-btn ${activeTab === 'records' ? 'active' : ''}`}
            onClick={() => setActiveTab('records')}
          >
            <FileText size={16} />
            Task Usage Logs
          </button>
          <button 
            className={`usage-tab-btn ${activeTab === 'summaries' ? 'active' : ''}`}
            onClick={() => setActiveTab('summaries')}
          >
            <Calendar size={16} />
            Monthly Statements
          </button>
        </div>

        <div className="usage-tab-content">
          {/* TAB 1: TASK USAGE RECORDS */}
          {activeTab === 'records' && (
            <div className="details-card table-card">
              <div className="table-header-section">
                <h3>Task-by-Task Page Costs</h3>
                <span className="page-vol-total">{totalPagesCount} Total Pages Processed</span>
              </div>

              <div className="table-wrapper">
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>Task ID</th>
                      <th>Pages Processed</th>
                      <th>Cost per Page</th>
                      <th>Total Cost</th>
                      <th>Recorded Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.id}>
                        <td className="mono-text font-bold">
                          #{record.task_id.substring(0, 8)}...
                        </td>
                        <td>{record.pages_processed} page(s)</td>
                        <td>{formatCurrency(record.cost_per_page)}</td>
                        <td className="total-cost-col font-bold">
                          {formatCurrency(record.total_cost)}
                        </td>
                        <td className="date-col">
                          {formatDate(record.recorded_at)}
                        </td>
                      </tr>
                    ))}
                    {records.length === 0 && (
                      <tr>
                        <td colSpan="5" className="empty-table-col">
                          No page processing usage logs found. Tasks with documents uploaded will record costs here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: MONTHLY SUMMARIES */}
          {activeTab === 'summaries' && (
            <div className="details-card table-card">
              <div className="table-header-section">
                <h3>Monthly Billing History</h3>
                <span className="page-vol-total">{summaries.length} Statement(s)</span>
              </div>

              <div className="table-wrapper">
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>Billing Month</th>
                      <th>Usage Cost</th>
                      <th>Amount Paid</th>
                      <th>Remaining Due</th>
                      <th>Payment Status</th>
                      <th>Settled Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaries.map((summary) => {
                      const latestPayment = summary.payments && summary.payments.length > 0 
                        ? summary.payments[summary.payments.length - 1] 
                        : null;
                      
                      let statusClass = 'unpaid';
                      if (summary.status?.toLowerCase() === 'paid') statusClass = 'paid';
                      if (summary.status?.toLowerCase() === 'partially_paid') statusClass = 'partial';

                      return (
                        <tr key={summary.id}>
                          <td className="font-bold">{summary.billing_month}</td>
                          <td>{formatCurrency(summary.total_usage_cost)}</td>
                          <td>{formatCurrency(summary.amount_paid)}</td>
                          <td className="font-bold" style={{ color: summary.due_balance > 0 ? '#ef4444' : 'inherit' }}>
                            {formatCurrency(summary.due_balance)}
                          </td>
                          <td>
                            <span className={`status-pill billing-status ${statusClass}`}>
                              {summary.status?.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="date-col">
                            {latestPayment ? formatDate(latestPayment.paid_at) : 'No Payments'}
                          </td>
                        </tr>
                      );
                    })}
                    {summaries.length === 0 && (
                      <tr>
                        <td colSpan="6" className="empty-table-col">
                          No monthly statements compiled yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
