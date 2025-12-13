/**
 * FORGE - Cloud Habit Tracker
 * Version: 13.0 (Old Keys - Login Fix)
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

// --- 2. INITIALIZATION ---
let auth, db;
try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    console.log("Firebase (Old Project) initialized.");
} catch (e) {
    console.error("Firebase Init Error:", e);
    alert("Database Connection Failed. Check Console.");
}

// --- 3. AUTH MANAGER ---
const authManager = {
    signInGoogle: () => {
        if (!auth) return;
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(e => {
            console.error("Login Error:", e);
            alert(`Login Failed: ${e.message}\n\n(Check 'Authorized Domains' in Firebase Console for project: forge-habit-tracker-45a37)`);
        });
    },
    handleEmailAuth: () => {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-password').value;
        if (!email || !pass) return alert("Please enter email and password");

        if (window.authMode === 'register') {
            auth.createUserWithEmailAndPassword(email, pass)
                .then((cred) => {
                    db.collection('users').doc(cred.user.uid).set({ profile: { email: email } }, { merge: true });
                })
                .catch(e => alert(e.message));
        } else {
            auth.signInWithEmailAndPassword(email, pass).catch(e => alert(e.message));
        }
    },
    logout: () => auth.signOut()
};

// --- 4. APP LOGIC ---
const app = (() => {
    // State
    const defaultData = { habits: [], records: {}, settings: { theme: 'light', accent: '#8B5CF6' } };
    let state = JSON.parse(JSON.stringify(defaultData));
    let currentUser = null;

    // Init
    const init = () => {
        setupUI();
        
        // Login Listener
        if (auth) {
            auth.onAuthStateChanged(user => {
                currentUser = user;
                updateProfileUI(user);
                if (user) loadCloudData();
            });
        }
        
        loadLocalData();
    };

    // Data
    const loadLocalData = () => {
        const local = localStorage.getItem('forge_data');
        if (local) state = { ...defaultData, ...JSON.parse(local) };
        renderTracker();
    };

    const loadCloudData = async () => {
        if (!currentUser) return;
        try {
            const doc = await db.collection('users').doc(currentUser.uid).get();
            if (doc.exists) {
                state = { ...defaultData, ...doc.data() };
                localStorage.setItem('forge_data', JSON.stringify(state));
                renderTracker();
            } else {
                saveCloudData(); // New user setup
            }
        } catch (e) { console.warn("Sync Error:", e); }
    };

    const saveCloudData = () => {
        if (currentUser) {
            db.collection('users').doc(currentUser.uid).set(state, { merge: true }).catch(console.warn);
        }
        localStorage.setItem('forge_data', JSON.stringify(state));
    };

    // UI
    const setupUI = () => {
        // Fix Sidebar Toggle
        const btn = document.getElementById('mobile-menu-btn');
        if (btn) btn.onclick = () => document.getElementById('sidebar').classList.toggle('-translate-x-full');
        
        // Date Setup
        const d = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        document.getElementById('current-date-display').innerText = d;
    };

    const updateProfileUI = (user) => {
        const forms = document.getElementById('auth-forms');
        const info = document.getElementById('profile-info');
        if (user) {
            forms.classList.add('hidden');
            info.classList.remove('hidden');
            document.getElementById('profile-email').innerText = user.email;
            document.getElementById('user-status-text').innerText = "Online";
        } else {
            forms.classList.remove('hidden');
            info.classList.add('hidden');
            document.getElementById('user-status-text').innerText = "Guest";
        }
    };

    // Navigation & Rendering
    const navigate = (view) => {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(view === 'admin-panel' ? 'view-admin-login' : `view-${view}`);
        if (target) target.classList.remove('hidden');
        if (view === 'tracker') renderTracker();
    };

    const renderTracker = () => {
        const tbody = document.getElementById('tracker-body');
        if (!tbody) return;
        
        const daysInMonth = new Date().getDate(); // Simplified for demo
        tbody.innerHTML = state.habits.map(h => `
            <tr class="border-b">
                <td class="p-4 font-bold">${h.name}</td>
                <td class="p-4 text-gray-400">Loading calendar...</td>
            </tr>
        `).join('') || '<tr><td class="p-4">No habits yet. Add one in Settings.</td></tr>';
    };

    // Exports
    return { init, navigate, authManager };
})();

// Start
document.addEventListener('DOMContentLoaded', app.init);
