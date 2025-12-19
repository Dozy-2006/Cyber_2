import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AdminPanel() {
  const [currentView, setCurrentView] = useState('dashboard');

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {currentView === 'dashboard' && <DashboardView onNavigate={setCurrentView} />}
      {currentView === 'users' && <ManageUsersPage onBack={() => setCurrentView('dashboard')} />}
      {currentView === 'divisions' && <ManageDivisionsPage onBack={() => setCurrentView('dashboard')} />}
    </div>
  );
}

// ==========================================
// 1. DASHBOARD VIEW
// ==========================================
function DashboardView({ onNavigate }) {
  const [formData, setFormData] = useState({ name: '', role: 'User', subdivision: '', station: '', email: '' });
  const [qrCode, setQrCode] = useState(null);
  const [manualKey, setManualKey] = useState(null); 
  const [structure, setStructure] = useState({});
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  // Fetch structure on mount and poll every 5 seconds
  useEffect(() => {
    fetchStructure();
    const interval = setInterval(fetchStructure, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStructure = async () => {
    try {
      const res = await axios.get('http://localhost:5000/api/admin/structure');
      setStructure(res.data || {});
    } catch (err) { console.error(err); }
  };

  const createUser = async () => {
    if (!formData.name || !formData.email) return alert("Please fill Name and Email");

    if (formData.role === 'Manager') {
        if (!formData.subdivision) return alert("Subdivision is required for Manager");
    } else if (formData.role === 'User') {
        if (!formData.subdivision || !formData.station) return alert("Subdivision and Station required for User");
    }

    setLoading(true);
    setQrCode(null);
    setManualKey(null);

    try {
      const res = await axios.post('http://localhost:5000/api/admin/create-user', formData);
      setQrCode(res.data.qrCode);
      setManualKey(res.data.secret);
      setResetEmail(formData.email);
      alert('User Created Successfully! Please scan the QR code.');
      setFormData({ name: '', role: 'User', subdivision: '', station: '', email: '' }); 
    } catch (err) { 
        alert(err.response?.data?.message || 'Error creating user'); 
    } finally { 
        setLoading(false); 
    }
  };

  const handleReset = async () => {
    if(!resetEmail) return alert("Enter email");
    try {
        const res = await axios.post('http://localhost:5000/api/admin/reset-key', { email: resetEmail });
        setQrCode(res.data.qrCode);
        setManualKey(res.data.secret);
        alert('Key Reset! Scan the new QR Code.');
    } catch(err) { alert('Error resetting key. Ensure user exists.'); }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 tracking-tight">Admin Dashboard</h1>
          <p className="text-gray-500 mt-1">System Overview & Registration</p>
        </div>
        <div className="flex gap-4 mt-4 md:mt-0">
          <button onClick={() => onNavigate('divisions')} className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg shadow font-bold hover:bg-indigo-700 transition-all hover:-translate-y-0.5">
            🏢 Manage Stations
          </button>
          <button onClick={() => onNavigate('users')} className="bg-gray-800 text-white px-6 py-2.5 rounded-lg shadow font-bold hover:bg-gray-900 transition-all hover:-translate-y-0.5">
            👥 Manage Users
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Create User Form */}
        <div className="w-full lg:w-1/2 space-y-6">
          <div className="bg-white p-8 rounded-xl shadow-md border-t-4 border-green-500">
            <h2 className="text-xl font-bold mb-6 text-gray-800 flex items-center gap-2">
              <span className="bg-green-100 text-green-600 p-1 rounded">👤</span> Register New Personnel
            </h2>
            <div className="space-y-4">
              <input placeholder="Full Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50 focus:ring-2 focus:ring-green-500 outline-none transition-all" />
              <input placeholder="Email (Google ID)" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full border p-3 rounded-lg bg-gray-50 focus:ring-2 focus:ring-green-500 outline-none transition-all" />
              
              <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value, subdivision: '', station: ''})} className="w-full border p-3 rounded-lg bg-white font-bold text-gray-700 focus:ring-2 focus:ring-green-500">
                <option value="User">User (Constable)</option>
                <option value="Manager">Manager (Officer)</option>
                <option value="Admin">Admin (HQ)</option>
              </select>
              
              {formData.role !== 'Admin' && (
                <div className="grid grid-cols-1 gap-4 animate-fade-in">
                  <select className="border p-3 rounded-lg bg-white focus:ring-2 focus:ring-green-500" value={formData.subdivision} onChange={e => setFormData({...formData, subdivision: e.target.value, station: ''})}>
                    <option value="">Select Subdivision</option>
                    {Object.keys(structure).map(sub => <option key={sub} value={sub}>{sub}</option>)}
                  </select>
                  
                  {formData.role !== 'Manager' && (
                      <select className="border p-3 rounded-lg bg-white focus:ring-2 focus:ring-green-500" value={formData.station} onChange={e => setFormData({...formData, station: e.target.value})} disabled={!formData.subdivision}>
                        <option value="">Select Station</option>
                        {formData.subdivision && structure[formData.subdivision]?.map(stn => <option key={stn} value={stn}>{stn}</option>)}
                      </select>
                  )}
                </div>
              )}

              <button onClick={createUser} disabled={loading} className={`w-full text-white font-bold py-3.5 rounded-lg transition-all shadow-md ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 hover:shadow-lg'}`}>
                {loading ? 'Processing...' : 'Create User & Generate 2FA'}
              </button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h3 className="font-bold text-red-600 mb-2 flex items-center gap-2">🔑 Reset Lost Key</h3>
            <div className="flex gap-2">
              <input placeholder="Enter User Email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} className="flex-1 border p-2 rounded-lg" />
              <button onClick={handleReset} className="bg-red-50 text-red-600 border border-red-100 px-4 rounded-lg font-bold hover:bg-red-100 transition-colors">Reset</button>
            </div>
          </div>

          {qrCode && (
            <div className="bg-blue-50 border-blue-200 border rounded-xl p-6 text-center animate-fade-in-up">
              <p className="font-bold text-lg text-blue-900 mb-1">Scan with Authenticator App</p>
              <div className="bg-white p-2 inline-block rounded-lg shadow-sm mb-4"><img src={qrCode} alt="QR" className="w-40 h-40 mix-blend-multiply" /></div>
              <div className="text-left bg-white p-4 rounded-lg border border-blue-100 shadow-sm">
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Manual Entry Key:</p>
                <p className="font-mono text-lg tracking-widest text-gray-800 break-all select-all font-bold">{manualKey}</p>
              </div>
            </div>
          )}
        </div>

        {/* Live Structure View */}
        <div className="w-full lg:w-1/2">
            <div className="bg-white p-6 rounded-xl shadow-sm h-full overflow-y-auto max-h-[800px] border border-gray-200">
                <h3 className="font-bold text-gray-500 uppercase text-xs tracking-wider mb-4 border-b pb-2">Organization Tree (Live)</h3>
                <div className="space-y-4">
                    {Object.keys(structure).length === 0 && <p className="text-gray-400 text-center py-10">Loading structure...</p>}
                    {Object.keys(structure).map(sub => (
                        <div key={sub} className="border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition-colors hover:shadow-sm">
                            <h4 className="font-bold text-lg text-indigo-900 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>{sub}
                            </h4>
                            <div className="flex flex-wrap gap-2 mt-3 ml-4">
                                {(structure[sub] || []).map((stn, i) => (
                                    <span key={i} className="bg-white text-gray-700 px-3 py-1 rounded-full text-sm border border-gray-200 font-medium shadow-sm">{stn}</span>
                                ))}
                                {(!structure[sub] || structure[sub].length === 0) && <span className="text-xs text-gray-400 italic">No stations assigned</span>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. MANAGE DIVISIONS PAGE (Update this function)
// ==========================================
function ManageDivisionsPage({ onBack }) {
  const [newSub, setNewSub] = useState('');
  const [newStations, setNewStations] = useState('');
  
  const [editSub, setEditSub] = useState('');
  const [editStations, setEditStations] = useState('');
  
  const [structure, setStructure] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchStructure();
    const interval = setInterval(fetchStructure, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchStructure = async () => {
    try { 
        const res = await axios.get('http://localhost:5000/api/admin/structure'); 
        setStructure(res.data || {}); 
        
        // AUTO-UPDATE EDIT FIELD: 
        // If we are currently editing a subdivision, update the text box live 
        // so it reflects changes made by the delete buttons below.
        if (editSub && res.data[editSub]) {
            // Only update if the user isn't actively typing (simple check to avoid overwrite)
            // Ideally, we just sync on delete, but this keeps it consistent.
             setEditStations(prev => {
                const dbValue = res.data[editSub].join(', ');
                return prev === dbValue ? prev : dbValue;
             });
        }
    } catch (err) { console.error(err); }
  };

  const handleAdd = async () => {
    if (!newSub) return alert("Subdivision Name is required");
    setSaving(true);
    try {
      await axios.post('http://localhost:5000/api/admin/create-subdivision', { subdivision: newSub, stations: newStations });
      alert("Created Successfully!"); 
      setNewSub(''); 
      setNewStations(''); 
      fetchStructure(); 
    } catch (err) { 
        // Show specific error from backend
        alert(err.response?.data?.message || "Error creating."); 
    } 
    finally { setSaving(false); }
  };

  const handleEditSave = async () => {
    if (!editSub) return alert("Select a subdivision first");
    setSaving(true);
    try {
        await axios.post('http://localhost:5000/api/admin/update-stations-list', { subdivision: editSub, stations: editStations });
        alert("Updated Successfully!"); 
        setEditSub(''); 
        setEditStations(''); 
        fetchStructure();
    } catch(err) { alert("Error updating."); }
    finally { setSaving(false); }
  };

  const onSelectEditSub = (subName) => {
      setEditSub(subName);
      if(subName && structure[subName]) { 
          setEditStations(structure[subName].join(', ')); 
      } else { 
          setEditStations(''); 
      }
  };

  const handleRemoveSubdivision = async (subdivision) => {
    if (!window.confirm(`⚠️ WARNING: Deleting ${subdivision} will also delete ALL USERS and MANAGERS in it. Continue?`)) return;
    try {
        await axios.post('http://localhost:5000/api/admin/delete-subdivision', { subdivision });
        if(editSub === subdivision) { setEditSub(''); setEditStations(''); }
        fetchStructure();
    } catch(err) { alert("Error deleting."); }
  };

  const handleRemoveStation = async (subdivision, stationToRemove) => {
    if (!window.confirm(`⚠️ Remove station '${stationToRemove}'? Users assigned to this station will be deleted.`)) return;
    
    // Calculate new list immediately for UI responsiveness
    const currentStations = structure[subdivision] || [];
    const newStationsList = currentStations.filter(s => s !== stationToRemove).join(', ');
    
    try {
        await axios.post('http://localhost:5000/api/admin/update-stations-list', { subdivision, stations: newStationsList });
        
        // Force update the Edit box immediately if selected
        if (editSub === subdivision) {
            setEditStations(newStationsList);
        }
        fetchStructure();
    } catch(err) { alert("Error removing station"); }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <button onClick={onBack} className="mb-6 font-bold flex items-center gap-2 text-gray-600 hover:text-black transition-colors">
        <span className="text-xl">←</span> Back to Dashboard
      </button>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          
          {/* CREATE CARD */}
          <div className="bg-white p-6 rounded-xl shadow-md border-t-4 border-green-500">
            <h2 className="text-xl font-bold mb-4 text-green-800 flex items-center gap-2">
                ➕ Add New Subdivision
            </h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">New Subdivision Name</label>
                    <input value={newSub} onChange={e => setNewSub(e.target.value)} className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-green-500 outline-none" placeholder="e.g. Traffic North" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Initial Stations (Comma Separated)</label>
                    <textarea value={newStations} onChange={e => setNewStations(e.target.value)} className="w-full border p-2 rounded-lg h-24 focus:ring-2 focus:ring-green-500 outline-none resize-none" placeholder="Station A, Station B" />
                </div>
                <button onClick={handleAdd} disabled={saving} className="w-full bg-green-600 text-white py-2.5 rounded-lg font-bold hover:bg-green-700 transition-colors shadow-sm disabled:opacity-50">
                    {saving ? 'Saving...' : 'Create Subdivision'}
                </button>
            </div>
          </div>

          {/* EDIT CARD */}
          <div className="bg-white p-6 rounded-xl shadow-md border-t-4 border-blue-500">
            <h2 className="text-xl font-bold mb-4 text-blue-800 flex items-center gap-2">
                ✏️ Edit Stations
            </h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Select Subdivision to Edit</label>
                    <select value={editSub} onChange={e => onSelectEditSub(e.target.value)} className="w-full border p-2 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="">-- Choose Subdivision --</option>
                        {Object.keys(structure).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                        Update Stations (Comma Separated)
                    </label>
                    <textarea 
                        value={editStations} 
                        onChange={e => setEditStations(e.target.value)} 
                        disabled={!editSub} 
                        className="w-full border p-2 rounded-lg h-24 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none resize-none disabled:cursor-not-allowed" 
                    />
                </div>
                <button onClick={handleEditSave} disabled={saving || !editSub} className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
          </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="font-bold text-xl mb-6 text-gray-800 border-b pb-4">Current Organization Structure</h3>
          <div className="grid grid-cols-1 gap-6">
            {Object.keys(structure).length === 0 && <p className="text-gray-400 italic">No structure found.</p>}
            {Object.keys(structure).map(sub => (
                <div key={sub} className="bg-gray-50 p-5 rounded-lg border border-gray-200 hover:border-indigo-200 transition-colors">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-lg text-indigo-900">{sub}</h4>
                        <button onClick={() => handleRemoveSubdivision(sub)} className="text-red-500 hover:text-red-700 text-xs font-bold border border-red-200 px-3 py-1.5 rounded bg-white hover:bg-red-50 transition-colors">
                            Delete Subdivision
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(structure[sub] || []).map(stn => (
                            <div key={stn} className="bg-white text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium border border-gray-200 shadow-sm flex items-center gap-2 group hover:border-red-300 transition-colors">
                                {stn}
                                <button 
                                    onClick={() => handleRemoveStation(sub, stn)} 
                                    className="text-gray-300 hover:text-red-600 font-bold leading-none ml-1 transition-colors text-lg"
                                    title="Remove Station"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                        {(structure[sub] || []).length === 0 && <span className="text-gray-400 italic text-sm">No stations assigned</span>}
                    </div>
                </div>
            ))}
          </div>
      </div>
    </div>
  );
}

// ==========================================
// 3. MANAGE USERS (Unchanged functionality, styling matched)
// ==========================================
function ManageUsersPage({ onBack }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filterRole, setFilterRole] = useState('');
  const [filterSub, setFilterSub] = useState('');
  const [filterStation, setFilterStation] = useState('');
  
  // Search
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchUsers = () => {
    axios.get('http://localhost:5000/api/admin/users').then(res => { setUsers(res.data); setLoading(false); });
  };

  const deleteUser = async (id) => {
    if(!window.confirm("Are you sure you want to delete this user?")) return;
    try { await axios.post('http://localhost:5000/api/admin/delete-user', { userId: id }); fetchUsers(); } catch(err) { alert("Error deleting user"); }
  };

  // --- DYNAMIC FILTER OPTIONS LOGIC ---
  const availableSubs = [...new Set(users
    .filter(u => !filterRole || u.role === filterRole)
    .filter(u => u.subdivision && u.subdivision !== 'HQ')
    .map(u => u.subdivision)
  )].sort();

  const availableStations = [...new Set(users
    .filter(u => !filterRole || u.role === filterRole)
    .filter(u => !filterSub || u.subdivision === filterSub)
    .filter(u => u.station && u.station !== 'Headquarters')
    .map(u => u.station)
  )].sort();

  const displayedUsers = users.filter(user => {
    if (filterRole && user.role !== filterRole) return false;
    if (filterSub && user.subdivision !== filterSub) return false;
    if (filterStation && user.station !== filterStation) return false;
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const nameMatch = user.name?.toLowerCase().includes(query);
        const emailMatch = user.email?.toLowerCase().includes(query);
        if (!nameMatch && !emailMatch) return false;
    }
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto p-6">
      <button onClick={onBack} className="mb-6 font-bold flex items-center gap-2 text-gray-600 hover:text-black transition-colors">
        <span className="text-xl">←</span> Back to Dashboard
      </button>
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">System Users (Live)</h2>
        <span className="bg-indigo-100 text-indigo-800 px-4 py-1 rounded-full font-bold text-sm shadow-sm">{displayedUsers.length} Found</span>
      </div>
      
      {/* FILTER BAR */}
      <div className="bg-white p-4 rounded-xl shadow-sm mb-6 border border-gray-200 flex flex-col md:flex-row gap-4 items-center">
         
         <div className="w-full md:w-1/3 relative">
            <input 
                type="text" 
                placeholder="🔍 Search Name or Email..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full border p-2.5 rounded-lg pl-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
         </div>

         <div className="w-full md:w-auto flex flex-wrap gap-2 items-center flex-1">
            <div className="font-bold text-gray-400 text-xs uppercase tracking-wide mr-2">Filters:</div>
            
            <select value={filterRole} onChange={e => { setFilterRole(e.target.value); setFilterSub(''); setFilterStation(''); }} className="border p-2 rounded-lg bg-white font-medium text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">All Roles</option>
                <option value="User">User</option>
                <option value="Manager">Manager</option>
                <option value="Admin">Admin</option>
            </select>
            
            {filterRole !== 'Admin' && (
                <>
                    <select value={filterSub} onChange={e => { setFilterSub(e.target.value); setFilterStation(''); }} className="border p-2 rounded-lg bg-white font-medium text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option value="">All Subdivisions</option>
                        {availableSubs.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    
                    <select value={filterStation} onChange={e => setFilterStation(e.target.value)} className="border p-2 rounded-lg bg-white font-medium text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-100 disabled:text-gray-400" disabled={!filterSub && availableStations.length > 20}>
                        <option value="">All Stations</option>
                        {availableStations.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </>
            )}
         </div>

         {(filterRole || filterSub || filterStation || searchQuery) && (
            <button onClick={() => { setFilterRole(''); setFilterSub(''); setFilterStation(''); setSearchQuery(''); }} className="text-sm text-red-600 hover:text-red-800 font-bold whitespace-nowrap px-3 py-1 rounded hover:bg-red-50 transition-colors">
                Clear Filters
            </button>
         )}
      </div>

      <div className="bg-white shadow-sm rounded-xl overflow-hidden border border-gray-200">
        <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50">
                <tr>
                    <th className="p-4 border-b font-bold text-gray-500 uppercase text-xs tracking-wider">Name</th>
                    <th className="p-4 border-b font-bold text-gray-500 uppercase text-xs tracking-wider">Role</th>
                    <th className="p-4 border-b font-bold text-gray-500 uppercase text-xs tracking-wider">Division / Station</th>
                    <th className="p-4 border-b font-bold text-gray-500 uppercase text-xs tracking-wider">Email</th>
                    <th className="p-4 border-b font-bold text-gray-500 uppercase text-xs tracking-wider text-center">Action</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {displayedUsers.length === 0 ? (
                    <tr><td colSpan="5" className="p-10 text-center text-gray-400 italic">No users found matching your filters.</td></tr>
                ) : (
                    displayedUsers.map(u => (
                        <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                            <td className="p-4 font-semibold text-gray-800">{u.name}</td>
                            <td className="p-4"><span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${u.role === 'Admin' ? 'bg-purple-50 text-purple-700 border-purple-200' : u.role === 'Manager' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{u.role}</span></td>
                            <td className="p-4 text-gray-600 text-sm">
                                {u.role === 'Admin' ? <span className="text-gray-400 italic">Headquarters</span> : (
                                    <div className="flex flex-col">
                                        <span className="font-medium text-gray-800">{u.subdivision}</span>
                                        {u.station && <span className="text-xs text-gray-500">{u.station}</span>}
                                    </div>
                                )}
                            </td>
                            <td className="p-4 text-sm text-gray-500 font-mono">{u.email}</td>
                            <td className="p-4 text-center">
                                <button onClick={() => deleteUser(u.id)} className="text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-1.5 rounded text-xs font-bold transition-colors border border-transparent hover:border-red-200">
                                    Remove
                                </button>
                            </td>
                        </tr>
                    ))
                )}
            </tbody>
        </table>
      </div>
    </div>
  );
}