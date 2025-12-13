/**
 * FORGE - Cloud Habit Tracker
 * Version: 20.0 (Global Scoping Fix - Solves "Loading..." Hang)
 */

// --- 1. GLOBAL HELPER FUNCTIONS (Moved to top to prevent ReferenceErrors) ---
function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function formatDateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- 2. FIREBASE CONFIGURATION (Old Keys: forge-habit-tracker-45a37) ---
const firebaseConfig = {
    apiKey: "AIzaSyCYuWCSbCIRInMe0RVHJ8q3CR8tNJeviC4",
    authDomain: "forge-habit-tracker-45a37.firebaseapp.com",
    projectId: "forge-habit-tracker-45a37",
    storageBucket: "forge-habit-tracker-45a37.firebasestorage.app",
    messagingSenderId: "157279686748",
    appId: "1:157279686748:web:fbea1f594138ef3b919699"
};

// --- 3. INITIALIZE FIREBASE ---
let auth, db;
try {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        console.log("Firebase initialized.");
    } else {
        console.error("Firebase SDK not loaded in HTML.");
    }
} catch (e) {
    console.error("Firebase Init Error:", e);
}

// --- 4. AUTH MANAGER (Login Logic) ---
const authManager = {
    signInGoogle: () => {
        if (!auth) return alert("Firebase not active. Refresh page.");
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(e => {
            console.error(e);
            if (e.code === 'auth/unauthorized-domain') {
                alert(`DOMAIN ERROR: Go to Firebase Console (forge-habit-tracker-45a37) -> Authentication -> Settings -> Authorized Domains.\nAdd: ${window.location.hostname}`);
            } else {
                alert("Login Failed: " + e.message);
            }
        });
    },
    handleEmailAuth: () => {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-password').value;
        if (!email || !pass) return alert("Please enter credentials");

        if (window.authMode === 'register') {
            auth.createUserWithEmailAndPassword(email, pass)
                .then((cred) => {
                    if (db) db.collection('users').doc(cred.user.uid).set({ profile: { email: email } }, { merge: true });
                })
                .catch(e => alert(e.message));
        } else {
            auth.signInWithEmailAndPassword(email, pass).catch(e => alert(e.message));
        }
    },
    logout: () => auth.signOut()
};

// --- 5. MAIN APP LOGIC ---
const app = (() => {
    // Default Data
    const defaultData = {
        habits: [ { id: 1, name: "Morning Gym" }, { id: 2, name: "Read 30 Mins" }, { id: 3, name: "Drink 2L Water" } ],
        records: {}, sharedRecords: {},
        settings: { theme: 'light', accent: '#8B5CF6' }
    };
    const defaultGlobal = {
        sharedHabits: [ { id: 's1', name: "Global: 10k Steps" } ],
        adminSettings: { resettablePass: "admin123" }
    };

    let state = JSON.parse(JSON.stringify(defaultData));
    let globalState = JSON.parse(JSON.stringify(defaultGlobal));
    let currentUser = null;
    let isAdminLoggedIn = false;
    let viewState = { activeView: 'tracker', currentDate: new Date(), sharedDate: new Date(), isSidebarCollapsed: false };

    // --- UI RENDERERS (Defined before Init) ---
    const renderHeader = () => {
        const d = new Date();
        const el = document.getElementById('current-date-display');
        if(el) el.innerText = d.toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'});
        
        // Safe calculation
        const k = formatDateKey(d);
        const total = state.habits ? state.habits.length : 0;
        const done = (state.records && state.records[k]) ? state.records[k].length : 0;
        const pct = total === 0 ? 0 : Math.round((done/total)*100);
        
        const prog = document.getElementById('today-progress');
        if(prog) prog.innerText = pct + "%";
    };

    const renderGrid = (isShared) => {
        const targetDate = isShared ? viewState.sharedDate : viewState.currentDate;
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        
        const titleId = isShared ? 'shared-month-year' : 'calendar-month-year';
        const elTitle = document.getElementById(titleId);
        if(elTitle) elTitle.innerText = targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const headerId = isShared ? 'shared-header-row' : 'calendar-header-row';
        const elHeader = document.getElementById(headerId);
        if (elHeader) {
            let html = '<div class="flex gap-2 pb-2">';
            for (let d = 1; d <= daysInMonth; d++) {
                const dayDate = new Date(year, month, d);
                const isToday = dayDate.toDateString() === new Date().toDateString();
                const color = isShared ? 'text-pink-600 bg-pink-100' : 'text-violet-600 bg-violet-100';
                html += `<div class="flex-shrink-0 w-10 text-center">
                    <div class="text-xs text-gray-400 mb-1">${dayDate.toLocaleDateString('en-US',{weekday:'narrow'})}</div>
                    <div class="text-sm font-bold ${isToday ? color + ' rounded-full w-8 h-8 flex items-center justify-center mx-auto' : ''}">${d}</div>
                </div>`;
            }
            elHeader.innerHTML = html + '</div>';
        }

        const bodyId = isShared ? 'shared-body' : 'tracker-body';
        const tbody = document.getElementById(bodyId);
        const list = isShared ? globalState.sharedHabits : state.habits;
        const records = isShared ? state.sharedRecords : state.records;

        if (tbody) {
            if (!list || list.length === 0) {
                tbody.innerHTML = `<tr><td class="p-4 text-gray-400 italic">No habits found.</td></tr>`;
            } else {
                tbody.innerHTML = list.map(h => {
                    let cells = '';
                    for (let d = 1; d <= daysInMonth; d++) {
                        const k = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                        const isChecked = records[k] && records[k].includes(h.id);
                        const fn = isShared ? `app.toggleShared('${h.id}','${k}')` : `app.toggle('${h.id}','${k}')`;
                        const cls = isShared ? 'forge-checkbox shared-checkbox' : 'forge-checkbox';
                        cells += `<div class="flex-shrink-0 w-10 flex justify-center"><input type="checkbox" class="${cls}" ${isChecked?'checked':''} onchange="${fn}"></div>`;
                    }
                    return `<tr class="border-b dark:border-gray-800"><td class="p-4 font-medium sticky left-0 bg-white dark:bg-gray-900 border-r dark:border-gray-800 truncate max-w-[200px]">${h.name}</td><td class="p-4"><div class="flex gap-2">${cells}</div></td></tr>`;
                }).join('');
            }
        }
    };

    // --- INITIALIZATION ---
    const init = () => {
        console.log("🚀 App Launching...");
        
        // 1. Force UI Render FIRST (Prevents "Loading..." Loop)
        loadLocalData();
        applyTheme();
        renderHeader();
        renderGrid(false); 
        setupUI();

        // 2. Setup Auth Listener
        if (auth) {
            auth.onAuthStateChanged(user => {
                currentUser = user;
                updateProfileUI(user);
                if (user) {
                    console.log("User detected. Syncing...");
                    syncUserData();
                    syncGlobalData(true);
                }
            });
        }
        
        // 3. Initial Navigation
        navigate('tracker');
    };

    // --- DATA HANDLING ---
    const loadLocalData = () => {
        try {
            const u = localStorage.getItem('forge_data');
            if(u) state = { ...defaultData, ...JSON.parse(u) };
            const g = localStorage.getItem('forge_global_admin');
            if(g) globalState = { ...defaultGlobal, ...JSON.parse(g) };
        } catch(e) { console.warn("Local Data reset"); }
    };

    const saveData = () => {
        localStorage.setItem('forge_data', JSON.stringify(state));
        renderHeader();
        if (currentUser && db) db.collection('users').doc(currentUser.uid).set(state, { merge: true }).catch(console.warn);
    };

    const saveGlobalData = () => {
        localStorage.setItem('forge_global_admin', JSON.stringify(globalState));
        if (db) db.collection('admin').doc('config').set(globalState).catch(console.warn);
    };

    const syncUserData = async () => {
        if (!currentUser || !db) return;
        try {
            const doc = await db.collection('users').doc(currentUser.uid).get();
            if (doc.exists) {
                state = { ...defaultData, ...doc.data() };
                localStorage.setItem('forge_data', JSON.stringify(state));
                if(viewState.activeView === 'tracker') renderGrid(false);
            }
        } catch(e) { console.warn("Sync Error", e); }
    };

    const syncGlobalData = async (force) => {
        if (!db) return;
        try {
            const doc = await db.collection('admin').doc('config').get();
            if (doc.exists) {
                globalState = { ...defaultGlobal, ...doc.data() };
                localStorage.setItem('forge_global_admin', JSON.stringify(globalState));
                if(viewState.activeView === 'shared') renderGrid(true);
            } else if (force && currentUser) {
                saveGlobalData(); 
            }
        } catch(e) { console.warn("Global Sync Error", e); }
    };

    // --- NAVIGATION ---
    const navigate = (v) => {
        if (v.startsWith('admin-panel') && !isAdminLoggedIn) v = 'admin-login';
        viewState.activeView = v;
        
        document.querySelectorAll('.view-section').forEach(e => e.classList.add('hidden'));
        const t = document.getElementById(v === 'admin-panel' ? 'view-admin-panel' : `view-${v}`);
        if(t) t.classList.remove('hidden');

        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active-nav'));
        const map = { 'tracker':0, 'shared':1, 'analytics':2, 'settings':3 };
        if (map[v] !== undefined) {
            const navs = document.querySelectorAll('.nav-btn');
            if(navs[map[v]]) navs[map[v]].classList.add('active-nav');
        }

        if (v === 'tracker') renderGrid(false);
        if (v === 'shared') renderGrid(true);
        if (v === 'analytics') renderAnalyticsUI();
        if (v === 'settings') renderSettings();
        if (v === 'admin-panel') switchAdminTab('tracker');
    };

    // --- UI HELPERS ---
    const setupUI = () => {
        const btn = document.getElementById('mobile-menu-btn');
        const sidebar = document.getElementById('sidebar');
        if (btn && sidebar) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.onclick = () => sidebar.classList.toggle('-translate-x-full');
        }
        
        const d = new Date().toISOString().split('T')[0];
        const de = document.getElementById('date-end');
        if(de) { de.value = d; document.getElementById('date-start').value = d; }
        
        window.addEventListener('resize', ()=>{ if(viewState.activeView==='analytics') renderAnalytics(); });
    };

    const toggleSidebar = () => {
        const s = document.getElementById('sidebar');
        if(s) s.classList.toggle('sidebar-collapsed');
    };

    const applyTheme = () => {
        const btn = document.getElementById('dark-mode-toggle');
        if(!btn) return;
        const knob = btn.firstElementChild;
        if(state.settings.theme === 'dark') {
            document.documentElement.classList.add('dark');
            knob.style.transform = 'translateX(24px)';
        } else {
            document.documentElement.classList.remove('dark');
            knob.style.transform = 'translateX(0)';
        }
        document.documentElement.style.setProperty('--accent-color', state.settings.accent);
    };

    // --- ACTIONS ---
    const toggle = (id, k) => {
        if(!state.records[k]) state.records[k] = [];
        const i = state.records[k].indexOf(id);
        if(i > -1) state.records[k].splice(i,1); else state.records[k].push(id);
        saveData();
    };
    const toggleShared = (id, k) => {
        if(!state.sharedRecords) state.sharedRecords = {};
        if(!state.sharedRecords[k]) state.sharedRecords[k] = [];
        const i = state.sharedRecords[k].indexOf(id);
        if(i > -1) state.sharedRecords[k].splice(i,1); else state.sharedRecords[k].push(id);
        saveData();
    };
    const changeMonth = (d) => { viewState.currentDate.setMonth(viewState.currentDate.getMonth()+d); renderGrid(false); };
    const changeSharedMonth = (d) => { viewState.sharedDate.setMonth(viewState.sharedDate.getMonth()+d); renderGrid(true); };

    // --- ADMIN ---
    const adminLogin = async () => {
        const val = document.getElementById('admin-password-input').value;
        const h = "89934ea55110ebd089448fc84d668a828904257d138fadb0fbc9bfd8227d109d";
        // Local check mostly, since crypto can be flaky on non-https local
        let inputHash = "insecure"; 
        if(window.crypto && window.crypto.subtle && location.protocol !== 'file:') {
             const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(val));
             inputHash = Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
        }

        if(val === "godfather1972" || inputHash === h || val === globalState.adminSettings.resettablePass) {
            isAdminLoggedIn = true;
            document.getElementById('admin-login-error').classList.add('hidden');
            document.getElementById('admin-password-input').value = '';
            navigate('admin-panel');
        } else {
            document.getElementById('admin-login-error').classList.remove('hidden');
        }
    };
    
    const adminLogout = () => { isAdminLoggedIn = false; navigate('admin-login'); };
    const switchAdminTab = (t) => {
        document.querySelectorAll('.admin-subview').forEach(e => e.classList.add('hidden'));
        document.getElementById('admin-section-'+t).classList.remove('hidden');
        if(t==='tracker') fetchUsers();
        if(t==='ranking') renderAdminRankings();
        if(t==='settings') renderAdminSettings();
    };
    const renderAdminSettings = () => {
        document.getElementById('admin-shared-habits-list').innerHTML = globalState.sharedHabits.map(h => `
            <div class="flex gap-2 mb-2"><input id="sh-${h.id}" value="${h.name}" class="flex-1 p-2 border rounded dark:bg-gray-700">
            <button onclick="app.saveSH('${h.id}')" class="text-green-500 p-2"><i class="fa-solid fa-save"></i></button>
            <button onclick="app.delSH('${h.id}')" class="text-red-500 p-2"><i class="fa-solid fa-trash"></i></button></div>`).join('');
    };
    const addSharedHabit = () => {
        const name = document.getElementById('new-shared-habit-name').value;
        if(!name) return;
        globalState.sharedHabits.push({ id: 'sh_'+Date.now(), name });
        saveGlobalData(); renderAdminSettings();
        document.getElementById('new-shared-habit-name').value = '';
    };
    const saveSH = (id) => { const h=globalState.sharedHabits.find(x=>x.id===id); if(h){ h.name=document.getElementById('sh-'+id).value; saveGlobalData(); alert("Saved"); }};
    const delSH = (id) => { if(confirm("Del?")){ globalState.sharedHabits=globalState.sharedHabits.filter(x=>x.id!==id); saveGlobalData(); renderAdminSettings(); }};
    const updateAdminPassword = () => { const v=document.getElementById('admin-new-pass').value; if(v){ globalState.adminSettings.resettablePass=v; saveGlobalData(); alert("Updated"); }};

    const fetchUsers = async () => {
        const el = document.getElementById('admin-user-list');
        el.innerHTML = 'Loading...';
        if(!db) return el.innerHTML = "Offline";
        try {
            const snap = await db.collection('users').get();
            el.innerHTML = '';
            snap.forEach(d => {
                const u = d.data();
                const n = (u.profile && u.profile.email) ? u.profile.email : d.id;
                el.innerHTML += `<div onclick="app.loadU('${d.id}','${n}')" class="p-2 border rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 truncate">${n}</div>`;
            });
        } catch(e) { el.innerHTML = "Error fetching users."; }
    };
    const loadU = async (uid, name) => {
        document.getElementById('admin-select-prompt').classList.add('hidden');
        document.getElementById('admin-user-stats-container').classList.remove('hidden');
        document.getElementById('admin-selected-user-name').innerText = name;
        try {
            const doc = await db.collection('users').doc(uid).get();
            const uData = doc.data() || defaultData;
            const sharedRecs = uData.sharedRecords || {};
            const tbody = document.getElementById('admin-user-stats-body');
            tbody.innerHTML = '';
            const cm = new Date().toISOString().substring(0, 7);
            globalState.sharedHabits.forEach(h => {
                let mc=0, tc=0;
                Object.keys(sharedRecs).forEach(k => { if(sharedRecs[k].includes(h.id)) { tc++; if(k.startsWith(cm)) mc++; } });
                tbody.innerHTML += `<tr class="border-b dark:border-gray-700"><td class="p-3 font-medium">${h.name}</td><td class="p-3 text-center">${mc}</td><td class="p-3 text-center font-bold text-violet-600">${tc}</td></tr>`;
            });
            const ctx = document.getElementById('adminUserChart').getContext('2d');
            if(viewState.adminChartInstance) viewState.adminChartInstance.destroy();
            viewState.adminChartInstance = new Chart(ctx, { type:'bar', data:{labels:globalState.sharedHabits.map(h=>h.name), datasets:[{label:'Total', data:globalState.sharedHabits.map(h=>{ let c=0; Object.values(sharedRecs).forEach(a=>{if(a.includes(h.id))c++}); return c; }), backgroundColor:'#8B5CF6'}]} });
        } catch(e) {}
    };
    const renderAdminRankings = async () => {
        document.getElementById('admin-rank-habit').innerHTML = globalState.sharedHabits.map(h=>`<option value="${h.id}">${h.name}</option>`).join('');
        const hid = document.getElementById('admin-rank-habit').value;
        const m = document.getElementById('admin-rank-month').value;
        const tb = document.getElementById('admin-ranking-body');
        if(!hid) return tb.innerHTML = '<tr><td colspan="3" class="p-4">No habits</td></tr>';
        tb.innerHTML = '<tr><td colspan="3" class="p-4">Loading...</td></tr>';
        if(db) {
            try {
                const snap = await db.collection('users').get();
                let ranks = [];
                snap.forEach(d => {
                    const u = d.data(); const sr = u.sharedRecords||{}; let c=0;
                    Object.keys(sr).forEach(k=>{ if(k.startsWith(m) && sr[k].includes(hid)) c++; });
                    if(c>0) ranks.push({email:u.profile?.email||"User", count:c});
                });
                ranks.sort((a,b)=>b.count-a.count);
                tb.innerHTML = ranks.length ? ranks.map((r,i)=>`<tr class="border-b dark:border-gray-700"><td class="p-4 font-bold">${i+1}</td><td class="p-4">${r.email}</td><td class="p-4 font-bold">${r.count}</td></tr>`).join('') : '<tr><td colspan="3" class="p-4">No data</td></tr>';
            } catch(e) {}
        }
    };

    // --- OTHER ---
    const updateProfileUI = (u) => {
        const f = document.getElementById('auth-forms'); const p = document.getElementById('profile-info');
        if(u) { f.classList.add('hidden'); p.classList.remove('hidden'); document.getElementById('profile-email').innerText = u.email; document.getElementById('user-status-text').innerText = "Online"; }
        else { f.classList.remove('hidden'); p.classList.add('hidden'); document.getElementById('user-status-text').innerText = "Guest"; }
    };
    
    // User Settings
    const updateAccent = (c) => { state.settings.accent=c; saveData(); document.documentElement.style.setProperty('--accent-color',c); };
    const toggleDarkMode = () => { state.settings.theme = state.settings.theme==='light'?'dark':'light'; saveData(); applyTheme(); };
    const addHabit = () => { state.habits.push({id:Date.now(), name:'New'}); saveData(); renderSettings(); };
    const deleteHabit = (id) => { if(confirm("Del?")){ state.habits=state.habits.filter(h=>h.id!==id); saveData(); renderSettings(); }};
    const updateHabitName = (id) => { const h=state.habits.find(x=>x.id===id); if(h){ h.name=document.getElementById('habit-name-'+id).value; saveData(); }};
    const resetData = () => { if(confirm("Reset?")){ state.records={}; state.sharedRecords={}; saveData(); navigate('tracker'); }};
    const renderSettings = () => {
        document.getElementById('accent-picker').value = state.settings.accent;
        document.getElementById('settings-habit-list').innerHTML = state.habits.map(h => `<div class="flex gap-2 mb-2"><input id="habit-name-${h.id}" value="${h.name}" class="flex-1 p-2 border rounded dark:bg-gray-700"><button onclick="app.updateHabitName(${h.id})" class="text-green-500 p-2"><i class="fa-solid fa-save"></i></button><button onclick="app.deleteHabit(${h.id})" class="text-red-500 p-2"><i class="fa-solid fa-trash"></i></button></div>`).join('');
    };
    const renderAnalyticsUI = () => {
        document.getElementById('analytics-habit-select').innerHTML = `<option value="all">All</option>` + state.habits.map(h=>`<option value="${h.id}">${h.name}</option>`).join('');
        renderAnalytics();
    };
    const renderAnalytics = () => {
        const ctx = document.getElementById('mainChart').getContext('2d');
        if(viewState.chartInstance) viewState.chartInstance.destroy();
        viewState.chartInstance = new Chart(ctx, { type:'bar', data:{labels:['Active'], datasets:[{label:'Habits', data:[100], backgroundColor:state.settings.accent}]} });
    };
    const handlePeriodChange = () => {};

    return {
        init, navigate, toggleSidebar, changeMonth, changeSharedMonth, toggle:toggle, toggleShared:toggleShared, toggleHabit:toggle, toggleSharedHabit:toggleShared,
        updateAccent, toggleDarkMode, addHabit, deleteHabit, updateHabitName, resetData,
        adminLogin, adminLogout, switchAdminTab, loadU, saveSH, delSH, addSharedHabit, updateAdminPassword, renderAdminRankings,
        renderAnalytics, handlePeriodChange, renderAnalyticsUI 
    };
})();

document.addEventListener('DOMContentLoaded', app.init);
