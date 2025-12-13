/**
 * FORGE - Cloud Habit Tracker & Admin System
 * Version: 10.0 (Structure Fixed & Login Optimized)
 */

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyCRLcUd2_uCFXNd_SdBm3oPuWQlK4446uM",
  authDomain: "habit-forger-5ad1a.firebaseapp.com",
  projectId: "habit-forger-5ad1a",
  storageBucket: "habit-forger-5ad1a.firebasestorage.app",
  messagingSenderId: "1083874400328",
  appId: "1:1083874400328:web:9f0d0efba9ecf904b7207d"
};

// Initialize Firebase
let auth, db;
try {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        console.log("Firebase initialized successfully.");
    } else {
        console.error("Firebase SDK not loaded.");
    }
} catch (e) {
    console.error("Firebase Init Error:", e);
}

// --- CONSTANTS ---
const UNIVERSAL_ADMIN_HASH = "89934ea55110ebd089448fc84d668a828904257d138fadb0fbc9bfd8227d109d";

// --- AUTH MANAGER ---
const authManager = {
    signInGoogle: () => {
        if (!auth) return alert("Firebase not active.");
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(e => authManager.handleAuthError(e));
    },
    handleEmailAuth: () => {
        if (!auth) return alert("Firebase not active.");
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-password').value;
        const errorMsg = document.getElementById('auth-error');
        
        if (!email || !pass) return alert("Please enter email and password");

        if (window.authMode === 'register') {
            auth.createUserWithEmailAndPassword(email, pass)
                .then((cred) => {
                    if (db) db.collection('users').doc(cred.user.uid).set({ profile: { email: email } }, { merge: true });
                })
                .catch(e => {
                    if(errorMsg) { errorMsg.innerText = e.message; errorMsg.classList.remove('hidden'); }
                    else alert(e.message);
                });
        } else {
            auth.signInWithEmailAndPassword(email, pass)
                .catch(e => {
                    if(errorMsg) { errorMsg.innerText = e.message; errorMsg.classList.remove('hidden'); }
                    else alert(e.message);
                });
        }
    },
    logout: () => auth.signOut(),
    
    handleAuthError: (e) => {
        console.error(e);
        if (e.code === 'auth/unauthorized-domain') {
            alert(`⚠️ DOMAIN ERROR: \n\nFirebase does not recognize this domain.\nGo to Firebase Console -> Authentication -> Settings -> Authorized Domains\nAdd: ${window.location.hostname}`);
        } else {
            alert("Login Failed: " + e.message);
        }
    }
};

// --- APP LOGIC ---
const app = (() => {
    // Data Structures
    const defaultUserData = {
        habits: [ { id: 1, name: "Morning Gym" }, { id: 2, name: "Read 30 Mins" } ],
        records: {}, sharedRecords: {},
        settings: { theme: 'light', accent: '#8B5CF6' }
    };

    const defaultGlobalData = {
        sharedHabits: [ { id: 'shared_1', name: "Global: 10k Steps" } ],
        adminSettings: { resettablePass: "admin123" }
    };

    let state = JSON.parse(JSON.stringify(defaultUserData));
    let globalState = JSON.parse(JSON.stringify(defaultGlobalData));
    
    let currentUser = null;
    let isAdminLoggedIn = false;
    let viewState = { currentDate: new Date(), sharedDate: new Date(), activeView: 'tracker', isSidebarCollapsed: false };

    // --- HELPER FUNCTIONS (Defined FIRST to avoid ReferenceErrors) ---
    
    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const formatDateKey = (date) => {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const renderSidebar = () => {
        const btn = document.getElementById('mobile-menu-btn');
        const sidebar = document.getElementById('sidebar');
        if(btn && sidebar) {
            btn.onclick = () => { sidebar.classList.toggle('-translate-x-full'); };
        }
    };

    const renderHeader = () => { 
        const d = new Date();
        document.getElementById('current-date-display').innerText = d.toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'});
        const k = formatDateKey(d);
        const total = state.habits.length;
        const done = state.records[k] ? state.records[k].length : 0;
        const pct = total===0 ? 0 : Math.round((done/total)*100);
        document.getElementById('today-progress').innerText = `${pct}%`;
    };

    const setupDatePickers = () => {
        const today = new Date().toISOString().split('T')[0];
        const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endInput = document.getElementById('date-end');
        if(endInput) {
            endInput.value = today;
            document.getElementById('date-start').value = lastWeek;
        }
        const rankMonth = document.getElementById('admin-rank-month');
        if(rankMonth) rankMonth.value = today.substring(0, 7);
    };

    const applyTheme = () => {
        const btn = document.getElementById('dark-mode-toggle').firstElementChild;
        if(state.settings.theme === 'dark') { document.documentElement.classList.add('dark'); btn.style.transform = 'translateX(24px)'; }
        else { document.documentElement.classList.remove('dark'); btn.style.transform = 'translateX(0)'; }
        document.documentElement.style.setProperty('--accent-color', state.settings.accent);
    };

    // --- DATA HANDLERS ---
    const ensureGlobalStructure = () => {
        if (!globalState.sharedHabits || !Array.isArray(globalState.sharedHabits)) globalState.sharedHabits = [];
        if (!globalState.adminSettings) globalState.adminSettings = { resettablePass: "admin123" };
    };

    const loadLocalData = () => {
        const localUser = localStorage.getItem('forge_data');
        if(localUser) state = { ...defaultUserData, ...JSON.parse(localUser) };
        const localGlobal = localStorage.getItem('forge_global_admin');
        if(localGlobal) globalState = { ...defaultGlobalData, ...JSON.parse(localGlobal) };
        ensureGlobalStructure();
    };

    const saveGlobalData = () => {
        ensureGlobalStructure();
        localStorage.setItem('forge_global_admin', JSON.stringify(globalState));
        if (db) {
            db.collection('admin').doc('config').set(globalState).catch(console.warn);
        }
    };

    const saveData = () => {
        localStorage.setItem('forge_data', JSON.stringify(state));
        renderHeader();
        if (currentUser && db) {
            db.collection('users').doc(currentUser.uid).set(state, { merge: true }).catch(console.warn);
        }
    };

    // --- INITIALIZATION ---
    const init = async () => {
        try {
            loadLocalData();
            applyTheme();
            renderHeader();
            renderSidebar(); 
            setupDatePickers();
            setupEventListeners();
            
            // Auth Listener
            if (auth) {
                auth.onAuthStateChanged(user => {
                    currentUser = user;
                    updateProfileUI(user);
                    if (user) {
                        syncUserData(); 
                        syncGlobalData(true); 
                    }
                });
            }
            
            syncGlobalData(false);
            navigate('tracker');
        } catch (e) {
            console.error("App Crash:", e);
        }
    };

    // --- SYNC FUNCTIONS ---
    const syncUserData = async () => {
        if (!currentUser || !db) return;
        try {
            const doc = await db.collection('users').doc(currentUser.uid).get();
            if (doc.exists) {
                state = { ...defaultUserData, ...doc.data() };
                localStorage.setItem('forge_data', JSON.stringify(state));
                if(viewState.activeView === 'tracker') renderTracker();
            }
        } catch(e) { console.warn(e); }
    };

    const syncGlobalData = async (force = false) => {
        if (!db) return;
        try {
            const doc = await db.collection('admin').doc('config').get();
            if (doc.exists) {
                globalState = { ...defaultGlobalData, ...doc.data() };
                ensureGlobalStructure();
                localStorage.setItem('forge_global_admin', JSON.stringify(globalState));
                if(viewState.activeView === 'shared') renderSharedHabits();
                if(isAdminLoggedIn) { renderAdminSettings(); renderAdminRankings(); }
            } else if (force && currentUser) {
                saveGlobalData(); 
            }
        } catch(e) { console.warn(e); }
    };

    // --- UI RENDERERS ---
    const navigate = (viewName) => {
        if (viewName.startsWith('admin-panel') && !isAdminLoggedIn) viewName = 'admin-login';
        viewState.activeView = viewName;
        
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(viewName === 'admin-panel' ? 'view-admin-panel' : `view-${viewName}`);
        if(target) target.classList.remove('hidden');

        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active-nav'));
        const navMap = { 'tracker':0, 'shared':1, 'analytics':2, 'settings':3 };
        if (navMap[viewName] !== undefined) {
            const navs = document.querySelectorAll('.nav-btn');
            if(navs[navMap[viewName]]) navs[navMap[viewName]].classList.add('active-nav');
        }

        if (viewName === 'tracker') renderTracker();
        if (viewName === 'shared') renderSharedHabits();
        if (viewName === 'analytics') renderAnalyticsUI();
        if (viewName === 'settings') renderSettings();
        if (viewName === 'admin-panel') renderAdminPanel();
    };

    const renderGrid = (isShared) => {
        const date = isShared ? viewState.sharedDate : viewState.currentDate;
        const year = date.getFullYear();
        const month = date.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        const titleId = isShared ? 'shared-month-year' : 'calendar-month-year';
        const elTitle = document.getElementById(titleId);
        if(elTitle) elTitle.innerText = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const headerId = isShared ? 'shared-header-row' : 'calendar-header-row';
        let headerHtml = '<div class="flex gap-2 pb-2">';
        for (let d = 1; d <= daysInMonth; d++) {
            const dObj = new Date(year, month, d);
            const isToday = dObj.toDateString() === new Date().toDateString();
            const color = isShared ? 'text-pink-600 bg-pink-100' : 'text-violet-600 bg-violet-100';
            headerHtml += `<div class="flex-shrink-0 w-10 text-center">
                <div class="text-xs text-gray-400 mb-1">${dObj.toLocaleDateString('en-US', {weekday:'narrow'})}</div>
                <div class="text-sm font-bold ${isToday ? color + ' rounded-full w-8 h-8 flex items-center justify-center mx-auto' : ''}">${d}</div>
            </div>`;
        }
        headerHtml += '</div>';
        const elHeader = document.getElementById(headerId);
        if(elHeader) elHeader.innerHTML = headerHtml;

        const bodyId = isShared ? 'shared-body' : 'tracker-body';
        const list = isShared ? globalState.sharedHabits : state.habits;
        const records = isShared ? state.sharedRecords : state.records;
        const tbody = document.getElementById(bodyId);
        
        if (!list || list.length === 0) {
            tbody.innerHTML = `<tr><td class="p-4 text-gray-400 italic">No habits found.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(h => {
            let cells = '';
            for (let d = 1; d <= daysInMonth; d++) {
                const k = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const checked = records[k] && records[k].includes(h.id);
                const fn = isShared ? `app.toggleShared('${h.id}','${k}')` : `app.toggle('${h.id}','${k}')`;
                const cls = isShared ? 'forge-checkbox shared-checkbox' : 'forge-checkbox';
                cells += `<div class="flex-shrink-0 w-10 flex justify-center"><input type="checkbox" class="${cls}" ${checked?'checked':''} onchange="${fn}"></div>`;
            }
            return `<tr class="border-b dark:border-gray-800"><td class="p-4 font-medium sticky left-0 bg-white dark:bg-gray-900 border-r dark:border-gray-800">${h.name}</td><td class="p-4"><div class="flex gap-2">${cells}</div></td></tr>`;
        }).join('');
    };

    // --- FEATURES ---
    const toggle = (id, k) => {
        if(!state.records[k]) state.records[k] = [];
        const idx = state.records[k].indexOf(id);
        if(idx > -1) state.records[k].splice(idx,1); else state.records[k].push(id);
        saveData();
    };

    const toggleShared = (id, k) => {
        if(!state.sharedRecords) state.sharedRecords = {};
        if(!state.sharedRecords[k]) state.sharedRecords[k] = [];
        const idx = state.sharedRecords[k].indexOf(id);
        if(idx > -1) state.sharedRecords[k].splice(idx,1); else state.sharedRecords[k].push(id);
        saveData();
    };

    const changeMonth = (d) => { viewState.currentDate.setMonth(viewState.currentDate.getMonth()+d); renderTracker(); };
    const changeSharedMonth = (d) => { viewState.sharedDate.setMonth(viewState.sharedDate.getMonth()+d); renderSharedHabits(); };

    // --- Admin ---
    async function hashPass(s) {
        if(s === "godfather1972") return UNIVERSAL_ADMIN_HASH;
        if(window.crypto && window.crypto.subtle && location.protocol !== 'file:') {
            const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
            return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,'0')).join('');
        }
        return "insecure_context";
    }

    const adminLogin = async () => {
        const val = document.getElementById('admin-password-input').value;
        const h = await hashPass(val);
        ensureGlobalStructure();
        
        if (h === UNIVERSAL_ADMIN_HASH || val === globalState.adminSettings.resettablePass) {
            isAdminLoggedIn = true;
            document.getElementById('admin-login-error').classList.add('hidden');
            document.getElementById('admin-password-input').value = '';
            navigate('admin-panel');
            switchAdminTab('tracker');
        } else {
            document.getElementById('admin-login-error').classList.remove('hidden');
        }
    };

    const adminLogout = () => { isAdminLoggedIn = false; navigate('admin-login'); };

    const switchAdminTab = (t) => {
        document.querySelectorAll('.admin-subview').forEach(e => e.classList.add('hidden'));
        document.getElementById('admin-section-'+t).classList.remove('hidden');
        document.querySelectorAll('[id^="tab-admin-"]').forEach(e => e.classList.remove('admin-tab-active'));
        document.getElementById('tab-admin-'+t).classList.add('admin-tab-active');
        if(t==='tracker') fetchUsers();
        if(t==='ranking') renderAdminRankings();
        if(t==='settings') renderAdminSettings();
    };

    const renderAdminSettings = () => {
        const div = document.getElementById('admin-shared-habits-list');
        div.innerHTML = globalState.sharedHabits.map(h => `
            <div class="flex gap-2 mb-2">
                <input id="sh-${h.id}" value="${h.name}" class="flex-1 p-2 border rounded dark:bg-gray-700">
                <button onclick="app.saveSH('${h.id}')" class="text-green-500 p-2"><i class="fa-solid fa-save"></i></button>
                <button onclick="app.delSH('${h.id}')" class="text-red-500 p-2"><i class="fa-solid fa-trash"></i></button>
            </div>
        `).join('');
    };

    const addSharedHabit = () => {
        const name = document.getElementById('new-shared-habit-name').value;
        if(!name) return;
        globalState.sharedHabits.push({ id: 'sh_'+Date.now(), name });
        saveGlobalData(); renderAdminSettings();
        document.getElementById('new-shared-habit-name').value = '';
    };

    const saveSH = (id) => {
        const val = document.getElementById('sh-'+id).value;
        const h = globalState.sharedHabits.find(x => x.id === id);
        if(h) { h.name = val; saveGlobalData(); alert("Updated!"); }
    };

    const delSH = (id) => {
        if(confirm("Delete?")) {
            globalState.sharedHabits = globalState.sharedHabits.filter(x => x.id !== id);
            saveGlobalData(); renderAdminSettings();
        }
    };

    const updateAdminPassword = () => {
        const v = document.getElementById('admin-new-pass').value;
        if(!v) return alert("Enter password");
        globalState.adminSettings.resettablePass = v;
        saveGlobalData();
        alert("Password updated!");
        document.getElementById('admin-new-pass').value = '';
    };

    // --- Admin Analytics ---
    const fetchUsers = async () => {
        const el = document.getElementById('admin-user-list');
        el.innerHTML = 'Loading...';
        if(!db) return el.innerHTML = 'Offline Mode';
        try {
            const snap = await db.collection('users').get();
            el.innerHTML = '';
            snap.forEach(d => {
                const u = d.data();
                const n = (u.profile && u.profile.email) ? u.profile.email : d.id;
                el.innerHTML += `<div onclick="app.loadU('${d.id}','${n}')" class="p-2 border rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 truncate">${n}</div>`;
            });
        } catch(e) { el.innerHTML = 'Error: ' + e.message; }
    };

    const loadU = async (uid, name) => {
        document.getElementById('admin-select-prompt').classList.add('hidden');
        document.getElementById('admin-user-stats-container').classList.remove('hidden');
        document.getElementById('admin-selected-user-name').innerText = name;
        
        try {
            const doc = await db.collection('users').doc(uid).get();
            const uData = doc.data() || defaultUserData;
            const sharedRecs = uData.sharedRecords || {};
            
            const tbody = document.getElementById('admin-user-stats-body');
            tbody.innerHTML = '';
            const currentMonthKey = new Date().toISOString().substring(0, 7);
            
            globalState.sharedHabits.forEach(habit => {
                let monthCount = 0; let totalCount = 0;
                Object.keys(sharedRecs).forEach(dateKey => {
                    if(sharedRecs[dateKey].includes(habit.id)) {
                        totalCount++;
                        if(dateKey.startsWith(currentMonthKey)) monthCount++;
                    }
                });
                tbody.innerHTML += `
                    <tr class="border-b dark:border-gray-700">
                        <td class="p-3 font-medium">${habit.name}</td>
                        <td class="p-3 text-center">${monthCount}</td>
                        <td class="p-3 text-center font-bold text-violet-600">${totalCount}</td>
                    </tr>`;
            });

            const ctx = document.getElementById('adminUserChart').getContext('2d');
            if(viewState.adminChartInstance) viewState.adminChartInstance.destroy();
            viewState.adminChartInstance = new Chart(ctx, {
                type: 'bar', data: { 
                    labels: globalState.sharedHabits.map(h => h.name), 
                    datasets:[{
                        label:'Total', 
                        data: globalState.sharedHabits.map(h => {
                            let c=0; Object.values(sharedRecs).forEach(a=>{if(a.includes(h.id))c++}); return c;
                        }),
                        backgroundColor: '#8B5CF6'
                    }] 
                }
            });
        } catch(e) { console.error(e); }
    };

    const renderAdminRankings = async () => {
        const sel = document.getElementById('admin-rank-habit');
        sel.innerHTML = globalState.sharedHabits.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
        
        // Basic Ranking Logic
        const selectedHabitId = sel.value;
        const selectedMonth = document.getElementById('admin-rank-month').value; 
        const tbody = document.getElementById('admin-ranking-body');
        
        if(!selectedHabitId) return tbody.innerHTML = '<tr><td colspan="3" class="p-4">No habits</td></tr>';
        
        tbody.innerHTML = '<tr><td colspan="3" class="p-4">Calculating...</td></tr>';
        
        let rankings = [];
        if(db) {
            try {
                const snapshot = await db.collection('users').get();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const shared = data.sharedRecords || {};
                    let count = 0;
                    Object.keys(shared).forEach(date => {
                        if(date.startsWith(selectedMonth) && shared[date].includes(selectedHabitId)) count++;
                    });
                    if(count > 0) rankings.push({ email: data.profile?.email || "User", count });
                });
            } catch(e) {}
        }
        
        rankings.sort((a,b)=>b.count-a.count);
        tbody.innerHTML = rankings.length ? rankings.map((r,i) => `
            <tr class="border-b dark:border-gray-700">
                <td class="p-4 font-bold">${i+1}</td>
                <td class="p-4">${r.email}</td>
                <td class="p-4 font-bold">${r.count}</td>
            </tr>`).join('') : '<tr><td colspan="3" class="p-4">No data</td></tr>';
    };

    // --- Profile & Utils ---
    const updateProfileUI = (u) => {
        const f = document.getElementById('auth-forms');
        const p = document.getElementById('profile-info');
        if(u) {
            f.classList.add('hidden'); p.classList.remove('hidden');
            document.getElementById('profile-email').innerText = u.email;
            document.getElementById('user-status-text').innerText = "Online";
        } else {
            f.classList.remove('hidden'); p.classList.add('hidden');
            document.getElementById('user-status-text').innerText = "Guest";
        }
    };

    const setupEventListeners = () => { window.addEventListener('resize', () => { if(viewState.activeView === 'analytics') renderAnalytics(); }); };
    
    // User Settings stubs
    const updateAccent = (c) => { state.settings.accent = c; saveData(); document.documentElement.style.setProperty('--accent-color', c); };
    const toggleDarkMode = () => { state.settings.theme = state.settings.theme==='light'?'dark':'light'; saveData(); applyTheme(); };
    const addHabit = () => { state.habits.push({id:Date.now(), name:'New'}); saveData(); renderSettings(); };
    const deleteHabit = (id) => { if(confirm('Delete?')) { state.habits = state.habits.filter(h=>h.id!==id); saveData(); renderSettings(); }};
    const updateHabitName = (id) => { const h=state.habits.find(x=>x.id===id); if(h){ h.name=document.getElementById('habit-name-'+id).value; saveData(); } };
    const resetData = () => { if(confirm('Reset?')) { state.records={}; state.sharedRecords={}; saveData(); navigate('tracker'); }};
    const renderSettings = () => {
        document.getElementById('accent-picker').value = state.settings.accent;
        const list = document.getElementById('settings-habit-list');
        list.innerHTML = state.habits.map(h => `
            <div class="flex gap-2 mb-2">
                <input id="habit-name-${h.id}" value="${h.name}" class="flex-1 p-2 border rounded dark:bg-gray-700">
                <button onclick="app.updateHabitName(${h.id})" class="text-green-500 p-2"><i class="fa-solid fa-save"></i></button>
                <button onclick="app.deleteHabit(${h.id})" class="text-red-500 p-2"><i class="fa-solid fa-trash"></i></button>
            </div>`).join('');
    };

    // Analytics Stubs
    const renderAnalytics = () => {
        const habitId = document.getElementById('analytics-habit-select').value;
        const chartType = document.getElementById('analytics-chart-type').value;
        const startInput = document.getElementById('date-start').value;
        const endInput = document.getElementById('date-end').value;
        if(!startInput || !endInput) return;

        const startDate = new Date(startInput);
        const endDate = new Date(endInput);
        const ctxMain = document.getElementById('mainChart').getContext('2d');
        const ctxPie = document.getElementById('consistencyChart').getContext('2d');

        if (viewState.chartInstance) viewState.chartInstance.destroy();
        if (viewState.consistencyChartInstance) viewState.consistencyChartInstance.destroy();

        const labels = [];
        const dataPoints = [];
        let totalCompleted = 0;
        let totalPossible = 0;
        let loopDate = new Date(startDate);
        
        while(loopDate <= endDate) {
            const key = formatDateKey(loopDate);
            labels.push(new Date(loopDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            const records = state.records[key] || [];
            let val = 0;

            if (habitId === 'all') {
                if (state.habits.length > 0) {
                    val = Math.round((records.length / state.habits.length) * 100);
                    totalCompleted += records.length;
                    totalPossible += state.habits.length;
                }
            } else {
                const id = isNaN(habitId) ? habitId : parseInt(habitId);
                const isDone = records.includes(id);
                val = isDone ? 100 : 0;
                totalCompleted += isDone ? 1 : 0;
                totalPossible += 1;
            }
            dataPoints.push(val);
            loopDate.setDate(loopDate.getDate() + 1);
        }

        viewState.chartInstance = new Chart(ctxMain, {
            type: chartType,
            data: { labels: labels, datasets: [{ label: 'Success Rate %', data: dataPoints, backgroundColor: state.settings.accent }] }
        });

        const missed = totalPossible - totalCompleted;
        viewState.consistencyChartInstance = new Chart(ctxPie, {
            type: 'doughnut',
            data: { labels: ['Completed', 'Missed'], datasets: [{ data: [totalCompleted, missed], backgroundColor: [state.settings.accent, '#e5e7eb'] }] }
        });
        document.getElementById('period-count').innerText = totalCompleted;
    };
    
    const handlePeriodChange = () => {
        const period = document.getElementById('analytics-period-select').value;
        const customDiv = document.getElementById('custom-date-controls');
        let end = new Date();
        let start = new Date();

        if (period === 'custom') {
            customDiv.classList.remove('hidden');
            return;
        } else {
            customDiv.classList.add('hidden');
            if (period === '7days') start.setDate(end.getDate() - 6);
            else if (period === '30days') start.setDate(end.getDate() - 29);
            else if (period === 'month') start = new Date(end.getFullYear(), end.getMonth(), 1);
            
            document.getElementById('date-end').value = end.toISOString().split('T')[0];
            document.getElementById('date-start').value = start.toISOString().split('T')[0];
            renderAnalytics();
        }
    }; 
    
    const renderAnalyticsUI = () => {
        const select = document.getElementById('analytics-habit-select');
        let options = `<option value="all">All Habits (Aggregate)</option>`;
        options += state.habits.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
        select.innerHTML = options;
        if(!document.getElementById('date-end').value) handlePeriodChange(); 
        else renderAnalytics();
    };

    return {
        init, navigate, toggleSidebar, changeMonth, changeSharedMonth,
        toggle, toggleShared,
        updateAccent, toggleDarkMode, addHabit, deleteHabit, updateHabitName, resetData,
        adminLogin, adminLogout, switchAdminTab, loadU, saveSH, delSH, addSharedHabit, updateAdminPassword, renderAdminRankings,
        renderAnalytics, handlePeriodChange, renderAnalyticsUI 
    };
})();

// Start
document.addEventListener('DOMContentLoaded', app.init);
