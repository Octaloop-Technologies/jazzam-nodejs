// Example Frontend Implementation for Bidirectional Lead Sync

// ============================================
// React Component Example
// ============================================

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const LeadsPage = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [includeCrmLeads, setIncludeCrmLeads] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/v1/lead/all', {
        params: {
          page,
          limit: 20,
          includeCrmLeads,
          sortBy: 'createdAt',
          sortOrder: 'desc'
        },
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      setLeads(response.data.data.leads);
      setTotalPages(response.data.data.totalPages);
    } catch (error) {
      console.error('Error fetching leads:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [page, includeCrmLeads]);

  const renderLeadBadge = (lead) => {
    if (lead.isCrmLead) {
      return (
        <span className="badge badge-info">
          {lead.originCrmProvider || 'CRM'} Lead
        </span>
      );
    }
    if (lead.crmSyncStatus === 'synced') {
      return (
        <span className="badge badge-success">
          Synced to CRM
        </span>
      );
    }
    return (
      <span className="badge badge-secondary">
        Platform Lead
      </span>
    );
  };

  return (
    <div className="leads-container">
      <div className="leads-header">
        <h1>Leads</h1>
        
        {/* Toggle CRM Leads */}
        <div className="toggle-crm">
          <label>
            <input
              type="checkbox"
              checked={includeCrmLeads}
              onChange={(e) => setIncludeCrmLeads(e.target.checked)}
            />
            Include CRM Leads
          </label>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading leads...</div>
      ) : (
        <>
          <div className="leads-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Origin</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead._id} className={lead.isCrmLead ? 'crm-lead' : ''}>
                    <td>{lead.fullName}</td>
                    <td>{lead.email}</td>
                    <td>{lead.company}</td>
                    <td>
                      <span className={`status-badge status-${lead.status}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td>{lead.source || 'N/A'}</td>
                    <td>{renderLeadBadge(lead)}</td>
                    <td>{new Date(lead.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pagination">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default LeadsPage;

// ============================================
// CSS Styles Example
// ============================================

/*
.leads-container {
  padding: 20px;
}

.leads-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.toggle-crm {
  display: flex;
  align-items: center;
  gap: 10px;
}

.leads-table {
  overflow-x: auto;
}

.leads-table table {
  width: 100%;
  border-collapse: collapse;
}

.leads-table th,
.leads-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.leads-table th {
  background-color: #f5f5f5;
  font-weight: 600;
}

.crm-lead {
  background-color: #f0f8ff;
}

.badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.badge-info {
  background-color: #17a2b8;
  color: white;
}

.badge-success {
  background-color: #28a745;
  color: white;
}

.badge-secondary {
  background-color: #6c757d;
  color: white;
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.status-hot {
  background-color: #dc3545;
  color: white;
}

.status-warm {
  background-color: #ffc107;
  color: black;
}

.status-cold {
  background-color: #17a2b8;
  color: white;
}

.status-new {
  background-color: #6c757d;
  color: white;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 20px;
  margin-top: 20px;
}

.pagination button {
  padding: 8px 16px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
  border-radius: 4px;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading {
  text-align: center;
  padding: 40px;
  font-size: 18px;
  color: #666;
}
*/

// ============================================
// Advanced Example: Separate Loading
// ============================================

const LeadsPageAdvanced = () => {
  const [platformLeads, setPlatformLeads] = useState([]);
  const [crmLeads, setCrmLeads] = useState([]);
  const [loadingPlatform, setLoadingPlatform] = useState(false);
  const [loadingCrm, setLoadingCrm] = useState(false);

  // Fetch platform leads first for instant display
  const fetchPlatformLeads = async () => {
    setLoadingPlatform(true);
    try {
      const response = await axios.get('/api/v1/lead/all', {
        params: {
          includeCrmLeads: false, // Only platform leads
          page: 1,
          limit: 20
        }
      });
      setPlatformLeads(response.data.data.leads);
    } catch (error) {
      console.error('Error fetching platform leads:', error);
    } finally {
      setLoadingPlatform(false);
    }
  };

  // Fetch CRM leads separately
  const fetchCrmLeads = async () => {
    setLoadingCrm(true);
    try {
      const response = await axios.get('/api/v1/lead/all', {
        params: {
          includeCrmLeads: true,
          page: 1,
          limit: 20
        }
      });
      // Filter to get only CRM leads
      const onlyCrmLeads = response.data.data.leads.filter(
        lead => lead.isCrmLead
      );
      setCrmLeads(onlyCrmLeads);
    } catch (error) {
      console.error('Error fetching CRM leads:', error);
    } finally {
      setLoadingCrm(false);
    }
  };

  useEffect(() => {
    fetchPlatformLeads();
    fetchCrmLeads(); // Load in parallel
  }, []);

  const allLeads = [...platformLeads, ...crmLeads].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  return (
    <div className="leads-container">
      <div className="leads-stats">
        <div className="stat-card">
          <h3>Platform Leads</h3>
          <p className="stat-number">{platformLeads.length}</p>
          {loadingPlatform && <span className="loading-indicator">Loading...</span>}
        </div>
        <div className="stat-card">
          <h3>CRM Leads</h3>
          <p className="stat-number">{crmLeads.length}</p>
          {loadingCrm && <span className="loading-indicator">Loading...</span>}
        </div>
        <div className="stat-card">
          <h3>Total Leads</h3>
          <p className="stat-number">{allLeads.length}</p>
        </div>
      </div>

      <div className="leads-list">
        {allLeads.map((lead) => (
          <div key={lead._id} className="lead-card">
            <div className="lead-info">
              <h3>{lead.fullName}</h3>
              <p>{lead.email}</p>
              <p>{lead.company}</p>
            </div>
            <div className="lead-meta">
              {lead.isCrmLead ? (
                <span className="badge badge-info">
                  {lead.source}
                </span>
              ) : (
                <span className="badge badge-success">
                  Platform Lead
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================
// API Service Helper
// ============================================

export const leadsService = {
  // Fetch all leads (platform + CRM)
  getAllLeads: async (params = {}) => {
    const response = await axios.get('/api/v1/lead/all', { params });
    return response.data.data;
  },

  // Fetch only platform leads
  getPlatformLeads: async (params = {}) => {
    const response = await axios.get('/api/v1/lead/all', {
      params: { ...params, includeCrmLeads: false }
    });
    return response.data.data;
  },

  // Fetch only CRM leads
  getCrmLeads: async (params = {}) => {
    const response = await axios.get('/api/v1/lead/all', {
      params: { ...params, includeCrmLeads: true }
    });
    const allLeads = response.data.data.leads;
    return {
      ...response.data.data,
      leads: allLeads.filter(lead => lead.isCrmLead)
    };
  },

  // Sync specific leads to CRM
  syncLeadsToCrm: async (leadIds) => {
    const response = await axios.post('/api/v1/crm-integration/sync', {
      leadIds
    });
    return response.data;
  },

  // Import leads from CRM to platform
  importFromCrm: async () => {
    const response = await axios.get('/api/v1/crm-integration/import');
    return response.data;
  }
};

// ============================================
// Usage Examples
// ============================================

// Example 1: Simple fetch all leads
const fetchAllLeads = async () => {
  const data = await leadsService.getAllLeads({
    page: 1,
    limit: 20,
    status: 'hot'
  });
  console.log('All leads:', data.leads);
};

// Example 2: Fetch platform leads only
const fetchPlatformOnly = async () => {
  const data = await leadsService.getPlatformLeads({
    page: 1,
    limit: 20
  });
  console.log('Platform leads:', data.leads);
};

// Example 3: Sync a lead to CRM
const syncLead = async (leadId) => {
  const result = await leadsService.syncLeadsToCrm([leadId]);
  if (result.data.successful.length > 0) {
    console.log('Lead synced successfully!');
    // Refresh leads list
    fetchAllLeads();
  }
};

// Example 4: Import CRM leads to database
const importLeads = async () => {
  const result = await leadsService.importFromCrm();
  console.log(`Imported ${result.data.imported} leads`);
};
