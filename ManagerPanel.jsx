import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';

export default function ManagerPanel({ currentUser }) {
  const [currentView, setCurrentView] = useState('dashboard');
  const [tasks, setTasks] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [groups, setGroups] = useState([]);

  const fetchData = useCallback(async () => {
    if (!currentUser) return;
    try {
      // 1. Fetch Users
      const usersRes = await axios.get('http://localhost:5000/api/admin/users');
      const rawUsers = usersRes.data;
      const norm = (str) => String(str || '').trim().toLowerCase();
      const finalUsers = rawUsers.filter((u) => {
        const uRole = norm(u.role);
        return uRole !== 'admin' && uRole !== 'manager'; 
      });
      setAllUsers(finalUsers);

      // 2. Fetch Groups
      const groupRes = await axios.get('http://localhost:5000/api/manager/groups');
      setGroups(groupRes.data);

      // 3. Fetch Tasks
      const tasksRes = await axios.post('http://localhost:5000/api/manager/all-tasks');
      setTasks(tasksRes.data);
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  }, [currentUser]); 

  useEffect(() => {
    if (currentUser) fetchData();
    const interval = setInterval(() => {
      if (currentUser) fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, [currentUser, fetchData]);

  return (
    <div className="flex h-screen w-full bg-gray-100 font-sans">
      <div className="w-64 bg-gray-900 text-white flex flex-col p-4 fixed h-full z-10">
        <div className="mb-8 border-b border-gray-700 pb-4">
          <h2 className="text-xl font-bold tracking-wide">Manager Portal</h2>
          <p className="text-gray-400 text-sm mt-1">{currentUser?.name}</p>
          <span className="text-xs bg-indigo-600 px-2 py-0.5 rounded mt-2 inline-block uppercase font-bold tracking-wider">
            {currentUser?.subdivision || 'HQ'}
          </span>
        </div>
        <nav className="space-y-2">
          <button onClick={() => setCurrentView('dashboard')} className={`w-full text-left px-4 py-3 rounded font-medium transition-all duration-200 ${currentView === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg translate-x-1' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
            📊 Analytics & Dashboard
          </button>
          <button onClick={() => setCurrentView('create')} className={`w-full text-left px-4 py-3 rounded font-medium transition-all duration-200 ${currentView === 'create' ? 'bg-indigo-600 text-white shadow-lg translate-x-1' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
            ➕ Assign & Groups
          </button>
        </nav>
      </div>

      <div className="flex-1 ml-64 p-8 overflow-y-auto h-full">
        {currentView === 'dashboard' && (
          <AnalyticsDashboard tasks={tasks} groups={groups} refresh={fetchData} />
        )}
        {currentView === 'create' && (
          <BulkAssignPage allUsers={allUsers} groups={groups} refresh={fetchData} currentUser={currentUser} />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// ANALYTICS DASHBOARD
// ------------------------------------------------------------------
function AnalyticsDashboard({ tasks, groups, refresh }) {
  const [activeTab, setActiveTab] = useState('Pending'); 
  const [filterType, setFilterType] = useState('All'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [searchByUser, setSearchByUser] = useState(false); // NEW: Toggle Search Mode

  const contextTasks = useMemo(() => {
    // 1. Filter
    let filtered = tasks.filter(t => {
        const matchesType = filterType === 'All' ? true : t.sheetType === filterType;
        const query = searchQuery.toLowerCase();
        
        if (!query) return matchesType;

        let matchesSearch = false;
        if (searchByUser) {
            // Search Only User Name
            matchesSearch = (t.userName || '').toLowerCase().includes(query);
        } else {
            // Search Group Name OR Sheet Name
            matchesSearch = (t.groupName || '').toLowerCase().includes(query) || 
                            (t.sheetName || '').toLowerCase().includes(query);
        }

        return matchesType && matchesSearch;
    });

    // 2. Sort by Date/Time Descending (Newest First)
    return filtered.sort((a, b) => {
        // Use completedDate if available, otherwise fall back to creation date
        const dateA = new Date(a.completedDate || a.date).getTime();
        const dateB = new Date(b.completedDate || b.date).getTime();
        return dateB - dateA;
    });

  }, [tasks, filterType, searchQuery, searchByUser]);

  const pendingCount = contextTasks.filter(t => t.status === 'Pending').length;
  const nilCount = contextTasks.filter(t => t.isNil).length;
  const completedCount = contextTasks.filter(t => t.status === 'Completed' && !t.isNil).length;
  const totalInContext = pendingCount + nilCount + completedCount;
  const percentage = totalInContext === 0 ? 0 : Math.round(((completedCount + nilCount) / totalInContext) * 100);

  const displayTasks = contextTasks.filter(t => {
    if (activeTab === 'Pending') return t.status === 'Pending';
    if (activeTab === 'Completed') return t.status === 'Completed' && !t.isNil;
    if (activeTab === 'Nil') return t.isNil;
    return true;
  });

  const handleReassign = async (taskId) => {
    if (!window.confirm("Re-assign this sheet? Status will reset to Pending.")) return;
    try {
      await axios.post('http://localhost:5000/api/manager/reassign', { taskId });
      alert("Sheet Re-Assigned.");
      refresh();
    } catch (err) {
      alert("Error reassigning.");
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      
      {/* Header & Stats */}
      <div>
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Dashboard Overview</h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            <StatCard title="Pending Action" value={pendingCount} color="yellow" icon="⏳" />
            <StatCard title="Completed Reports" value={completedCount} color="green" icon="✅" />
            <StatCard title="Nil Reports" value={nilCount} color="red" icon="🚫" />
            <div className="bg-white p-6 rounded-xl shadow-sm border border-indigo-100 flex flex-col justify-center items-center">
              <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider">Completion Rate</h3>
              <div className="text-4xl font-extrabold text-indigo-600 mt-2">{percentage}%</div>
              {filterType !== 'All' && <span className="text-xs text-indigo-300 mt-1 font-bold uppercase">{filterType} Only</span>}
            </div>
          </div>
      </div>

      {/* Main Control Area */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        
        {/* Top Row: Search & Filters */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 border-b border-gray-100 pb-6">
            
            {/* Search Section */}
            <div className="flex flex-col gap-2 w-full md:w-96">
                <div className="relative w-full">
                    <input 
                        placeholder={searchByUser ? "🔍 Search by User Name..." : "🔍 Search Group or Sheet Name..."}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className={`w-full pl-4 pr-4 py-2.5 rounded-full border text-sm focus:outline-none transition-all ${
                            searchByUser 
                            ? 'border-indigo-300 bg-indigo-50 focus:ring-2 focus:ring-indigo-500' 
                            : 'border-gray-300 bg-gray-50 focus:ring-2 focus:ring-gray-400'
                        }`}
                    />
                </div>
                {/* NEW: Checkbox */}
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none ml-2">
                    <input 
                        type="checkbox" 
                        checked={searchByUser} 
                        onChange={e => setSearchByUser(e.target.checked)} 
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-3 h-3" 
                    />
                    <span className={searchByUser ? "font-bold text-indigo-600" : ""}>Search by User Name</span>
                </label>
            </div>

            {/* Type Pills */}
            <div className="flex bg-gray-100 p-1.5 rounded-full self-start md:self-center">
                {['All', 'New', 'Daily', 'Monthly'].map(type => (
                    <button
                        key={type}
                        onClick={() => setFilterType(type)}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all shadow-sm ${
                            filterType === type 
                            ? 'bg-indigo-600 text-white' 
                            : 'bg-white text-gray-500 hover:text-gray-800'
                        }`}
                    >
                        {type}
                    </button>
                ))}
            </div>
        </div>

        {/* Split Tabs */}
        <div className="flex gap-8 mb-6 border-b border-gray-200">
            {[
                { id: 'Pending', label: '⏳ Pending Tasks', count: pendingCount },
                { id: 'Completed', label: '✅ Completed', count: completedCount },
                { id: 'Nil', label: '🚫 Nil Reports', count: nilCount }
            ].map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`pb-3 px-2 text-md font-bold transition-all border-b-4 ${
                        activeTab === tab.id
                        ? 'border-indigo-600 text-indigo-700'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                >
                    {tab.label} 
                    <span className={`text-xs px-2 py-0.5 rounded-full ml-2 transition-colors ${
                        activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                        {tab.count}
                    </span>
                </button>
            ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="p-4 font-semibold text-gray-500">Sheet Name</th>
                <th className="p-4 font-semibold text-gray-500">Assigned To</th>
                <th className="p-4 font-semibold text-gray-500">Group / Division</th>
                <th className="p-4 font-semibold text-gray-500">
                    {activeTab === 'Pending' ? 'Due Date' : 'Completed On'}
                </th>
                <th className="p-4 font-semibold text-gray-500">Link</th>
                {(activeTab === 'Completed' || activeTab === 'Nil') && (
                    <th className="p-4 text-right font-semibold text-gray-500">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayTasks.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-12 text-center text-gray-400 italic bg-gray-50 rounded-b-lg">
                    No {activeTab.toLowerCase()} records found matching criteria.
                  </td>
                </tr>
              ) : (
                displayTasks.map((task) => (
                  <tr key={task.taskId} className="hover:bg-indigo-50 transition-colors group">
                    <td className="p-4 font-bold text-gray-700">{task.sheetName}</td>
                    <td className="p-4 text-gray-600 flex flex-col">
                        <span className="font-semibold">{task.userName}</span>
                        <span className="text-[10px] text-gray-400">{task.userStation}</span>
                    </td>
                    <td className="p-4 text-xs text-gray-500">
                      <span className="bg-gray-100 px-2 py-1 rounded border border-gray-200">
                          {task.groupName || task.userSubdivision}
                      </span>
                    </td>
                    <td className="p-4 text-gray-500 font-mono text-xs">
                      {activeTab === 'Pending' 
                        ? (task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-')
                        : (task.completedDate ? new Date(task.completedDate).toLocaleString() : new Date(task.date).toLocaleDateString())
                      }
                    </td>
                    <td className="p-4">
                      {activeTab !== 'Nil' && (
                          <a
                            href={task.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 hover:underline font-bold text-xs bg-indigo-50 px-3 py-1.5 rounded-md border border-indigo-100"
                          >
                            OPEN SHEET ↗
                          </a>
                      )}
                      {activeTab === 'Nil' && <span className="text-gray-300 text-xs italic">N/A</span>}
                    </td>
                    {(activeTab === 'Completed' || activeTab === 'Nil') && (
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleReassign(task.taskId)}
                            className="text-orange-500 hover:text-orange-700 text-xs font-bold border border-orange-200 px-3 py-1.5 rounded hover:bg-orange-50 transition-colors"
                          >
                            ↺ Re-Assign
                          </button>
                        </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, color, icon }) {
  const colors = {
    green: 'border-green-500 bg-green-50 text-green-700',
    yellow: 'border-yellow-500 bg-yellow-50 text-yellow-700',
    red: 'border-red-500 bg-red-50 text-red-700',
  };

  return (
    <div className={`p-6 rounded-xl shadow-sm border-l-4 ${colors[color]} bg-white flex justify-between items-center transition-transform hover:-translate-y-1`}>
      <div>
          <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</h3>
          <div className="text-3xl font-extrabold mt-1">{value}</div>
      </div>
      <div className="text-2xl opacity-50">{icon}</div>
    </div>
  );
}

// ------------------------------------------------------------------
// BULK ASSIGN PAGE
// ------------------------------------------------------------------
function BulkAssignPage({ allUsers, groups, refresh, currentUser }) {
  const [sheetName, setSheetName] = useState('');
  const [type, setType] = useState('New');
  const [manualLink, setManualLink] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [allowNil, setAllowNil] = useState(false);
  const [botConfirmed, setBotConfirmed] = useState(false);

  const [selectionMode, setSelectionMode] = useState('users');
  const [selUsers, setSelUsers] = useState([]); 
  
  const [selGroups, setSelGroups] = useState([]); 
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  
  const [newGroupName, setNewGroupName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [loading, setLoading] = useState(false);
  const [botEmail, setBotEmail] = useState('');

  useEffect(() => {
    axios.get('http://localhost:5000/api/system/bot-email')
      .then((res) => setBotEmail(res.data.email))
      .catch((err) => console.error("Could not fetch bot email"));
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(botEmail);
    alert("Bot Email copied to clipboard!");
  };

  const subdivisions = useMemo(() => {
    const subs = allUsers.map(u => u.subdivision || 'Unknown').filter(Boolean);
    return [...new Set(subs)].sort();
  }, [allUsers]);

  const toggleUser = (id) => {
    setSelUsers((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const toggleGroup = (id) => {
    setSelGroups((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const toggleDivision = (divName) => {
    const usersInDiv = allUsers.filter(u => (u.subdivision || 'Unknown') === divName);
    const idsInDiv = usersInDiv.map(u => u.id);
    const allSelected = idsInDiv.every(id => selUsers.includes(id));

    if (allSelected) {
      setSelUsers(prev => prev.filter(id => !idsInDiv.includes(id)));
    } else {
      const toAdd = idsInDiv.filter(id => !selUsers.includes(id));
      setSelUsers(prev => [...prev, ...toAdd]);
    }
  };

  // DELETE GROUP LOGIC
  const handleDeleteGroup = async (groupId, e) => {
    e.stopPropagation(); 
    if (!window.confirm("Are you sure you want to delete this group?")) return;

    try {
      await axios.post('http://localhost:5000/api/manager/delete-group', { groupId });
      setSelGroups(prev => prev.filter(id => id !== groupId));
      refresh(); 
    } catch (err) {
      alert("Error deleting group.");
    }
  };

  const groupedFilteredUsers = useMemo(() => {
    const filtered = allUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.station && u.station.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (u.subdivision && u.subdivision.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    const grouped = {};
    filtered.forEach(u => {
        const sub = u.subdivision || 'Unknown';
        if (!grouped[sub]) grouped[sub] = [];
        grouped[sub].push(u);
    });
    return Object.keys(grouped).sort().map(key => ({
        division: key,
        users: grouped[key]
    }));
  }, [allUsers, searchTerm]);

  const getGroupMembers = (groupId) => {
      const group = groups.find(g => g.id === groupId);
      if(!group) return [];
      return allUsers.filter(u => group.userIds.includes(u.id));
  };

  const filteredGroups = groups.filter(g => 
    g.name.toLowerCase().includes(groupSearchTerm.toLowerCase())
  );

  const handleSaveGroup = async () => {
    if (!newGroupName.trim() || selUsers.length === 0)
      return alert("Enter a group name and select at least one user.");
    try {
      await axios.post('http://localhost:5000/api/manager/create-group', {
        groupName: newGroupName,
        userIds: selUsers,
        managerId: currentUser.id,
      });
      alert(`Group '${newGroupName}' Saved Successfully!`);
      setNewGroupName('');
      refresh();
    } catch (e) {
      alert("Error saving group");
    }
  };

  const handleAssign = async () => {
    if (!botConfirmed) return alert("Please confirm you shared the sheet with the bot.");
    if (!sheetName || !manualLink || !dueDate) return alert("Fill all fields.");

    let targets = [];
    let groupNamesUsed = [];

    if (selectionMode === 'groups') {
      if (selGroups.length === 0) return alert("Select at least one group.");
      
      const allSelectedGroupIds = selGroups;
      const targetIds = new Set();
      
      allSelectedGroupIds.forEach(grpId => {
          const grp = groups.find(g => g.id === grpId);
          if (grp) {
              groupNamesUsed.push(grp.name);
              grp.userIds.forEach(uid => targetIds.add(uid));
          }
      });

      targets = allUsers
        .filter((u) => targetIds.has(u.id))
        .map((u) => ({ id: u.id, name: u.name, email: u.email }));
    
    } else {
      if (selUsers.length === 0) return alert("Select users");
      targets = allUsers
        .filter((u) => selUsers.includes(u.id))
        .map((u) => ({ id: u.id, name: u.name, email: u.email }));
    }

    setLoading(true);
    try {
      await axios.post('http://localhost:5000/api/manager/assign-sheet', {
        type,
        sheetName,
        manualLink,
        targets,
        dueDate,
        allowNil,
        managerName: currentUser.name,
        groupNameUsed: groupNamesUsed.join(', '), 
      });
      alert(`Assigned to ${targets.length} users!`);
      setSelUsers([]);
      setSelGroups([]); 
      setSheetName('');
      setManualLink('');
      setBotConfirmed(false);
      refresh();
    } catch (err) {
      alert(err.response?.data?.message || "Error assigning.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Assign New Sheets</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. Sheet Details Section */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="border-b border-gray-100 pb-4 mb-4">
             <h3 className="font-bold text-lg text-gray-800 flex items-center">
               <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2">1</span>
               Sheet Details
             </h3>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-md mb-6 border border-blue-100">
            <p className="text-xs text-blue-800 mb-2 font-semibold">Bot Service Email (Must be Editor):</p>
            <div className="flex gap-2 mb-3">
              <input readOnly value={botEmail || 'Loading...'} className="text-xs bg-white border border-blue-200 p-2 rounded w-full text-gray-600" />
              <button onClick={copyToClipboard} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 rounded font-bold transition-colors">Copy</button>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={botConfirmed}
                onChange={(e) => setBotConfirmed(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-xs font-bold text-blue-700">I have shared the sheet with this email.</span>
            </label>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Category</label>
              <div className="flex bg-gray-100 rounded p-1">
                {['New', 'Daily', 'Monthly'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex-1 text-sm py-1.5 rounded font-bold transition-all ${
                      type === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sheet Name</label>
              <input
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="e.g. Monthly Crime Report"
                className="w-full border border-gray-300 p-2 text-sm rounded focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Google Sheet Link</label>
              <input
                value={manualLink}
                onChange={(e) => setManualLink(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/..."
                className="w-full border border-gray-300 p-2 text-sm rounded focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full border border-gray-300 p-2 text-sm rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer bg-gray-50 p-2 rounded border border-gray-200 hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={allowNil}
                    onChange={(e) => setAllowNil(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded"
                  />
                  <span className="text-xs font-bold text-gray-700">Allow Nil?</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Target Selection Section */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 col-span-1 lg:col-span-2 flex flex-col h-[700px]">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4 border-b border-gray-100 pb-4">
            <h3 className="font-bold text-lg text-gray-800 flex items-center mb-2 sm:mb-0">
               <span className="bg-purple-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2">2</span>
               Select Targets
            </h3>
            <div className="flex bg-gray-100 rounded p-1">
              <button
                onClick={() => setSelectionMode('users')}
                className={`px-4 py-1.5 rounded text-xs font-bold transition-all ${
                  selectionMode === 'users' ? 'bg-white shadow text-purple-700' : 'text-gray-500'
                }`}
              >
                Individual & Divisions
              </button>
              <button
                onClick={() => setSelectionMode('groups')}
                className={`px-4 py-1.5 rounded text-xs font-bold transition-all ${
                  selectionMode === 'groups' ? 'bg-white shadow text-purple-700' : 'text-gray-500'
                }`}
              >
                Saved Groups
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            {selectionMode === 'groups' ? (
              // --- SAVED GROUPS VIEW (MULTIPLE SELECTION + DELETE) ---
              <div className="flex flex-col h-full gap-4">
                <input
                  placeholder="🔍 Search Saved Groups..."
                  value={groupSearchTerm}
                  onChange={(e) => setGroupSearchTerm(e.target.value)}
                  className="w-full border-b border-gray-200 p-2 text-sm focus:outline-none focus:border-purple-500"
                />
                
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar p-1">
                    {filteredGroups.length === 0 && <p className="text-center text-gray-400 text-sm py-10">No groups found.</p>}
                    
                    {filteredGroups.map(group => {
                        const members = getGroupMembers(group.id);
                        const isSelected = selGroups.includes(group.id);

                        return (
                            <div 
                                key={group.id} 
                                onClick={() => toggleGroup(group.id)} 
                                className={`border rounded-lg p-4 cursor-pointer transition-all relative group ${
                                    isSelected 
                                    ? 'border-purple-500 bg-purple-50 shadow-md ring-1 ring-purple-500' 
                                    : 'border-gray-200 hover:border-purple-300 hover:shadow-sm'
                                }`}
                            >
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 flex items-center justify-center rounded border ${isSelected ? 'bg-purple-600 border-purple-600' : 'bg-white border-gray-300'}`}>
                                            {isSelected && <span className="text-white text-xs">✓</span>}
                                        </div>
                                        <h4 className={`font-bold text-md ${isSelected ? 'text-purple-800' : 'text-gray-800'}`}>
                                            {group.name}
                                        </h4>
                                    </div>
                                    
                                    {/* DELETE BUTTON */}
                                    <div className="flex items-center gap-2">
                                        <span className="bg-gray-200 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                                            {group.userIds.length} Members
                                        </span>
                                        <button 
                                            onClick={(e) => handleDeleteGroup(group.id, e)}
                                            className="text-gray-300 hover:text-red-500 transition-colors p-1.5 rounded-full hover:bg-red-50"
                                            title="Delete Group"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="flex flex-wrap gap-2 ml-8">
                                    {members.length > 0 ? members.map(u => (
                                        <span key={u.id} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-1 rounded">
                                            {u.name}
                                        </span>
                                    )) : (
                                        <span className="text-xs text-red-400 italic">Members not found (possibly deleted)</span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
              </div>
            ) : (
              // --- SPLIT UI: DIVISIONS vs USERS (Unchanged) ---
              <div className="flex flex-col h-full gap-4">
                <input
                  placeholder="🔍 Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full border-b border-gray-200 p-2 text-sm focus:outline-none focus:border-purple-500"
                />

                <div className="flex-1 flex gap-4 min-h-0">
                    <div className="w-1/3 border-r border-gray-100 pr-2 flex flex-col">
                        <div className="text-xs font-bold text-gray-400 uppercase mb-2 tracking-wider">Subdivisions</div>
                        <div className="overflow-y-auto flex-1 space-y-1 custom-scrollbar">
                            {subdivisions.map(sub => {
                                const usersInSub = allUsers.filter(u => (u.subdivision || 'Unknown') === sub);
                                const selectedInSub = usersInSub.filter(u => selUsers.includes(u.id));
                                const isAll = usersInSub.length > 0 && selectedInSub.length === usersInSub.length;
                                const isSome = selectedInSub.length > 0 && !isAll;

                                return (
                                    <div 
                                        key={sub} 
                                        onClick={() => toggleDivision(sub)}
                                        className={`cursor-pointer p-2 rounded text-sm flex items-center justify-between group transition-colors ${
                                            isAll ? 'bg-purple-100 text-purple-800 font-bold' : 
                                            isSome ? 'bg-purple-50 text-purple-700' : 'hover:bg-gray-50 text-gray-700'
                                        }`}
                                    >
                                        <span className="truncate">{sub}</span>
                                        <div className={`w-4 h-4 min-w-[16px] rounded border flex items-center justify-center ${
                                            isAll ? 'bg-purple-600 border-purple-600' : 
                                            isSome ? 'bg-purple-300 border-purple-300' : 'border-gray-300 bg-white'
                                        }`}>
                                            {isAll && <span className="text-white text-[10px]">✓</span>}
                                            {isSome && <span className="text-white text-[10px] font-bold">-</span>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    <div className="w-2/3 flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                Users ({selUsers.length} Selected)
                            </div>
                        </div>
                        <div className="overflow-y-auto flex-1 bg-gray-50 p-2 rounded-lg border border-gray-100 custom-scrollbar">
                            {groupedFilteredUsers.length === 0 && <p className="text-center text-gray-400 text-xs py-10">No users found.</p>}
                            {groupedFilteredUsers.map((group) => (
                                <div key={group.division} className="mb-4">
                                    <div className="sticky top-0 z-10 bg-gray-200 text-gray-600 px-2 py-1 text-xs font-bold uppercase rounded mb-1 shadow-sm opacity-90">{group.division}</div>
                                    <div className="space-y-1">
                                        {group.users.map((u) => (
                                            <label key={u.id} className={`flex items-center gap-3 p-2 rounded border cursor-pointer transition-all duration-200 ${selUsers.includes(u.id) ? 'bg-white border-purple-300 shadow-sm' : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200'}`}>
                                                <input type="checkbox" checked={selUsers.includes(u.id)} onChange={() => toggleUser(u.id)} className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500" />
                                                <div className="flex flex-col"><span className="text-sm font-semibold text-gray-800 leading-tight">{u.name}</span><span className="text-[10px] text-gray-500">{u.station}</span></div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 items-center border-t border-gray-100 pt-3 bg-white">
                   <div className="flex-1">
                      <input placeholder="Group Name (e.g. Traffic Division)" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="w-full border border-gray-300 p-2 rounded text-sm focus:ring-2 focus:ring-purple-400 outline-none" />
                   </div>
                  <button onClick={handleSaveGroup} className="bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded text-sm font-bold transition-colors whitespace-nowrap shadow">Save Group</button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <button
              onClick={handleAssign}
              disabled={loading || !botConfirmed}
              className={`w-full py-4 rounded-lg text-white font-bold text-lg shadow-md transition-all flex items-center justify-center gap-2 ${
                loading || !botConfirmed 
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500 shadow-none' 
                  : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transform hover:-translate-y-0.5'
              }`}
            >
              {loading ? 'Processing...' : selectionMode === 'groups' ? 'Assign Sheet to Selected Groups' : 'Assign Sheet to Selected Users'}
            </button>
            {!botConfirmed && (
              <p className="text-center text-xs text-red-500 mt-2 font-medium">
                Please check the "Shared with Bot" box above to enable this button.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}