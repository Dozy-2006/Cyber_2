import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function UserPanel({ currentUser }) {
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState('active'); // 'active', 'completed', 'archive'
  const [activeTab, setActiveTab] = useState('New'); // 'New', 'Daily', 'Monthly'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser?.id) fetchTasks();
  }, [currentUser]);

  const fetchTasks = async () => {
    try {
      const res = await axios.post('http://localhost:5000/api/user/tasks', { userId: currentUser.id });
      setTasks(res.data);
    } catch (err) { console.error(err); } 
    finally { setLoading(false); }
  };

  // --- ACTIONS ---
  const markComplete = async (taskId) => {
    if (!window.confirm("Confirm submission?")) return;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'Completed', isNil: false } : t));
    try { await axios.post('http://localhost:5000/api/user/complete', { taskId }); } catch(e){ fetchTasks(); }
  };

  const submitNil = async (taskId) => {
      if (!window.confirm("Submit Nil Report? This means you have no data to enter.")) return;
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'Completed', isNil: true } : t));
      try { await axios.post('http://localhost:5000/api/user/submit-nil', { taskId }); } catch(e){ fetchTasks(); }
  };

  // --- FILTERING LOGIC (ACTIVE vs COMPLETED vs ARCHIVE) ---
  const today = new Date();
  today.setHours(0,0,0,0); // Reset time to start of day for accurate comparison

  const getFilteredTasks = () => {
      return tasks.filter(t => {
          // Determine Expiration
          // If no due date, treat as never expired (or handle as per requirement)
          // Here assuming 'dueDate' string YYYY-MM-DD format
          const taskDate = t.dueDate ? new Date(t.dueDate) : null;
          
          // Is Expired? (If Due Date exists AND Due Date is STRICTLY BEFORE Today)
          // Example: Due Date 15th. Today is 16th. Expired = True.
          const isExpired = taskDate && taskDate < today;

          // 1. ARCHIVE: STRICTLY EXPIRED TASKS (Regardless of Status)
          if (view === 'archive') {
              return isExpired;
          }
          
          // 2. COMPLETED: COMPLETED AND NOT EXPIRED
          if (view === 'completed') {
              return t.status === 'Completed' && !isExpired;
          }

          // 3. ACTIVE: PENDING AND NOT EXPIRED
          if (view === 'active') {
              return t.status === 'Pending' && !isExpired;
          }
          
          return false;
      })
      // Finally Filter by TAB (New/Daily/Monthly)
      .filter(t => (t.type || 'New').toLowerCase() === activeTab.toLowerCase());
  };

  const displayedTasks = getFilteredTasks();

  return (
    <div className="flex h-screen bg-gray-100 -m-5">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex flex-col p-4 fixed h-full z-10">
        <div className="mb-8 border-b border-gray-700 pb-4">
            <h2 className="text-xl font-bold tracking-wide">Officer Portal</h2>
            <p className="text-gray-400 text-xs mt-1 font-mono">{currentUser.name}</p>
            <span className="text-[10px] bg-blue-900 text-blue-200 px-2 py-0.5 rounded mt-2 inline-block">
                {currentUser.subdivision || 'General'}
            </span>
        </div>
        
        <nav className="space-y-2">
            <button onClick={() => setView('active')} className={`w-full text-left px-4 py-3 rounded font-medium transition-colors ${view === 'active' ? 'bg-indigo-600 shadow-lg text-white' : 'hover:bg-gray-800 text-gray-400'}`}>
                🚀 Active Tasks
            </button>
            <button onClick={() => setView('completed')} className={`w-full text-left px-4 py-3 rounded font-medium transition-colors ${view === 'completed' ? 'bg-green-600 shadow-lg text-white' : 'hover:bg-gray-800 text-gray-400'}`}>
                ✅ Completed
            </button>
            <button onClick={() => setView('archive')} className={`w-full text-left px-4 py-3 rounded font-medium transition-colors ${view === 'archive' ? 'bg-gray-700 shadow-lg text-white' : 'hover:bg-gray-800 text-gray-400'}`}>
                🗄️ Archive (Expired)
            </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 ml-64 p-8 overflow-y-auto h-full">
        <div className="max-w-6xl mx-auto">
            {/* Header Section */}
            <div className="flex justify-between items-end mb-6 border-b pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 capitalize">
                        {view === 'active' && 'Current Tasks'}
                        {view === 'completed' && 'Submitted Reports'}
                        {view === 'archive' && 'Archived History'}
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">
                        {view === 'active' && 'Tasks requiring your attention'}
                        {view === 'completed' && 'Tasks submitted successfully (Not Expired)'}
                        {view === 'archive' && 'Past due date records (Completed & Pending)'}
                    </p>
                </div>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 mb-8 bg-white p-1 rounded-full w-fit shadow-sm border">
                {['New', 'Daily', 'Monthly'].map(tab => (
                    <button 
                        key={tab} 
                        onClick={() => setActiveTab(tab)} 
                        className={`px-6 py-2 rounded-full font-bold text-sm transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow' : 'bg-transparent text-gray-500 hover:bg-gray-50'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {loading ? <p className="text-gray-500">Loading your dashboard...</p> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {displayedTasks.length === 0 && (
                        <div className="col-span-3 text-center py-20 bg-white rounded-lg border border-dashed border-gray-300">
                            <p className="text-gray-400 italic">No {view} records found in "{activeTab}".</p>
                        </div>
                    )}
                    
                    {displayedTasks.map(task => (
                        <div key={task.id} className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 relative hover:shadow-md transition-shadow flex flex-col ${task.isNil ? 'bg-gray-50' : ''}`}>
                            
                            {/* Card Header */}
                            <div className="flex justify-between items-start mb-4">
                                <div className="pr-2">
                                    <h3 className="font-bold text-gray-800 text-lg leading-tight line-clamp-2" title={task.name}>{task.name}</h3> 
                                    <p className={`text-xs mt-2 font-mono ${new Date(task.dueDate) < today && task.status === 'Pending' ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
                                        Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No Date'}
                                    </p>
                                </div>
                                
                                {/* Status Badge */}
                                {task.isNil ? (
                                    <span className="bg-gray-200 text-gray-600 text-[10px] px-2 py-1 rounded font-bold whitespace-nowrap">NIL</span>
                                ) : (
                                    <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded whitespace-nowrap ${
                                        task.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                        {task.status}
                                    </span>
                                )}
                            </div>

                            {/* View Specific Logic */}
                            <div className="mt-auto pt-4">
                                
                                {/* ACTIVE VIEW: Action Buttons */}
                                {view === 'active' && (
                                    <div className="space-y-3">
                                        <a href={task.link} target="_blank" rel="noopener noreferrer" className="block w-full text-center bg-blue-50 text-blue-600 font-bold py-2.5 rounded-lg text-sm hover:bg-blue-100 border border-blue-100 transition-colors">
                                            Open Sheet
                                        </a>
                                        <div className="flex gap-2">
                                            <button onClick={() => markComplete(task.id)} className="flex-1 bg-indigo-600 text-white font-bold py-2.5 rounded-lg text-sm hover:bg-indigo-700 transition-colors shadow-sm">
                                                Done
                                            </button>
                                            {task.allowNil && (
                                                <button onClick={() => submitNil(task.id)} className="flex-1 bg-white text-red-600 border border-red-200 font-bold py-2.5 rounded-lg text-sm hover:bg-red-50 transition-colors">
                                                    Nil
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* COMPLETED VIEW: Read Only */}
                                {view === 'completed' && (
                                    <div>
                                        <div className="text-center py-2 border rounded-lg bg-green-50 text-green-700 text-xs font-bold mb-2">
                                            Successfully Submitted
                                        </div>
                                        <a href={task.link} target="_blank" rel="noopener noreferrer" className="block w-full text-center text-gray-500 hover:text-blue-600 text-xs hover:underline mt-2">
                                            View Sheet Again
                                        </a>
                                    </div>
                                )}

                                {/* ARCHIVE VIEW: Status Info */}
                                {view === 'archive' && (
                                    <div>
                                        {task.status === 'Pending' ? (
                                            <div className="text-center py-2 border border-red-100 rounded-lg bg-red-50 text-red-600 text-xs font-bold">
                                                Expired (Not Submitted)
                                            </div>
                                        ) : (
                                            <div className="text-center py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-xs font-bold">
                                                Archived Record
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}