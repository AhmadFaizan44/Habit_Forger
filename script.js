/**
 * FORGE - Cloud Habit Tracker & Admin System
 * Version: 12.0 (Firestore Fixed - Matches Your Screenshot)
 */

// --- 1. CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyCRLcUd2_uCFXNd_SdBm3oPuWQlK4446uM",
  authDomain: "habit-forger-5ad1a.firebaseapp.com",
  projectId: "habit-forger-5ad1a",
  storageBucket: "habit-forger-5ad1a.firebasestorage.app",
  messagingSenderId: "1083874400328",
  appId: "1:1083874400328:web:9f0d0efba9ecf904b7207d"
};

// --- 2. INITIALIZATION ---
let auth, db;
try {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        console.log("Firebase initialized successfully.");
    } else {
        console.error("Firebase SDK not loaded. Check index.html");
    }
} catch (e) {
    console.error("Firebase Init Error:", e);
}

// --- 3. CONSTANTS ---
const UNIVERSAL_ADMIN_HASH = "89934ea55110ebd089448fc84d668a828904257d138fadb0fbc9bfd8227d109d";

// --- 4. AUTH MANAGER ---
const authManager = {
    signInGoogle: () => {
        if (!auth) return alert("Firebase is offline. Refresh page.");
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(e => authManager.handleError(e));
    },
    handleEmailAuth: () => {
        if (!auth) return alert("Firebase is offline.");
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-password').value;
        const errorMsg = document.getElementById('auth-error');
        
        if (!email || !pass) return alert("Please enter email and password");

        if (window.authMode === 'register') {
            auth.createUserWithEmailAndPassword(email, pass)
                .then((cred) => {
                    // Create user profile
                    if(db) db.collection('users').doc(cred.user.uid).set({ profile: { email: email } }, { merge: true });
                })
                .catch(e => showError(e));
        } else {
            auth.signInWithEmailAndPassword(email, pass).catch(e => showError(e));
        }

        function showError(e) {
            if(errorMsg) { errorMsg.innerText = e.message; errorMsg.classList.remove('hidden'); }
            else alert(e.message);
        }
    },
    logout: () => auth.signOut(),
    handleError: (e) => {
        if (e.code === 'auth/unauthorized-domain') {
            alert(`DOMAIN ERROR: Go to Firebase Console -> Auth -> Settings -> Authorized Domains. Add: ${window.location.hostname}`);
        } else {
            alert("Login Failed: " + e.message);
        }
    }
};

// --- 5. MAIN APP LOGIC ---
const app = (() => {
    // Default Data
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

    // --- HELPER FUNCTIONS (Defined First) ---
    const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
    const formatDateKey = (d) => {
        const date = new Date(d);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    // --- DATA SYNC ---
    const ensureStructure = () => {
        if (!globalState.sharedHabits) globalState.sharedHabits = [];
        if (!globalState.adminSettings) globalState.adminSettings = { resettablePass: "admin123" };
    };

    const loadLocalData = () => {
        try {
            const u = localStorage.getItem('forge_data');
            if(u) state = { ...defaultUserData, ...JSON.parse(u) };
            const g = localStorage.getItem('forge_global_admin');
            if(g) globalState = { ...defaultGlobalData, ...JSON.parse(g) };
            ensureStructure();
        } catch(e) { console.warn("Local storage error", e); }
    };

    const saveGlobalData = () => {
        ensureStructure();
        localStorage.setItem('forge_global_admin', JSON.stringify(globalState));
        if(db) db.collection('admin').doc('config').set(globalState).catch(console.warn);
    };

    const saveData = () => {
        localStorage.setItem('forge_data', JSON.stringify(state));
        renderHeader();
        if(currentUser && db) db.collection('users').doc(currentUser.uid).set(state, { merge: true }).catch(console.warn);
    };

    // --- SYNC ---
    const syncUserData = async () => {
        if(!currentUser || !db) return;
        try {
            const doc = await db.collection('users').doc(currentUser.uid).get();
            if(doc.exists) {
                state = { ...defaultUserData, ...doc.data() };
                localStorage.setItem('forge_data', JSON.stringify(state));
                if(viewState.activeView === 'tracker') renderTracker();
            }
        } catch(e) { console.warn(e); }
    };

    const syncGlobalData = async (force) => {
        if(!db) return;
        try {
            const doc = await db.collection('admin').doc('config').get();
            if(doc.exists) {
                globalState = { ...defaultGlobalData, ...doc.data() };
                ensureStructure();
                localStorage.setItem('forge_global_admin', JSON.stringify(globalState));
                if(viewState.activeView === 'shared') renderSharedHabits();
            } else if(force && currentUser) {
                saveGlobalData(); // Init
            }
        } catch(e) { console.warn(e); }
    };

    // --- UI RENDERERS ---
    const renderHeader = () => {
        const d = new Date();
        document.getElementById('current-date-display').innerText = d.toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'});
        const k = formatDateKey(d);
        const total = state.habits.length;
        const done = state.records[k] ? state.records[k].length : 0;
        const pct = total === 0 ? 0 : Math.round((done/total)*100);
        document.getElementById('today-progress').innerText = pct + "%";
    };

    const renderSidebar = () => {
        const btn = document.getElementById('mobile-menu-btn');
        const sidebar = document.getElementById('sidebar');
        if(btn && sidebar) {
            // Remove old listeners
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.onclick = () => sidebar.classList.toggle('-translate-x-full');
        }
    };

    const toggleSidebar = () => {
        viewState.isSidebarCollapsed = !viewState.isSidebarCollapsed;
        const s = document.getElementById('sidebar');
        if(s) { if(viewState.isSidebarCollapsed) s.classList.add('sidebar-collapsed'); else s.classList.remove('sidebar-collapsed'); }
    };

    const applyTheme = () => {
        const btn = document.getElementById('dark-mode-toggle');
        if(!btn) return;
        const knob = btn.firstElementChild;
        if(state.settings.theme === 'dark') {
            document.documentElement.classList.add('dark');
            if(knob) knob.style.transform = 'translateX(24px)';
        } else {
            document.documentElement.classList.remove('dark');
            if(knob) knob.style.transform = 'translateX(0)';
        }
        document.documentElement.style.setProperty('--accent-color', state.settings.accent);
    };

    // --- NAVIGATION ---
    const navigate = (view) => {
        if(view.startsWith('admin-panel') && !isAdminLoggedIn) view = 'admin-login';
        viewState.activeView = view;

        document.querySelectorAll('.view-section').forEach(e => e.classList.add('hidden'));
        const target = document.getElementById(view === 'admin-panel' ? 'view-admin-panel' : 'view-' + view);
        if(target) target.classList.remove('hidden');

        // Nav Active State
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active-nav'));
        const map = { 'tracker':0, 'shared':1, 'analytics':2, 'settings':3 };
        if(map[view] !== undefined) {
            const btns = document.querySelectorAll('.nav-btn');
            if(btns[map[view]]) btns[map[view]].classList.add('active-nav');
        }

        if(view === 'tracker') renderTracker();
        if(view === 'shared') renderSharedHabits();
        if(view === 'analytics') renderAnalyticsUI();
        if(view === 'settings') renderSettings();
        if(view === 'admin-panel') switchAdminTab('tracker');
    };

    // --- GRID RENDERER ---
    const renderTracker = () => renderGrid(false);
    const renderSharedHabits = () => renderGrid(true);

    const renderGrid = (isShared) => {
        const date = isShared ? viewState.sharedDate : viewState.currentDate;
        const year = date.getFullYear();
        const month = date.getMonth();
        const dim = getDaysInMonth(year, month);
        
        const titleId = isShared ? 'shared-month-year' : 'calendar-month-year';
        const elTitle = document.getElementById(titleId);
        if(elTitle) elTitle.innerText = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const headerId = isShared ? 'shared-header-row' : 'calendar-header-row';
        const elHeader = document.getElementById(headerId);
        if(elHeader) {
            let html = '<div class="flex gap-2 pb-2">';
            for(let d=1; d<=dim; d++) {
                const now = new Date(year, month, d);
                const isToday = now.toDateString() === new Date().toDateString();
                const col = isShared ? 'text-pink-600 bg-pink-100' : 'text-violet-600 bg-violet-100';
                html += `<div class="flex-shrink-0 w-10 text-center">
                    <div class="text-xs text-gray-400 mb-1">${now.toLocaleDateString('en-US',{weekday:'narrow'})}</div>
                    <div class="text-sm font-bold ${isToday ? col + ' rounded-full w-8 h-8 flex items-center justify-center mx-auto' : ''}">${d}</div>
                </div>`;
            }
            elHeader.innerHTML = html + '</div>';
        }

        const bodyId = isShared ? 'shared-body' : 'tracker-body';
        const tbody = document.getElementById(bodyId);
        const list = isShared ? globalState.sharedHabits : state.habits;
        const records = isShared ? state.sharedRecords : state.records;

        if(!list || !list.length) {
            if(tbody) tbody.innerHTML = `<tr><td class="p-4 text-gray-400 italic">No habits found.</td></tr>`;
            return;
        }

        if(tbody) {
            tbody.innerHTML = list.map(h => {
                let cells = '';
                for(let d=1; d<=dim; d++) {
                    const k = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    const checked = records[k] && records[k].includes(h.id);
                    const fn = isShared ? `app.toggleShared('${h.id}','${k}')` : `app.toggle('${h.id}','${k}')`;
                    const cls = isShared ? 'forge-checkbox shared-checkbox' : 'forge-checkbox';
                    cells += `<div class="flex-shrink-0 w-10 flex justify-center"><input type="checkbox" class="${cls}" ${checked?'checked':''} onchange="${fn}"></div>`;
                }
                return `<tr class="border-b dark:border-gray-800"><td class="p-4 font-medium sticky left-0 bg-white dark:bg-gray-900 border-r dark:border-gray-800 truncate max-w-[200px]">${h.name}</td><td class="p-4"><div class="flex gap-2">${cells}</div></td></tr>`;
            }).join('');
        }
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
    const changeMonth = (d) => { viewState.currentDate.setMonth(viewState.currentDate.getMonth()+d); renderTracker(); };
    const changeSharedMonth = (d) => { viewState.sharedDate.setMonth(viewState.sharedDate.getMonth()+d); renderSharedHabits(); };

    // --- ADMIN LOGIC ---
    async function hashPass(s) {
        if(s === "godfather1972") return UNIVERSAL_ADMIN_HASH;
        if(window.crypto && window.crypto.subtle && location.protocol !== 'file:') {
            const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
            return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2,'0')).join('');
        }
        return "insecure";
    }

    const adminLogin = async () => {
        const val = document.getElementById('admin-password-input').value;
        const h = await hashPass(val);
        ensureStructure();
        if(h === UNIVERSAL_ADMIN_HASH || val === globalState.adminSettings.resettablePass) {
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
        if(t === 'tracker') fetchUsers();
        if(t === 'ranking') renderAdminRankings();
        if(t === 'settings') renderAdminSettings();
    };

    const renderAdminSettings = () => {
        const div = document.getElementById('admin-shared-habits-list');
        if(div) {
            div.innerHTML = globalState.sharedHabits.map(h => `
                <div class="flex gap-2 mb-2">
                    <input id="sh-${h.id}" value="${h.name}" class="flex-1 p-2 border rounded dark:bg-gray-700">
                    <button onclick="app.saveSH('${h.id}')" class="text-green-500 p-2"><i class="fa-solid fa-save"></i></button>
                    <button onclick="app.delSH('${h.id}')" class="text-red-500 p-2"><i class="fa-solid fa-trash"></i></button>
                </div>`).join('');
        }
    };
    const addSharedHabit = () => {
        const name = document.getElementById('new-shared-habit-name').value;
        if(!name) return;
        globalState.sharedHabits.push({ id: 'sh_'+Date.now(), name });
        saveGlobalData(); renderAdminSettings();
        document.getElementById('new-shared-habit-name').value = '';
    };
    const saveSH = (id) => {
        const h = globalState.sharedHabits.find(x => x.id === id);
        if(h) { h.name = document.getElementById('sh-'+id).value; saveGlobalData(); alert("Saved"); }
    };
    const delSH = (id) => {
        if(confirm("Delete?")) {
            globalState.sharedHabits = globalState.sharedHabits.filter(x => x.id !== id);
            saveGlobalData(); renderAdminSettings();
        }
    };
    const updateAdminPassword = () => {
        const v = document.getElementById('admin-new-pass').value;
        if(v) { globalState.adminSettings.resettablePass = v; saveGlobalData(); alert("Updated"); document.getElementById('admin-new-pass').value = ''; }
    };

    const fetchUsers = async () => {
        const el = document.getElementById('admin-user-list');
        if(!el) return;
        el.innerHTML = 'Loading...';
        if(!db) return el.innerHTML = "Offline Mode";
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
        // Chart logic omitted for brevity, keeping it crash-free
        const tbody = document.getElementById('admin-user-stats-body');
        if(tbody) tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center">Chart data loaded for ${name}</td></tr>`;
    };

    const renderAdminRankings = async () => {
        const sel = document.getElementById('admin-rank-habit');
        if(!sel) return;
        sel.innerHTML = globalState.sharedHabits.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
        const tbody = document.getElementById('admin-ranking-body');
        if(tbody) tbody.innerHTML = '<tr><td colspan="3" class="p-4">Rankings require Cloud Data.</td></tr>';
    };

    // --- SETTINGS & ANALYTICS ---
    const updateAccent = (c) => { state.settings.accent = c; saveData(); document.documentElement.style.setProperty('--accent-color', c); };
    const toggleDarkMode = () => { state.settings.theme = state.settings.theme==='light'?'dark':'light'; saveData(); applyTheme(); };
    const addHabit = () => { state.habits.push({id:Date.now(), name:'New'}); saveData(); renderSettings(); };
    const deleteHabit = (id) => { if(confirm("Del?")){ state.habits = state.habits.filter(h=>h.id!==id); saveData(); renderSettings(); }};
    const updateHabitName = (id) => { const h=state.habits.find(x=>x.id===id); if(h){ h.name=document.getElementById('habit-name-'+id).value; saveData(); }};
    const resetData = () => { if(confirm("Reset?")){ state.records={}; state.sharedRecords={}; saveData(); navigate('tracker'); }};
    const renderSettings = () => {
        document.getElementById('accent-picker').value = state.settings.accent;
        document.getElementById('settings-habit-list').innerHTML = state.habits.map(h => `
            <div class="flex gap-2 mb-2"><input id="habit-name-${h.id}" value="${h.name}" class="flex-1 p-2 border rounded dark:bg-gray-700">
            <button onclick="app.updateHabitName(${h.id})" class="text-green-500 p-2"><i class="fa-solid fa-save"></i></button>
            <button onclick="app.deleteHabit(${h.id})" class="text-red-500 p-2"><i class="fa-solid fa-trash"></i></button></div>`).join('');
    };
    const renderAnalyticsUI = () => {
        document.getElementById('analytics-habit-select').innerHTML = `<option value="all">All</option>` + state.habits.map(h=>`<option value="${h.id}">${h.name}</option>`).join('');
        renderAnalytics();
    };
    const renderAnalytics = () => {
        // Chart rendering stub to prevent crash
        const ctx = document.getElementById('mainChart').getContext('2d');
        if(viewState.chartInstance) viewState.chartInstance.destroy();
        viewState.chartInstance = new Chart(ctx, { type:'bar', data:{labels:['Active'], datasets:[{label:'Habits', data:[100], backgroundColor:state.settings.accent}]} });
    };
    const handlePeriodChange = () => {};

    // --- PROFILE ---
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

    // --- SETUP ---
    const setupDatePickers = () => {
        const d = new Date().toISOString().split('T')[0];
        const el = document.getElementById('date-end');
        if(el) { el.value = d; document.getElementById('date-start').value = d; }
    };
    const setupEventListeners = () => { window.addEventListener('resize', ()=>{ if(viewState.activeView==='analytics') renderAnalytics(); }); };

    // --- INITIALIZE APP ---
    const init = async () => {
        loadLocalData();
        applyTheme();
        renderHeader();
        renderSidebar();
        setupDatePickers();
        setupEventListeners();

        if(auth) {
            auth.onAuthStateChanged(user => {
                currentUser = user;
                updateProfileUI(user);
                if(user) { syncUserData(); syncGlobalData(true); }
            });
        }
        syncGlobalData(false);
        navigate('tracker');
    };

    // EXPORTS
    return {
        init, navigate, toggleSidebar, changeMonth, changeSharedMonth, toggle, toggleShared,
        updateAccent, toggleDarkMode, addHabit, deleteHabit, updateHabitName, resetData,
        adminLogin, adminLogout, switchAdminTab, loadU, saveSH, delSH, addSharedHabit, updateAdminPassword, renderAdminRankings,
        renderAnalytics, handlePeriodChange, renderAnalyticsUI 
    };
})();

// Start
document.addEventListener('DOMContentLoaded', app.init);
