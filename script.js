/**
 * FORGE - Cloud Habit Tracker
 * Version: 3.0 (Firebase Integration)
 */

// --- FIREBASE CONFIGURATION ---
// 1. Go to Firebase Console > Create Project
// 2. Add Web App > Copy Config object below
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

const app = (() => {
    // --- State Management ---
    const defaultData = {
        habits: [
            { id: 1, name: "Morning Gym" },
            { id: 2, name: "Read 30 Mins" },
            { id: 3, name: "Drink 2L Water" }
        ],
        records: {}, 
        settings: { theme: 'light', accent: '#8B5CF6' }
    };

    let state = defaultData;
    let currentUser = null;
    let viewState = {
        currentDate: new Date(),
        activeView: 'tracker',
        chartInstance: null,
        consistencyChartInstance: null,
        isSidebarCollapsed: false
    };

    // --- Core Functions ---

    const init = () => {
        // Load local first for speed
        const local = localStorage.getItem('forge_data');
        if(local) state = JSON.parse(local);

        applyTheme();
        renderHeader();
        renderSidebar();
        navigate('tracker');
        
        // Init Date Pickers
        const today = new Date().toISOString().split('T')[0];
        const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const endInput = document.getElementById('date-end');
        if(endInput) {
            endInput.value = today;
            document.getElementById('date-start').value = lastWeek;
        }

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

    const saveData = () => {
        // 1. Save Local
        localStorage.setItem('forge_data', JSON.stringify(state));
        renderHeader();

        // 2. Save Cloud (Debounced 1s would be better, but direct for simplicity)
        if (currentUser && db) {
            db.collection('users').doc(currentUser.uid).set(state)
                .catch(err => console.error("Cloud Save Error", err));
        }
    };

    const syncDataFromCloud = async () => {
        if (!currentUser || !db) return;
        try {
            const doc = await db.collection('users').doc(currentUser.uid).get();
            if (doc.exists) {
                state = doc.data();
                // Ensure defaults exist if merged
                if(!state.settings) state.settings = defaultData.settings;
                if(!state.records) state.records = {};
                
                saveData(); // Sync back to local
                navigate(viewState.activeView); // Re-render current view
                applyTheme();
            } else {
                // New user on cloud, upload local data
                saveData();
            }
        } catch (e) {
            console.error("Sync error", e);
        }
    };

    // --- Helper: Date Handling ---
    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const formatDateKey = (date) => {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // --- Sidebar Logic ---
    const toggleSidebar = () => {
        viewState.isSidebarCollapsed = !viewState.isSidebarCollapsed;
        const sidebar = document.getElementById('sidebar');
        if (viewState.isSidebarCollapsed) sidebar.classList.add('sidebar-collapsed');
        else sidebar.classList.remove('sidebar-collapsed');
    };

    // --- View Navigation ---
    const navigate = (viewName) => {
        viewState.activeView = viewName;
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(`view-${viewName}`);
        if(target) target.classList.remove('hidden');

        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active-nav'));
        const navIndex = ['tracker', 'analytics', 'settings'].indexOf(viewName);
        if(navIndex >= 0) document.querySelectorAll('.nav-btn')[navIndex].classList.add('active-nav');

        if (viewName === 'tracker') renderTracker();
        if (viewName === 'analytics') renderAnalyticsUI();
        if (viewName === 'settings') renderSettings();
    };

    // --- SECTION: TRACKER ---
    const renderTracker = () => {
        const year = viewState.currentDate.getFullYear();
        const month = viewState.currentDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        document.getElementById('calendar-month-year').innerText = `${monthNames[month]} ${year}`;

        const headerRow = document.getElementById('calendar-header-row');
        headerRow.innerHTML = '';
        let daysHtml = '<div class="flex gap-2 pb-2">';
        
        for (let d = 1; d <= daysInMonth; d++) {
            const dateObj = new Date(year, month, d);
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'narrow' });
            const isToday = formatDateKey(new Date()) === formatDateKey(dateObj);
            
            daysHtml += `
                <div class="flex-shrink-0 w-10 text-center">
                    <div class="text-xs text-gray-400 mb-1">${dayName}</div>
                    <div class="text-sm font-bold ${isToday ? 'text-violet-600 bg-violet-100 rounded-full w-8 h-8 flex items-center justify-center mx-auto' : ''}">${d}</div>
                </div>
            `;
        }
        daysHtml += '</div>';
        headerRow.innerHTML = daysHtml;

        const tbody = document.getElementById('tracker-body');
        tbody.innerHTML = '';

        state.habits.forEach(habit => {
            const tr = document.createElement('tr');
            tr.className = "border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition";
            
            let rowHtml = `<td class="p-4 font-medium text-gray-700 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-900 z-10 shadow-sm border-r dark:border-gray-800 truncate max-w-[200px]">${habit.name}</td>`;
            rowHtml += `<td class="p-4"><div class="flex gap-2">`;

            for (let d = 1; d <= daysInMonth; d++) {
                const dateKey = formatDateKey(new Date(year, month, d));
                const completed = state.records[dateKey] && state.records[dateKey].includes(habit.id);
                rowHtml += `
                    <div class="flex-shrink-0 w-10 flex justify-center">
                        <input type="checkbox" class="forge-checkbox" ${completed ? 'checked' : ''} onchange="app.toggleHabit(${habit.id}, '${dateKey}')">
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

    const toggleHabit = (habitId, dateKey) => {
        if (!state.records[dateKey]) state.records[dateKey] = [];
        const index = state.records[dateKey].indexOf(habitId);
        if (index > -1) state.records[dateKey].splice(index, 1);
        else state.records[dateKey].push(habitId);
        if (state.records[dateKey].length === 0) delete state.records[dateKey];
        saveData();
    };

    // --- SECTION: ANALYTICS (FIXED) ---
    const renderAnalyticsUI = () => {
        const select = document.getElementById('analytics-habit-select');
        let options = `<option value="all">All Habits (Aggregate)</option>`;
        options += state.habits.map(h => `<option value="${h.id}">${h.name}</option>`).join('');
        select.innerHTML = options;
        
        // Only set default dates if not already set by user interaction
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
            return; // Don't calc dates
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
        // Fix: Use UTC or parse carefully to avoid timezone issues with inputs
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

        // Clone start date for iteration
        let loopDate = new Date(startDate);
        
        // Loop while loopDate <= endDate
        while(loopDate <= endDate) {
            const key = formatDateKey(loopDate);
            labels.push(new Date(loopDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            
            let val = 0;
            const records = state.records[key] || [];

            if (habitId === 'all') {
                if (state.habits.length > 0) {
                    val = Math.round((records.length / state.habits.length) * 100);
                    totalCompleted += records.length;
                    totalPossible += state.habits.length;
                }
            } else {
                const id = parseInt(habitId);
                const isDone = records.includes(id);
                val = isDone ? 100 : 0;
                totalCompleted += isDone ? 1 : 0;
                totalPossible += 1;
            }
            dataPoints.push(val);
            
            // Increment Day
            loopDate.setDate(loopDate.getDate() + 1);
        }

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
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });

        const missed = totalPossible - totalCompleted;
        viewState.consistencyChartInstance = new Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'Missed'],
                datasets: [{
                    data: [totalCompleted, missed],
                    backgroundColor: [accent, '#e5e7eb'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%'
            }
        });

        document.getElementById('period-count').innerText = totalCompleted;
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
        if(!confirm('Are you sure?')) return;
        if (scope === 'all') state.records = {};
        saveData();
        navigate('tracker');
    };

    // --- Profile & Auth UI Helper ---
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
        init, navigate, changeMonth, toggleHabit, renderAnalytics, handlePeriodChange,
        updateAccent, toggleDarkMode, updateHabitName, addHabit, deleteHabit, resetData, toggleSidebar
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
                .catch(e => { errorMsg.innerText = e.message; errorMsg.classList.remove('hidden'); });
        } else {
            auth.signInWithEmailAndPassword(email, pass)
                .catch(e => { errorMsg.innerText = e.message; errorMsg.classList.remove('hidden'); });
        }
    },
    logout: () => auth.signOut()
};

document.addEventListener('DOMContentLoaded', app.init);