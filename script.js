/**
 * FORGE - Cloud Habit Tracker
 * Version: 17.0 (Failsafe Mode - UI Loads First)
 */

// --- 1. CONFIGURATION (Old Keys: forge-habit-tracker-45a37) ---
const firebaseConfig = {
    apiKey: "AIzaSyCYuWCSbCIRInMe0RVHJ8q3CR8tNJeviC4",
    authDomain: "forge-habit-tracker-45a37.firebaseapp.com",
    projectId: "forge-habit-tracker-45a37",
    storageBucket: "forge-habit-tracker-45a37.firebasestorage.app",
    messagingSenderId: "157279686748",
    appId: "1:157279686748:web:fbea1f594138ef3b919699"
};

// --- 2. GLOBAL VARIABLES ---
let auth = null;
let db = null;
const UNIVERSAL_ADMIN_HASH = "89934ea55110ebd089448fc84d668a828904257d138fadb0fbc9bfd8227d109d";

// --- 3. CORE APP (Defined immediately) ---
const app = (() => {
    // Data Default
    const defaultData = {
        habits: [ { id: 1, name: "Morning Gym" }, { id: 2, name: "Read 30 Mins" } ],
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

    // --- INITIALIZATION ---
    const init = () => {
        console.log("🚀 App Launching...");
        
        // 1. Initialize Firebase (Try/Catch block prevents crash if offline)
        try {
            if (typeof firebase !== 'undefined') {
                if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
                auth = firebase.auth();
                db = firebase.firestore();
                console.log("✅ Firebase Connected");
                setupAuthListener();
            } else {
                console.error("❌ Firebase SDK missing");
            }
        } catch (e) {
            console.error("❌ Firebase Init Failed:", e);
        }

        // 2. Load Local Data & Render UI (Happens regardless of Firebase status)
        loadLocalData();
        setupUI();
        navigate('tracker');
    };

    // --- AUTH LISTENER ---
    const setupAuthListener = () => {
        if (!auth) return;
        auth.onAuthStateChanged(user => {
            currentUser = user;
            updateProfileUI(user);
            if (user) {
                console.log("👤 User Logged In:", user.email);
                syncData('pull'); // Fetch cloud data
            } else {
                console.log("👤 Guest Mode");
            }
        });
    };

    // --- DATA HANDLING ---
    const loadLocalData = () => {
        try {
            const u = localStorage.getItem('forge_data');
            if (u) state = { ...defaultData, ...JSON.parse(u) };
            const g = localStorage.getItem('forge_global_admin');
            if (g) globalState = { ...defaultGlobal, ...JSON.parse(g) };
        } catch (e) { console.warn("Local data reset"); }
    };

    const saveData = () => {
        localStorage.setItem('forge_data', JSON.stringify(state));
        renderGrid(false); // Update UI
        if (currentUser && db) db.collection('users').doc(currentUser.uid).set(state, { merge: true }).catch(console.warn);
    };

    const saveGlobal = () => {
        localStorage.setItem('forge_global_admin', JSON.stringify(globalState));
        if (db) db.collection('admin').doc('config').set(globalState).catch(console.warn);
    };

    const syncData = async (direction) => {
        if (!db) return;
        try {
            // Sync Global
            const gDoc = await db.collection('admin').doc('config').get();
            if (gDoc.exists) {
                globalState = { ...defaultGlobal, ...gDoc.data() };
                localStorage.setItem('forge_global_admin', JSON.stringify(globalState));
            }
            
            // Sync User
            if (currentUser) {
                const uDoc = await db.collection('users').doc(currentUser.uid).get();
                if (uDoc.exists) {
                    state = { ...defaultData, ...uDoc.data() };
                    localStorage.setItem('forge_data', JSON.stringify(state));
                    navigate(viewState.activeView); // Refresh current view
                }
            }
        } catch (e) { console.error("Sync Error:", e); }
    };

    // --- NAVIGATION & UI ---
    const setupUI = () => {
        // Sidebar
        const btn = document.getElementById('mobile-menu-btn');
        const sb = document.getElementById('sidebar');
        if (btn) btn.onclick = () => sb.classList.toggle('-translate-x-full');

        // Date Pickers
        const d = new Date().toISOString().split('T')[0];
        const de = document.getElementById('date-end');
        if (de) { de.value = d; document.getElementById('date-start').value = d; }

        // Theme
        applyTheme();
        window.addEventListener('resize', () => { if(viewState.activeView === 'analytics') renderAnalytics(); });
    };

    const navigate = (view) => {
        if (view.startsWith('admin-panel') && !isAdminLoggedIn) view = 'admin-login';
        viewState.activeView = view;

        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(view === 'admin-panel' ? 'view-admin-panel' : `view-${view}`);
        if (target) target.classList.remove('hidden');

        // Update Nav Buttons
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active-nav'));
        const map = { 'tracker':0, 'shared':1, 'analytics':2, 'settings':3 };
        if (map[view] !== undefined) {
            const navs = document.querySelectorAll('.nav-btn');
            if (navs[map[view]]) navs[map[view]].classList.add('active-nav');
        }

        // Render View
        if (view === 'tracker') renderGrid(false);
        if (view === 'shared') renderGrid(true);
        if (view === 'analytics') renderAnalyticsUI();
        if (view === 'settings') renderSettings();
        if (view === 'admin-panel') renderAdminPanel();
    };

    // --- GRID RENDERER (The Critical Part) ---
    const renderGrid = (isShared) => {
        const date = isShared ? viewState.sharedDate : viewState.currentDate;
        const year = date.getFullYear();
        const month = date.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Header Title
        const titleEl = document.getElementById(isShared ? 'shared-month-year' : 'calendar-month-year');
        if (titleEl) titleEl.innerText = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        // Calendar Header
        const headerEl = document.getElementById(isShared ? 'shared-header-row' : 'calendar-header-row');
        if (headerEl) {
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
            headerEl.innerHTML = html + '</div>';
        }

        // Rows
        const bodyEl = document.getElementById(isShared ? 'shared-body' : 'tracker-body');
        const list = isShared ? globalState.sharedHabits : state.habits;
        const records = isShared ? state.sharedRecords : state.records;

        if (bodyEl) {
            if (!list || list.length === 0) {
                bodyEl.innerHTML = `<tr><td class="p-4 text-gray-400 italic">No habits found.</td></tr>`;
            } else {
                bodyEl.innerHTML = list.map(h => {
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

    // --- ACTIONS ---
    const toggle = (id, k) => {
        if (!state.records[k]) state.records[k] = [];
        const idx = state.records[k].indexOf(id);
        if (idx > -1) state.records[k].splice(idx, 1); else state.records[k].push(id);
        saveData();
    };
    const toggleShared = (id, k) => {
        if (!state.sharedRecords) state.sharedRecords = {};
        if (!state.sharedRecords[k]) state.sharedRecords[k] = [];
        const idx = state.sharedRecords[k].indexOf(id);
        if (idx > -1) state.sharedRecords[k].splice(idx, 1); else state.sharedRecords[k].push(id);
        saveData();
    };
    const changeMonth = (d) => { viewState.currentDate.setMonth(viewState.currentDate.getMonth() + d); renderGrid(false); };
    const changeSharedMonth = (d) => { viewState.sharedDate.setMonth(viewState.sharedDate.getMonth() + d); renderGrid(true); };

    // --- ADMIN & AUTH ---
    const adminLogin = async () => {
        const val = document.getElementById('admin-password-input').value;
        // Simple hash check for resiliency
        let hash = "insecure";
        if (window.crypto) {
            const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(val));
            hash = Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
        }
        
        if (hash === UNIVERSAL_ADMIN_HASH || val === globalState.adminSettings.resettablePass) {
            isAdminLoggedIn = true;
            document.getElementById('admin-login-error').classList.add('hidden');
            navigate('admin-panel');
        } else {
            document.getElementById('admin-login-error').classList.remove('hidden');
        }
    };

    const renderAdminPanel = () => {
        const el = document.getElementById('admin-section-tracker');
        if(el) {
            document.querySelectorAll('.admin-subview').forEach(e => e.classList.add('hidden'));
            el.classList.remove('hidden');
            fetchUsers();
        }
    };

    const fetchUsers = async () => {
        const list = document.getElementById('admin-user-list');
        if (!list) return;
        list.innerHTML = 'Loading...';
        if (!db) return list.innerHTML = "Offline Mode";
        
        try {
            const snap = await db.collection('users').get();
            list.innerHTML = '';
            snap.forEach(doc => {
                const d = doc.data();
                const name = d.profile?.email || doc.id;
                list.innerHTML += `<div onclick="app.loadUser('${doc.id}','${name}')" class="p-2 border rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 truncate">${name}</div>`;
            });
        } catch (e) { list.innerHTML = "Error fetching users."; }
    };

    const loadUser = async (uid, name) => {
        document.getElementById('admin-select-prompt').classList.add('hidden');
        document.getElementById('admin-user-stats-container').classList.remove('hidden');
        document.getElementById('admin-selected-user-name').innerText = name;
        // Simple render to avoid chart crashes
        document.getElementById('admin-user-stats-body').innerHTML = `<tr><td colspan="3" class="p-4 text-center">Stats loaded for ${name}</td></tr>`;
    };

    // --- SETTINGS & MISC ---
    const renderSettings = () => {
        document.getElementById('accent-picker').value = state.settings.accent;
        document.getElementById('settings-habit-list').innerHTML = state.habits.map(h => `
            <div class="flex gap-2 mb-2">
                <input id="habit-name-${h.id}" value="${h.name}" class="flex-1 p-2 border rounded dark:bg-gray-700">
                <button onclick="app.updateHabitName(${h.id})" class="text-green-500 p-2"><i class="fa-solid fa-save"></i></button>
                <button onclick="app.deleteHabit(${h.id})" class="text-red-500 p-2"><i class="fa-solid fa-trash"></i></button>
            </div>
        `).join('');
    };
    const addHabit = () => { state.habits.push({id:Date.now(), name:'New'}); saveData(); renderSettings(); };
    const deleteHabit = (id) => { if(confirm("Delete?")){ state.habits = state.habits.filter(h=>h.id!==id); saveData(); renderSettings(); }};
    const updateHabitName = (id) => { const h=state.habits.find(x=>x.id===id); if(h){ h.name=document.getElementById('habit-name-'+id).value; saveData(); } };
    const updateAccent = (c) => { state.settings.accent=c; saveData(); applyTheme(); };
    const toggleDarkMode = () => { state.settings.theme = state.settings.theme==='light'?'dark':'light'; saveData(); applyTheme(); };
    const applyTheme = () => {
        const root = document.documentElement;
        const btn = document.getElementById('dark-mode-toggle').firstElementChild;
        if (state.settings.theme === 'dark') { root.classList.add('dark'); btn.style.transform='translateX(24px)'; }
        else { root.classList.remove('dark'); btn.style.transform='translateX(0)'; }
        root.style.setProperty('--accent-color', state.settings.accent);
    };
    const updateProfileUI = (u) => {
        const f = document.getElementById('auth-forms');
        const p = document.getElementById('profile-info');
        if (u) {
            f.classList.add('hidden'); p.classList.remove('hidden');
            document.getElementById('profile-email').innerText = u.email;
            document.getElementById('user-status-text').innerText = "Online";
        } else {
            f.classList.remove('hidden'); p.classList.add('hidden');
            document.getElementById('user-status-text').innerText = "Guest";
        }
    };

    // Stubs for stability
    const renderAnalyticsUI = () => {}; 
    const renderAnalytics = () => {}; 
    const handlePeriodChange = () => {};
    const resetData = () => { if(confirm("Reset?")){ state.records={}; saveData(); navigate('tracker'); }};

    return {
        init, navigate, toggleSidebar, changeMonth, changeSharedMonth, toggle, toggleShared,
        updateAccent, toggleDarkMode, addHabit, deleteHabit, updateHabitName, resetData,
        adminLogin, fetchUsers, loadUser, // Exported for HTML onclicks
        toggleHabit: toggle, toggleSharedHabit: toggleShared // Aliases for legacy HTML
    };
})();

// --- 6. AUTHENTICATION EXPORTS ---
const authManager = {
    signInGoogle: () => {
        if (!auth) return alert("Firebase not loaded yet.");
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(e => {
            if (e.code === 'auth/unauthorized-domain') alert(`DOMAIN ERROR: Add ${window.location.hostname} to Firebase Console.`);
            else alert("Login Error: " + e.message);
        });
    },
    handleEmailAuth: () => {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-password').value;
        if (!email || !pass) return alert("Missing credentials");
        if (window.authMode === 'register') {
            auth.createUserWithEmailAndPassword(email, pass)
                .then(c => { if(db) db.collection('users').doc(c.user.uid).set({profile:{email}},{merge:true}); })
                .catch(e => alert(e.message));
        } else {
            auth.signInWithEmailAndPassword(email, pass).catch(e => alert(e.message));
        }
    },
    logout: () => auth.signOut()
};

// START
document.addEventListener('DOMContentLoaded', app.init);
