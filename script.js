/**
 * FORGE - Cloud Habit Tracker & Admin System
 * Version: 4.1 (Syntax Fixes & New Security)
 */

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCYuWCSbCIRInMe0RVHJ8q3CR8tNJeviC4",
    authDomain: "forge-habit-tracker-45a37.firebaseapp.com",
    projectId: "forge-habit-tracker-45a37",
    storageBucket: "forge-habit-tracker-45a37.firebasestorage.app",
    messagingSenderId: "157279686748",
    appId: "1:157279686748:web:fbea1f594138ef3b919699"
};

// Initialize Firebase
let auth, db;
try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
} catch (e) {
    console.warn("Firebase not configured yet. Using local storage mode.");
}

// --- CONSTANTS & ADMIN SECURITY ---
// SHA-256 Hash for 'godfather1972'
const UNIVERSAL_ADMIN_HASH = "89934ea55110ebd089448fc84d668a828904257d138fadb0fbc9bfd8227d109d"; 

const app = (() => {
    // --- State Management ---
    const defaultData = {
        habits: [
            { id: 1, name: "Morning Gym" },
            { id: 2, name: "Read 30 Mins" },
            { id: 3, name: "Drink 2L Water" }
        ],
        records: {}, // Personal Records
        sharedRecords: {}, // { 'YYYY-MM-DD': ['shared_1'] } - Tracks completion of shared habits
        settings: { theme: 'light', accent: '#8B5CF6' }
    };

    // Global Admin Data (Synced from 'admin/config' doc)
    let globalState = {
        sharedHabits: [
            { id: 'shared_1', name: "Global: 10k Steps" }, // Default shared habit
            { id: 'shared_2', name: "Global: No Sugar" }
        ],
        adminSettings: {
            resettablePass: "admin123" // Default Resettable Password
        }
    };

    let state = defaultData;
    let currentUser = null;
    let isAdminLoggedIn = false;
    
    let viewState = {
        currentDate: new Date(),
        sharedDate: new Date(),
        activeView: 'tracker',
        chartInstance: null,
        consistencyChartInstance: null,
        adminChartInstance: null,
        isSidebarCollapsed: false
    };

    // --- Core Functions ---

    const init = async () => {
        // Load local first
        const local = localStorage.getItem('forge_data');
        if(local) state = JSON.parse(local);
        
        // Ensure sharedRecords exists (Migration)
        if(!state.sharedRecords) state.sharedRecords = {};

        // Load Global Admin Data (Simulated or Cloud)
        await syncGlobalData();

        applyTheme();
        renderHeader();
        renderSidebar();
        navigate('tracker');
        
        // Init Date Pickers
        setupDatePickers();
        setupEventListeners();

        // Check Firebase Auth
        if(auth) {
            auth.onAuthStateChanged(user => {
                currentUser = user;
                updateProfileUI(user);
                if (user) syncDataFromCloud();
            });
        }
    };

    const setupDatePickers = () => {
        const today = new Date().toISOString().split('T')[0];
        const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endInput = document.getElementById('date-end');
        if(endInput) {
            endInput.value = today;
            document.getElementById('date-start').value = lastWeek;
        }
        // Admin Ranking Month Default
        document.getElementById('admin-rank-month').value = today.substring(0, 7);
    };

    const saveData = () => {
        localStorage.setItem('forge_data', JSON.stringify(state));
        renderHeader();
        if (currentUser && db) {
            db.collection('users').doc(currentUser.uid).set(state, { merge: true })
                .catch(err => console.error("Cloud Save Error", err));
        }
    };

    const saveGlobalData = () => {
        // In real app: Write to admin/config. Here we simulate persistence or write to a specific doc if admin
        if(db) {
            db.collection('admin').doc('config').set(globalState)
                .catch(err => console.error("Admin Save Error", err));
        }
    };

    const syncGlobalData = async () => {
        if(db) {
            try {
                const doc = await db.collection('admin').doc('config').get();
                if(doc.exists) {
                    globalState = doc.data();
                } else {
                    // Initialize if empty
                    saveGlobalData();
                }
            } catch(e) { console.log("Using default global state"); }
        }
    };

    const syncDataFromCloud = async () => {
        if (!currentUser || !db) return;
        try {
            const doc = await db.collection('users').doc(currentUser.uid).get();
            if (doc.exists) {
                const cloudData = doc.data();
                state = { ...defaultData, ...cloudData };
                saveData(); 
                navigate(viewState.activeView); 
                applyTheme();
            } else {
                saveData();
            }
        } catch (e) { console.error("Sync error", e); }
    };

    // --- Helper: Date Handling ---
    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const formatDateKey = (date) => {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // --- Sidebar & Nav ---
    const toggleSidebar = () => {
        viewState.isSidebarCollapsed = !viewState.isSidebarCollapsed;
        const sidebar = document.getElementById('sidebar');
        if (viewState.isSidebarCollapsed) sidebar.classList.add('sidebar-collapsed');
        else sidebar.classList.remove('sidebar-collapsed');
    };

    const navigate = (viewName) => {
        // Security Check for Admin
        if(viewName.startsWith('admin-panel') && !isAdminLoggedIn) {
            viewName = 'admin-login';
        }

        viewState.activeView = viewName;
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        
        const targetId = viewName === 'admin-panel' ? 'view-admin-panel' : `view-${viewName}`;
        const target = document.getElementById(targetId);
        if(target) target.classList.remove('hidden');

        // Nav Active State
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active-nav'));
        if(viewName === 'tracker') document.querySelectorAll('.nav-btn')[0].classList.add('active-nav');
        if(viewName === 'shared') document.querySelectorAll('.nav-btn')[1].classList.add('active-nav');
        if(viewName === 'analytics') document.querySelectorAll('.nav-btn')[2].classList.add('active-nav');
        if(viewName === 'settings') document.querySelectorAll('.nav-btn')[3].classList.add('active-nav');

        if (viewName === 'tracker') renderTracker();
        if (viewName === 'shared') renderSharedHabits();
        if (viewName === 'analytics') renderAnalyticsUI();
        if (viewName === 'settings') renderSettings();
        if (viewName === 'admin-panel') renderAdminPanel();
    };

    // --- SECTION: TRACKER (Personal) ---
    const renderTracker = () => {
        const year = viewState.currentDate.getFullYear();
        const month = viewState.currentDate.getMonth();
        renderGrid('tracker-body', 'calendar-header-row', 'calendar-month-year', year, month, state.habits, state.records, false);
    };

    // --- SECTION: SHARED HABITS (New) ---
    const renderSharedHabits = () => {
        const year = viewState.sharedDate.getFullYear();
        const month = viewState.sharedDate.getMonth();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        document.getElementById('shared-month-year').innerText = `${monthNames[month]} ${year}`;
        
        // Use Global Habits, User's Shared Records
        renderGrid('shared-body', 'shared-header-row', null, year, month, globalState.sharedHabits, state.sharedRecords, true);
    };

    // Generic Grid Renderer
    const renderGrid = (bodyId, headerId, titleId, year, month, habitsList, recordsObj, isShared) => {
        const daysInMonth = getDaysInMonth(year, month);
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        if(titleId) document.getElementById(titleId).innerText = `${monthNames[month]} ${year}`;

        const headerRow = document.getElementById(headerId);
        headerRow.innerHTML = '';
        let daysHtml = '<div class="flex gap-2 pb-2">';
        
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month, d);
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'narrow' });
            const isToday = formatDateKey(new Date()) === formatDateKey(dateObj);
            const colorClass = isShared ? 'text-pink-600 bg-pink-100' : 'text-violet-600 bg-violet-100';
            
            daysHtml += `
                <div class="flex-shrink-0 w-10 text-center">
                    <div class="text-xs text-gray-400 mb-1">${dayName}</div>
                    <div class="text-sm font-bold ${isToday ? `${colorClass} rounded-full w-8 h-8 flex items-center justify-center mx-auto` : ''}">${d}</div>
                </div>
            `;
        }
        daysHtml += '</div>';
        headerRow.innerHTML = daysHtml;

        const tbody = document.getElementById(bodyId);
        tbody.innerHTML = '';

        habitsList.forEach(habit => {
            const tr = document.createElement('tr');
            tr.className = `border-b dark:border-gray-800 transition ${isShared ? 'hover:bg-pink-50 dark:hover:bg-pink-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`;
            
            let rowHtml = `<td class="p-4 font-medium text-gray-700 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-900 z-10 shadow-sm border-r dark:border-gray-800 truncate max-w-[200px]">${habit.name}</td>`;
            rowHtml += `<td class="p-4"><div class="flex gap-2">`;

            for (let d = 1; d <= daysInMonth; d++) {
                const dateKey = formatDateKey(new Date(year, month, d));
                const completed = recordsObj[dateKey] && recordsObj[dateKey].includes(habit.id);
                const checkboxClass = isShared ? 'forge-checkbox shared-checkbox' : 'forge-checkbox';
                
                // Toggle function differs for shared
                const toggleFn = isShared 
                    ? `app.toggleSharedHabit('${habit.id}', '${dateKey}')`
                    : `app.toggleHabit(${habit.id}, '${dateKey}')`;

                rowHtml += `
                    <div class="flex-shrink-0 w-10 flex justify-center">
                        <input type="checkbox" class="${checkboxClass}" ${completed ? 'checked' : ''} onchange="${toggleFn}">
                    </div>`;
            }

            rowHtml += `</div></td>`;
            tr.innerHTML = rowHtml;
            tbody.appendChild(tr);
        });
    };

    const changeMonth = (delta) => {
        viewState.currentDate.setMonth(viewState.currentDate.getMonth() + delta);
        renderTracker();
    };
    
    const changeSharedMonth = (delta) => {
        viewState.sharedDate.setMonth(viewState.sharedDate.getMonth() + delta);
        renderSharedHabits();
    };

    const toggleHabit = (habitId, dateKey) => {
        if (!state.records[dateKey]) state.records[dateKey] = [];
        const index = state.records[dateKey].indexOf(habitId);
        if (index > -1) state.records[dateKey].splice(index, 1);
        else state.records[dateKey].push(habitId);
        if (state.records[dateKey].length === 0) delete state.records[dateKey];
        saveData();
    };

    const toggleSharedHabit = (habitId, dateKey) => {
        if (!state.sharedRecords) state.sharedRecords = {}; // Safety
        if (!state.sharedRecords[dateKey]) state.sharedRecords[dateKey] = [];
        
        const index = state.sharedRecords[dateKey].indexOf(habitId);
        if (index > -1) state.sharedRecords[dateKey].splice(index, 1);
        else state.sharedRecords[dateKey].push(habitId);
        
        if (state.sharedRecords[dateKey].length === 0) delete state.sharedRecords[dateKey];
        saveData(); // Save to user's record
    };

    // --- SECTION: ANALYTICS ---
    const renderAnalyticsUI = () => {
        const select = document.getElementById('analytics-habit-select');
        let options = `<option value="all">All Habits (Aggregate)</option>`;
        options += state.habits.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
        select.innerHTML = options;
        
        if(!document.getElementById('date-end').value) handlePeriodChange(); 
        else renderAnalytics();
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

        const { labels, dataPoints, totalCompleted, totalPossible } = calculateStats(startDate, endDate, habitId, state.habits, state.records);

        const accent = state.settings.accent;
        viewState.chartInstance = new Chart(ctxMain, {
            type: chartType,
            data: {
                labels: labels,
                datasets: [{
                    label: 'Success Rate %',
                    data: dataPoints,
                    backgroundColor: `${accent}40`,
                    borderColor: accent,
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100 } } }
        });

        const missed = totalPossible - totalCompleted;
        viewState.consistencyChartInstance = new Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'Missed'],
                datasets: [{ data: [totalCompleted, missed], backgroundColor: [accent, '#e5e7eb'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%' }
        });
        document.getElementById('period-count').innerText = totalCompleted;
    };

    const calculateStats = (startDate, endDate, habitId, habitsSource, recordsSource) => {
        const labels = [];
        const dataPoints = [];
        let totalCompleted = 0;
        let totalPossible = 0;
        let loopDate = new Date(startDate);
        
        while(loopDate <= endDate) {
            const key = formatDateKey(loopDate);
            labels.push(new Date(loopDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            const records = recordsSource[key] || [];
            let val = 0;

            if (habitId === 'all') {
                if (habitsSource.length > 0) {
                    val = Math.round((records.length / habitsSource.length) * 100);
                    totalCompleted += records.length;
                    totalPossible += habitsSource.length;
                }
            } else {
                const id = isNaN(habitId) ? habitId : parseInt(habitId); // ID can be string for shared
                const isDone = records.includes(id);
                val = isDone ? 100 : 0;
                totalCompleted += isDone ? 1 : 0;
                totalPossible += 1;
            }
            dataPoints.push(val);
            loopDate.setDate(loopDate.getDate() + 1);
        }
        return { labels, dataPoints, totalCompleted, totalPossible };
    };

    // --- SECTION: SETTINGS ---
    const renderSettings = () => {
        document.getElementById('accent-picker').value = state.settings.accent;
        const list = document.getElementById('settings-habit-list');
        list.innerHTML = '';
        state.habits.forEach((h) => {
            const div = document.createElement('div');
            div.className = "flex gap-2";
            div.innerHTML = `
                <input type="text" value="${h.name}" id="habit-name-${h.id}" class="flex-1 p-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                <button onclick="app.updateHabitName(${h.id})" class="text-green-500 p-2 hover:bg-green-50 rounded"><i class="fa-solid fa-save"></i></button>
                <button onclick="app.deleteHabit(${h.id})" class="text-red-500 p-2 hover:bg-red-50 rounded"><i class="fa-solid fa-trash"></i></button>
            `;
            list.appendChild(div);
        });
        document.documentElement.style.setProperty('--accent-color', state.settings.accent);
    };

    const updateAccent = (color) => {
        state.settings.accent = color;
        document.documentElement.style.setProperty('--accent-color', color);
        saveData();
    };

    const toggleDarkMode = () => {
        state.settings.theme = state.settings.theme === 'light' ? 'dark' : 'light';
        applyTheme();
        saveData();
    };

    const applyTheme = () => {
        const toggleBtn = document.getElementById('dark-mode-toggle').firstElementChild;
        if (state.settings.theme === 'dark') {
            document.documentElement.classList.add('dark');
            toggleBtn.style.transform = 'translateX(24px)';
        } else {
            document.documentElement.classList.remove('dark');
            toggleBtn.style.transform = 'translateX(0)';
        }
        document.documentElement.style.setProperty('--accent-color', state.settings.accent);
    };

    const updateHabitName = (id) => {
        const input = document.getElementById(`habit-name-${id}`);
        const habit = state.habits.find(h => h.id === id);
        if(habit) { habit.name = input.value; saveData(); alert('Habit updated!'); }
    };

    const addHabit = () => {
        const newId = state.habits.length > 0 ? Math.max(...state.habits.map(h => h.id)) + 1 : 1;
        state.habits.push({ id: newId, name: "New Habit" });
        saveData();
        renderSettings();
    };

    const deleteHabit = (id) => {
        if(confirm('Delete this habit?')) {
            state.habits = state.habits.filter(h => h.id !== id);
            saveData();
            renderSettings();
        }
    };

    const resetData = (scope) => {
        if(!confirm('Are you sure? This action cannot be undone.')) return;
        if (scope === 'all') {
            state.records = {};
            state.sharedRecords = {};
        }
        saveData();
        navigate('tracker');
    };

    // --- ADMIN PANEL LOGIC ---

    // 1. Auth
    async function sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const adminLogin = async () => {
        const input = document.getElementById('admin-password-input').value;
        const errorMsg = document.getElementById('admin-login-error');
        
        // 1. Check Universal (Hash Check)
        const inputHash = await sha256(input);
        const isUniversal = (inputHash === UNIVERSAL_ADMIN_HASH);

        // 2. Check Resettable (Direct Check)
        const isResettable = (input === globalState.adminSettings.resettablePass);

        if (isUniversal || isResettable) {
            isAdminLoggedIn = true;
            errorMsg.classList.add('hidden');
            document.getElementById('admin-password-input').value = '';
            navigate('admin-panel');
            renderAdminPanel(); // Force render
        } else {
            errorMsg.classList.remove('hidden');
        }
    };

    const adminLogout = () => {
        isAdminLoggedIn = false;
        navigate('admin-login');
    };

    const switchAdminTab = (tab) => {
        document.querySelectorAll('.admin-subview').forEach(el => el.classList.add('hidden'));
        document.getElementById(`admin-section-${tab}`).classList.remove('hidden');
        
        document.querySelectorAll('[id^="tab-admin-"]').forEach(el => el.classList.remove('admin-tab-active'));
        document.getElementById(`tab-admin-${tab}`).classList.add('admin-tab-active');

        if(tab === 'tracker') fetchAndRenderUserList();
        if(tab === 'ranking') renderAdminRankings();
        if(tab === 'settings') renderAdminSettings();
    };

    const renderAdminPanel = () => {
        if(!isAdminLoggedIn) return navigate('admin-login');
        // Default to tracker tab
        switchAdminTab('tracker');
    };

    // 2. Admin Tracker
    const fetchAndRenderUserList = async () => {
        const listEl = document.getElementById('admin-user-list');
        listEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
        
        if(!db) {
            listEl.innerHTML = "Mock User (No Cloud DB)";
            return;
        }

        try {
            const usersSnap = await db.collection('users').get();
            let html = '';
            usersSnap.forEach(doc => {
                const uData = doc.data();
                const displayName = uData.profile?.email || doc.id.substring(0,8) + "...";
                // Sanitize single quotes for HTML attribute
                const safeName = displayName.replace(/'/g, "\\'");
                
                html += `<div onclick="app.loadUserAdminStats('${doc.id}', '${safeName}')" class="p-2 border rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-sm flex items-center justify-between">
                    <span>${displayName}</span> <i class="fa-solid fa-chevron-right text-xs"></i>
                </div>`;
            });
            listEl.innerHTML = html || "No users found.";
        } catch (e) {
            console.error(e);
            listEl.innerHTML = "Error fetching users (Permission denied?)";
        }
    };

    const loadUserAdminStats = async (uid, name) => {
        document.getElementById('admin-select-prompt').classList.add('hidden');
        document.getElementById('admin-user-stats-container').classList.remove('hidden');
        document.getElementById('admin-selected-user-name').innerText = name;

        try {
            const doc = await db.collection('users').doc(uid).get();
            const uData = doc.data() || defaultData;
            const sharedRecs = uData.sharedRecords || {};
            
            // Render Table
            const tbody = document.getElementById('admin-user-stats-body');
            tbody.innerHTML = '';
            
            const currentMonthKey = new Date().toISOString().substring(0, 7); // YYYY-MM
            
            globalState.sharedHabits.forEach(habit => {
                let monthCount = 0;
                let totalCount = 0;
                
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
                    </tr>
                `;
            });

            // Render Admin Chart (Reuse logic)
            // Show aggregate performance for this user across shared habits
            const ctx = document.getElementById('adminUserChart').getContext('2d');
            if(viewState.adminChartInstance) viewState.adminChartInstance.destroy();
            
            // Last 6 months simplified
            viewState.adminChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: globalState.sharedHabits.map(h => h.name),
                    datasets: [{
                        label: 'Total Completions',
                        data: globalState.sharedHabits.map(h => {
                            let count = 0;
                            Object.values(sharedRecs).forEach(arr => { if(arr.includes(h.id)) count++; });
                            return count;
                        }),
                        backgroundColor: '#8B5CF6'
                    }]
                },
                options: { responsive: true }
            });

        } catch(e) { console.error(e); }
    };

    // 3. Admin Ranking
    const renderAdminRankings = async () => {
        const habitSelect = document.getElementById('admin-rank-habit');
        const monthInput = document.getElementById('admin-rank-month');
        
        // Populate Habits if empty
        if(habitSelect.options.length === 0) {
            habitSelect.innerHTML = globalState.sharedHabits.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
        }

        const selectedHabitId = habitSelect.value;
        const selectedMonth = monthInput.value; // YYYY-MM
        const tbody = document.getElementById('admin-ranking-body');
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">Calculating...</td></tr>';

        if(!db) return;

        try {
            const snapshot = await db.collection('users').get();
            let rankings = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                const shared = data.sharedRecords || {};
                let count = 0;
                
                Object.keys(shared).forEach(date => {
                    if(date.startsWith(selectedMonth) && shared[date].includes(selectedHabitId)) {
                        count++;
                    }
                });

                if(count > 0) {
                    rankings.push({ 
                        email: data.profile?.email || "User " + doc.id.substring(0,5), 
                        count 
                    });
                }
            });

            // Sort
            rankings.sort((a, b) => b.count - a.count);

            // Render
            tbody.innerHTML = '';
            if(rankings.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-500">No activity recorded for this period.</td></tr>';
                return;
            }

            rankings.forEach((r, idx) => {
                // FIXED: Simplified logic to avoid nested template literal errors
                let rankHtml = '';
                if (idx < 3) {
                    const color = idx === 0 ? 'yellow' : idx === 1 ? 'gray' : 'orange';
                    rankHtml = `<i class="fa-solid fa-medal text-${color}-500"></i>`;
                } else {
                    rankHtml = idx + 1;
                }

                tbody.innerHTML += `
                    <tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td class="p-4 font-bold">${rankHtml}</td>
                        <td class="p-4">${r.email}</td>
                        <td class="p-4 text-right font-mono font-bold">${r.count}</td>
                    </tr>
                `;
            });

        } catch(e) { console.error(e); }
    };

    // 4. Admin Settings
    const renderAdminSettings = () => {
        const list = document.getElementById('admin-shared-habits-list');
        list.innerHTML = globalState.sharedHabits.map(h => `
            <div class="flex justify-between items-center p-3 border rounded bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                <span class="font-medium">${h.name}</span>
                <span class="text-xs text-gray-500 bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded">ID: ${h.id}</span>
            </div>
        `).join('');
    };

    const addSharedHabit = () => {
        const name = document.getElementById('new-shared-habit-name').value;
        if(!name) return;
        
        const newId = `shared_${Date.now()}`;
        globalState.sharedHabits.push({ id: newId, name });
        saveGlobalData();
        renderAdminSettings();
        document.getElementById('new-shared-habit-name').value = '';
        alert("Shared habit added globally.");
    };

    const updateAdminPassword = () => {
        const oldPass = document.getElementById('admin-old-pass').value;
        const newPass = document.getElementById('admin-new-pass').value;

        if(oldPass !== globalState.adminSettings.resettablePass) {
            alert("Incorrect current password.");
            return;
        }
        
        globalState.adminSettings.resettablePass = newPass;
        saveGlobalData();
        alert("Resettable password updated.");
        document.getElementById('admin-old-pass').value = '';
        document.getElementById('admin-new-pass').value = '';
    };

    // --- Profile Helper ---
    const updateProfileUI = (user) => {
        const authForms = document.getElementById('auth-forms');
        const profileInfo = document.getElementById('profile-info');
        const userStatusText = document.getElementById('user-status-text');

        if (user) {
            authForms.classList.add('hidden');
            profileInfo.classList.remove('hidden');
            document.getElementById('profile-name').innerText = user.displayName || "User";
            document.getElementById('profile-email').innerText = user.email;
            document.getElementById('profile-pic').src = user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=8B5CF6&color=fff`;
            userStatusText.innerText = "Online";
        } else {
            authForms.classList.remove('hidden');
            profileInfo.classList.add('hidden');
            userStatusText.innerText = "Guest Mode";
        }
    };

    const renderHeader = () => {
        const today = new Date();
        document.getElementById('current-date-display').innerText = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        
        const key = formatDateKey(today);
        const totalHabits = state.habits.length;
        const completedToday = state.records[key] ? state.records[key].length : 0;
        const monthKey = key.substring(0, 7);
        const daysPassed = today.getDate();
        const totalPossible = daysPassed * totalHabits;
        let totalDoneMonth = 0;
        for(let d=1; d<=daysPassed; d++) {
             const k = `${monthKey}-${String(d).padStart(2, '0')}`;
             if(state.records[k]) totalDoneMonth += state.records[k].length;
        }

        const todayPct = totalHabits === 0 ? 0 : Math.round((completedToday / totalHabits) * 100);
        const monthPct = totalPossible === 0 ? 0 : Math.round((totalDoneMonth / totalPossible) * 100);

        document.getElementById('today-progress').innerText = `${todayPct}%`;
        document.getElementById('month-progress').innerText = `${monthPct}%`;
    };

    const renderSidebar = () => {
        const btn = document.getElementById('mobile-menu-btn');
        const sidebar = document.getElementById('sidebar');
        btn.onclick = () => { sidebar.classList.toggle('-translate-x-full'); };
    };
    
    const setupEventListeners = () => {
        window.addEventListener('resize', () => { if(viewState.activeView === 'analytics') renderAnalytics(); });
    };

    return {
        init, navigate, changeMonth, changeSharedMonth, toggleHabit, toggleSharedHabit,
        renderAnalytics, handlePeriodChange, updateAccent, toggleDarkMode, updateHabitName, 
        addHabit, deleteHabit, resetData, toggleSidebar,
        
        // Admin Exports
        adminLogin, adminLogout, switchAdminTab, loadUserAdminStats, renderAdminRankings,
        addSharedHabit, updateAdminPassword
    };

})();

const authManager = {
    signInGoogle: () => {
        if(!auth) return alert("Firebase not configured");
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(e => alert(e.message));
    },
    handleEmailAuth: () => {
        if(!auth) return alert("Firebase not configured");
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-password').value;
        const errorMsg = document.getElementById('auth-error');
        
        if(window.authMode === 'register') {
            auth.createUserWithEmailAndPassword(email, pass)
                .then((cred) => {
                    // Initialize user profile doc
                    db.collection('users').doc(cred.user.uid).set({
                        profile: { email: email }
                    }, { merge: true });
                })
                .catch(e => { errorMsg.innerText = e.message; errorMsg.classList.remove('hidden'); });
        } else {
            auth.signInWithEmailAndPassword(email, pass)
                .catch(e => { errorMsg.innerText = e.message; errorMsg.classList.remove('hidden'); });
        }
    },
    logout: () => auth.signOut()
};

document.addEventListener('DOMContentLoaded', app.init);
