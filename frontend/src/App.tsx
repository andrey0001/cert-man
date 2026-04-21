import React, { useState, useEffect } from 'react';

const API_BASE = '/api';

interface CertMetadata {
  serial: string;
  commonName: string;
  type: 'ca' | 'server' | 'client';
  caSerial?: string;
  issuedAt: string;
  expiresAt: string;
  status: 'active' | 'revoked';
  pem?: string;
  issuer?: string;
  sans?: string[];
}

function App() {
  const [certs, setCerts] = useState<CertMetadata[]>([]);
  const [allCAs, setAllCAs] = useState<CertMetadata[]>([]);
  const [totalCerts, setTotalCerts] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [showCAForm, setShowCAForm] = useState(false);
  const [showImportCAForm, setShowImportCAForm] = useState(false);
  const [showCertForm, setShowCertForm] = useState(false);
  const [viewCertData, setViewCertData] = useState<CertMetadata | null>(null);
  
  // P12 Modal State
  const [p12Modal, setP12Modal] = useState<{ open: boolean; serial: string }>({ open: false, serial: '' });
  const [p12Password, setP12Password] = useState('');
  
  // Toast State
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Forms State
  const initialCaForm = { parentCaSerial: '', commonName: '', emailAddress: '', organization: '', organizationalUnit: '', country: '', state: '', locality: '', validityDays: 3650, keySize: 4096 };
  const initialImportForm = { commonName: '', certPem: '', keyPem: '' };
  const initialCertForm = { caSerial: '', commonName: '', emailAddress: '', organization: '', organizationalUnit: '', country: '', state: '', locality: '', validityDays: 365, keySize: 2048, isClient: false, sans: '' };
  
  const [caForm, setCaForm] = useState(initialCaForm);
  const [importForm, setImportForm] = useState(initialImportForm);
  const [certForm, setCertForm] = useState(initialCertForm);

  // Auth State
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loginPassword, setLoginPassword] = useState('');

  const logout = () => {
    setToken(null);
    localStorage.removeItem('token');
  };

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401 && !url.endsWith('/login')) {
      logout();
      throw new Error('Session expired. Please log in again.');
    }
    return res;
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      setToken(data.token);
      localStorage.setItem('token', data.token);
      setLoginPassword('');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const fetchCerts = async () => {
    if (!token) return;
    try {
      const res = await apiFetch(`${API_BASE}/certs?page=${currentPage}&limit=${itemsPerPage}`);
      const { data, total } = await res.json();
      setCerts(data);
      setTotalCerts(total);
    } catch (err) {
      showToast('Failed to connect to backend', 'error');
    }
  };

  const fetchAllCAs = async () => {
    if (!token) return;
    try {
      const res = await apiFetch(`${API_BASE}/certs?type=ca`);
      const { data } = await res.json();
      setAllCAs(data);
    } catch (err) {
      console.error('Failed to fetch CAs', err);
    }
  };

  useEffect(() => {
    fetchCerts();
  }, [currentPage, itemsPerPage, token]);

  useEffect(() => {
    fetchAllCAs();
  }, [token]);

  const viewCert = async (serial: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/certs/${serial}`);
      if (!res.ok) throw new Error('Failed to fetch certificate details');
      const data = await res.json();
      setViewCertData(data);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const deleteCert = async (serial: string) => {
    if (confirm('Are you sure you want to permanently delete this certificate? This cannot be undone.')) {
      try {
        const res = await apiFetch(`${API_BASE}/certs/${serial}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete certificate');
        showToast('Certificate deleted successfully');
        fetchCerts();
        if (viewCertData?.serial === serial) {
          setViewCertData(null);
        }
      } catch (err: any) {
        showToast(err.message, 'error');
      }
    }
  };

  const importCA = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch(`${API_BASE}/ca/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(importForm)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to import CA');
      
      showToast('CA imported successfully!');
      setShowImportCAForm(false);
      setImportForm(initialImportForm);
      fetchCerts();
      fetchAllCAs();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const createCA = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch(`${API_BASE}/ca`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caForm)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create CA');
      
      showToast('CA created successfully!');
      setShowCAForm(false);
      setCaForm(initialCaForm);
      fetchCerts();
      fetchAllCAs();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const createCert = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...certForm, sans: certForm.sans.split(',').map(s => s.trim()).filter(s => s) };
      const res = await apiFetch(`${API_BASE}/certs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create certificate');
      
      showToast('Certificate created successfully!');
      setShowCertForm(false);
      setCertForm(initialCertForm);
      fetchCerts();
      fetchAllCAs();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const revoke = async (serial: string) => {
    if (confirm('Revoke this certificate?')) {
      try {
        const res = await apiFetch(`${API_BASE}/certs/${serial}/revoke`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to revoke');
        showToast('Certificate revoked');
        fetchCerts();
      } catch (err: any) {
        showToast(err.message, 'error');
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  };

  const downloadP12 = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch(`${API_BASE}/download/${p12Modal.serial}/p12`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: p12Password })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to generate P12');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cert = certs.find(c => c.serial === p12Modal.serial);
      a.download = `${(cert?.commonName || 'certificate').replace(/[^a-z0-9]/gi, '_')}.p12`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      setP12Modal({ open: false, serial: '' });
      setP12Password('');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const renderCertTable = (title: string, list: CertMetadata[]) => {
    if (list.length === 0) return null;
    return (
      <div className="card" style={{marginBottom: '2rem'}}>
        <div className="card-header">
          <h2>{title}</h2>
        </div>
        <div style={{overflowX: 'auto'}}>
          <table>
            <thead>
              <tr>
                <th>Common Name</th>
                <th>Serial</th>
                <th>Status</th>
                <th>Expires</th>
                <th style={{textAlign: 'right'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(cert => (
                <tr key={cert.serial}>
                  <td style={{fontWeight: 500}}>{cert.commonName}</td>
                  <td style={{fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b'}}>{cert.serial.substring(0, 12)}...</td>
                  <td><span className={`badge badge-${cert.status}`}>{cert.status}</span></td>
                  <td style={{ color: new Date(cert.expiresAt) < new Date() ? 'var(--danger)' : 'inherit' }}>
                    {new Date(cert.expiresAt).toLocaleDateString()}
                  </td>
                  <td style={{textAlign: 'right'}}>
                    <button className="action-btn view" onClick={() => viewCert(cert.serial)} title="View Details">View</button>
                    <a href={`${API_BASE}/download/${cert.serial}/crt?token=${token}`} className="action-btn download" download title="Download CRT">CRT</a>
                    <a href={`${API_BASE}/download/${cert.serial}/key?token=${token}`} className="action-btn download" download title="Download Key">KEY</a>
                    {cert.type !== 'ca' && <button className="action-btn download" onClick={() => setP12Modal({ open: true, serial: cert.serial })} title="Download P12">P12</button>}
                    
                    {cert.status === 'active' && (
                      <button className="action-btn revoke" onClick={() => revoke(cert.serial)} title="Revoke">Revoke</button>
                    )}
                    <button className="action-btn delete" onClick={() => deleteCert(cert.serial)} title="Delete">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const caCerts = certs.filter(c => c.type === 'ca');
  const serverCerts = certs.filter(c => c.type === 'server');
  const clientCerts = certs.filter(c => c.type === 'client');

  const totalPages = Math.ceil(totalCerts / itemsPerPage);

  if (!token) {
    return (
      <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
        <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '2rem' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>CertManager Login</h2>
          <form onSubmit={login}>
            <div className="form-group full-width">
              <label>Password</label>
              <input 
                type="password" 
                value={loginPassword} 
                onChange={e => setLoginPassword(e.target.value)} 
                required 
                placeholder="Enter admin password" 
                style={{ marginBottom: '1rem' }}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Login</button>
          </form>
        </div>
        {/* Toast Notification Container */}
        {toast && (
          <div className="toast-container">
            <div className={`toast ${toast.type}`}>
              {toast.msg}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container">
      <header className="app-header">
        <h1>CertManager</h1>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => setShowImportCAForm(true)}>Import CA</button>
          <button className="btn btn-secondary" onClick={() => setShowCAForm(true)}>+ New CA</button>
          <button className="btn btn-primary" onClick={() => setShowCertForm(true)}>+ New Certificate</button>
          <button className="btn btn-danger" onClick={logout} style={{ marginLeft: '1rem' }}>Logout</button>
        </div>
      </header>

      {totalCerts === 0 ? (
        <div className="card">
          <div className="empty-state">
            <svg style={{width:'64px', height:'64px', margin:'0 auto 1rem', color:'#cbd5e1'}} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3>No certificates found</h3>
            <p>Get started by creating a new CA.</p>
          </div>
        </div>
      ) : (
        <>
          {renderCertTable('Certificate Authorities (CA)', caCerts)}
          {renderCertTable('Server Certificates', serverCerts)}
          {renderCertTable('Client Certificates', clientCerts)}

          <div className="pagination">
            <div className="pagination-info">
              Showing {Math.min((currentPage - 1) * itemsPerPage + 1, totalCerts)} to {Math.min(currentPage * itemsPerPage, totalCerts)} of {totalCerts} certificates
              <select 
                className="limit-select" 
                value={itemsPerPage} 
                onChange={(e) => {
                  setItemsPerPage(parseInt(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10 per page</option>
                <option value={20}>20 per page</option>
                <option value={50}>50 per page</option>
              </select>
            </div>
            <div className="pagination-controls">
              <button 
                className="pagination-btn" 
                disabled={currentPage === 1} 
                onClick={() => setCurrentPage(prev => prev - 1)}
              >
                Previous
              </button>
              {[...Array(totalPages)].map((_, i) => {
                const pageNum = i + 1;
                if (
                  pageNum === 1 || 
                  pageNum === totalPages || 
                  (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                ) {
                  return (
                    <button 
                      key={pageNum}
                      className={`pagination-btn ${currentPage === pageNum ? 'active' : ''}`}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                } else if (
                  pageNum === currentPage - 2 || 
                  pageNum === currentPage + 2
                ) {
                  return <span key={pageNum}>...</span>;
                }
                return null;
              })}
              <button 
                className="pagination-btn" 
                disabled={currentPage === totalPages || totalPages === 0} 
                onClick={() => setCurrentPage(prev => prev + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Import CA Modal */}
      {showImportCAForm && (
        <div className="modal-overlay" onClick={() => setShowImportCAForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Import External CA</h2>
              <button className="modal-close" onClick={() => setShowImportCAForm(false)}>&times;</button>
            </div>
            <form onSubmit={importCA}>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Display Name (Common Name) *</label>
                  <input value={importForm.commonName} onChange={e => setImportForm({...importForm, commonName: e.target.value})} required placeholder="e.g. Corporate Root CA" />
                </div>
                <div className="form-group full-width">
                  <label>PEM Certificate *</label>
                  <textarea 
                    value={importForm.certPem} 
                    onChange={e => setImportForm({...importForm, certPem: e.target.value})} 
                    required 
                    rows={8} 
                    style={{width:'100%', fontFamily:'monospace', fontSize:'0.8rem', padding:'0.5rem', borderRadius:'4px', border:'1px solid var(--border)'}}
                    placeholder="-----BEGIN CERTIFICATE-----..."
                  />
                </div>
                <div className="form-group full-width">
                  <label>PEM Private Key *</label>
                  <textarea 
                    value={importForm.keyPem} 
                    onChange={e => setImportForm({...importForm, keyPem: e.target.value})} 
                    required 
                    rows={8} 
                    style={{width:'100%', fontFamily:'monospace', fontSize:'0.8rem', padding:'0.5rem', borderRadius:'4px', border:'1px solid var(--border)'}}
                    placeholder="-----BEGIN RSA PRIVATE KEY-----..."
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowImportCAForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Import CA</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Root/Intermediate CA Modal */}
      {showCAForm && (
        <div className="modal-overlay" onClick={() => setShowCAForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Certificate Authority</h2>
              <button className="modal-close" onClick={() => setShowCAForm(false)}>&times;</button>
            </div>
            <form onSubmit={createCA}>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Parent CA (Optional - leave blank for Root CA)</label>
                  <select value={caForm.parentCaSerial} onChange={e => setCaForm({...caForm, parentCaSerial: e.target.value})}>
                    <option value="">None (Self-Signed Root CA)</option>
                    {allCAs.map(c => (
                      <option key={c.serial} value={c.serial}>{c.commonName}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group full-width">
                  <label>Common Name (CN) *</label>
                  <input value={caForm.commonName} onChange={e => setCaForm({...caForm, commonName: e.target.value})} required placeholder="My Root CA" />
                </div>
                <div className="form-group full-width">
                  <label>Email Address (E)</label>
                  <input type="email" value={caForm.emailAddress} onChange={e => setCaForm({...caForm, emailAddress: e.target.value})} placeholder="admin@example.com" />
                </div>
                <div className="form-group">
                  <label>Organization (O)</label>
                  <input value={caForm.organization} onChange={e => setCaForm({...caForm, organization: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Organizational Unit (OU)</label>
                  <input value={caForm.organizationalUnit} onChange={e => setCaForm({...caForm, organizationalUnit: e.target.value})} placeholder="e.g. IT Department" />
                </div>
                <div className="form-group">
                  <label>Country (C)</label>
                  <input value={caForm.country} onChange={e => setCaForm({...caForm, country: e.target.value})} maxLength={2} placeholder="US" />
                </div>
                <div className="form-group">
                  <label>State/Province (ST)</label>
                  <input value={caForm.state} onChange={e => setCaForm({...caForm, state: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Locality/City (L)</label>
                  <input value={caForm.locality} onChange={e => setCaForm({...caForm, locality: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Validity (Days)</label>
                  <input type="number" value={caForm.validityDays} onChange={e => setCaForm({...caForm, validityDays: parseInt(e.target.value)})} />
                </div>
                <div className="form-group full-width">
                  <label>Key Size</label>
                  <select value={caForm.keySize} onChange={e => setCaForm({...caForm, keySize: parseInt(e.target.value) as 2048 | 4096})}>
                    <option value={2048}>2048-bit RSA</option>
                    <option value={4096}>4096-bit RSA</option>
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCAForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Generate CA</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Certificate Modal */}
      {showCertForm && (
        <div className="modal-overlay" onClick={() => setShowCertForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Certificate</h2>
              <button className="modal-close" onClick={() => setShowCertForm(false)}>&times;</button>
            </div>
            <form onSubmit={createCert}>
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Signing CA *</label>
                  <select value={certForm.caSerial} onChange={e => setCertForm({...certForm, caSerial: e.target.value})} required>
                    <option value="">Select a CA...</option>
                    {allCAs.map(c => (
                      <option key={c.serial} value={c.serial}>{c.commonName}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Common Name (CN) *</label>
                  <input value={certForm.commonName} onChange={e => setCertForm({...certForm, commonName: e.target.value})} required placeholder="example.com" />
                </div>
                <div className="form-group">
                  <label>Type</label>
                  <select value={certForm.isClient ? 'client' : 'server'} onChange={e => setCertForm({...certForm, isClient: e.target.value === 'client'})}>
                    <option value="server">Server (TLS/SSL)</option>
                    <option value="client">Client (mTLS)</option>
                  </select>
                </div>
                <div className="form-group full-width">
                  <label>Email Address (E)</label>
                  <input type="email" value={certForm.emailAddress} onChange={e => setCertForm({...certForm, emailAddress: e.target.value})} placeholder="user@example.com" />
                </div>
                <div className="form-group">
                  <label>Organization (O)</label>
                  <input value={certForm.organization} onChange={e => setCertForm({...certForm, organization: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Organizational Unit (OU)</label>
                  <input value={certForm.organizationalUnit} onChange={e => setCertForm({...certForm, organizationalUnit: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Country (C)</label>
                  <input value={certForm.country} onChange={e => setCertForm({...certForm, country: e.target.value})} maxLength={2} />
                </div>
                <div className="form-group">
                  <label>State/Province (ST)</label>
                  <input value={certForm.state} onChange={e => setCertForm({...certForm, state: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Locality/City (L)</label>
                  <input value={certForm.locality} onChange={e => setCertForm({...certForm, locality: e.target.value})} />
                </div>
                <div className="form-group">
                  <label>Validity (Days)</label>
                  <input type="number" value={certForm.validityDays} onChange={e => setCertForm({...certForm, validityDays: parseInt(e.target.value)})} />
                </div>
                <div className="form-group">
                  <label>Key Size</label>
                  <select value={certForm.keySize} onChange={e => setCertForm({...certForm, keySize: parseInt(e.target.value) as 2048 | 4096})}>
                    <option value={2048}>2048-bit RSA</option>
                    <option value={4096}>4096-bit RSA</option>
                  </select>
                </div>
                <div className="form-group full-width">
                  <label>Subject Alternative Names (SANs)</label>
                  <input value={certForm.sans} onChange={e => setCertForm({...certForm, sans: e.target.value})} placeholder="DNS, IP, or Email (comma separated)" />
                  <span style={{fontSize:'0.75rem', color:'var(--text-muted)'}}>Example: test.local, 192.168.1.1, alert@test.local</span>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCertForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Generate Certificate</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Certificate Modal */}
      {viewCertData && (
        <div className="modal-overlay" onClick={() => setViewCertData(null)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Certificate Details</h2>
              <button className="modal-close" onClick={() => setViewCertData(null)}>&times;</button>
            </div>
            <div className="cert-viewer-grid">
              <div className="cert-detail-item">
                <label>Common Name</label>
                <div>{viewCertData.commonName}</div>
              </div>
              <div className="cert-detail-item">
                <label>Type</label>
                <div><span className={`badge badge-${viewCertData.type}`}>{viewCertData.type}</span></div>
              </div>
              <div className="cert-detail-item">
                <label>Issuer</label>
                <div>{viewCertData.issuer || 'Unknown'}</div>
              </div>
              {viewCertData.sans && viewCertData.sans.length > 0 && (
                <div className="cert-detail-item" style={{ gridColumn: '1 / -1' }}>
                  <label>Subject Alternative Names (SANs)</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.25rem' }}>
                    {viewCertData.sans.map((san, idx) => (
                      <span key={idx} className="badge badge-server" style={{ fontSize: '0.7rem' }}>{san}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="cert-detail-item">
                <label>Serial Number</label>
                <div style={{fontFamily: 'monospace'}}>{viewCertData.serial}</div>
              </div>
              <div className="cert-detail-item">
                <label>Status</label>
                <div><span className={`badge badge-${viewCertData.status}`}>{viewCertData.status}</span></div>
              </div>
              <div className="cert-detail-item">
                <label>Issued At</label>
                <div>{new Date(viewCertData.issuedAt).toLocaleString()}</div>
              </div>
              <div className="cert-detail-item">
                <label>Expires At</label>
                <div>{new Date(viewCertData.expiresAt).toLocaleString()}</div>
              </div>
            </div>
            <div className="pem-container">
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem'}}>
                <label style={{fontWeight:600}}>PEM Certificate</label>
                {viewCertData.pem && (
                  <button className="btn btn-secondary" style={{padding:'0.25rem 0.75rem', fontSize:'0.75rem'}} onClick={() => copyToClipboard(viewCertData.pem!)}>
                    Copy to Clipboard
                  </button>
                )}
              </div>
              <pre>{viewCertData.pem}</pre>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setViewCertData(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* P12 Password Modal */}
      {p12Modal.open && (
        <div className="modal-overlay" onClick={() => setP12Modal({ open: false, serial: '' })}>
          <div className="modal-content" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Download P12 Certificate</h2>
              <button className="modal-close" onClick={() => setP12Modal({ open: false, serial: '' })}>&times;</button>
            </div>
            <form onSubmit={downloadP12}>
              <div className="form-grid" style={{ paddingBottom: '0.5rem' }}>
                <div className="form-group full-width">
                  <label>PKCS#12 Export Password *</label>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 0.5rem 0' }}>
                    Enter a password to encrypt your .p12 file. You will need this password when importing the certificate into a browser or OS keychain.
                  </p>
                  <input 
                    type="password" 
                    value={p12Password} 
                    onChange={e => setP12Password(e.target.value)} 
                    required 
                    placeholder="Create a password..." 
                    autoFocus
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setP12Modal({ open: false, serial: '' })}>Cancel</button>
                <button type="submit" className="btn btn-primary">Download</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
