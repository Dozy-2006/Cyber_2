const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode'); 
const { authenticator } = require('otplib'); 
const { google } = require('googleapis');
const { doc, serviceAccountAuth } = require('./sheetsClient');
const credentials = require('./credentials.json'); 

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 5000;

// ==========================================
// 0. HIGH-SPEED MEMORY STORE (RAM)
// ==========================================
let DB = {
    Users: [],
    Stations: [],
    Tasks: [],
    Groups: []
};

// Flags & Queue
let isDbReady = false;
let dbReadyPromise = null;
const WRITE_QUEUE = [];
let isProcessingQueue = false;
let isSyncing = false; 

// ==========================================
// 1. SYNC ENGINE (Google -> RAM)
// ==========================================

function arrayToObjects(values, headers) {
    if (!values || values.length < 2) return []; 
    const result = [];
    for (let i = 1; i < values.length; i++) {
        const row = values[i];
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = row[index] || ''; 
        });
        result.push(obj);
    }
    return result;
}

async function syncDatabase() {
    if (isSyncing || isProcessingQueue) {
        console.log("⚠️ Skipping Sync: Server is writing data.");
        return; 
    }

    isSyncing = true;
    
    try {
        const sheets = google.sheets({ version: 'v4', auth: serviceAccountAuth });
        if(!doc.spreadsheetId) await doc.loadInfo(); 

        const response = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: doc.spreadsheetId,
            ranges: ['Users!A:Z', 'Stations!A:Z', 'Tasks!A:Z', 'Groups!A:Z'],
        });

        const data = response.data.valueRanges;

        DB.Users = arrayToObjects(data[0].values, ['UserID', 'Name', 'Role', 'Subdivision', 'Station', 'Email', 'AuthKey']);
        DB.Stations = arrayToObjects(data[1].values, ['Subdivision', 'Stations']);
        
        // UPDATED: Added 'CompletedDate' to headers
        DB.Tasks = arrayToObjects(data[2].values, ['TaskID', 'SheetLink', 'SheetType', 'AssignedTo', 'Status', 'Date', 'TaskName', 'DueDate', 'AllowNil', 'IsNil', 'GroupName', 'CompletedDate']);
        
        DB.Groups = arrayToObjects(data[3].values, ['GroupID', 'GroupName', 'CreatedBy', 'UserIDs']);

        isDbReady = true;
        // console.log(`✅ Sync Complete.`); 
    } catch (err) {
        console.error("❌ Sync Error:", err.message);
    } finally {
        isSyncing = false;
    }
}

// --- FIXED SHEET HELPER ---
async function getSheet(title, headers) {
    try {
        await doc.loadInfo();
    } catch (e) {
        console.error("⚠️ Failed to load doc info, retrying...", e.message);
        await new Promise(r => setTimeout(r, 1000));
        await doc.loadInfo();
    }

    let sheet = doc.sheetsByIndex.find(s => s.title.toLowerCase() === title.toLowerCase());
    
    if (!sheet) {
        sheet = await doc.addSheet({ title: title, headerValues: headers });
    }
    return sheet;
}

const waitForDb = async (req, res, next) => {
    if (isDbReady) return next();
    if (!dbReadyPromise) dbReadyPromise = syncDatabase();
    await dbReadyPromise;
    next();
};

// ==========================================
// 2. BACKGROUND WRITER (RAM -> Google)
// ==========================================
async function processWriteQueue() {
    if (isProcessingQueue || WRITE_QUEUE.length === 0) return;
    isProcessingQueue = true;

    while (WRITE_QUEUE.length > 0) {
        const job = WRITE_QUEUE.shift();
        try {
            console.log(`☁️ Writing: ${job.type} ${job.sheet}`);
            const sheet = await getSheet(job.sheet, job.headers);

            if (job.type === 'ADD') {
                await sheet.addRow(job.data);
            } 
            else if (job.type === 'UPDATE') {
                const rows = await sheet.getRows(); 
                const row = rows.find(r => r.get(job.keyField) === job.keyValue);
                if (row) {
                    row.assign(job.data);
                    await row.save();
                }
            }
            else if (job.type === 'DELETE') {
                const rows = await sheet.getRows();
                const row = rows.find(r => {
                    const val = r.get(job.keyField);
                    return val && val === job.keyValue;
                });
                
                if (row) {
                    await row.delete();
                }
            }
            await new Promise(r => setTimeout(r, 300)); 

        } catch (err) {
            console.error(`❌ Write Failed: ${err.message}`);
        }
    }
    isProcessingQueue = false;
}

function queueJob(type, sheet, data, keyField, keyValue) {
    // 1. Update RAM Immediately
    if (type === 'ADD') DB[sheet].push(data);
    else if (type === 'UPDATE') {
        const item = DB[sheet].find(i => i[keyField] === keyValue);
        if (item) Object.assign(item, data);
    }
    else if (type === 'DELETE') {
        DB[sheet] = DB[sheet].filter(i => i[keyField] !== keyValue);
    }

    // 2. Queue Cloud Update
    let headers = [];
    if(sheet === 'Users') headers = ['UserID', 'Name', 'Role', 'Subdivision', 'Station', 'Email', 'AuthKey'];
    
    // UPDATED: Added 'CompletedDate' to headers
    if(sheet === 'Tasks') headers = ['TaskID', 'SheetLink', 'SheetType', 'AssignedTo', 'Status', 'Date', 'TaskName', 'DueDate', 'AllowNil', 'IsNil', 'GroupName', 'CompletedDate'];
    
    if(sheet === 'Groups') headers = ['GroupID', 'GroupName', 'CreatedBy', 'UserIDs'];
    if(sheet === 'Stations') headers = ['Subdivision', 'Stations'];

    WRITE_QUEUE.push({ type, sheet, data, keyField, keyValue, headers });
    processWriteQueue();
}

// ==========================================
// 3. API ROUTES
// ==========================================

app.get('/api/system/bot-email', (req, res) => res.json({ email: credentials.client_email }));

app.post('/api/login', waitForDb, (req, res) => {
    const { role, username, authKey } = req.body; 
    const user = DB.Users.find(row => row.Role === role && row.Name.toLowerCase() === username.toLowerCase());
    if (user) {
        authenticator.options = { window: 1 };
        if (authenticator.check(authKey, user.AuthKey)) {
            res.json({ success: true, user: { id: user.UserID, name: user.Name, role: user.Role, subdivision: user.Subdivision, station: user.Station } });
        } else { res.status(401).json({ success: false, message: 'Invalid Code' }); }
    } else { res.status(401).json({ success: false, message: 'User not found' }); }
});

app.get('/api/admin/users', waitForDb, (req, res) => {
    const users = DB.Users.map(u => ({ id: u.UserID, name: u.Name, role: u.Role, email: u.Email, subdivision: u.Subdivision, station: u.Station }));
    res.json(users);
});

app.get('/api/admin/structure', waitForDb, (req, res) => {
    const structure = {};
    DB.Stations.forEach(row => {
        if(row.Subdivision) structure[row.Subdivision] = row.Stations ? row.Stations.split(',').map(s=>s.trim()).filter(s => s !== '') : [];
    });
    res.json(structure);
});

app.get('/api/manager/groups', waitForDb, (req, res) => {
    const groups = DB.Groups.map(r => ({ id: r.GroupID, name: r.GroupName, createdBy: r.CreatedBy, userIds: r.UserIDs ? r.UserIDs.split(',') : [] }));
    res.json(groups);
});

app.post('/api/manager/all-tasks', waitForDb, (req, res) => {
    const userMap = {};
    DB.Users.forEach(u => userMap[u.UserID] = { name: u.Name, station: u.Station, subdivision: u.Subdivision });

    const allTasks = DB.Tasks.map(row => {
      const u = userMap[row.AssignedTo] || { name: 'Unknown', station: 'Unknown', subdivision: 'Unknown' };
      return {
        taskId: row.TaskID, sheetType: row.SheetType, status: row.Status, link: row.SheetLink, 
        date: row.Date, dueDate: row.DueDate, sheetName: row.TaskName,
        isNil: String(row.IsNil).toUpperCase() === 'TRUE', groupName: row.GroupName,
        // Include CompletedDate in response if needed for UI
        completedDate: row.CompletedDate, 
        assignedToId: row.AssignedTo, userName: u.name, userStation: u.station, userSubdivision: u.subdivision
      };
    });
    res.json(allTasks);
});

app.post('/api/user/tasks', waitForDb, (req, res) => {
    const { userId } = req.body;
    const myTasks = DB.Tasks.filter(row => row.AssignedTo === userId).map(row => ({
        id: row.TaskID, link: row.SheetLink, type: row.SheetType, status: row.Status, 
        date: row.Date, name: row.TaskName, dueDate: row.DueDate,
        allowNil: String(row.AllowNil).toUpperCase() === 'TRUE',
        isNil: String(row.IsNil).toUpperCase() === 'TRUE',
        completedDate: row.CompletedDate // Send this to frontend
    }));
    res.json(myTasks);
});

// ==========================================
// 4. WRITE ROUTES
// ==========================================

app.post('/api/admin/create-user', async (req, res) => {
    let { name, role, subdivision, station, email } = req.body;
    if (DB.Users.some(u => u.Email === email)) return res.status(400).json({ message: 'User exists' });
    if (role === 'Admin') { subdivision = 'HQ'; station = 'Headquarters'; }
    if (role === 'Manager') { station = 'All Stations'; }

    const { secret, qrCodeData } = await generateTOTP(name);
    const newUser = { UserID: uuidv4(), Name: name, Role: role, Subdivision: subdivision, Station: station, Email: email, AuthKey: secret };
    queueJob('ADD', 'Users', newUser);
    res.json({ success: true, qrCode: qrCodeData, secret: secret });
});

app.post('/api/admin/delete-user', (req, res) => {
    queueJob('DELETE', 'Users', null, 'UserID', req.body.userId);
    res.json({success:true});
});

app.post('/api/admin/reset-key', async (req, res) => {
    const user = DB.Users.find(u => u.Email.toLowerCase() === req.body.email.toLowerCase());
    if(user) {
        const { secret, qrCodeData } = await generateTOTP(user.Name);
        queueJob('UPDATE', 'Users', { AuthKey: secret }, 'UserID', user.UserID);
        res.json({ success: true, qrCode: qrCodeData, secret: secret });
    } else { res.status(404).json({ message: "User not found" }); }
});

app.post('/api/admin/create-subdivision', (req, res) => {
    const { subdivision, stations } = req.body;
    if (DB.Stations.some(s => (s.Subdivision||'').trim().toLowerCase() === subdivision.trim().toLowerCase())) return res.status(400).json({ message: "Exists" });
    queueJob('ADD', 'Stations', { Subdivision: subdivision, Stations: stations });
    res.json({ success: true });
});

app.post('/api/admin/update-stations-list', (req, res) => {
    const { subdivision, stations } = req.body;
    queueJob('UPDATE', 'Stations', { Stations: stations }, 'Subdivision', subdivision);
    const valid = stations.split(',').map(s => s.trim().toLowerCase());
    const toDel = DB.Users.filter(r => r.Subdivision === subdivision && r.Role === 'User' && !valid.includes((r.Station||'').trim().toLowerCase()));
    toDel.forEach(u => queueJob('DELETE', 'Users', null, 'UserID', u.UserID));
    res.json({ success: true, deletedUsers: toDel.length });
});

app.post('/api/admin/delete-subdivision', (req, res) => {
    const { subdivision } = req.body;
    queueJob('DELETE', 'Stations', null, 'Subdivision', subdivision);
    const toDel = DB.Users.filter(r => r.Subdivision === subdivision);
    toDel.forEach(u => queueJob('DELETE', 'Users', null, 'UserID', u.UserID));
    res.json({ success: true, deletedUsers: toDel.length });
});

app.post('/api/manager/create-group', (req, res) => {
    const { groupName, userIds, managerId } = req.body;
    const newGroup = { GroupID: uuidv4(), GroupName: groupName, CreatedBy: managerId, UserIDs: userIds.join(',') };
    queueJob('ADD', 'Groups', newGroup);
    res.json({ success: true });
});

app.post('/api/manager/delete-group', (req, res) => {
    const { groupId } = req.body;
    queueJob('DELETE', 'Groups', null, 'GroupID', groupId);
    res.json({success: true});
});

app.post('/api/manager/assign-sheet', async (req, res) => {
    const { type, targets, manualLink, sheetName, dueDate, allowNil, groupNameUsed } = req.body;
    
    const driveTask = async () => {
        try {
            const drive = google.drive({ version: 'v3', auth: serviceAccountAuth });
            const fileId = extractFileId(manualLink);
            if (fileId) {
                for (const user of targets) {
                    if (user.email) {
                        await drive.permissions.create({
                            fileId: fileId, requestBody: { role: 'writer', type: 'user', emailAddress: user.email }
                        }).catch(e => {});
                        await new Promise(r => setTimeout(r, 200)); 
                    }
                }
            }
        } catch(e) {}
    };
    driveTask(); 

    targets.forEach(user => {
        const newTask = {
            TaskID: uuidv4(), SheetLink: manualLink, SheetType: type,
            AssignedTo: user.id || user.UserID, Status: 'Pending', Date: new Date().toISOString(),
            TaskName: sheetName || `${type} Report`, DueDate: dueDate || '',
            AllowNil: allowNil ? 'TRUE' : 'FALSE', IsNil: 'FALSE', GroupName: groupNameUsed || '',
            CompletedDate: '' // Init empty
        };
        queueJob('ADD', 'Tasks', newTask);
    });
    res.json({ success: true });
});

// --- UPDATED: Save CompletedDate ---
app.post('/api/user/complete', (req, res) => {
    // Save current ISO timestamp
    const timestamp = new Date().toISOString();
    queueJob('UPDATE', 'Tasks', { Status: 'Completed', IsNil: 'FALSE', CompletedDate: timestamp }, 'TaskID', req.body.taskId);
    res.json({ success: true });
});

app.post('/api/user/submit-nil', (req, res) => {
    // Save current ISO timestamp
    const timestamp = new Date().toISOString();
    queueJob('UPDATE', 'Tasks', { Status: 'Completed', IsNil: 'TRUE', CompletedDate: timestamp }, 'TaskID', req.body.taskId);
    res.json({ success: true });
});

app.post('/api/manager/reassign', (req, res) => {
    // Reset CompletedDate to empty on reassign
    queueJob('UPDATE', 'Tasks', { Status: 'Pending', IsNil: 'FALSE', CompletedDate: '' }, 'TaskID', req.body.taskId);
    res.json({ success: true });
});

async function generateTOTP(name) {
  const secret = authenticator.generateSecret(); 
  const otpauth = authenticator.keyuri(name, 'PoliceApp', secret); 
  const qrCodeData = await QRCode.toDataURL(otpauth); 
  return { secret, qrCodeData };
}

function extractFileId(url) {
    if (!url) return null;
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}

dbReadyPromise = syncDatabase();
app.listen(PORT, () => {
    console.log(`🚀 Hybrid Server running on port ${PORT}`);
    setInterval(syncDatabase, 30 * 1000);
});