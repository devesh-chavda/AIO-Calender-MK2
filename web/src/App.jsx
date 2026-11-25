import { useState, useEffect } from 'react';
import { auth, googleProvider, db, firebaseConfig, handleFirestoreError, OperationType } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  signOut, 
  signInWithCredential, 
  GoogleAuthProvider 
} from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  setupNotifications,
  syncAllAlarms,
  getNotificationStatus,
  openBatterySettings,
  openAutostartSettings
} from "./notifications";
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

const isDesktop = typeof window !== 'undefined' && Boolean(
  window.__TAURI__ || 
  window.__TAURI_INTERNALS__ || 
  window.location.hostname === 'tauri.localhost' || 
  window.location.protocol === 'tauri:'
);

const isNativeMobile = typeof window !== 'undefined' && Capacitor.isNativePlatform();
const isWebOnly = !isDesktop && !isNativeMobile;

// ==========================================
// 1. AUTHENTICATION WRAPPER
// ==========================================
export default function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(() => Boolean(auth));
  const [loginError, setLoginError] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('aio-theme') !== 'light') {
      document.documentElement.classList.add('dark');
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    // 1. Process redirect result on web (only if redirect was explicitly started)
    if (!Capacitor.isNativePlatform() && auth) {
      const isRedirectPending = sessionStorage.getItem('aio_auth_redirect_pending') === 'true';
      getRedirectResult(auth)
        .then((result) => {
          if (!isMounted) return;
          if (result?.user) {
            setUser(result.user);
          }
        })
        .catch((error) => {
          if (!isMounted) return;
          if (isRedirectPending) {
            console.error("Redirect sign-in error:", error);
            setLoginError(error.message || "Failed to complete redirect sign-in.");
          } else {
            console.info("Launch auth status notice:", error?.code || error);
          }
        })
        .finally(() => {
          sessionStorage.removeItem('aio_auth_redirect_pending');
        });
    }

    // 2. Initialize native GoogleAuth on mobile
    if (Capacitor.isNativePlatform() && firebaseConfig.oAuthClientId) {
      GoogleAuth.initialize({
        clientId: firebaseConfig.oAuthClientId,
        serverClientId: firebaseConfig.oAuthClientId,
        scopes: ['profile', 'email'],
        grantOfflineAccess: false,
      }).catch((err) => {
        console.warn("Native GoogleAuth init warning on mount:", err);
      });
    }

    // 3. Listen to authentication state
    let unsubscribe = () => {};
    if (auth) {
      unsubscribe = onAuthStateChanged(
        auth,
        (currentUser) => {
          if (!isMounted) return;
          setUser(currentUser);
          setLoadingAuth(false);
        },
        (error) => {
          if (!isMounted) return;
          console.warn("Auth state observer notice:", error);
          setLoadingAuth(false);
        }
      );
    }

    // Safety timeout to guarantee auth loader never stays stuck
    const authTimeout = setTimeout(() => {
      if (isMounted) setLoadingAuth(false);
    }, 4000);

    return () => {
      isMounted = false;
      clearTimeout(authTimeout);
      unsubscribe();
    }; 
  }, []);

  const handleLogin = async () => {
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      if (!auth || !firebaseConfig.apiKey) {
        throw new Error("Firebase authentication is unavailable. Please verify configuration.");
      }

      if (Capacitor.isNativePlatform()) {
        try {
          await GoogleAuth.initialize({
            clientId: firebaseConfig.oAuthClientId,
            serverClientId: firebaseConfig.oAuthClientId,
            scopes: ['profile', 'email'],
            grantOfflineAccess: false,
          });
        } catch {
          // Plugin already initialized
        }

        const googleUser = await GoogleAuth.signIn();
        const idToken = googleUser?.authentication?.idToken || googleUser?.idToken;
        if (!idToken) {
          throw new Error("Unable to obtain Google ID token. Please try again.");
        }
        const credential = GoogleAuthProvider.credential(idToken, googleUser?.authentication?.accessToken || null);
        await signInWithCredential(auth, credential);
      } else if (isDesktop) {
        // Industry-standard RFC 8252 Loopback OAuth for Windows Desktop
        const invoke = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
        if (!invoke) {
          throw new Error("Desktop native bridge is unavailable.");
        }
        const tokens = await invoke('start_system_browser_auth');
        const idToken = tokens?.id_token || tokens?.idToken || null;
        const accessToken = tokens?.access_token || tokens?.accessToken || null;
        if (!idToken && !accessToken) {
          throw new Error("Did not receive authorization tokens from desktop authentication.");
        }
        const credential = GoogleAuthProvider.credential(idToken, accessToken);
        await signInWithCredential(auth, credential);
      } else {
        // Web / Vercel browser: Popup with redirect fallback
        try {
          await signInWithPopup(auth, googleProvider);
        } catch (popupErr) {
          if (popupErr.code === 'auth/popup-closed-by-user') {
            console.log("User closed sign-in popup.");
          } else {
            console.warn("Sign-in popup notice, falling back to redirect:", popupErr?.code || popupErr);
            try {
              sessionStorage.setItem('aio_auth_redirect_pending', 'true');
              await signInWithRedirect(auth, googleProvider);
            } catch (redirectErr) {
              sessionStorage.removeItem('aio_auth_redirect_pending');
              throw redirectErr;
            }
          }
        }
      }
    } catch (error) {
      console.error("Login Error:", error);
      const code = error?.code || error?.statusCode;
      const rawMsg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
      if (code === 'auth/unauthorized-domain') {
        setLoginError(`Domain "${window.location.hostname}" is not authorized. Add it to Firebase Console -> Authentication -> Settings -> Authorized Domains.`);
      } else if (code === 'auth/popup-blocked') {
        setLoginError("Pop-up blocked. Please allow pop-ups for this site or try again.");
      } else if (code === 'auth/network-request-failed') {
        setLoginError(`Network request failed (${rawMsg || code}). Please verify connection.`);
      } else {
        const displayCode = code && !rawMsg.includes(String(code)) ? ` [Code: ${code}]` : '';
        setLoginError(`${rawMsg}${displayCode}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    if (loadingAuth || user) return;
    if (typeof window !== 'undefined' && window.location.search) {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('action') === 'login') {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        const timer = setTimeout(() => {
          handleLogin();
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [loadingAuth, user]);

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0c] flex items-center justify-center w-full max-w-full overflow-x-clip">
        <p className="font-bold text-gray-500">Loading Auth...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0c] flex flex-col items-center justify-center p-4 transition-colors w-full max-w-full overflow-x-clip">
        <div className="bg-white dark:bg-[#121215] p-8 md:p-12 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 text-center max-w-md w-full">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-purple-600 to-indigo-600 dark:from-red-500 dark:via-purple-500 dark:to-indigo-400 mb-2 select-none">
            AIO Calender MK2
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8 font-medium">Sign in to sync your schedule across all devices.</p>
          {!firebaseConfig.apiKey && (
            <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs text-left">
              Firebase is not yet configured. Please supply your Firebase settings via <code>.env</code>.
            </div>
          )}
          {loginError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 text-xs text-left break-words">
              Login Failed: {loginError}
            </div>
          )}
          <button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-[#1a1a20] border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-[#25252b] text-gray-800 dark:text-gray-200 py-3.5 px-4 rounded-xl font-bold transition-all shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
            <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" className="w-5 h-5" />
            {isLoggingIn ? 'Waiting for browser sign-in...' : 'Continue with Google'}
          </button>
        </div>
      </div>
    );
  }

  return <MainDashboard user={user} />;
}


// ==========================================
// 2. MAIN APPLICATION DASHBOARD
// ==========================================
const DEFAULT_NOTIF_SETTINGS = {
  classNotifs: true,
  classLeadTime: '10',
  taskNotifs: true,
  taskLeadTime: '60',
  taskRepeatFrequency: 'daily',
  vibrateEnabled: true
};

function MainDashboard({ user }) {
  // ----------------------------------------
  // ALL HOOKS MUST BE AT THE TOP
  // ----------------------------------------
  
  // UI State
  const [gridContentType, setGridContentType] = useState('Lectures'); // New Toggle State
  const [activeTab, setActiveTab] = useState('dashboard'); 
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('aio-theme') !== 'light');
  const [activeView, setActiveView] = useState('list'); 
  const [activeSemester, setActiveSemester] = useState(() => localStorage.getItem('aio-active-sem') || 'Monsoon 2026');
  const [viewFilter, setViewFilter] = useState('Today'); 
  
  // Date/Grid Configuration Constants (Moved up for safe access)
  const startHour = 8; 
  const endHour = 20;  
  const totalMinutes = (endHour - startHour) * 60;
  const hoursArray = Array.from({ length: endHour - startHour + 1 }, (_, i) => i + startHour);

  const initialDayStr = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const ALL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dayValues = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6, Sunday: 7 };
  const [activeGridDay, setActiveGridDay] = useState(ALL_DAYS.includes(initialDayStr) ? initialDayStr : 'Monday');

  // Dynamic array: hides Sunday for lectures, shows it for tasks
  const displayDays = gridContentType === 'Lectures' 
    ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] 
    : ALL_DAYS;

  // Helper to position a task on the grid based on time
  const getTaskStyle = (time) => {
    if (!time) return { top: '0%', height: '40px' };
    const [h, m] = time.split(':').map(Number);
    let topMinutes = (h - startHour) * 60 + m;
    
    // Keep tasks inside the visible grid even if they are due at 11:59 PM
    if (topMinutes > totalMinutes - 40) topMinutes = totalMinutes - 40;
    if (topMinutes < 0) topMinutes = 0;

    return {
      top: `${(topMinutes / totalMinutes) * 100}%`,
      height: '45px',
    };
  };

  // Cloud & Instant Offline-First Local Data State
  const [allSchedules, setAllSchedules] = useState(() => {
    try {
      const saved = localStorage.getItem('aio-cached-schedules');
      return saved ? JSON.parse(saved) : { 'Monsoon 2026': [] };
    } catch {
      return { 'Monsoon 2026': [] };
    }
  });

  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem('aio-cached-tasks');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [notifSettings, setNotifSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('aio-cached-notif-settings');
      return saved ? JSON.parse(saved) : DEFAULT_NOTIF_SETTINGS;
    } catch {
      return DEFAULT_NOTIF_SETTINGS;
    }
  });

  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [syncError, setSyncError] = useState(() => (!db ? "Firebase 'db' is not initialized." : null));

  // Desktop Preferences State (Windows Native)
  const [desktopSettings, setDesktopSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('aio-desktop-settings');
      return saved ? JSON.parse(saved) : { minimizeToTray: true };
    } catch {
      return { minimizeToTray: true };
    }
  });

  useEffect(() => {
    if (isDesktop) {
      const invoke = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
      if (invoke) {
        invoke('get_desktop_settings')
          .then((res) => {
            if (res) {
              setDesktopSettings({
                minimizeToTray: res.minimize_to_tray ?? true,
              });
              try {
                localStorage.setItem('aio-desktop-settings', JSON.stringify({
                  minimizeToTray: res.minimize_to_tray ?? true,
                }));
              } catch {
                // ignore
              }
            }
          })
          .catch((err) => {
            console.debug('Desktop settings fetch error:', err);
          });
      }
    }
  }, []);

  const handleDesktopSettingToggle = async (key, value) => {
    const updated = { ...desktopSettings, [key]: value };
    setDesktopSettings(updated);
    try {
      localStorage.setItem('aio-desktop-settings', JSON.stringify(updated));
    } catch {
      // ignore
    }
    if (isDesktop) {
      const invoke = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
      if (invoke) {
        try {
          if (key === 'minimizeToTray') {
            await invoke('set_minimize_to_tray', { enabled: value });
          }
        } catch (err) {
          console.error(`Failed to update desktop setting ${key}:`, err);
        }
      }
    }
  };

  // Form State
  const [newClass, setNewClass] = useState({
    day: 'Monday', courseCode: '', courseName: '', section: '', startTime: '', endTime: '', building: '', room: ''
  });
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', due: '', time: '', location: '', type: 'Assignment' });

  // Live Time Engine
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const current24HourTime = currentTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const currentDayStr = currentTime.toLocaleDateString('en-US', { weekday: 'long' });

  // Theme Sync
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('aio-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('aio-theme', 'light');
    }
  }, [isDarkMode]);

  // Semester Preference Sync
  useEffect(() => {
    if (activeSemester) localStorage.setItem('aio-active-sem', activeSemester);
  }, [activeSemester]);

  // Notification Diagnostics State
  const [notifStatus, setNotifStatus] = useState({
    isNative: false,
    displayPermission: 'default',
    exactAlarmStatus: 'granted',
    isBatteryIgnored: true,
    manufacturer: '',
    model: ''
  });
  const [showAdvancedTuning, setShowAdvancedTuning] = useState(false);

  const refreshDiagnostics = () => {
    getNotificationStatus().then((status) => {
      setNotifStatus(status);
    });
  };

  // 1. Set up the Android Notification Channels & Diagnostics (Mobile Native only)
  useEffect(() => {
    let active = true;
    if (isNativeMobile) {
      setupNotifications().then(() => {
        if (active) {
          refreshDiagnostics();
        }
      });
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isNativeMobile) {
        refreshDiagnostics();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // 2. Monitor Firebase data to rebuild the alarms dynamically (Native Mobile & Desktop only)
  useEffect(() => {
    if (allSchedules && tasks && notifSettings) {
      const currentClasses = allSchedules[activeSemester] || [];
      if (!isWebOnly) {
        syncAllAlarms(currentClasses, tasks, notifSettings);
      }
    }
  }, [allSchedules, tasks, activeSemester, notifSettings]);

  // ----------------------------------------
  // FIREBASE REAL-TIME SYNC LISTENER (OFFLINE-FIRST)
  // ----------------------------------------
  const userDocPath = `users/${user.uid}`;
  const [showNewSemInput, setShowNewSemInput] = useState(false);
  const [newSemName, setNewSemName] = useState('');

  useEffect(() => {
    if (!db) return;
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, { includeMetadataChanges: true }, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const scheds = data.schedules || { 'Monsoon 2026': [] };
        const userTasks = data.tasks || [];
        const settings = data.notifSettings || DEFAULT_NOTIF_SETTINGS;
        setAllSchedules(scheds);
        setTasks(userTasks);
        setNotifSettings(settings);
        setIsCloudSynced(!docSnap.metadata.fromCache);
        try {
          localStorage.setItem('aio-cached-schedules', JSON.stringify(scheds));
          localStorage.setItem('aio-cached-tasks', JSON.stringify(userTasks));
          localStorage.setItem('aio-cached-notif-settings', JSON.stringify(settings));
        } catch (e) {
          console.debug("Local storage write notice:", e);
        }
      } else {
        setIsCloudSynced(true);
        setDoc(userRef, {
          email: user.email || '',
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
          uid: user.uid,
          schedules: { 'Monsoon 2026': [] },
          tasks: [],
          notifSettings: DEFAULT_NOTIF_SETTINGS,
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(err => {
          setSyncError(err.message);
          handleFirestoreError(err, OperationType.WRITE, userDocPath);
        });
      }
    }, (error) => {
      console.warn("Firestore snapshot notice:", error);
      handleFirestoreError(error, OperationType.GET, userDocPath);
    });
    return () => unsubscribe();
  }, [user.uid, userDocPath, user.email, user.displayName, user.photoURL]);

  // ----------------------------------------
  // CLOUD WRITE FUNCTIONS (OPTIMISTIC SYNC)
  // ----------------------------------------
  const saveUserFields = async (fields) => {
    try {
      // 1. Optimistic instant local updates
      if (fields.schedules) {
        setAllSchedules(fields.schedules);
        try { localStorage.setItem('aio-cached-schedules', JSON.stringify(fields.schedules)); } catch (e) { console.debug(e); }
      }
      if (fields.tasks) {
        setTasks(fields.tasks);
        try { localStorage.setItem('aio-cached-tasks', JSON.stringify(fields.tasks)); } catch (e) { console.debug(e); }
      }
      if (fields.notifSettings) {
        setNotifSettings(fields.notifSettings);
        try { localStorage.setItem('aio-cached-notif-settings', JSON.stringify(fields.notifSettings)); } catch (e) { console.debug(e); }
      }

      // 2. Persist to Firestore (persistent cache writes locally first, then syncs to cloud)
      if (db) {
        await setDoc(doc(db, 'users', user.uid), {
          ...fields,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (error) {
      console.error("Firestore save notice:", error);
      setSyncError(error.message);
      handleFirestoreError(error, OperationType.WRITE, userDocPath);
    }
  };

  const handleAddClass = async (e) => {
    e.preventDefault();
    if (!newClass.courseName || !newClass.startTime || !newClass.endTime) return; 
    const classEntry = { id: Date.now(), ...newClass };
    const currentClasses = allSchedules[activeSemester] || [];
    const updatedSchedules = { ...allSchedules, [activeSemester]: [...currentClasses, classEntry] };
    await saveUserFields({ schedules: updatedSchedules });
    setNewClass({ day: 'Monday', courseCode: '', courseName: '', section: '', startTime: '', endTime: '', building: '', room: '' });
  };

  const handleDeleteClass = async (id) => {
    const currentClasses = allSchedules[activeSemester] || [];
    const updatedSchedules = { ...allSchedules, [activeSemester]: currentClasses.filter(c => c.id !== id) };
    await saveUserFields({ schedules: updatedSchedules });
  };

  const handleSemesterChange = (e) => {
    const selected = e.target.value;
    if (selected === 'NEW') {
      setShowNewSemInput(true);
    } else {
      setShowNewSemInput(false);
      setActiveSemester(selected);
    }
  };

  const handleCreateSemester = async (e) => {
    e.preventDefault();
    const trimmed = newSemName.trim();
    if (trimmed && !allSchedules[trimmed]) {
      const updatedSchedules = { ...allSchedules, [trimmed]: [] };
      await saveUserFields({ schedules: updatedSchedules });
      setActiveSemester(trimmed);
    }
    setNewSemName('');
    setShowNewSemInput(false);
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.title) return;
    const updatedTasks = [...tasks, { id: Date.now(), ...newTask, completed: false }];
    await saveUserFields({ tasks: updatedTasks });
    setNewTask({ title: '', due: '', time: '', location: '', type: 'Assignment' });
    setShowTaskForm(false);
  };

  const handleDeleteTask = async (id) => {
    const updatedTasks = tasks.filter(t => t.id !== id);
    await saveUserFields({ tasks: updatedTasks });
  };

  const toggleTaskCompletion = async (id) => {
    const updatedTasks = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    await saveUserFields({ tasks: updatedTasks });
  };

  const handleNotifSettingsChange = async (key, value) => {
    const updatedSettings = { ...notifSettings, [key]: value };
    await saveUserFields({ notifSettings: updatedSettings });
  };

  // ----------------------------------------
  // MAIN UI RENDER LOGIC (OFFLINE-FIRST)
  // ----------------------------------------
  const semesters = Object.keys(allSchedules);
  const currentClasses = allSchedules[activeSemester] || [];
  
  const sortedClasses = [...currentClasses].sort((a, b) => {
    if (dayValues[a.day] !== dayValues[b.day]) return dayValues[a.day] - dayValues[b.day];
    return a.startTime.localeCompare(b.startTime); 
  });
  const displayedClasses = viewFilter === 'Today' ? sortedClasses.filter(c => c.day === currentDayStr) : sortedClasses;

  const getClassStatus = (lecture) => {
    if (lecture.day !== currentDayStr) return 'upcoming'; 
    if (current24HourTime >= lecture.startTime && current24HourTime <= lecture.endTime) return 'ongoing';
    if (current24HourTime > lecture.endTime) return 'past';
    return 'upcoming';
  };

  const format12Hour = (time24) => {
    if (!time24) return '';
    const [h, m] = time24.split(':');
    const hours = parseInt(h, 10);
    const suffix = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${m} ${suffix}`;
  };

  const getEventStyle = (startTime, endTime) => {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const topMinutes = (startH - startHour) * 60 + startM;
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    return {
      top: `${(topMinutes / totalMinutes) * 100}%`,
      height: `${(durationMinutes / totalMinutes) * 100}%`
    };
  };

  const eventColors = [
    'bg-blue-100 border-blue-500 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-600',
    'bg-green-100 border-green-500 text-green-800 dark:bg-green-900/30 dark:text-green-300 dark:border-green-600',
    'bg-yellow-100 border-yellow-500 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-600',
    'bg-purple-100 border-purple-500 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-600',
    'bg-pink-100 border-pink-500 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-600',
    'bg-orange-100 border-orange-500 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-600',
  ];

  const getEventColor = (courseCode) => {
    if (!courseCode) return eventColors[0];
    const sum = courseCode.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return eventColors[sum % eventColors.length];
  };

  return (
    <div className="min-h-screen transition-colors duration-300 bg-gray-50 dark:bg-[#0a0a0c] text-gray-800 dark:text-gray-200 font-sans p-4 md:p-8 pb-24 md:pb-8 flex flex-col w-full max-w-full overflow-x-clip">
      
      {/* Top Header */}
      <header className="mb-6 flex flex-col xl:flex-row justify-between xl:items-center gap-4 shrink-0 border-b border-gray-200 dark:border-gray-800/80 pb-4">
        <div className="flex justify-between items-center w-full xl:w-auto">
          <div className="flex items-center gap-2">
            <h1 className="text-[1.4rem] xs:text-[1.65rem] sm:text-3xl font-semibold tracking-tight whitespace-nowrap select-none text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-purple-600 to-indigo-600 dark:from-red-500 dark:via-purple-500 dark:to-indigo-400">
              AIO Calender MK2
            </h1>
          </div>
          <div className="flex md:hidden items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${isCloudSynced ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'}`}>
              {isCloudSynced ? '☁️ Synced' : '📶 Offline Ready'}
            </span>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 rounded-lg bg-gray-200 dark:bg-gray-800 text-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors shadow-sm">
              {isDarkMode ? '🌞' : '🌙'}
            </button>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-2 bg-gray-200 dark:bg-[#1a1a20] p-1.5 rounded-xl border border-gray-300 dark:border-gray-800">
          <button 
            onClick={() => setActiveTab('dashboard')} 
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all duration-200 flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-red-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
            📊 Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('schedule')} 
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all duration-200 flex items-center gap-2 ${activeTab === 'schedule' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-red-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
            ✏️ Schedule Manager
          </button>
          <button 
            onClick={() => setActiveTab('settings')} 
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all duration-200 flex items-center gap-2 ${activeTab === 'settings' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-red-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'}`}>
            {isWebOnly ? '⚙️ Settings' : '⚙️ Settings & Notifs'}
          </button>
        </nav>

        {/* Status Bar & Google Account Profile (REORDERED) */}
        <div className="hidden md:flex items-center gap-4">
          
          {/* Cloud Sync State Badge */}
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${isCloudSynced ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'}`}>
            {isCloudSynced ? '☁️ Cloud Synced' : '📶 Offline Ready'}
          </span>

          {/* 1. Time Display */}
          <div className="flex items-center gap-3 bg-white dark:bg-[#1a1a20] px-4 py-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">{currentDayStr}</span>
            <span className="text-lg font-bold text-blue-600 dark:text-red-500 tracking-wider">{current24HourTime}</span>
          </div>

          {/* 2. Theme Toggle (Moved to the middle) */}
          <button onClick={() => setIsDarkMode(!isDarkMode)} className="p-2 px-4 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors shadow-inner font-medium cursor-pointer flex-shrink-0">
            {isDarkMode ? '🌞' : '🌙'}
          </button>

          {/* 3. User Profile & Logout (Moved to the extreme right) */}
          <div className="flex items-center gap-3 bg-white dark:bg-[#1a1a20] px-3 py-1.5 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
            {user.photoURL && <img src={user.photoURL} alt="Profile" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" onError={(e) => e.target.style.display='none'} />}
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 hidden lg:block">{user.displayName}</span>
            <button onClick={() => { if (auth) signOut(auth); }} className="ml-2 text-gray-400 hover:text-red-500 transition-colors cursor-pointer" title="Sign Out">🚪</button>
          </div>

        </div>
      </header>

      {/* Non-blocking sync notice if any error occurs */}
      {syncError && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200 shrink-0 shadow-sm">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{syncError}</span>
          </div>
          <button onClick={() => setSyncError(null)} className="font-bold underline cursor-pointer ml-3">Dismiss</button>
        </div>
      )}

      {/* TAB 1: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="flex-1 flex flex-col space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-[#121215] p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
            {/* Left: Active Term (Order 1 on both) */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto order-1">
              <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">Active Term:</span>
              <select value={showNewSemInput ? 'NEW' : activeSemester} onChange={handleSemesterChange} className="w-full sm:w-auto text-sm bg-gray-100 dark:bg-[#1a1a20] text-gray-800 dark:text-gray-200 rounded-md px-3 py-1.5 font-bold border border-gray-200 dark:border-gray-700 outline-none cursor-pointer">
                {semesters.map(sem => <option key={sem} value={sem}>{sem}</option>)}
                <option value="NEW">+ New Semester</option>
              </select>
              {showNewSemInput && (
                <form onSubmit={handleCreateSemester} className="flex items-center gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="e.g., Winter 2027"
                    value={newSemName}
                    onChange={(e) => setNewSemName(e.target.value)}
                    className="text-sm bg-white dark:bg-[#1a1a20] text-gray-800 dark:text-gray-200 rounded-md px-2.5 py-1 border border-gray-300 dark:border-gray-700 outline-none"
                    autoFocus
                  />
                  <button type="submit" className="text-xs font-bold bg-blue-600 dark:bg-red-600 text-white px-3 py-1.5 rounded-md cursor-pointer">Add</button>
                  <button type="button" onClick={() => setShowNewSemInput(false)} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-1.5 cursor-pointer">✕</button>
                </form>
              )}
            </div>

            {/* Middle: Lectures vs Tasks Toggle (Order 3 on mobile, Order 2 on laptop) */}
            {activeView === 'calendar' && (
              <div className="flex bg-gray-100 dark:bg-[#1a1a20] p-1 rounded-lg border border-gray-200 dark:border-gray-800 w-full md:w-auto self-stretch order-3 md:order-2">
                <button onClick={() => setGridContentType('Lectures')} className={`flex-1 md:flex-none px-6 py-1.5 rounded-md text-xs font-bold transition-all ${gridContentType === 'Lectures' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-red-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                  📚 Lectures
                </button>
                <button onClick={() => setGridContentType('Tasks')} className={`flex-1 md:flex-none px-6 py-1.5 rounded-md text-xs font-bold transition-all ${gridContentType === 'Tasks' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-purple-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
                  🎯 Tasks
                </button>
              </div>
            )}

            {/* Right: List View vs Calendar Grid (Order 2 on mobile, Order 3 on laptop) */}
            <div className="flex bg-gray-100 dark:bg-[#1a1a20] p-1 rounded-lg border border-gray-200 dark:border-gray-800 w-full md:w-auto self-stretch order-2 md:order-3">
              <button onClick={() => setActiveView('list')} className={`flex-1 md:flex-none px-5 py-1.5 rounded-md text-xs font-bold transition-all ${activeView === 'list' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-red-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>📋 List View</button>
              <button onClick={() => setActiveView('calendar')} className={`flex-1 md:flex-none px-5 py-1.5 rounded-md text-xs font-bold transition-all ${activeView === 'calendar' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-red-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>📅 Calendar Grid</button>
            </div>
          </div>

          {activeView === 'list' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white dark:bg-[#121215] rounded-xl shadow-sm p-6 border border-gray-100 dark:border-red-900/30">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold dark:text-red-400">Classes Agenda</h2>
                    <div className="flex bg-gray-100 dark:bg-[#1a1a20] rounded-lg p-1 border border-gray-200 dark:border-gray-800">
                      <button onClick={() => setViewFilter('Today')} className={`px-4 py-1 rounded-md text-sm font-bold transition-colors ${viewFilter === 'Today' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>Today</button>
                      <button onClick={() => setViewFilter('All')} className={`px-4 py-1 rounded-md text-sm font-bold transition-colors ${viewFilter === 'All' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>All Week</button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {displayedClasses.length === 0 ? (
                      <div className="text-center py-10">
                        <p className="text-gray-500 dark:text-gray-400 italic">No classes scheduled for {viewFilter === 'Today' ? 'today' : 'this week'}.</p>
                        <button onClick={() => setActiveTab('schedule')} className="mt-3 text-sm text-blue-600 dark:text-red-400 font-bold hover:underline cursor-pointer">+ Add classes in Schedule Manager</button>
                      </div>
                    ) : (
                      displayedClasses.map((lecture) => {
                        const status = getClassStatus(lecture);
                        let containerStyles = "p-5 rounded-lg border transition-all duration-300 group flex flex-col sm:flex-row sm:justify-between ";
                        if (status === 'past') containerStyles += "bg-gray-100 dark:bg-[#15151a] border-gray-100 dark:border-gray-800 opacity-60"; 
                        else if (status === 'ongoing') containerStyles += "bg-blue-50 dark:bg-[#1f1618] border-blue-300 dark:border-red-500/60 shadow-[0_0_15px_rgba(59,130,246,0.2)] dark:shadow-[0_0_15px_rgba(239,68,68,0.2)]"; 
                        else containerStyles += "bg-white dark:bg-[#1a1a20] border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-red-500/50"; 

                        return (
                          <div key={lecture.id} className={containerStyles}>
                            <div className="flex flex-col sm:flex-row gap-4 items-start">
                              <div className="flex flex-col gap-2 relative">
                                {status === 'ongoing' && <span className="absolute -left-2 -top-2 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 dark:bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500 dark:bg-red-500"></span></span>}
                                <span className={`px-3 py-1 rounded-full text-xs font-bold border w-fit text-center ${status === 'ongoing' ? 'bg-blue-200 dark:bg-red-900/60 text-blue-800 dark:text-red-300 border-blue-300 dark:border-red-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 border-transparent'}`}>
                                  {lecture.day}
                                </span>
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                  {format12Hour(lecture.startTime)} - {format12Hour(lecture.endTime)}
                                </span>
                              </div>
                              <div className="mt-2 sm:mt-0">
                                <h3 className={`font-bold text-lg transition-colors ${status === 'ongoing' ? 'text-blue-700 dark:text-red-400' : 'group-hover:text-blue-600 dark:group-hover:text-red-400'}`}>
                                  {lecture.courseCode && <span className="mr-2">{lecture.courseCode}</span>}{lecture.courseName}
                                </h3>
                                {lecture.section && <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">Sec {lecture.section}</p>}
                              </div>
                            </div>
                            <div className="mt-4 sm:mt-0 flex sm:flex-col justify-between sm:justify-center items-center sm:items-end gap-3">
                              <div className={`px-4 py-2 rounded-md shadow-sm border text-sm font-medium text-right ${status === 'ongoing' ? 'bg-blue-100 dark:bg-red-950/40 border-blue-200 dark:border-red-900/50 text-blue-800 dark:text-red-300' : 'bg-white dark:bg-black border-gray-200 dark:border-gray-800 dark:text-gray-300'}`}>
                                {lecture.building && <span>{lecture.building}</span>}{lecture.building && lecture.room && <br/>}{lecture.room && <span>Room {lecture.room}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-[#121215] rounded-xl shadow-sm p-6 border border-gray-100 dark:border-purple-900/30 h-fit">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold dark:text-purple-400">Tasks & Events</h2>
                  <button 
                    onClick={() => {
                      if (showTaskForm) {
                        // Clear the form data when the user clicks 'X'
                        setNewTask({ title: '', due: '', time: '', location: '', type: 'Assignment' });
                      }
                      setShowTaskForm(!showTaskForm);
                    }} 
                    className="text-xl text-blue-600 dark:text-purple-400 hover:text-blue-800 dark:hover:text-purple-300 font-bold px-3 py-1 bg-blue-50 dark:bg-purple-900/30 rounded-md transition-colors cursor-pointer"
                  >
                    {showTaskForm ? '✕' : '+'}
                  </button>
                </div>
                {showTaskForm && (
                  <form onSubmit={handleAddTask} className="mb-6 p-4 bg-gray-50 dark:bg-[#1a1a20] rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
                    {/* 1. Task or Event Title */}
                    <input type="text" placeholder="Task or Event Title" required value={newTask.title} onChange={(e) => setNewTask({...newTask, title: e.target.value})} className="w-full p-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200 placeholder-gray-400 outline-none text-sm" />
                    
                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
                      {/* Date Wrapper (Order 2 on Mobile so it's below Assignment, Order 1 on Laptop so it's on the left) */}
                      <label className="flex items-center w-full sm:w-[55%] bg-white dark:bg-[#121215] border border-gray-200 dark:border-gray-700 rounded-md px-2 py-2 cursor-pointer order-2 sm:order-1">
                        <span className="text-xs text-gray-500 font-medium mr-1 whitespace-nowrap">Date:</span>
                        <input 
                          type="date" 
                          value={newTask.due} 
                          onChange={(e) => setNewTask({...newTask, due: e.target.value})} 
                          className="bg-transparent flex-1 min-w-0 outline-none border-none text-gray-900 dark:text-gray-200 dark:[color-scheme:dark] cursor-pointer text-sm"
                          required 
                        />
                      </label>
                      
                      {/* Assignment Dropdown (Order 1 on Mobile so it's on top, Order 2 on Laptop so it's on the right) */}
                      <div className="w-full sm:w-[45%] flex items-center bg-white dark:bg-[#121215] border border-gray-200 dark:border-gray-700 rounded-md pr-2 min-w-0 order-1 sm:order-2">
                        <select value={newTask.type} onChange={(e) => setNewTask({...newTask, type: e.target.value})} className="w-full bg-transparent border-none text-gray-900 dark:text-gray-200 outline-none text-sm cursor-pointer p-2">
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="Assignment">Assignment</option>
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="Quiz">Quiz</option>
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="Exam">Exam</option>
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="Project">Project</option>
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="Event">Event</option>
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="Workshop">Workshop</option>
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="Other">Other</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
                      {/* Time Wrapper */}
                      <label className="flex items-center w-full sm:w-1/2 bg-white dark:bg-[#121215] border border-gray-200 dark:border-gray-700 rounded-md px-2 py-2 cursor-pointer">
                        <span className="text-xs text-gray-500 font-medium mr-1 whitespace-nowrap">Time:</span>
                        <input 
                          type="time" 
                          value={newTask.time} 
                          onChange={(e) => setNewTask({...newTask, time: e.target.value})} 
                          className="bg-transparent flex-1 min-w-0 outline-none border-none text-gray-900 dark:text-gray-200 dark:[color-scheme:dark] cursor-pointer text-sm"
                          required
                        />
                      </label>
                      
                      {/* Location */}
                      <input type="text" placeholder="Location (Optional)" value={newTask.location} onChange={(e) => setNewTask({...newTask, location: e.target.value})} className="w-full sm:w-1/2 p-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200 placeholder-gray-400 outline-none text-sm min-w-0" />
                    </div>
                    
                    <button type="submit" className="w-full mt-1 bg-blue-600 dark:bg-purple-600 hover:bg-blue-700 dark:hover:bg-purple-700 text-white py-2 rounded-md font-bold transition-colors cursor-pointer text-sm shadow-sm">Save Task</button>
                  </form>
                )}
                <div className="space-y-3">
                  {tasks.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 italic text-sm text-center py-4">No pending tasks. You're all caught up!</p>
                  ) : (
                    tasks.map((task) => (
                      <div key={task.id} className={`p-4 border-l-4 rounded-r-lg shadow-sm transition-all flex justify-between items-start group ${task.completed ? 'border-gray-300 bg-gray-50 dark:bg-[#1a1a20] dark:border-gray-600 opacity-60' : 'border-blue-500 dark:border-purple-600 bg-white dark:bg-[#1a1a20]'}`}>
                        <div className="flex items-start gap-3 w-full">
                          <input type="checkbox" checked={task.completed} onChange={() => toggleTaskCompletion(task.id)} className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 cursor-pointer flex-shrink-0" />
                          <div className="w-full">
                            <h3 className={`font-semibold text-md ${task.completed ? 'text-gray-500 line-through dark:text-gray-400' : 'dark:text-gray-200'}`}>{task.title}</h3>
                            <div className="flex flex-wrap gap-2 items-center mt-2 text-xs text-gray-500 dark:text-gray-400">
                              {task.due && <span>📅 {task.due}</span>}
                              {task.time && <span>⏰ {format12Hour(task.time)}</span>}
                              {task.location && <span>📍 {task.location}</span>}
                              <span className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded ml-auto font-medium">{task.type}</span>
                            </div>
                          </div>
                        </div>
                        <button onClick={() => handleDeleteTask(task.id)} className="text-gray-400 hover:text-red-500 cursor-pointer p-1 ml-2">✕</button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeView === 'calendar' && (
            <div className="bg-white dark:bg-[#121215] rounded-xl shadow-sm border border-gray-100 dark:border-red-900/30 flex-1 flex flex-col overflow-hidden w-full max-w-full">
              <div className="flex-1 overflow-x-auto max-w-full">
                <div className="min-w-full lg:min-w-[800px] w-full relative pb-4">
                  <div className="hidden lg:flex border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-[#121215] z-20">
                      <div className="w-16 shrink-0 bg-gray-50 dark:bg-[#1a1a20]"></div> 
                      {displayDays.map(day => (
                          <div key={day} className={`flex-1 text-center py-3 font-bold text-sm border-l border-gray-200 dark:border-gray-800 ${day === currentDayStr ? 'text-blue-600 dark:text-red-400 bg-blue-50/50 dark:bg-red-900/10' : 'text-gray-700 dark:text-gray-300'}`}>
                              {day.substring(0,3).toUpperCase()}
                          </div>
                      ))}
                  </div>
                  <div className="flex lg:hidden border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white dark:bg-[#121215] z-20">
                      <div className="w-12 sm:w-16 shrink-0 bg-gray-50 dark:bg-[#1a1a20]"></div> 
                      <div className="flex-1 border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1a1a20]">
                          <select 
                              value={activeGridDay}
                              onChange={(e) => setActiveGridDay(e.target.value)}
                              className="w-full text-center py-3 font-bold text-sm bg-transparent outline-none text-blue-600 dark:text-red-400 cursor-pointer"
                              style={{ textAlignLast: 'center' }}
                          >
                              {displayDays.map(day => (
                                  <option key={day} value={day} className="text-gray-900 dark:text-gray-200 bg-white dark:bg-[#121215]">
                                      {day} ▾
                                  </option>
                              ))}
                          </select>
                      </div>
                  </div>
                  <div className="flex relative" style={{ height: '800px' }}>
                      <div className="w-12 sm:w-16 shrink-0 flex flex-col relative border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-[#1a1a20]">
                          {hoursArray.map(hour => (
                              <div key={hour} className="absolute w-full text-right pr-2 sm:pr-3 text-[10px] sm:text-[11px] font-bold text-gray-400 dark:text-gray-500"
                                   style={{ top: `${((hour - startHour) / (endHour - startHour)) * 100}%`, transform: 'translateY(-50%)' }}>
                                  {format12Hour(`${hour.toString().padStart(2, '0')}:00`)}
                              </div>
                          ))}
                      </div>
                      {displayDays.map(day => (
                        <div key={day} className={`flex-1 relative border-l border-gray-200 dark:border-gray-800 
                            ${activeGridDay === day ? 'block' : 'hidden lg:block'} 
                            ${day === currentDayStr ? 'bg-blue-50/30 dark:bg-red-900/5' : ''}`}>
                            
                            {/* Horizontal Hour Lines */}
                            {hoursArray.map(hour => (
                                <div key={hour} className="absolute w-full border-t border-gray-100 dark:border-gray-800/60 pointer-events-none"
                                    style={{ top: `${((hour - startHour) / (endHour - startHour)) * 100}%` }}></div>
                            ))}
                            
                            {/* RENDER LECTURES OR TASKS */}
                            {gridContentType === 'Lectures' ? (
                              currentClasses.filter(c => c.day === day).map((lecture) => {
                                  const style = getEventStyle(lecture.startTime, lecture.endTime);
                                  const colorClass = getEventColor(lecture.courseCode); 
                                  return (
                                      <div key={lecture.id}
                                          className={`absolute w-[92%] left-[4%] rounded-md border-l-4 p-2 text-xs overflow-hidden shadow-sm z-10 ${colorClass}`}
                                          style={style}>
                                          <div className="font-extrabold truncate text-[11px] uppercase tracking-wider">{lecture.courseCode}</div>
                                          <div className="truncate font-bold opacity-90">{lecture.courseName}</div>
                                          <div className="opacity-75 mt-1 font-medium text-[10px] sm:text-xs">{format12Hour(lecture.startTime)} - {format12Hour(lecture.endTime)}</div>
                                          {lecture.room && <div className="opacity-75 font-medium truncate mt-0.5 text-[10px] sm:text-xs">Room {lecture.room}</div>}
                                      </div>
                                  );
                              })
                            ) : (
                              tasks.filter(t => {
                                  if (!t.due || !t.time || t.completed) return false;
                                  // Safely convert YYYY-MM-DD to a Day string without timezone shifts
                                  const taskDayStr = new Date(t.due + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
                                  return taskDayStr === day;
                              }).map((task) => (
                                  <div key={task.id}
                                      className="absolute w-[92%] left-[4%] rounded-md border-l-4 border-purple-500 bg-white dark:bg-[#1a1a20] p-1.5 text-xs overflow-hidden shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_12px_rgba(168,85,247,0.15)] z-20 flex flex-col justify-center transition-all hover:scale-[1.02]"
                                      style={getTaskStyle(task.time)}>
                                      <div className="font-extrabold truncate text-[11px] text-gray-900 dark:text-purple-300">{task.title}</div>
                                      <div className="opacity-80 font-medium truncate text-[10px] text-gray-600 dark:text-gray-400">
                                          {format12Hour(task.time)} {task.location ? `• ${task.location}` : ''}
                                      </div>
                                  </div>
                              ))
                            )}
                        </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SCHEDULE MANAGER */}
      {activeTab === 'schedule' && (
        <div className="flex-1 space-y-6 animate-in fade-in duration-300 w-full max-w-full overflow-x-clip">
          <div className="bg-white dark:bg-[#121215] rounded-xl shadow-sm p-6 border border-gray-100 dark:border-red-900/30">
            <h2 className="text-xl font-semibold mb-2 dark:text-red-400">Class Timetable Management</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Add new lectures or delete existing slots for {activeSemester}.</p>
            <form onSubmit={handleAddClass} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-gray-50 dark:bg-[#1a1a20] p-4 rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="flex items-center bg-white dark:bg-[#121215] border border-gray-200 dark:border-gray-700 rounded-md pr-2 focus-within:ring-2 focus-within:ring-red-500">
                <select value={newClass.day} onChange={(e) => setNewClass({...newClass, day: e.target.value})} className="w-full bg-transparent border-none text-gray-900 dark:text-gray-200 outline-none cursor-pointer p-2.5">
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => <option key={d} value={d} className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200">{d}</option>)}
                </select>
              </div>
              <input type="text" placeholder="Course Code (e.g. ENR211)" value={newClass.courseCode} onChange={(e) => setNewClass({...newClass, courseCode: e.target.value})} className="p-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200 outline-none" />
              <input type="text" placeholder="Course Name" value={newClass.courseName} onChange={(e) => setNewClass({...newClass, courseName: e.target.value})} className="p-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200 lg:col-span-2 outline-none" />
              <input type="text" placeholder="Section (e.g. 2)" value={newClass.section} onChange={(e) => setNewClass({...newClass, section: e.target.value})} className="p-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200 outline-none" />
              <div className="flex items-center bg-white dark:bg-[#121215] border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2">
                <span className="text-xs text-gray-500 font-medium mr-2 whitespace-nowrap">Start:</span>
                <input type="time" required value={newClass.startTime} onChange={(e) => setNewClass({...newClass, startTime: e.target.value})} className="bg-transparent w-full outline-none text-gray-900 dark:text-gray-200 dark:[color-scheme:dark] cursor-pointer" />
              </div>
              <div className="flex items-center bg-white dark:bg-[#121215] border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2">
                <span className="text-xs text-gray-500 font-medium mr-2 whitespace-nowrap">End:</span>
                <input type="time" required value={newClass.endTime} onChange={(e) => setNewClass({...newClass, endTime: e.target.value})} className="bg-transparent w-full outline-none text-gray-900 dark:text-gray-200 dark:[color-scheme:dark] cursor-pointer" />
              </div>
              <input type="text" placeholder="Building (e.g. GICT)" value={newClass.building} onChange={(e) => setNewClass({...newClass, building: e.target.value})} className="p-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200 outline-none" />
              <div className="flex gap-2 lg:col-span-4 mt-2">
                <input type="text" placeholder="Classroom (e.g. 236)" value={newClass.room} onChange={(e) => setNewClass({...newClass, room: e.target.value})} className="w-full p-2.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200 outline-none" />
                <button type="submit" className="bg-blue-600 dark:bg-red-600 hover:bg-blue-700 dark:hover:bg-red-700 text-white px-8 rounded-md font-bold transition-colors cursor-pointer shadow-md">+ Add Class</button>
              </div>
            </form>
          </div>
          <div className="bg-white dark:bg-[#121215] rounded-xl shadow-sm p-6 border border-gray-100 dark:border-gray-800">
            <h3 className="text-lg font-bold mb-4">Current Registered Classes ({currentClasses.length})</h3>
            <div className="space-y-3">
              {currentClasses.length === 0 ? (
                <p className="text-gray-500 italic text-sm">No classes added yet.</p>
              ) : (
                currentClasses.map((item) => (
                  <div key={item.id} className="p-4 bg-gray-50 dark:bg-[#1a1a20] rounded-lg border border-gray-200 dark:border-gray-800 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-600 dark:text-red-400">{item.day}</span>
                        <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded font-semibold">{format12Hour(item.startTime)} - {format12Hour(item.endTime)}</span>
                      </div>
                      <h4 className="font-semibold text-md mt-1">{item.courseCode} {item.courseName}</h4>
                      <p className="text-xs text-gray-500">{item.building} {item.room ? `• Room ${item.room}` : ''} {item.section ? `• Sec ${item.section}` : ''}</p>
                    </div>
                    <button onClick={() => handleDeleteClass(item.id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 p-2 rounded-md font-bold text-sm cursor-pointer">Delete</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ADVANCED SETTINGS & NOTIFICATIONS */}
      {activeTab === 'settings' && (
        <div className="flex-1 space-y-6 animate-in fade-in duration-300 max-w-4xl w-full">
          {isWebOnly ? (
            /* --- WEB CLIENT MODE INFORMATIONAL CARD --- */
            <div className="bg-white dark:bg-[#121215] rounded-xl shadow-sm p-6 border border-gray-100 dark:border-blue-900/30">
              <div className="flex items-center gap-3 mb-4">
                <span className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xl">
                  🌐
                </span>
                <div>
                  <h2 className="text-xl font-semibold dark:text-blue-400">Web Client Mode</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-xs">Cloud Timetable & Task Management View</p>
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-[#1a1a20] rounded-xl border border-gray-200 dark:border-gray-800 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5">ℹ️</span>
                  <div className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed space-y-2.5">
                    <p>
                      You are using the <strong className="text-gray-900 dark:text-gray-200">AIO Calender MK2 Web Client</strong>. All timetable entries, lecture schedules, and task deadlines are continuously synced to Firebase Cloud in real time.
                    </p>
                    <p>
                      Hardware RTC alarm scheduling, lock-screen wakeups, background notification delivery, and haptic feedback are native device benefits reserved exclusively for our native apps:
                    </p>
                    <ul className="list-disc pl-5 space-y-1.5 text-gray-700 dark:text-gray-300">
                      <li>
                        <strong className="text-red-600 dark:text-red-400">Android APK:</strong> Zero-battery-drain RTC hardware alarms (rings accurately through Android Doze & Power Saving), full-screen lock alerts, and physical haptic vibration.
                      </li>
                      <li>
                        <strong className="text-blue-600 dark:text-blue-400">Windows Desktop (.exe):</strong> Native Windows notification alerts, background System Tray persistence, and quick window restore.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* --- NATIVE NOTIFICATION PREFERENCES (Android APK & Windows Desktop) --- */
            <div className="bg-white dark:bg-[#121215] rounded-xl shadow-sm p-6 border border-gray-100 dark:border-red-900/30">
              <h2 className="text-xl font-semibold mb-1 dark:text-red-400">Notification Preferences</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">Configure lecture reminders, deadline alerts, and device background delivery settings.</p>
              <div className="space-y-6">
                <div className="p-4 bg-gray-50 dark:bg-[#1a1a20] rounded-xl border border-gray-200 dark:border-gray-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-md">Lecture Alerts</h3>
                      <p className="text-xs text-gray-500">Receive reminders prior to your scheduled class time.</p>
                    </div>
                    {/* Red tick box for lecture alerts */}
                    <input type="checkbox" checked={notifSettings.classNotifs} onChange={(e) => handleNotifSettingsChange('classNotifs', e.target.checked)} className="h-5 w-5 accent-red-600 cursor-pointer" />
                  </div>
                  {notifSettings.classNotifs && (
                    <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-800">
                      <span className="text-sm font-medium">Remind me:</span>
                      <div className="flex items-center bg-white dark:bg-[#121215] border border-gray-300 dark:border-gray-700 rounded-md pr-2 w-full sm:w-64">
                        <select value={notifSettings.classLeadTime} onChange={(e) => handleNotifSettingsChange('classLeadTime', e.target.value)} className="w-full bg-transparent border-none text-gray-900 dark:text-gray-200 text-sm outline-none font-bold cursor-pointer p-2">
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="5">5 minutes before</option>
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="10">10 minutes before</option>
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="15">15 minutes before</option>
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="20">20 minutes before</option>
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="30">30 minutes before</option>
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="45">45 minutes before</option>
                          <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="60">1 hour before</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-gray-50 dark:bg-[#1a1a20] rounded-xl border border-gray-200 dark:border-gray-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-md">Task & Assignment Alerts</h3>
                      <p className="text-xs text-gray-500">Scheduled reminders for assignments, quizzes, and projects.</p>
                    </div>
                    {/* Red tick box for task alerts */}
                    <input type="checkbox" checked={notifSettings.taskNotifs} onChange={(e) => handleNotifSettingsChange('taskNotifs', e.target.checked)} className="h-5 w-5 accent-red-600 cursor-pointer" />
                  </div>
                  {notifSettings.taskNotifs && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-800">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium whitespace-nowrap">Remind me:</span>
                        <div className="flex items-center bg-white dark:bg-[#121215] border border-gray-300 dark:border-gray-700 rounded-md pr-2 w-full">
                          <select value={notifSettings.taskLeadTime} onChange={(e) => handleNotifSettingsChange('taskLeadTime', e.target.value)} className="w-full bg-transparent border-none text-gray-900 dark:text-gray-200 text-sm outline-none font-bold cursor-pointer p-2">
                            <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="15">15 minutes before</option>
                            <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="60">1 hour before</option>
                            <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="1440">1 day before</option>
                            <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="10080">1 week before</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium whitespace-nowrap">Repetition:</span>
                        <div className="flex items-center bg-white dark:bg-[#121215] border border-gray-300 dark:border-gray-700 rounded-md pr-2 w-full">
                          <select value={notifSettings.taskRepeatFrequency} onChange={(e) => handleNotifSettingsChange('taskRepeatFrequency', e.target.value)} className="w-full bg-transparent border-none text-gray-900 dark:text-gray-200 text-sm outline-none font-bold cursor-pointer p-2">
                            <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="once">Once only</option>
                            <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="daily">Daily Digest (Morning/Evening)</option>
                            <option className="bg-white dark:bg-[#121215] text-gray-900 dark:text-gray-200" value="hourly">Every Hour</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* --- VIBRATION TOGGLE (Android APK exclusive) --- */}
                {isNativeMobile && (
                  <div className="p-4 bg-gray-50 dark:bg-[#1a1a20] rounded-xl border border-gray-200 dark:border-gray-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-md">Haptic Feedback</h3>
                        <p className="text-xs text-gray-500">Allow notifications to physically vibrate the device.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={notifSettings.vibrateEnabled !== false} 
                        onChange={(e) => handleNotifSettingsChange('vibrateEnabled', e.target.checked)} 
                        className="h-5 w-5 accent-red-600 cursor-pointer" 
                      />
                    </div>
                  </div>
                )}

                {/* --- WINDOWS DESKTOP PREFERENCES (Windows .exe exclusive) --- */}
                {isDesktop && (
                  <div className="p-4 bg-gray-50 dark:bg-[#1a1a20] rounded-xl border border-blue-200 dark:border-blue-900/40 space-y-4">
                    <div className="border-b border-gray-200 dark:border-gray-800 pb-2">
                      <h3 className="font-bold text-md flex items-center gap-2 text-blue-600 dark:text-blue-400">
                        <span>🖥️ Windows Desktop Preferences</span>
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Configure background persistence and system tray behavior.
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-sm">Minimize to System Tray on Close</h4>
                        <p className="text-xs text-gray-500">Keep running in the background when the window is closed to maintain alarms and reminders.</p>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={desktopSettings.minimizeToTray} 
                        onChange={(e) => handleDesktopSettingToggle('minimizeToTray', e.target.checked)} 
                        className="h-5 w-5 accent-blue-600 cursor-pointer" 
                      />
                    </div>
                  </div>
                )}

                {/* --- ADVANCED OPTIONS / SETTINGS (Android APK exclusive) --- */}
                {isNativeMobile && (
                  <div className="p-4 bg-gray-50 dark:bg-[#1a1a20] rounded-xl border border-gray-200 dark:border-gray-800 space-y-3">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedTuning(!showAdvancedTuning)}
                      className="w-full flex items-center justify-between text-left cursor-pointer group"
                    >
                      <div className="pr-2">
                        <h3 className="font-bold text-md flex items-center gap-2">
                          <span>Advanced Settings</span>
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                          System battery optimization and OEM device management.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 group-hover:bg-gray-300 dark:group-hover:bg-gray-700 transition-colors shrink-0 whitespace-nowrap">
                        <span>{showAdvancedTuning ? 'Hide Options\u00A0▲' : 'Advanced Options\u00A0▼'}</span>
                      </div>
                    </button>

                    {showAdvancedTuning && (
                      <div className="pt-3 border-t border-gray-200 dark:border-gray-800 space-y-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                          Alarms are scheduled using Android&apos;s native AlarmClock engine which rings accurately on Default battery mode and Power Saving mode. If your phone manufacturer has aggressive background management, you can access device settings here:
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={async () => {
                              await openBatterySettings();
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer border border-gray-300 dark:border-gray-700 flex items-center gap-1.5"
                          >
                            ⚙️ App Battery Settings
                          </button>
                          {['xiaomi', 'redmi', 'poco', 'samsung', 'oneplus', 'oppo', 'vivo', 'realme', 'huawei'].some(m => notifStatus.manufacturer?.toLowerCase().includes(m)) && (
                            <button
                              type="button"
                              onClick={async () => {
                                await openAutostartSettings();
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer border border-gray-300 dark:border-gray-700 flex items-center gap-1.5"
                            >
                              📱 Autostart Settings ({notifStatus.manufacturer ? notifStatus.manufacturer.toUpperCase() : 'OEM'})
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="bg-white dark:bg-[#121215] rounded-xl shadow-sm p-6 border border-gray-100 dark:border-gray-800">
            <h2 className="text-xl font-semibold mb-1">Account & Sync</h2>
            <div className="p-4 mt-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/40 rounded-lg flex justify-between items-center">
              <div>
                <span className="text-xs font-bold uppercase text-green-600 dark:text-green-500">Status</span>
                <p className="font-bold text-sm mt-0.5">Firebase Database Connected</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Logged in as {user.email}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Sync Mode: {isCloudSynced ? 'Live Cloud Sync' : 'Offline-First Local Storage Cache'}</p>
              </div>
              <span className="text-2xl">{isCloudSynced ? '☁️' : '✅'}</span>
            </div>
          </div>
        </div>
      )} {/* <-- This correctly closes the Settings Tab! */}

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav aria-label="Primary mobile navigation" className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-[#121215]/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pl-[max(8px,env(safe-area-inset-left,0px))] pr-[max(8px,env(safe-area-inset-right,0px))] z-50 grid grid-cols-3 items-center">
        <button type="button" onClick={() => setActiveTab('dashboard')} aria-current={activeTab === 'dashboard' ? 'page' : undefined} className={`w-full min-w-0 min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-lg text-[length:min(0.75rem,18px)] leading-[1.333333] font-bold transition-all cursor-pointer ${activeTab === 'dashboard' ? 'text-blue-600 dark:text-red-400' : 'text-gray-400'}`}>
          <span className="text-lg" aria-hidden="true">📊</span>
          Dashboard
        </button>
        <button type="button" onClick={() => setActiveTab('schedule')} aria-current={activeTab === 'schedule' ? 'page' : undefined} className={`w-full min-w-0 min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-lg text-[length:min(0.75rem,18px)] leading-[1.333333] font-bold transition-all cursor-pointer ${activeTab === 'schedule' ? 'text-blue-600 dark:text-red-400' : 'text-gray-400'}`}>
          <span className="text-lg" aria-hidden="true">✏️</span>
          Schedule
        </button>
        <button type="button" onClick={() => setActiveTab('settings')} aria-current={activeTab === 'settings' ? 'page' : undefined} className={`w-full min-w-0 min-h-[44px] flex flex-col items-center justify-center py-1 px-1 rounded-lg text-[length:min(0.75rem,18px)] leading-[1.333333] font-bold transition-all cursor-pointer ${activeTab === 'settings' ? 'text-blue-600 dark:text-red-400' : 'text-gray-400'}`}>
          <span className="text-lg" aria-hidden="true">⚙️</span>
          Settings
        </button>
      </nav>

    </div>
  );
}