import React, { useState, useEffect, useMemo, useRef } from 'react';
import { storage } from './lib/storage';
import { auth } from './lib/firebase';
import firebaseConfig from '../firebase-applet-config.json';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  Activity, Users, ClipboardList, ShieldCheck, LogOut, Search, 
  AlertCircle, Info, UserPlus, BarChart3, History, Clock, CheckCircle2,
  Stethoscope, Thermometer, Droplets, Brain, Wind, HeartPulse, Syringe,
  Printer, Download, Trash2, Settings, ArrowUpRight, ArrowDownRight,
  Handshake, ChevronDown, ArrowRightLeft, FileText, Shield, LineChart, HeartOff,
  DoorOpen, AlertTriangle, Moon, Sun, Cloud, Database, Wand2, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip
} from 'recharts';
import Markdown from 'react-markdown';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { 
  runClassificationLogic, getAIJustification, predictRiskScore, generateSBAR 
} from './services/geminiService';
import { ErrorBoundary } from './components/ErrorBoundary';

// --- Components ---

function Logo({ className = "w-full h-full" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 100 100" 
      className={className}
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background Circle */}
      <circle cx="50" cy="50" r="48" fill="currentColor" className="text-blue-600/5" />
      
      {/* Grid Pattern */}
      <defs>
        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-blue-600/10" />
        </pattern>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#grid)" />
      
      {/* Pulse Line (Acuity) */}
      <motion.path 
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        d="M15 50 H35 L42 25 L50 75 L58 50 H85" 
        stroke="currentColor" 
        strokeWidth="6" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        className="text-blue-600"
      />
      
      {/* Sync Arrows */}
      <g className="text-blue-400">
        <path 
          d="M80 30 A35 35 0 0 0 50 15" 
          stroke="currentColor" 
          strokeWidth="4" 
          strokeLinecap="round"
        />
        <path d="M80 30 L72 30 M80 30 L80 38" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        
        <path 
          d="M20 70 A35 35 0 0 0 50 85" 
          stroke="currentColor" 
          strokeWidth="4" 
          strokeLinecap="round"
        />
        <path d="M20 70 L28 70 M20 70 L20 62" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

import KPIDashboard from './components/KPIDashboard';

// --- Types ---
interface Patient {
  id: string;
  hisId: string;
  name: string;
  dob: string;
  bedNumber: string;
  currentAcuity: 'ICU' | 'HDU';
  lastAssessmentId?: string;
  riskScore?: number;
  riskLevel?: 'Low' | 'Moderate' | 'High' | 'Critical';
  riskFactors?: string[];
  medicalHistory?: string; // Enhanced history
}

interface Staff {
  uid: string;
  name: string;
  role: 'Administrator / Auditor' | 'Clinician' | 'Team-Leader / Charge Nurse' | 'Team-leader' | 'Nurse' | 'Charge Nurse' | 'Physician' | 'Administrator';
  department: string;
}

interface ShiftAssessment {
  id: string;
  patientId: string;
  assessorId: string;
  shiftTime: '07:00' | '19:00';
  vitals: {
    hr: number;
    map: number;
    spo2: number;
    rr: number;
    temp: number;
    gcs: number;
    urineOutput: number;
  };
  interventions: {
    mechanicalVentilation: boolean;
    highFlowO2: boolean;
    cpapBipap: boolean;
    singleVasopressor: boolean;
    multipleVasopressors: boolean;
    iabpEcmo: boolean;
    crrt: boolean;
    stepDownFromLevel3: boolean;
  };
  positioning: {
    mobility: 'Mobile' | 'Relative Bedridden' | 'Bedridden';
    isProne: boolean;
  };
  clinicalContext?: {
    labTrends: string;
    medicationChanges: string;
  };
  classification: 'ICU' | 'HDU';
  aiJustification: string;
  timestamp: any;
}

interface AuditLog {
  id: string;
  timestamp: any;
  userId: string;
  userEmail: string;
  action: string;
  resourceId?: string;
  details?: string;
}

// --- Constants ---
const ICU_BEDS = ['ICU-1', 'ICU-2', 'ICU-3', 'ICU-4', 'ICU-5', 'ICU-ISO1', 'ICU-ISO2'];
const HDU_BEDS = ['HDU-1', 'HDU-2', 'HDU-3', 'HDU-4', 'HDU-5', 'HDU-ISO1', 'HDU-ISO2'];
const ALL_BEDS = [...ICU_BEDS, ...HDU_BEDS];

// --- Helper: Audit Logging ---
const logAction = async (action: string, resourceId?: string, details?: string) => {
  try {
    const profile = storage.getStaffProfile();
    const logData: any = {
      userId: profile ? profile.uid : 'anonymous',
      userEmail: 'local@acuitysync.local',
      action,
    };
    if (resourceId) logData.resourceId = resourceId;
    if (details) logData.details = details;

    await storage.saveAuditLog(logData);
  } catch (error) {
    console.error("Audit log failed:", error);
  }
};

// --- Main App Component ---
export default function App() {
  return (
    <ErrorBoundary>
      <AcuitySync />
    </ErrorBoundary>
  );
}

function LoginScreen({ onLogin }: { onLogin: (profile: Staff) => void }) {
  const [role, setRole] = useState<'Team-Leader / Charge Nurse' | 'Administrator / Auditor' | null>(null);
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const isConfigPlaceholder = firebaseConfig.apiKey.includes('INVALID_PLACEHOLDER');

  const handleGoogleLogin = async () => {
    if (!role) {
      setError('Please select a role first');
      return;
    }
    
    setIsLoggingIn(true);
    setError('');
    
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      onLogin({
        uid: user.uid,
        name: user.displayName || user.email?.split('@')[0] || 'User',
        role: role,
        department: 'Intensive Care Unit'
      });
    } catch (err: any) {
      console.error("Google Login Error:", err);
      setError(err.message || 'Failed to sign in with Google');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleDemoPilot = async () => {
    if (!role) {
      setError('Please select a role first');
      return;
    }
    
    setIsLoggingIn(true);
    try {
      const demoProfile: Staff = {
        uid: 'demo-admin-id',
        name: 'Admin Demo User',
        role: role,
        department: 'Intensive Care Unit'
      };
      
      // Seed initial patients for demo with active risk data
      const seedPatients = [
        { id: 'p1', hisId: 'HN-1001', name: 'Ahmed Al-Said', dob: '1965-05-12', bedNumber: 'ICU-1', currentAcuity: 'ICU' as const, medicalHistory: 'Post-op CABG, History of Hypertension and Type 2 Diabetes.', riskScore: 82, riskLevel: 'Critical' as const, riskFactors: ['Hemodynamic Instability', 'Recent Surgery'] },
        { id: 'p2', hisId: 'HN-1002', name: 'Fatma Al-Balushi', dob: '1978-11-23', bedNumber: 'ICU-ISO1', currentAcuity: 'ICU' as const, medicalHistory: 'Severe Sepsis secondary to Pneumonia, Acute Kidney Injury on CRRT.', riskScore: 68, riskLevel: 'High' as const, riskFactors: ['Sepsis', 'Renal Support'] },
        { id: 'p3', hisId: 'HN-1003', name: 'Mohammed Al-Rawahi', dob: '1952-08-30', bedNumber: 'HDU-2', currentAcuity: 'HDU' as const, medicalHistory: 'Exacerbation of COPD, requiring NIV support.', riskScore: 45, riskLevel: 'Moderate' as const, riskFactors: ['Respiratory Distress'] },
        { id: 'p4', hisId: 'HN-1004', name: 'Sara Al-Zadjali', dob: '1989-02-14', bedNumber: 'HDU-ISO2', currentAcuity: 'HDU' as const, medicalHistory: 'Post-op Whipple procedure, monitoring for pancreatic leak.', riskScore: 24, riskLevel: 'Low' as const, riskFactors: ['Stable Post-op'] },
      ];

      storage.updateStaffProfile(demoProfile);
      // Wait for all seed data to be committed to local storage
      await Promise.all(seedPatients.map(p => storage.savePatient(p)));
      
      onLogin(demoProfile);
    } catch (err: any) {
      setError(err.message || 'Failed to start demo pilot');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-10 rounded-[40px] shadow-xl max-w-md w-full border border-slate-200 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 bg-white p-2 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/10 border border-slate-100">
            <Logo className="w-full h-full text-blue-600" />
          </div>
        </div>
        <h1 className="text-3xl font-black text-center text-slate-900 mb-2 tracking-tight">AcuitySync</h1>
        <p className="text-center text-slate-500 mb-8 font-medium">Hospital Network Access</p>

        {isConfigPlaceholder && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
            <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            <div className="text-xs text-amber-800">
              <p className="font-bold mb-1">Firebase Setup Required</p>
              <p>The Firebase API key is currently missing or invalid. To use Google Sign-In, please run the "Firebase Setup" tool in the sidebar.</p>
            </div>
          </div>
        )}

        {!role ? (
          <div className="space-y-4">
            <button 
              onClick={() => setRole('Team-Leader / Charge Nurse')}
              className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-blue-600 hover:bg-blue-50 transition-all flex items-center gap-4 group"
            >
              <div className="w-12 h-12 bg-slate-100 group-hover:bg-blue-100 rounded-xl flex items-center justify-center text-slate-600 group-hover:text-blue-600 transition-colors">
                <Users size={24} />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-slate-900">Team-Leader / Charge Nurse</h3>
                <p className="text-xs text-slate-500">Access patient census and handovers</p>
              </div>
            </button>
            <button 
              onClick={() => setRole('Administrator / Auditor')}
              className="w-full p-4 rounded-2xl border-2 border-slate-200 hover:border-blue-600 hover:bg-blue-50 transition-all flex items-center gap-4 group"
            >
              <div className="w-12 h-12 bg-slate-100 group-hover:bg-blue-100 rounded-xl flex items-center justify-center text-slate-600 group-hover:text-blue-600 transition-colors">
                <Shield size={24} />
              </div>
              <div className="text-left">
                <h3 className="font-bold text-slate-900">Administrator / Auditor</h3>
                <p className="text-xs text-slate-500">System configuration and audits</p>
              </div>
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
              <button 
                type="button" 
                onClick={() => { setRole(null); setError(''); }}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
              >
                <ArrowUpRight size={20} className="rotate-180" />
              </button>
              <h2 className="text-xl font-bold text-slate-900">{role} Login</h2>
            </div>

            <button
              onClick={handleGoogleLogin}
              disabled={isLoggingIn || isConfigPlaceholder}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all font-bold text-slate-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingIn ? (
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              {isConfigPlaceholder ? 'Cloud Access Unavailable' : 'Sign in with Google'}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-100"></span>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest">
                <span className="bg-white px-4 text-slate-400">Administration Pilot</span>
              </div>
            </div>

            <button
              onClick={handleDemoPilot}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all font-black text-sm border border-blue-100 shadow-sm group"
            >
              <ArrowUpRight size={18} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              One-Click Demo Pilot
            </button>

            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold flex items-start gap-2"
              >
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>
                  {error.includes('auth-domain-config-required') || error.includes('auth/auth-domain-config-required')
                    ? 'Cloud authentication is currently pending configuration. Please use Demo Mode below.'
                    : error}
                </span>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>
      <div className="mt-8 text-center">
        <p className="text-sm text-slate-400 font-medium tracking-wide">Developed by: K.Younes BSN, MSN</p>
      </div>
    </div>
  );
}

function AcuitySync() {
  const [staffProfile, setStaffProfile] = useState<Staff | null>(storage.getStaffProfile());
  const [patients, setPatients] = useState<Patient[]>(storage.getPatients());
  const [assessments, setAssessments] = useState<ShiftAssessment[]>(storage.getAssessments());
  const [handovers, setHandovers] = useState<any[]>(storage.getHandovers());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(storage.getAuditLogs());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'census' | 'handover' | 'audit' | 'kpi'>('dashboard');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [initialBedForNewPatient, setInitialBedForNewPatient] = useState<string | undefined>(undefined);
  const [isStandardsOpen, setIsStandardsOpen] = useState(false);
  const [sbarPatient, setSbarPatient] = useState<Patient | null>(null);
  const [transferPatient, setTransferPatient] = useState<Patient | null>(null);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [dischargePatient, setDischargePatient] = useState<Patient | null>(null);
  const [isDischarging, setIsDischarging] = useState(false);
  const [declareDeathPatient, setDeclareDeathPatient] = useState<Patient | null>(null);
  const [isDeclaringDeath, setIsDeclaringDeath] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(storage.getDarkMode());

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    storage.saveDarkMode(darkMode);
  }, [darkMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is signed in, check if we have a profile in storage
        const profile = storage.getStaffProfile();
        if (profile && profile.uid === user.uid) {
          setStaffProfile(profile);
        } else {
          // If no profile in storage or different user, we might need to set it
          // For now, we'll let the LoginScreen handle the initial profile creation
          // but we'll clear it if the UID doesn't match
          if (profile && profile.uid !== user.uid) {
            storage.updateStaffProfile(null);
            setStaffProfile(null);
          }
        }
      } else {
        // User is signed out
        storage.updateStaffProfile(null);
        setStaffProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshData = () => {
    setPatients(storage.getPatients());
    setAssessments(storage.getAssessments());
    setHandovers(storage.getHandovers());
    setAuditLogs(storage.getAuditLogs());
    setStaffProfile(storage.getStaffProfile());
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      storage.updateStaffProfile(null);
      setStaffProfile(null);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleDischarge = async (patient: Patient) => {
    setIsDischarging(true);
    try {
      await storage.deletePatient(patient.id);
      logAction('PATIENT_DISCHARGED', patient.id, `Patient ${patient.name} discharged from bed ${patient.bedNumber}`);
      setDischargePatient(null);
      refreshData();
    } catch (error) {
      console.error("Discharge error:", error);
    } finally {
      setIsDischarging(false);
    }
  };

  const handleDeclareDeath = async (patient: Patient) => {
    setIsDeclaringDeath(true);
    try {
      await storage.deletePatient(patient.id);
      logAction('PATIENT_DECEASED', patient.id, `Patient ${patient.name} declared deceased from bed ${patient.bedNumber}`);
      setDeclareDeathPatient(null);
      refreshData();
    } catch (error) {
      console.error("Declare death error:", error);
    } finally {
      setIsDeclaringDeath(false);
    }
  };

  // Initial Data Load
  useEffect(() => {
    refreshData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!staffProfile) {
    return <LoginScreen onLogin={(profile) => {
      storage.updateStaffProfile(profile);
      setStaffProfile(profile);
    }} />;
  }

  return (
    <div className="min-h-screen flex flex-col font-sans text-slate-900">
      {/* Clinical Header */}
      <header className="metallic-panel !rounded-none border-b border-white/20 px-8 py-4 flex flex-col gap-4 sticky top-0 z-30 shadow-xl">
        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-6">
            <div className="bg-white/40 p-3 rounded-[2rem] shadow-inner border border-white/50 overflow-hidden w-20 h-20 flex items-center justify-center transition-all hover:scale-110 hover:rotate-3 active:scale-95 shadow-lg">
              <Logo />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-black tracking-tighter text-slate-900 font-mono bg-gradient-to-br from-blue-900 via-slate-900 to-blue-600 bg-clip-text text-transparent drop-shadow-sm">AcuitySYNC</h1>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-white bg-blue-600 px-2 py-0.5 rounded-md uppercase tracking-[0.15em] shadow-lg shadow-blue-900/20">V1.0 Pro</span>
                  <span className="text-[8px] font-bold text-blue-400 uppercase tracking-widest mt-0.5">Enterprise</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">Live System</span>
                </div>
                {auth.currentUser && (
                  <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                    <Cloud size={10} className="text-blue-500" />
                    <span className="text-[10px] font-bold text-blue-600 uppercase">Cloud Active</span>
                  </div>
                )}
                {!auth.currentUser && (
                  <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                    <Database size={10} className="text-slate-400" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Local Mode</span>
                  </div>
                )}
                <p className="micro-label text-slate-500 font-bold">
                  {staffProfile?.department?.replace(/ONCOLOGY/gi, '') || 'Intensive Care Unit'} • <span className="text-blue-600">Census, Ratio, Handover</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsStandardsOpen(true)}
              className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-white/50 rounded-xl transition-all flex items-center gap-2"
              title="Clinical Standards"
            >
              <Info size={20} />
              <span className="hidden xl:inline text-xs font-bold uppercase tracking-widest">Standards</span>
            </button>

            <button 
              onClick={() => {
                const dataString = storage.exportFullDatabase();
                const blob = new Blob([dataString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `acuitysync_checkpoint_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
                a.click();
                logAction('SYSTEM_CHECKPOINT', 'ALL', 'Manual data checkpoint saved to local file');
              }}
              className="p-2.5 text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-600 hover:text-white rounded-xl transition-all flex items-center gap-2 shadow-sm group"
              title="Save Data Checkpoint to Computer"
            >
              <Download size={20} className="group-hover:translate-y-0.5 transition-transform" />
              <span className="hidden xl:inline text-xs font-bold uppercase tracking-widest">Save Checkpoint</span>
            </button>
            
            <div className="h-8 w-px bg-slate-300 mx-1 hidden sm:block"></div>

            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-white/50 rounded-xl transition-all flex items-center gap-2"
              title={darkMode ? "Switch to Day Mode" : "Switch to Night Mode"}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              <span className="hidden xl:inline text-xs font-bold uppercase tracking-widest">{darkMode ? 'Day Mode' : 'Night Mode'}</span>
            </button>

            <div className="h-8 w-px bg-slate-300 mx-1 hidden sm:block"></div>

            <button 
              onClick={() => setIsProfileOpen(true)}
              className="flex items-center gap-3 text-right hover:bg-white/50 p-2 rounded-xl transition-all group"
            >
              <div className="hidden sm:block">
                <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{staffProfile.name}</p>
                <p className="text-[10px] font-bold text-blue-600 uppercase tracking-tighter">{staffProfile.role}</p>
              </div>
              <div className="bg-slate-200/50 p-2 rounded-lg text-slate-500 group-hover:text-blue-600">
                <Settings size={20} />
              </div>
            </button>

            <button 
              onClick={handleLogout}
              className="p-2.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all flex items-center gap-2"
              title="Log Out"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        <div className="flex justify-center">
          <nav className="hidden lg:flex items-center bg-slate-200/50 p-1 rounded-2xl border border-white/50 shadow-inner">
            <NavTab active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<BarChart3 size={14} />} label="Dashboard" />
            {staffProfile?.role === 'Administrator / Auditor' && (
              <NavTab active={activeTab === 'kpi'} onClick={() => setActiveTab('kpi')} icon={<LineChart size={14} />} label="KPI Analytics" />
            )}
            <NavTab active={activeTab === 'census'} onClick={() => setActiveTab('census')} icon={<Users size={14} />} label="Unit Census" />
            <NavTab active={activeTab === 'handover'} onClick={() => setActiveTab('handover')} icon={<Handshake size={14} />} label="ICU/HDU-Handover tool PRO" />
            {staffProfile?.role === 'Administrator / Auditor' && (
              <NavTab active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon={<History size={14} />} label="Audit Trail" />
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 p-8 max-w-[1600px] mx-auto w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && <Dashboard patients={patients} assessments={assessments} onGenerateSummary={() => setIsSummaryOpen(true)} />}
          {activeTab === 'kpi' && staffProfile?.role === 'Administrator / Auditor' && <KPIDashboard auditLogs={auditLogs} />}
          {activeTab === 'census' && (
            <Census 
              patients={patients} 
              assessments={assessments}
              onAssess={(p) => setSelectedPatient(p)} 
              onAddPatient={(bed) => {
                setInitialBedForNewPatient(bed);
                setIsAddPatientOpen(true);
              }} 
              onGenerateSBAR={(p) => setSbarPatient(p)}
              onTransfer={(p) => setTransferPatient(p)}
              onGenerateSummary={() => setIsSummaryOpen(true)}
              onDischarge={(p) => setDischargePatient(p)}
              onDeclareDeath={(p) => setDeclareDeathPatient(p)}
              onRefresh={refreshData}
            />
          )}
          {activeTab === 'handover' && (
            <HandoverTool 
              patients={patients} 
              assessments={assessments}
              handovers={handovers}
              staff={staffProfile}
              onRefresh={refreshData}
              onGenerateSBAR={(p) => setSbarPatient(p)}
              onGenerateSummary={() => setIsSummaryOpen(true)}
            />
          )}
          {activeTab === 'audit' && staffProfile?.role === 'Administrator / Auditor' && <AuditTrail logs={auditLogs} />}
        </AnimatePresence>
      </main>

      {/* Assessment Modal */}
      <AnimatePresence>
        {selectedPatient && (
          <AssessmentModal 
            patient={selectedPatient} 
            staff={staffProfile!} 
            onClose={() => setSelectedPatient(null)} 
            onSuccess={refreshData}
          />
        )}
      </AnimatePresence>

      {/* Add Patient Modal */}
      <AnimatePresence>
        {isAddPatientOpen && (
          <AddPatientModal 
            onClose={() => {
              setIsAddPatientOpen(false);
              setInitialBedForNewPatient(undefined);
            }} 
            onSuccess={refreshData}
            initialBed={initialBedForNewPatient}
          />
        )}
      </AnimatePresence>

      {/* Clinical Standards Modal */}
      <AnimatePresence>
        {isStandardsOpen && (
          <ClinicalStandardsModal onClose={() => setIsStandardsOpen(false)} />
        )}
      </AnimatePresence>

      {/* SBAR Handover Modal */}
      <AnimatePresence>
        {sbarPatient && (
          <SBARModal 
            patient={sbarPatient} 
            staff={staffProfile!} 
            onClose={() => setSbarPatient(null)} 
          />
        )}
      </AnimatePresence>

      {/* Transfer Patient Modal */}
      <AnimatePresence>
        {transferPatient && (
          <TransferModal 
            patient={transferPatient} 
            patients={patients}
            onClose={() => setTransferPatient(null)} 
            onSuccess={refreshData}
          />
        )}
      </AnimatePresence>

      {/* Unit Summary Modal */}
      <AnimatePresence>
        {isSummaryOpen && (
          <UnitSummaryModal 
            patients={patients} 
            onClose={() => setIsSummaryOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Discharge Confirmation Modal */}
      <AnimatePresence>
        {dischargePatient && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-900 border border-slate-800 rounded-[32px] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="bg-red-950/30 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-red-900/30">
                <Trash2 className="text-red-500" size={32} />
              </div>
              <h3 className="text-2xl font-black text-slate-50 mb-2">Confirm Discharge</h3>
              <p className="text-slate-400 mb-8 leading-relaxed">
                Are you sure you want to discharge <strong>{dischargePatient.name}</strong> from bed <strong>{dischargePatient.bedNumber}</strong>? This action will remove the patient from the current census.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setDischargePatient(null)}
                  className="flex-1 py-4 bg-slate-800 text-slate-300 rounded-2xl font-bold hover:bg-slate-700 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDischarge(dischargePatient)}
                  disabled={isDischarging}
                  className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-500 transition-all flex items-center justify-center gap-2"
                >
                  {isDischarging && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                  Discharge
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Declare Death Confirmation Modal */}
      <AnimatePresence>
        {declareDeathPatient && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-900 border border-slate-800 rounded-[32px] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="bg-slate-800 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-slate-700">
                <HeartOff className="text-slate-300" size={32} />
              </div>
              <h3 className="text-2xl font-black text-white mb-2">Declare Death?</h3>
              <p className="text-slate-400 mb-8 leading-relaxed">
                You are about to declare <span className="text-white font-bold">{declareDeathPatient.name}</span> in <span className="text-white font-bold">Bed {declareDeathPatient.bedNumber}</span> as deceased. This action will remove them from the active census and log the event for KPI tracking.
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setDeclareDeathPatient(null)}
                  disabled={isDeclaringDeath}
                  className="flex-1 py-4 bg-slate-800 text-slate-300 rounded-2xl font-bold hover:bg-slate-700 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDeclareDeath(declareDeathPatient)}
                  disabled={isDeclaringDeath}
                  className="flex-1 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl font-bold transition-all shadow-lg shadow-black/20 flex items-center justify-center gap-2"
                >
                  {isDeclaringDeath ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <HeartOff size={18} />
                      Confirm Death
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Footer */}
      <footer className="mt-auto py-6 border-t border-slate-200/50 bg-slate-50/50 text-center">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Developed by: K.Younes BSN, MSN</p>
      </footer>
    </div>
  );
}

// --- Sub-Components ---

function NavTab({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all relative group ${
        active 
          ? 'text-blue-600' 
          : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      <span className={`${active ? 'text-blue-600' : 'text-slate-500 group-hover:text-blue-600'} transition-colors`}>
        {icon}
      </span>
      <span className="micro-label !text-current !tracking-widest">
        {label}
      </span>
      {active && (
        <motion.div 
          layoutId="nav-active"
          className="absolute inset-0 bg-white rounded-xl -z-10 shadow-sm ring-1 ring-black/5"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
    </button>
  );
}

function Dashboard({ patients, assessments, onGenerateSummary }: { patients: Patient[], assessments: ShiftAssessment[], onGenerateSummary: () => void }) {
  const stats = useMemo(() => {
    const icu = patients.filter(p => p.currentAcuity === 'ICU').length;
    const hdu = patients.filter(p => p.currentAcuity === 'HDU').length;
    const nurses = icu + Math.ceil(hdu / 2);
    const icuTotal = ICU_BEDS.length;
    const hduTotal = HDU_BEDS.length;
    const totalBeds = icuTotal + hduTotal;
    return { 
      icu, hdu, nurses, total: patients.length,
      icuTotal, hduTotal, totalBeds,
      icuOccupancy: Math.round((icu / icuTotal) * 100),
      hduOccupancy: Math.round((hdu / hduTotal) * 100),
      totalOccupancy: Math.round((patients.length / totalBeds) * 100)
    };
  }, [patients]);

  const pieData = [
    { name: 'ICU', value: stats.icu, color: '#EF4444' },
    { name: 'HDU', value: stats.hdu, color: '#F59E0B' },
    { name: 'Available', value: stats.totalBeds - stats.total, color: '#1E293B' },
  ];

  return (
    <div className="space-y-12">
      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-1.5 h-12 bg-blue-600 rounded-full glow-blue"></div>
          <div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Unit Dashboard</h2>
            <p className="micro-label mt-1">Real-time clinical acuity monitoring</p>
          </div>
        </div>
        <button 
          onClick={onGenerateSummary}
          className="clinical-btn-secondary"
        >
          <Printer size={18} />
          <span className="micro-label !text-current">Unit Summary Report</span>
        </button>
      </div>

      {/* Top Row: Key Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Unit Census Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-7 metallic-panel p-10 flex flex-col md:flex-row items-center gap-12"
        >
          <div className="w-full md:w-1/2 relative">
            <div className="flex items-center justify-between mb-8">
              <h3 className="micro-label">Unit Census Overview</h3>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 glow-teal"></span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Live</span>
              </div>
            </div>
            <div className="h-[300px] relative w-full">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={300}>
                <PieChart>
                  <Pie 
                    data={pieData} 
                    innerRadius={90} 
                    outerRadius={120} 
                    paddingAngle={8} 
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color} 
                        className="hover:opacity-80 transition-opacity cursor-pointer"
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.9)', 
                      borderRadius: '16px', 
                      border: '1px solid rgba(0,0,0,0.1)',
                      boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                      color: '#0f172a'
                    }} 
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-7xl font-black text-slate-900 tracking-tighter data-value">{stats.total}</span>
                <span className="micro-label mt-1 opacity-50">Total Patients</span>
              </div>
            </div>
          </div>
          
          <div className="w-full md:w-1/2 space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <MetricRow label="ICU (Level 3)" value={stats.icu} total={stats.icuTotal} color="bg-red-600" glow="shadow-red-600/10" />
                <MetricRow label="HDU (Level 2)" value={stats.hdu} total={stats.hduTotal} color="bg-amber-600" glow="shadow-amber-600/10" />
                <MetricRow label="Available Beds" value={stats.totalBeds - stats.total} total={stats.totalBeds} color="bg-slate-400" glow="" />
              </div>
            
            <div className="pt-6 mt-6 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="micro-label">Overall Occupancy</span>
                <span className="data-value text-blue-600 font-bold">{stats.totalOccupancy}%</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.totalOccupancy}%` }}
                  className="h-full bg-blue-600 shadow-sm"
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Staffing Forecast Card */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-5 metallic-panel p-10 flex flex-col justify-between relative overflow-hidden group brushed-metal"
        >
          <div className="relative">
            <div className="flex items-center justify-between mb-10">
              <div className="flex items-center gap-4">
                <div className="bg-blue-600/10 p-3 rounded-2xl border border-blue-500/20">
                  <Users className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight">Staffing Forecast</h3>
                  <p className="micro-label opacity-70">Next 12-Hour Shift</p>
                </div>
              </div>
              <div className="bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100 shadow-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                Live
              </div>
            </div>

            <div className="flex items-baseline gap-4 mb-4">
              <h4 className="text-8xl font-black tracking-tighter data-value text-blue-600">{stats.nurses}</h4>
              <span className="micro-label opacity-50">RNs Required</span>
            </div>
            <p className="text-slate-600 text-sm max-w-md leading-relaxed font-clinical italic">
              Calculated based on clinical ratios: <span className="font-black text-slate-900">1:1 for ICU</span> and <span className="font-black text-slate-900">1:2 for HDU</span> patients.
            </p>
          </div>

          <div className="relative grid grid-cols-2 gap-6 pt-8 border-t border-slate-200">
            <div className="space-y-1">
              <p className="micro-label opacity-60">ICU Requirement</p>
              <p className="text-2xl font-black data-value text-slate-900">{stats.icu} <span className="text-xs font-bold opacity-40">RN</span></p>
            </div>
            <div className="space-y-1">
              <p className="micro-label opacity-60">HDU Requirement</p>
              <p className="text-2xl font-black data-value text-slate-900">{Math.ceil(stats.hdu / 2)} <span className="text-xs font-bold opacity-40">RN</span></p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Safety & Quality Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <SafetyAlertCard 
          title="Critical Miss Alerts" 
          value={patients.filter(p => {
            const latest = assessments.find(a => a.patientId === p.id);
            if (!latest) return true;
            const hoursSince = (new Date().getTime() - new Date(latest.timestamp).getTime()) / (1000 * 60 * 60);
            return hoursSince > 4;
          }).length}
          label="Overdue Assessments (>4h)"
          icon={<AlertTriangle className="text-red-500" />}
          color="bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-900/30"
        />
        <SafetyAlertCard 
          title="High Risk Trends" 
          value={patients.filter(p => p.riskLevel === 'Critical' || p.riskLevel === 'High').length}
          label="Patients at Critical Risk"
          icon={<Activity className="text-amber-500" />}
          color="bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-900/30"
        />
        <SafetyAlertCard 
          title="Protocol Compliance" 
          value="94%"
          label="Handover Tool Adherence"
          icon={<CheckCircle2 className="text-emerald-500" />}
          color="bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-900/30"
        />
      </div>

      {/* Bottom Section: Patient Summaries */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-1 h-8 bg-blue-600 rounded-full"></div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Patient Summaries</h2>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-white/50 rounded-xl text-slate-500 text-xs font-bold uppercase tracking-widest border border-white/50 shadow-sm">
            <Users size={14} />
            {patients.length} Active Patients
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {patients.map((patient, idx) => {
            return (
              <motion.div 
                key={patient.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="metallic-card p-6 group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="font-black text-lg text-slate-900 group-hover:text-blue-600 transition-colors">{patient.name}</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Bed {patient.bedNumber} • HIS: {patient.hisId}</p>
                  </div>
                  <AcuityBadge level={patient.currentAcuity} />
                </div>
                
                <div className="bg-white/40 p-4 rounded-2xl mb-4 border border-white/50 group-hover:bg-white/60 transition-all min-h-[80px]">
                  <p className="text-xs text-slate-600 leading-relaxed italic line-clamp-3">
                    {patient.medicalHistory || "No medical history provided."}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <Activity size={12} className={patient.riskLevel === 'Critical' ? 'text-red-500' : patient.riskLevel === 'High' ? 'text-amber-500' : 'text-emerald-500'} />
                    Risk: {patient.riskLevel}
                  </div>
                  <span className="text-[10px] font-bold text-slate-500">
                    Age: {new Date().getFullYear() - new Date(patient.dob).getFullYear()} Yrs
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SafetyAlertCard({ title, value, label, icon, color }: { title: string, value: string | number, label: string, icon: React.ReactNode, color: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`metallic-panel p-8 ${color} border flex flex-col justify-between`}
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="micro-label text-slate-900">{title}</h3>
        {icon}
      </div>
      <div>
        <p className="text-4xl font-black text-slate-900 mb-1">{value}</p>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
      </div>
    </motion.div>
  );
}

function LegendItem({ color, label, value }: { color: string, label: string, value: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`}></div>
        <span className="text-sm font-bold text-slate-600">{label}</span>
      </div>
      <span className="text-sm font-black text-slate-900">{value}</span>
    </div>
  );
}

function AcuityBadge({ level }: { level: string }) {
  const isICU = level === 'ICU';
  return (
    <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border flex items-center gap-1.5 ${
      isICU 
        ? 'bg-red-50 text-red-600 border-red-100 shadow-sm' 
        : 'bg-amber-50 text-amber-600 border-amber-100 shadow-sm'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isICU ? 'bg-red-600' : 'bg-amber-600'}`}></span>
      {isICU ? 'Level 3 (ICU)' : 'Level 2 (HDU)'}
    </div>
  );
}

function calculateWorkloadScore(patient: Patient, latestAssessment?: ShiftAssessment) {
  if (!latestAssessment) return patient.currentAcuity === 'ICU' ? 45 : 25;
  
  let score = 0;
  const { interventions, positioning, classification } = latestAssessment;
  
  if (interventions.mechanicalVentilation) score += 30;
  if (interventions.crrt) score += 25;
  if (interventions.multipleVasopressors) score += 20;
  else if (interventions.singleVasopressor) score += 10;
  if (interventions.iabpEcmo) score += 35;
  if (positioning.isProne) score += 15;
  if (positioning.mobility === 'Bedridden') score += 10;
  
  score += (classification === 'ICU' ? 20 : 10);
  
  return Math.min(100, score);
}

function Census({ patients, assessments, onAssess, onAddPatient, onGenerateSBAR, onTransfer, onGenerateSummary, onDischarge, onDeclareDeath, onRefresh }: { 
  patients: Patient[], 
  assessments: any[],
  onAssess: (p: Patient) => void, 
  onAddPatient: (bed?: string) => void,
  onGenerateSBAR: (p: Patient) => void,
  onTransfer: (p: Patient) => void,
  onGenerateSummary: () => void,
  onDischarge: (p: Patient) => void,
  onDeclareDeath: (p: Patient) => void,
  onRefresh: () => void
}) {
  const [search, setSearch] = useState('');
  const [acuityFilter, setAcuityFilter] = useState<'All' | 'ICU' | 'HDU'>('All');
  
  // Group patients by bed for easy lookup
  const patientMap = useMemo(() => {
    const map: Record<string, Patient> = {};
    patients.forEach(p => {
      map[p.bedNumber] = p;
    });
    return map;
  }, [patients]);

  const handleSeed = async () => {
    const seedPatients = [
      { id: 'p1', hisId: 'HN-1001', name: 'Ahmed Al-Said', dob: '1965-05-12', bedNumber: 'ICU-1', currentAcuity: 'ICU', medicalHistory: 'Post-op CABG, History of Hypertension and Type 2 Diabetes.' },
      { id: 'p2', hisId: 'HN-1002', name: 'Fatma Al-Balushi', dob: '1978-11-23', bedNumber: 'ICU-ISO1', currentAcuity: 'ICU', medicalHistory: 'Severe Sepsis secondary to Pneumonia, Acute Kidney Injury on CRRT.' },
      { id: 'p3', hisId: 'HN-1003', name: 'Mohammed Al-Rawahi', dob: '1952-08-30', bedNumber: 'HDU-2', currentAcuity: 'HDU', medicalHistory: 'Exacerbation of COPD, requiring NIV support.' },
      { id: 'p4', hisId: 'HN-1004', name: 'Sara Al-Zadjali', dob: '1989-02-14', bedNumber: 'HDU-ISO2', currentAcuity: 'HDU', medicalHistory: 'Post-op Whipple procedure, monitoring for pancreatic leak.' },
    ];

    await Promise.all(seedPatients.map(p => storage.savePatient(p)));
    await logAction('CENSUS_SEEDED', 'ALL', 'Initial demo census data populated');
    onRefresh();
  };

  const handleRandomAdd = async () => {
    const firstNames = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'Thomas', 'Elizabeth', 'Ousmane', 'Amina', 'Chen', 'Wei', 'Arun', 'Priya'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Dembele', 'Diop', 'Lee', 'Wong', 'Gupta', 'Sharma', 'Al-Farsi', 'Bin-Said'];
    const diagnoses = [
      'Post-op Whipple procedure',
      'Exacerbation of COPD',
      'Severe Sepsis',
      'Acute Kidney Injury',
      'Community Acquired Pneumonia',
      'Post-op CABG',
      'History of Hypertension',
      'Type 2 Diabetes',
      'Multiple Trauma',
      'Ischemic Stroke'
    ];

    const randomBed = ALL_BEDS.filter(b => !patientMap[b])[Math.floor(Math.random() * ALL_BEDS.filter(b => !patientMap[b]).length)];
    
    if (!randomBed) {
      alert("No available beds in the unit.");
      return;
    }

    const randomPatient: Patient = {
      id: crypto.randomUUID(),
      hisId: `HN-${Math.floor(1000 + Math.random() * 9000)}`,
      name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
      dob: `${Math.floor(1940 + Math.random() * 60)}-${String(Math.floor(1 + Math.random() * 12)).padStart(2, '0')}-${String(Math.floor(1 + Math.random() * 28)).padStart(2, '0')}`,
      bedNumber: randomBed,
      currentAcuity: randomBed.startsWith('ICU') ? 'ICU' : 'HDU',
      medicalHistory: diagnoses[Math.floor(Math.random() * diagnoses.length)],
      riskScore: Math.floor(10 + Math.random() * 80),
      riskLevel: 'Moderate', // Default
      riskFactors: ['Randomly Generated']
    };

    if (randomPatient.riskScore >= 70) randomPatient.riskLevel = 'Critical' as const;
    else if (randomPatient.riskScore >= 40) randomPatient.riskLevel = 'High' as const;
    else if (randomPatient.riskScore >= 20) randomPatient.riskLevel = 'Moderate' as const;
    else randomPatient.riskLevel = 'Low' as const;

    await storage.savePatient(randomPatient);
    await logAction('RANDOM_PATIENT_GENERATED', randomPatient.hisId, `Randomly generated patient ${randomPatient.name}`);
    onRefresh();
  };

  const handleBulkRandomAdd = async () => {
    const firstNames = ['Arun', 'Priya', 'Ahmed', 'Fatma', 'John', 'Sarah', 'Chen', 'Wei', 'Ousmane', 'Amina', 'Hiroshi', 'Yuki', 'Carlos', 'Elena'];
    const lastNames = ['Gupta', 'Sharma', 'Al-Said', 'Al-Balushi', 'Smith', 'Doe', 'Wong', 'Lee', 'Diop', 'Sow', 'Tanaka', 'Sato', 'Garcia', 'Martinez'];
    const diagnoses = [
      'Heart Failure Exacerbation',
      'Acute Respiratory Distress Syndrome',
      'Sepsis Shock',
      'Post-op Liver Transplant',
      'Traumatic Brain Injury',
      'Gastrointestinal Hemorrhage',
      'Multisystem Organ Failure',
      'Status Epilepticus',
      'Pulmonary Embolism',
      'Cardiogenic Shock'
    ];

    const availableBeds = ALL_BEDS.filter(b => !patientMap[b]);
    const numToGenerate = Math.min(7, availableBeds.length);

    if (numToGenerate === 0) {
      alert("No available beds in the unit.");
      return;
    }

    // Shuffle and pick beds
    const bedSubset = [...availableBeds].sort(() => 0.5 - Math.random()).slice(0, numToGenerate);

    const newPatients: Patient[] = bedSubset.map(bed => {
      const riskScore = Math.floor(15 + Math.random() * 80);
      let riskLevel: 'Low' | 'Moderate' | 'High' | 'Critical' = 'Moderate';
      if (riskScore >= 75) riskLevel = 'Critical';
      else if (riskScore >= 45) riskLevel = 'High';
      else if (riskScore >= 25) riskLevel = 'Moderate';
      else riskLevel = 'Low';

      return {
        id: crypto.randomUUID(),
        hisId: `DEMO-${Math.floor(1000 + Math.random() * 8999)}`,
        name: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
        dob: `${Math.floor(1935 + Math.random() * 65)}-${String(Math.floor(1 + Math.random() * 12)).padStart(2, '0')}-${String(Math.floor(1 + Math.random() * 28)).padStart(2, '0')}`,
        bedNumber: bed,
        currentAcuity: bed.startsWith('ICU') ? 'ICU' : 'HDU',
        medicalHistory: diagnoses[Math.floor(Math.random() * diagnoses.length)],
        riskScore,
        riskLevel,
        riskFactors: ['Demo Simulation Cluster']
      };
    });

    await Promise.all(newPatients.map(p => storage.savePatient(p)));
    await logAction('BULK_DEMO_GENERATED', 'UNIT', `Generated ${numToGenerate} demo patients for simulation`);
    onRefresh();
  };

  const renderBed = (bedId: string) => {
    const patient = patientMap[bedId];
    
    if (patient) {
      // Filter logic
      if (acuityFilter !== 'All' && patient.currentAcuity !== acuityFilter) return null;
      if (search && !patient.name.toLowerCase().includes(search.toLowerCase()) && !patient.hisId.includes(search)) return null;

      const patientAssessments = assessments.filter(a => a.patientId === patient.id);
      const lastAssessment = patientAssessments[0];
      const prevAssessment = patientAssessments[1];
      
      const isDue = !lastAssessment || (new Date().getTime() - new Date(lastAssessment.timestamp).getTime() > 12 * 60 * 60 * 1000);
      
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (lastAssessment && prevAssessment) {
        if (lastAssessment.riskScore > prevAssessment.riskScore) trend = 'up';
        else if (lastAssessment.riskScore < prevAssessment.riskScore) trend = 'down';
      }

      return (
        <motion.div 
          key={patient.id}
          layout
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`relative metallic-card p-6 transition-all group ${
            isDue ? 'border-amber-500/50 shadow-amber-500/10' : 'border-white/50'
          }`}
        >
          {isDue && (
            <div className="absolute top-0 right-0 mt-2 mr-2 px-3 py-1 bg-amber-500 text-white micro-label !text-[8px] !text-white rounded-lg shadow-lg flex items-center gap-1.5 animate-pulse z-10">
              <Clock size={10} /> Assessment Due
            </div>
          )}

          <div className="flex flex-col gap-4 mb-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="bg-slate-900 text-white px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 flex-shrink-0 border border-white/20">
                  <span className="text-sm font-black uppercase tracking-widest">Bed {patient.bedNumber}</span>
                </div>
              </div>
              <AcuityBadge level={patient.currentAcuity} />
            </div>
            
            {patient.riskScore !== undefined && (
              <div className="w-full">
                <RiskIndicator score={patient.riskScore} level={patient.riskLevel!} trend={trend} />
              </div>
            )}
          </div>

          <h3 className="text-xl font-black text-slate-900 mb-1 tracking-tight truncate">{patient.name}</h3>
          <div className="flex items-center gap-2 mb-6 overflow-hidden">
            <span className="data-value text-[10px] text-slate-500 truncate">HIS: {patient.hisId}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/50 p-3 rounded-2xl border border-slate-200 min-w-0">
              <p className="micro-label !text-[8px] opacity-50 mb-1 truncate">DOB</p>
              <p className="data-value text-xs text-slate-700 truncate">{patient.dob}</p>
            </div>
            <div className="bg-white/50 p-3 rounded-2xl border border-slate-200 min-w-0">
              <p className="micro-label !text-[8px] opacity-50 mb-1 truncate">Workload</p>
              <div className="flex items-center gap-2">
                <p className="data-value text-xs text-slate-700 truncate">{calculateWorkloadScore(patient, lastAssessment)}%</p>
                <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${calculateWorkloadScore(patient, lastAssessment) > 70 ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${calculateWorkloadScore(patient, lastAssessment)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {lastAssessment && (
            <div className="mb-4 grid grid-cols-4 gap-2">
              <div className="flex flex-col items-center p-2 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[7px] font-black text-slate-400 uppercase">HR</span>
                <span className={`text-[10px] font-black ${lastAssessment.vitals.hr > 110 || lastAssessment.vitals.hr < 50 ? 'text-red-600' : 'text-slate-700'}`}>{lastAssessment.vitals.hr}</span>
              </div>
              <div className="flex flex-col items-center p-2 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[7px] font-black text-slate-400 uppercase">MAP</span>
                <span className={`text-[10px] font-black ${lastAssessment.vitals.map < 65 ? 'text-red-600' : 'text-slate-700'}`}>{lastAssessment.vitals.map}</span>
              </div>
              <div className="flex flex-col items-center p-2 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[7px] font-black text-slate-400 uppercase">SpO2</span>
                <span className={`text-[10px] font-black ${lastAssessment.vitals.spo2 < 92 ? 'text-red-600' : 'text-slate-700'}`}>{lastAssessment.vitals.spo2}%</span>
              </div>
              <div className="flex flex-col items-center p-2 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[7px] font-black text-slate-400 uppercase">Temp</span>
                <span className={`text-[10px] font-black ${lastAssessment.vitals.temp > 38 || lastAssessment.vitals.temp < 36 ? 'text-red-600' : 'text-slate-700'}`}>{lastAssessment.vitals.temp}°</span>
              </div>
            </div>
          )}

          {patient.medicalHistory && (
            <div className="mb-6 p-4 bg-white/40 rounded-2xl border border-slate-200/50">
              <p className="micro-label !text-[8px] text-blue-600 uppercase mb-1">Medical History</p>
              <p className="text-[10px] text-slate-600 line-clamp-3 leading-relaxed">{patient.medicalHistory}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button 
              onClick={() => onAssess(patient)}
              className="clinical-btn-primary !py-3 !text-xs w-full"
            >
              <ClipboardList size={14} />
              <span className="micro-label !text-current !text-[10px]">Assess Patient</span>
            </button>
            <div className="grid grid-cols-4 gap-2">
              <button 
                onClick={() => onTransfer(patient)}
                className="h-10 bg-white/80 text-slate-500 rounded-xl hover:text-blue-600 transition-all flex items-center justify-center border border-slate-200 shadow-sm"
                title="Transfer"
              >
                <ArrowRightLeft size={14} />
              </button>
              <button 
                onClick={() => onGenerateSBAR(patient)}
                className="h-10 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all flex items-center justify-center border border-blue-200 shadow-sm"
                title="SBAR"
              >
                <FileText size={14} />
              </button>
              <button 
                onClick={() => onDischarge(patient)}
                className="h-10 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center shadow-sm border border-emerald-100"
                title="Discharge"
              >
                <DoorOpen size={14} />
              </button>
              <button 
                onClick={() => onDeclareDeath(patient)}
                className="h-10 bg-slate-800 text-white rounded-xl hover:bg-black transition-all flex items-center justify-center shadow-md shadow-black/10"
                title="Death"
              >
                <HeartOff size={14} />
              </button>
            </div>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div 
        key={bedId}
        layout
        className="metallic-card bg-white/20 p-6 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-center group hover:border-blue-400 hover:bg-white/40 transition-all min-h-[450px] shadow-inner"
      >
        <div className="bg-slate-100/50 w-16 h-16 rounded-2xl flex items-center justify-center text-slate-400 mb-6 shadow-inner border border-slate-200 group-hover:text-blue-600 transition-colors">
          <UserPlus size={24} />
        </div>
        <h3 className="text-xl font-black text-slate-400 group-hover:text-slate-600 transition-colors mb-1">Bed {bedId}</h3>
        <p className="micro-label opacity-40 mb-6">Available for Admission</p>
        <button 
          onClick={() => onAddPatient(bedId)}
          className="clinical-btn-secondary !py-2 !px-6 !text-[10px]"
        >
          Admit Patient
        </button>
      </motion.div>
    );
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Unit Census</h2>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => onAddPatient()}
              className="clinical-btn-primary !py-2 !px-4 !text-[10px]"
            >
              <UserPlus size={14} />
              Quick Add
            </button>
            <button 
              onClick={handleRandomAdd}
              className="h-9 w-9 bg-slate-900 text-white rounded-xl hover:bg-black transition-all flex items-center justify-center shadow-lg shadow-black/10 group"
              title="Generate Random Patient"
            >
              <Wand2 size={16} className="group-hover:rotate-12 transition-transform" />
            </button>
            <button 
              onClick={handleBulkRandomAdd}
              className="px-4 h-9 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-purple-900/20 group ring-2 ring-purple-500/20"
              title="Generate 7 Demo Patients"
            >
              <div className="relative">
                <Sparkles size={16} className="group-hover:scale-110 transition-transform" />
                <span className="absolute -top-1 -right-1 text-[8px] font-black bg-white text-purple-600 px-1 rounded-full border border-purple-100 uppercase">Demo</span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider hidden sm:inline">Bulk Demo (x7)</span>
            </button>
          </div>
          {patients.length === 0 && (
            <button 
              onClick={handleSeed}
              className="clinical-btn-secondary !py-2 !px-4 !text-[10px]"
            >
              Seed Demo Census
            </button>
          )}
        </div>
        <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
          <div className="flex bg-slate-200/50 p-1 rounded-2xl border border-white/50 shadow-inner">
            {(['All', 'ICU', 'HDU'] as const).map(f => (
              <button
                key={f}
                onClick={() => setAcuityFilter(f)}
                className={`px-4 py-2 rounded-xl micro-label !text-current transition-all ${
                  acuityFilter === f 
                    ? 'bg-white text-blue-600 shadow-sm ring-1 ring-black/5' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search census..." 
              className="w-full pl-12 pr-4 py-3 bg-white/50 border border-white/50 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all text-slate-900 text-sm shadow-inner"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Left Wing: HDU */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-300 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-amber-900/10">
                <Users size={16} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Left Wing</h3>
                <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest">HDU</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-black text-slate-900">{HDU_BEDS.filter(b => !!patientMap[b]).length} / {HDU_BEDS.length}</p>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Occupancy</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {HDU_BEDS.map(renderBed)}
          </div>
        </div>

        {/* Right Wing: ICU */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-300 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-red-900/10">
                <Activity size={16} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Right Wing</h3>
                <p className="text-[9px] font-bold text-red-600 uppercase tracking-widest">ICU</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-black text-slate-900">{ICU_BEDS.filter(b => !!patientMap[b]).length} / {ICU_BEDS.length}</p>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Occupancy</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ICU_BEDS.map(renderBed)}
          </div>
        </div>
      </div>
    </div>
  );
}

function RiskIndicator({ score, level, trend }: { score: number, level: string, trend?: 'up' | 'down' | 'stable' }) {
  const color = 
    level === 'Critical' ? 'text-red-600' :
    level === 'High' ? 'text-orange-600' :
    level === 'Moderate' ? 'text-amber-600' : 'text-emerald-600';

  const bgColor = 
    level === 'Critical' ? 'bg-red-50 border-red-100' :
    level === 'High' ? 'bg-orange-50 border-orange-100' :
    level === 'Moderate' ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100';

  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border ${bgColor} shadow-sm w-full overflow-hidden`}>
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex flex-col min-w-0">
          <span className="text-[7px] font-black uppercase tracking-widest text-slate-400 truncate">Risk</span>
          <div className="flex items-center gap-1">
            <span className={`text-sm font-black ${color}`}>{score}</span>
            {trend === 'up' && <ArrowUpRight size={10} className="text-red-600 flex-shrink-0" />}
            {trend === 'down' && <ArrowDownRight size={10} className="text-emerald-600 flex-shrink-0" />}
          </div>
        </div>
      </div>
      <div className="w-px h-4 bg-slate-200 flex-shrink-0"></div>
      <div className="flex flex-col items-end min-w-0">
        <span className="text-[7px] font-black uppercase tracking-widest text-slate-400 truncate">Status</span>
        <span className={`text-[9px] font-black uppercase tracking-widest ${color} truncate`}>{level}</span>
      </div>
    </div>
  );
}

function SBARModal({ patient, staff, onClose }: { patient: Patient, staff: Staff, onClose: () => void }) {
  const [report, setReport] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchAndGenerate = async () => {
      try {
        const patientAssessments = storage.getAssessments().filter((a: any) => a.patientId === patient.id);
        const latest = patientAssessments[0]; // Already sorted newest first
        
        const sbar = await generateSBAR(patient, latest || {}, staff);
        setReport(sbar);
      } catch (error) {
        console.error("SBAR generation error:", error);
        setReport('Failed to generate SBAR report.');
      } finally {
        setLoading(false);
      }
    };
    fetchAndGenerate();
  }, [patient, staff]);

  const handleSavePDF = async () => {
    if (!reportRef.current) return;
    setIsGeneratingPDF(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const elements = clonedDoc.getElementsByTagName('*');
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLElement;
            if (el.classList.contains('bg-slate-900')) el.style.setProperty('background-color', '#0f172a', 'important');
            if (el.classList.contains('text-slate-900')) el.style.setProperty('color', '#0f172a', 'important');
            if (el.classList.contains('text-slate-700')) el.style.setProperty('color', '#334155', 'important');
            if (el.classList.contains('text-blue-600')) el.style.setProperty('color', '#2563eb', 'important');
            try {
              const computed = window.getComputedStyle(el);
              const props = ['backgroundColor', 'color', 'borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'textDecorationColor', 'boxShadow', 'textShadow'];
              for (const prop of props) {
                const val = computed[prop as any];
                if (val && (val.includes('oklch') || val.includes('oklab') || val.includes('color('))) {
                  if (prop === 'backgroundColor') el.style.backgroundColor = '#ffffff';
                  else if (prop === 'color') el.style.color = '#000000';
                  else if (prop === 'boxShadow' || prop === 'textShadow') el.style[prop as any] = 'none';
                  else el.style[prop as any] = 'transparent';
                }
              }
            } catch (e) {}
          }
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`SBAR_${patient.name.replace(/\s+/g, '_')}_${staff.name.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('PDF Generation Error:', error);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:bg-white print:p-0">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="metallic-panel w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col !rounded-[40px] print:shadow-none print:rounded-none print:max-w-none print:h-screen print:bg-white"
      >
        <div className="px-10 py-8 border-b border-slate-200 flex items-center justify-between bg-white/50 print:hidden">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-900/10">
              <History className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">SBAR Handover Report</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">AI-Generated Clinical Summary</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <LogOut size={24} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-white/30" ref={reportRef}>
          <div className="hidden print:block mb-8 border-b pb-4">
            <h1 className="text-3xl font-black text-slate-900">SBAR Handover Report</h1>
            <p className="text-sm text-slate-600">Patient: {patient.name} | Bed: {patient.bedNumber}</p>
            <p className="text-sm text-slate-600">Generated by: {staff.name} | Date: {new Date().toLocaleString()}</p>
          </div>
          
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4 print:hidden">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Synthesizing Clinical Data...</p>
            </div>
          ) : (
            <div className="prose prose-slate max-w-none markdown-body !text-slate-700">
              <Markdown>{report}</Markdown>
            </div>
          )}
        </div>

        <div className="px-10 py-6 bg-slate-100/80 border-t border-slate-200 flex justify-end gap-4 print:hidden">
          <button 
            disabled={isGeneratingPDF || loading}
            onClick={handleSavePDF}
            className="clinical-btn-secondary"
          >
            {isGeneratingPDF ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            ) : (
              <Download size={18} />
            )}
            Save as PDF
          </button>
          <button 
            disabled={loading}
            onClick={() => window.print()}
            className="clinical-btn-primary"
          >
            <Printer size={18} />
            Print Report
          </button>
          <button 
            onClick={onClose}
            className="clinical-btn-secondary"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function UnitSummaryModal({ patients, onClose }: { patients: Patient[], onClose: () => void }) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const summary = useMemo(() => {
    const leftWing = patients.filter(p => HDU_BEDS.includes(p.bedNumber));
    const rightWing = patients.filter(p => ICU_BEDS.includes(p.bedNumber));
    
    const icuCount = patients.filter(p => p.currentAcuity === 'ICU').length;
    const hduCount = patients.filter(p => p.currentAcuity === 'HDU').length;
    
    // Staffing: ICU 1:1, HDU 1:2
    const nurseRequirement = icuCount + Math.ceil(hduCount / 2);

    return {
      leftWing: { count: leftWing.length, total: HDU_BEDS.length },
      rightWing: { count: rightWing.length, total: ICU_BEDS.length },
      icuCount,
      hduCount,
      nurseRequirement,
      totalCensus: patients.length,
      timestamp: new Date().toLocaleString()
    };
  }, [patients]);

  const handlePrint = () => {
    window.print();
  };

  const handleSavePDF = async () => {
    if (!reportRef.current) return;
    setIsGeneratingPDF(true);
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          // Fix for oklch/oklab colors which html2canvas doesn't support
          const elements = clonedDoc.getElementsByTagName('*');
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as HTMLElement;
            
            // Force hex/rgb for common Tailwind classes used in the report
            // this prevents html2canvas from trying to parse the oklch/oklab values
            if (el.classList.contains('bg-slate-900')) el.style.setProperty('background-color', '#0f172a', 'important');
            if (el.classList.contains('bg-slate-800/50')) el.style.setProperty('background-color', 'rgba(30, 41, 59, 0.5)', 'important');
            if (el.classList.contains('bg-blue-600')) el.style.setProperty('background-color', '#2563eb', 'important');
            if (el.classList.contains('bg-amber-500')) el.style.setProperty('background-color', '#f59e0b', 'important');
            if (el.classList.contains('bg-red-500')) el.style.setProperty('background-color', '#ef4444', 'important');
            if (el.classList.contains('bg-slate-800')) el.style.setProperty('background-color', '#1e293b', 'important');
            if (el.classList.contains('bg-slate-50')) el.style.setProperty('background-color', '#f8fafc', 'important');
            
            if (el.classList.contains('text-slate-50')) el.style.setProperty('color', '#f8fafc', 'important');
            if (el.classList.contains('text-slate-400')) el.style.setProperty('color', '#94a3b8', 'important');
            if (el.classList.contains('text-slate-500')) el.style.setProperty('color', '#64748b', 'important');
            if (el.classList.contains('text-slate-900')) el.style.setProperty('color', '#0f172a', 'important');
            if (el.classList.contains('text-blue-600')) el.style.setProperty('color', '#2563eb', 'important');
            if (el.classList.contains('text-amber-500')) el.style.setProperty('color', '#f59e0b', 'important');
            if (el.classList.contains('text-red-500')) el.style.setProperty('color', '#ef4444', 'important');
            if (el.classList.contains('text-white')) el.style.setProperty('color', '#ffffff', 'important');
            
            if (el.classList.contains('border-slate-800')) el.style.setProperty('border-color', '#1e293b', 'important');
            if (el.classList.contains('border-blue-600')) el.style.setProperty('border-color', '#2563eb', 'important');
            if (el.classList.contains('border-slate-200')) el.style.setProperty('border-color', '#e2e8f0', 'important');
            
            // Handle print-specific overrides
            if (el.classList.contains('print:bg-white')) el.style.setProperty('background-color', '#ffffff', 'important');
            if (el.classList.contains('print:text-slate-900')) el.style.setProperty('color', '#0f172a', 'important');

            // Generic catch-all for any remaining oklch/oklab colors in computed styles
            try {
              const computed = window.getComputedStyle(el);
              const props = ['backgroundColor', 'color', 'borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'textDecorationColor', 'boxShadow', 'textShadow'];
              for (const prop of props) {
                const val = computed[prop as any];
                if (val && (val.includes('oklch') || val.includes('oklab') || val.includes('color('))) {
                  if (prop === 'backgroundColor') el.style.backgroundColor = '#ffffff';
                  else if (prop === 'color') el.style.color = '#000000';
                  else if (prop === 'boxShadow' || prop === 'textShadow') el.style[prop as any] = 'none';
                  else el.style[prop as any] = 'transparent';
                }
              }
            } catch (e) {
              // Ignore errors if computed style is not accessible
            }
          }
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`Unit_Summary_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('PDF Generation Error:', error);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm print:bg-white print:p-0">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="metallic-panel w-full max-w-2xl overflow-hidden flex flex-col !rounded-[40px] print:shadow-none print:rounded-none print:max-w-none print:h-screen print:bg-white"
      >
        <div className="px-10 py-8 border-b border-slate-200 flex items-center justify-between bg-white/50 print:hidden">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-900/10">
              <Printer className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">Unit Summary Report</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Census & Staffing Overview</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <LogOut size={24} className="text-slate-400" />
          </button>
        </div>

        <div ref={reportRef} className="flex-1 overflow-y-auto p-10 space-y-10 print:p-12 bg-white/30 print:bg-white">
          {/* Header for Print */}
          <div className="hidden print:block border-b-2 border-slate-900 pb-6 mb-10" style={{ borderBottomColor: '#0f172a' }}>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-sm font-bold text-blue-600 uppercase tracking-widest" style={{ color: '#2563eb' }}>AcuitySync Unit Summary</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest" style={{ color: '#94a3b8' }}>Report Generated</p>
                <p className="text-sm font-black text-slate-900" style={{ color: '#0f172a' }}>{summary.timestamp}</p>
              </div>
            </div>
          </div>

          {/* Wing Occupancy */}
          <div className="grid grid-cols-2 gap-8">
            <div className="p-6 bg-white/50 rounded-3xl border border-slate-200 print:bg-slate-50 print:border-slate-200">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-2">Left Wing (HDU)</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900">{summary.leftWing.count}</span>
                <span className="text-lg font-bold text-slate-400">/ {summary.leftWing.total} Beds</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Occupancy: {Math.round((summary.leftWing.count / summary.leftWing.total) * 100)}%</p>
            </div>
            <div className="p-6 bg-white/50 rounded-3xl border border-slate-200 print:bg-slate-50 print:border-slate-200">
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-2">Right Wing (ICU)</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900">{summary.rightWing.count}</span>
                <span className="text-lg font-bold text-slate-400">/ {summary.rightWing.total} Beds</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Occupancy: {Math.round((summary.rightWing.count / summary.rightWing.total) * 100)}%</p>
            </div>
          </div>

          {/* Classification Breakdown */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest border-l-4 border-blue-600 pl-3" style={{ borderLeftColor: '#2563eb' }}>Clinical Classification</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 border border-slate-200 rounded-2xl bg-white/40">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Census</p>
                <p className="text-2xl font-black text-slate-900">{summary.totalCensus}</p>
              </div>
              <div className="p-4 border border-slate-200 rounded-2xl bg-white/40">
                <p className="text-[10px] font-bold text-red-600 uppercase mb-1">Level 3 (ICU)</p>
                <p className="text-2xl font-black text-slate-900">{summary.icuCount}</p>
              </div>
              <div className="p-4 border border-slate-200 rounded-2xl bg-white/40">
                <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">Level 2 (HDU)</p>
                <p className="text-2xl font-black text-slate-900">{summary.hduCount}</p>
              </div>
            </div>
          </div>

          {/* Staffing Requirements */}
          <div className="bg-blue-600 p-8 rounded-[32px] text-white shadow-xl shadow-blue-900/20 print:shadow-none print:bg-blue-600" style={{ backgroundColor: '#2563eb', color: '#ffffff' }}>
            <div className="flex items-center gap-4 mb-6">
              <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm" style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}>
                <Users className="text-white" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black">Staffing Requirements</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80" style={{ opacity: 0.8 }}>Calculated for Current Shift</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-4xl font-black mb-1">{summary.nurseRequirement}</p>
                <p className="text-xs font-bold uppercase tracking-widest opacity-80" style={{ opacity: 0.8 }}>Total Nurses Required</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase border-b border-white/20 pb-1" style={{ borderBottomColor: 'rgba(255, 255, 255, 0.2)' }}>
                  <span>ICU Ratio (1:1)</span>
                  <span>{summary.icuCount} RN</span>
                </div>
                <div className="flex justify-between text-[10px] font-bold uppercase border-b border-white/20 pb-1" style={{ borderBottomColor: 'rgba(255, 255, 255, 0.2)' }}>
                  <span>HDU Ratio (1:2)</span>
                  <span>{Math.ceil(summary.hduCount / 2)} RN</span>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden print:block mt-20 pt-10 border-t border-slate-200" style={{ borderTopColor: '#e2e8f0' }}>
            <div className="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-3xl" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }}>
              <p className="text-[9px] text-slate-500 font-clinical italic leading-relaxed" style={{ color: '#64748b' }}>
                <span className="font-black text-slate-900 not-italic mr-1" style={{ color: '#0f172a' }}>Clinical Decision Support Disclaimer:</span>
                This report is generated by AcuitySync AI module. All classifications and risk predictions are for support purposes only. Final clinical judgment remains the responsibility of the registered clinician. Data is processed locally for pilot validation.
              </p>
            </div>
            <div className="flex justify-between items-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest" style={{ color: '#94a3b8' }}>Authorized By: ___________________________</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest" style={{ color: '#94a3b8' }}>Page 1 of 1</p>
            </div>
          </div>
        </div>

        <div className="px-10 py-6 bg-slate-100/80 border-t border-slate-200 flex justify-end gap-4 print:hidden">
          <button 
            disabled={isGeneratingPDF}
            onClick={handleSavePDF}
            className="clinical-btn-secondary"
          >
            {isGeneratingPDF ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            ) : (
              <Download size={18} />
            )}
            Save as PDF
          </button>
          <button 
            onClick={handlePrint}
            className="clinical-btn-primary"
          >
            <Printer size={18} />
            Print Report
          </button>
          <button 
            onClick={onClose}
            className="clinical-btn-secondary"
          >
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function TransferModal({ patient, patients, onClose, onSuccess }: { patient: Patient, patients: Patient[], onClose: () => void, onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [selectedBed, setSelectedBed] = useState<string>('');

  const occupiedBeds = useMemo(() => patients.map(p => p.bedNumber), [patients]);
  const availableBeds = useMemo(() => ALL_BEDS.filter(b => !occupiedBeds.includes(b)), [occupiedBeds]);

  const handleTransfer = async () => {
    if (!selectedBed) return;
    setLoading(true);
    try {
      await storage.savePatient({
        ...patient,
        bedNumber: selectedBed,
        currentAcuity: selectedBed.startsWith('ICU') ? 'ICU' : 'HDU'
      });
      await logAction('PATIENT_TRANSFERRED', patient.id, `Transferred from ${patient.bedNumber} to ${selectedBed}`);
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Transfer error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="metallic-panel w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] !rounded-[40px]"
      >
        <div className="px-10 py-8 border-b border-slate-200 flex items-center justify-between bg-white/50">
          <div className="flex items-center gap-4">
            <div className="bg-amber-500 p-2 rounded-xl shadow-lg shadow-amber-900/10">
              <Clock className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Transfer Patient</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">{patient.name} • Current Bed: {patient.bedNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <LogOut size={24} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-8 bg-white/30">
          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Destination Bed</p>
            
            <div className="grid grid-cols-2 gap-8">
              {/* HDU Section */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Left Wing (HDU)</p>
                <div className="grid grid-cols-2 gap-2">
                  {HDU_BEDS.map(bed => {
                    const isOccupied = occupiedBeds.includes(bed);
                    return (
                      <button
                        key={bed}
                        disabled={isOccupied}
                        onClick={() => setSelectedBed(bed)}
                        className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                          selectedBed === bed 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                            : isOccupied 
                              ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-blue-500 hover:bg-blue-50'
                        }`}
                      >
                        {bed}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ICU Section */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Right Wing (ICU)</p>
                <div className="grid grid-cols-2 gap-2">
                  {ICU_BEDS.map(bed => {
                    const isOccupied = occupiedBeds.includes(bed);
                    return (
                      <button
                        key={bed}
                        disabled={isOccupied}
                        onClick={() => setSelectedBed(bed)}
                        className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                          selectedBed === bed 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md' 
                            : isOccupied 
                              ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-blue-500 hover:bg-blue-50'
                        }`}
                      >
                        {bed}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {selectedBed && (
            <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
              <p className="text-sm font-bold text-blue-600 mb-1">Transfer Confirmation</p>
              <p className="text-xs text-slate-600 leading-relaxed">
                You are about to transfer <strong>{patient.name}</strong> from <strong>{patient.bedNumber}</strong> to <strong>{selectedBed}</strong>. 
                The patient's acuity will be automatically updated to <strong>{selectedBed.startsWith('ICU') ? 'Level 3 (ICU)' : 'Level 2 (HDU)'}</strong>.
              </p>
            </div>
          )}
        </div>

        <div className="px-10 py-6 bg-slate-100/80 border-t border-slate-200 flex justify-end gap-4">
          <button 
            onClick={onClose}
            className="clinical-btn-secondary"
          >
            Cancel
          </button>
          <button 
            disabled={loading || !selectedBed}
            onClick={handleTransfer}
            className="clinical-btn-primary"
          >
            {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
            Confirm Transfer
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function ClinicalStandardsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="metallic-panel w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] !rounded-[40px]"
      >
        <div className="px-10 py-8 border-b border-slate-200 flex items-center justify-between bg-white/50">
          <div className="flex items-center gap-4">
            <div className="bg-white p-2 rounded-xl border border-slate-200 w-12 h-12 flex items-center justify-center shadow-sm">
              <Logo />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Clinical Classification Standards</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Validated by Intensive Care Society (ICS) Guidelines</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <LogOut size={24} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-12 bg-white/30">
          <section className="space-y-4">
            <h3 className="text-lg font-black text-red-600 flex items-center gap-2">
              <AlertCircle size={20} /> Level 3: Intensive Care (ICU)
            </h3>
            <div className="bg-red-50 p-6 rounded-3xl border border-red-100 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed font-medium">
                Patients requiring advanced respiratory support alone or support of at least two organ systems. This level is appropriate for patients with multi-organ failure.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ul className="space-y-3">
                  <StandardBullet label="Invasive Mechanical Ventilation" />
                  <StandardBullet label="Multi-organ Support (2+ Systems)" />
                  <StandardBullet label="Multiple Vasopressors/Inotropes" />
                </ul>
                <ul className="space-y-3">
                  <StandardBullet label="Prone Positioning (ARDS Protocol)" />
                  <StandardBullet label="Advanced Renal Support (CRRT)" />
                  <StandardBullet label="Mechanical Circulatory Support (IABP/ECMO)" />
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-lg font-black text-amber-600 flex items-center gap-2">
              <Info size={20} /> Level 2: High Dependency (HDU)
            </h3>
            <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed font-medium">
                Patients requiring more detailed observation or intervention including support for a single failing organ system or post-operative care and those 'stepping down' from higher levels of care.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ul className="space-y-3">
                  <StandardBullet label="Single Organ Support" />
                  <StandardBullet label="Non-Invasive Ventilation (CPAP/BiPAP)" />
                  <StandardBullet label="Single Vasopressor Support" />
                </ul>
                <ul className="space-y-3">
                  <StandardBullet label="Post-Major Surgery Recovery" />
                  <StandardBullet label="Step-down from Level 3 Care" />
                  <StandardBullet label="Extended Monitoring Requirements" />
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-lg font-black text-emerald-600 flex items-center gap-2">
              <CheckCircle2 size={20} /> Level 1: Ward Care with Support
            </h3>
            <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed font-medium">
                Patients at risk of their condition deteriorating, or those recently relocated from higher levels of care, whose needs can be met on an acute ward with additional advice and support from the critical care team.
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StandardBullet label="Risk of Deterioration" />
                <StandardBullet label="Recent Step-down from HDU" />
                <StandardBullet label="Additional Nursing Support" />
                <StandardBullet label="Critical Care Outreach Input" />
              </ul>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-lg font-black text-slate-600 flex items-center gap-2">
              <Users size={20} /> Level 0: Normal Ward Care
            </h3>
            <div className="bg-slate-100 p-6 rounded-3xl border border-slate-200 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed font-medium">
                Patients whose needs can be met through normal ward care in an acute hospital.
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StandardBullet label="Stable Clinical Condition" />
                <StandardBullet label="Routine Observation Frequency" />
                <StandardBullet label="Standard Nursing Ratios" />
                <StandardBullet label="No Organ Support Required" />
              </ul>
            </div>
          </section>

          <div className="border-t border-slate-200 pt-8 mt-8">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-6">Evidence-Based Handover Frameworks</h2>
            
            <section className="space-y-4 mb-8">
              <h3 className="text-lg font-black text-blue-600 flex items-center gap-2">
                <FileText size={20} /> ISBAR Communication Tool
              </h3>
              <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100 space-y-4">
                <p className="text-sm text-slate-700 leading-relaxed font-medium mb-4">
                  A standardized framework for communicating critical patient information, ensuring clarity and reducing errors during handovers.
                </p>
                <div className="space-y-3">
                  <div className="flex gap-3"><strong className="text-blue-700 min-w-[100px]">Identify:</strong> <span className="text-sm text-slate-700">Identify yourself, your role, the patient, and their location.</span></div>
                  <div className="flex gap-3"><strong className="text-blue-700 min-w-[100px]">Situation:</strong> <span className="text-sm text-slate-700">State the immediate problem or reason for the handover.</span></div>
                  <div className="flex gap-3"><strong className="text-blue-700 min-w-[100px]">Background:</strong> <span className="text-sm text-slate-700">Provide relevant clinical history, admission diagnosis, and current treatment.</span></div>
                  <div className="flex gap-3"><strong className="text-blue-700 min-w-[100px]">Assessment:</strong> <span className="text-sm text-slate-700">Share your clinical assessment, vital signs, and recent changes.</span></div>
                  <div className="flex gap-3"><strong className="text-blue-700 min-w-[100px]">Recommendation:</strong> <span className="text-sm text-slate-700">State what needs to be done, specific requests, or the plan of care.</span></div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-lg font-black text-indigo-600 flex items-center gap-2">
                <ClipboardList size={20} /> I-PASS Handoff Bundle
              </h3>
              <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 space-y-4">
                <p className="text-sm text-slate-700 leading-relaxed font-medium mb-4">
                  An evidence-based handoff bundle proven to decrease medical errors and prevent adverse events.
                </p>
                <div className="space-y-3">
                  <div className="flex gap-3"><strong className="text-indigo-700 min-w-[120px]">Illness severity:</strong> <span className="text-sm text-slate-700">Stable, "watcher," or unstable.</span></div>
                  <div className="flex gap-3"><strong className="text-indigo-700 min-w-[120px]">Patient summary:</strong> <span className="text-sm text-slate-700">Summary statement, events leading up to admission, hospital course, ongoing assessment, plan.</span></div>
                  <div className="flex gap-3"><strong className="text-indigo-700 min-w-[120px]">Action list:</strong> <span className="text-sm text-slate-700">To-do items, timeline, and ownership.</span></div>
                  <div className="flex gap-3"><strong className="text-indigo-700 min-w-[120px]">Situation awareness:</strong> <span className="text-sm text-slate-700">Know what's going on, plan for what might happen (contingency planning).</span></div>
                  <div className="flex gap-3"><strong className="text-indigo-700 min-w-[120px]">Synthesis by receiver:</strong> <span className="text-sm text-slate-700">Receiver summarizes what was heard, asks questions, restates key action/to-do items.</span></div>
                </div>
              </div>
            </section>
          </div>

          <div className="pt-8 border-t border-slate-200">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">References (APA Style)</h4>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-3">
              <p className="text-xs text-slate-500 italic leading-relaxed">
                1. Intensive Care Society. (2009). Levels of Critical Care for Adult Patients. London: Intensive Care Society.
              </p>
              <p className="text-xs text-slate-500 italic leading-relaxed">
                2. Müller, M., Jürgens, J., Redaèlli, M., Klingberg, K., Stock, S., & Müller, W. (2018). Impact of the communication tool SBAR on patient safety: a scoping review. BMJ Open, 8(8), e022249. https://doi.org/10.1136/bmjopen-2018-022249
              </p>
              <p className="text-xs text-slate-500 italic leading-relaxed">
                3. Marshall, S., Harrison, J., & Flanagan, B. (2009). The teaching of a structured tool improves the clarity and content of interprofessional clinical communication. Quality and Safety in Health Care, 18(2), 137-140. https://doi.org/10.1136/qshc.2007.025247
              </p>
              <p className="text-xs text-slate-500 italic leading-relaxed">
                4. Starmer, A. J., Spector, N. D., Srivastava, R., West, D. C., Rosenbluth, G., Allen, A. D., ... & Landrigan, C. P. (2014). Changes in medical errors after implementation of a handoff program. New England Journal of Medicine, 371(19), 1803-1812. https://doi.org/10.1056/NEJMsa1405556
              </p>
              <p className="text-xs text-slate-500 italic leading-relaxed">
                5. Khan, A., Spector, N. D., Baird, J. D., Ashland, M., Starmer, A. J., Rosenbluth, G., ... & Landrigan, C. P. (2018). Patient safety after implementation of a multicenter family-centered rounds intervention. JAMA Pediatrics, 172(1), 31-39. https://doi.org/10.1001/jamapediatrics.2017.3804
              </p>
              <p className="text-xs text-slate-500 italic leading-relaxed">
                6. Australian Commission on Safety and Quality in Health Care (ACSQHC). (2021). National Safety and Quality Health Service Standards: Clinical Handover.
              </p>
            </div>
          </div>

          <footer className="pt-6 border-t border-slate-200 text-center">
            <p className="text-xs font-bold text-blue-600 mt-1">Developed by: K.Younes BSN, MSN</p>
          </footer>
        </div>
      </motion.div>
    </div>
  );
}

function StandardBullet({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs font-bold text-slate-400">
      <CheckCircle2 size={14} className="text-slate-500" />
      {label}
    </li>
  );
}

function AddPatientModal({ onClose, onSuccess, initialBed }: { onClose: () => void, onSuccess: () => void, initialBed?: string }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<{
    hisId: string;
    name: string;
    dob: string;
    bedNumber: string;
    currentAcuity: 'ICU' | 'HDU';
    medicalHistory: string;
  }>({
    hisId: '',
    name: '',
    dob: '',
    bedNumber: initialBed || '',
    currentAcuity: initialBed?.startsWith('ICU') ? 'ICU' : 'HDU',
    medicalHistory: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await storage.savePatient(formData);
      await logAction('PATIENT_ADDED', formData.hisId, `Manually added ${formData.name}`);
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Add patient error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="metallic-panel w-full max-w-xl overflow-hidden !rounded-[40px]"
      >
        <div className="px-10 py-8 border-b border-slate-200 flex items-center justify-between bg-white/50">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Add New Patient</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <LogOut size={24} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-6 bg-white/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">HIS ID</label>
              <input 
                required
                className="w-full p-5 bg-white/50 border border-slate-200 rounded-[24px] text-sm text-slate-900 outline-none transition-all shadow-inner focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5"
                value={formData.hisId}
                onChange={e => setFormData({...formData, hisId: e.target.value})}
                placeholder="e.g. HN-1234"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
              <input 
                required
                className="w-full p-5 bg-white/50 border border-slate-200 rounded-[24px] text-sm text-slate-900 outline-none transition-all shadow-inner focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="e.g. John Doe"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date of Birth</label>
              <input 
                required
                type="date"
                className="w-full p-5 bg-white/50 border border-slate-200 rounded-[24px] text-sm text-slate-900 outline-none transition-all shadow-inner focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5"
                value={formData.dob}
                onChange={e => setFormData({...formData, dob: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Bed Number</label>
              <input 
                required
                className="w-full p-5 bg-white/50 border border-slate-200 rounded-[24px] text-sm text-slate-900 outline-none transition-all shadow-inner focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5"
                value={formData.bedNumber}
                onChange={e => setFormData({...formData, bedNumber: e.target.value})}
                placeholder="e.g. ICU-05"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Medical History / Admission Diagnosis</label>
            <textarea 
              className="w-full p-5 bg-white/50 border border-slate-200 rounded-[24px] text-sm text-slate-900 outline-none transition-all min-h-[140px] shadow-inner focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5"
              value={formData.medicalHistory}
              onChange={e => setFormData({...formData, medicalHistory: e.target.value})}
              placeholder="e.g. Post-op CABG, History of COPD, Type 2 Diabetes..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Initial Acuity</label>
            <div className="flex gap-4">
              {(['HDU', 'ICU'] as const).map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setFormData({...formData, currentAcuity: level})}
                  className={`flex-1 py-4 rounded-[24px] font-black text-sm border transition-all ${
                    formData.currentAcuity === level 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-900/10' 
                      : 'bg-white/50 border-slate-200 text-slate-400 hover:border-blue-600 hover:text-blue-600'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-6 flex gap-4">
            <button 
              type="button"
              onClick={onClose}
              className="clinical-btn-secondary flex-1"
            >
              Cancel
            </button>
            <button 
              disabled={loading}
              className="clinical-btn-primary flex-1"
            >
              {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
              Add to Census
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function AssessmentModal({ patient, staff, onClose, onSuccess }: { patient: Patient, staff: Staff, onClose: () => void, onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [vitals, setVitals] = useState({
    hr: 85, map: 75, spo2: 96, rr: 20, temp: 37.2, gcs: 15, urineOutput: 50
  });
  const [interventions, setInterventions] = useState({
    mechanicalVentilation: false, highFlowO2: false, cpapBipap: false,
    singleVasopressor: false, multipleVasopressors: false, iabpEcmo: false,
    crrt: false, stepDownFromLevel3: false
  });
  const [positioning, setPositioning] = useState<{
    mobility: 'Mobile' | 'Relative Bedridden' | 'Bedridden';
    isProne: boolean;
  }>({
    mobility: 'Mobile',
    isProne: false
  });
  const [clinicalContext, setClinicalContext] = useState({
    labTrends: '',
    medicationChanges: ''
  });

  // Mock FHIR Auto-population
  const handleAutoPopulate = () => {
    setVitals({
      hr: Math.floor(70 + Math.random() * 40),
      map: Math.floor(60 + Math.random() * 30),
      spo2: Math.floor(90 + Math.random() * 10),
      rr: Math.floor(12 + Math.random() * 15),
      temp: 36.5 + Math.random() * 2,
      gcs: 15,
      urineOutput: 40
    });
    logAction('FHIR_DATA_FETCHED', patient.hisId);
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const classification = runClassificationLogic(vitals, interventions, positioning);
      const justification = await getAIJustification(vitals, interventions, classification, positioning, clinicalContext);

      // Fetch history for risk prediction from local storage
      const history = storage.getAssessments()
        .filter((a: any) => a.patientId === patient.id)
        .slice(0, 3);

      const riskResult = await predictRiskScore(vitals, interventions, history, patient.medicalHistory);

      const assessmentData = {
        patientId: patient.id,
        assessorId: staff.uid,
        shiftTime: new Date().getHours() >= 19 || new Date().getHours() < 7 ? '19:00' : '07:00',
        vitals,
        interventions,
        positioning,
        clinicalContext,
        classification,
        aiJustification: justification,
        riskScore: riskResult.score,
        riskLevel: riskResult.level,
        riskFactors: riskResult.factors
      };

      const savedAssessments = await storage.saveAssessment(assessmentData);
      const newAssessmentId = savedAssessments[0].id;

      await storage.savePatient({
        ...patient,
        currentAcuity: classification,
        lastAssessmentId: newAssessmentId,
        riskScore: riskResult.score,
        riskLevel: riskResult.level,
        riskFactors: riskResult.factors
      });

      await logAction('ASSESSMENT_SUBMITTED', patient.id, `Classified as ${classification} with ${riskResult.level} risk`);
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Assessment submission error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="metallic-panel w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col !rounded-[40px]"
      >
        <div className="px-10 py-8 border-b border-slate-200 flex items-center justify-between bg-white/50">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Shift Assessment</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">{patient.name} • Bed {patient.bedNumber}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <LogOut size={24} className="text-slate-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 bg-white/30">
          {step === 1 ? (
            <div className="space-y-10">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <HeartPulse className="text-red-600" /> Vital Signs
                </h3>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setVitals({ hr: 80, map: 85, spo2: 98, rr: 16, temp: 36.8, gcs: 15, urineOutput: 60 })}
                    className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100 hover:bg-emerald-100 transition-all shadow-sm"
                  >
                    Preset: Stable
                  </button>
                  <button 
                    onClick={handleAutoPopulate}
                    className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <ShieldCheck size={12} /> Sync FHIR
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <VitalInput label="HR (bpm)" value={vitals.hr} onChange={v => setVitals({...vitals, hr: v})} icon={<HeartPulse size={14}/>} step={5} />
                <VitalInput label="MAP (mmHg)" value={vitals.map} onChange={v => setVitals({...vitals, map: v})} icon={<Activity size={14}/>} step={5} />
                <VitalInput label="SpO2 (%)" value={vitals.spo2} onChange={v => setVitals({...vitals, spo2: v})} icon={<Wind size={14}/>} step={1} />
                <VitalInput label="RR (bpm)" value={vitals.rr} onChange={v => setVitals({...vitals, rr: v})} icon={<Wind size={14}/>} step={2} />
                <VitalInput label="Temp (°C)" value={vitals.temp} onChange={v => setVitals({...vitals, temp: v})} icon={<Thermometer size={14}/>} step={0.1} />
                <VitalInput label="GCS" value={vitals.gcs} onChange={v => setVitals({...vitals, gcs: v})} icon={<Brain size={14}/>} step={1} />
                <VitalInput label="Urine (ml/h)" value={vitals.urineOutput} onChange={v => setVitals({...vitals, urineOutput: v})} icon={<Droplets size={14}/>} step={10} />
              </div>
            </div>
          ) : step === 2 ? (
            <div className="space-y-10">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Stethoscope className="text-blue-600" /> Interventions & Support
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Respiratory</p>
                  <Toggle label="Mechanical Ventilation" active={interventions.mechanicalVentilation} onToggle={() => setInterventions({...interventions, mechanicalVentilation: !interventions.mechanicalVentilation})} />
                  <Toggle label="CPAP / BiPAP" active={interventions.cpapBipap} onToggle={() => setInterventions({...interventions, cpapBipap: !interventions.cpapBipap})} />
                  <Toggle label="High-Flow Oxygen" active={interventions.highFlowO2} onToggle={() => setInterventions({...interventions, highFlowO2: !interventions.highFlowO2})} />
                </div>
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Circulatory & Renal</p>
                  <Toggle label="Multiple Vasopressors" active={interventions.multipleVasopressors} onToggle={() => setInterventions({...interventions, multipleVasopressors: !interventions.multipleVasopressors})} />
                  <Toggle label="Single Vasopressor" active={interventions.singleVasopressor} onToggle={() => setInterventions({...interventions, singleVasopressor: !interventions.singleVasopressor})} />
                  <Toggle label="CRRT / Dialysis" active={interventions.crrt} onToggle={() => setInterventions({...interventions, crrt: !interventions.crrt})} />
                  <Toggle label="IABP / ECMO" active={interventions.iabpEcmo} onToggle={() => setInterventions({...interventions, iabpEcmo: !interventions.iabpEcmo})} />
                </div>
              </div>

              <div className="pt-10 border-t border-slate-200">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 mb-6">
                  <Users className="text-emerald-600" /> Patient Positioning & Mobility
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mobility Status</p>
                    <div className="flex flex-col gap-3">
                      {(['Mobile', 'Relative Bedridden', 'Bedridden'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setPositioning({ ...positioning, mobility: mode })}
                          className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                            positioning.mobility === mode
                              ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-sm'
                              : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                          }`}
                        >
                          <span className="text-sm font-bold">{mode}</span>
                          {positioning.mobility === mode && <CheckCircle2 size={18} className="text-blue-600" />}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Special Positioning</p>
                    <Toggle 
                      label="Prone Position" 
                      active={positioning.isProne} 
                      onToggle={() => setPositioning({ ...positioning, isProne: !positioning.isProne })} 
                    />
                    <p className="text-[10px] text-slate-500 font-medium leading-relaxed italic">
                      * Prone positioning is a critical intervention for severe respiratory failure and typically indicates Level 3 (ICU) care.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <FileText className="text-blue-600" /> Clinical Context & Trends
              </h3>
              
              <div className="grid grid-cols-1 gap-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Recent Lab Trends</label>
                  <textarea 
                    className="w-full p-5 bg-white/50 border border-slate-200 rounded-[24px] text-sm text-slate-900 outline-none transition-all min-h-[140px] shadow-inner focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5"
                    value={clinicalContext.labTrends}
                    onChange={e => setClinicalContext({...clinicalContext, labTrends: e.target.value})}
                    placeholder="e.g. Rising Lactate (2.1 -> 4.5), Dropping Hb, Improving Creatinine..."
                  />
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Significant Medication Changes</label>
                  <textarea 
                    className="w-full p-5 bg-white/50 border border-slate-200 rounded-[24px] text-sm text-slate-900 outline-none transition-all min-h-[140px] shadow-inner focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5"
                    value={clinicalContext.medicationChanges}
                    onChange={e => setClinicalContext({...clinicalContext, medicationChanges: e.target.value})}
                    placeholder="e.g. Started Noradrenaline, Increased Sedation, New Antibiotics (Meropenem)..."
                  />
                </div>
              </div>

              <div className="p-6 bg-white/40 border border-white/50 rounded-[32px] metallic-card">
                <div className="flex gap-4">
                  <div className="p-3 bg-blue-600/10 rounded-2xl h-fit border border-blue-500/20">
                    <ShieldCheck className="text-blue-600" size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 tracking-tight">AI-Enhanced Prediction</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed italic">
                      These parameters will be used by Gemini to refine the risk prediction model, considering both current trends and the patient's underlying history: <span className="text-blue-600 font-black">"{patient.medicalHistory || 'No history provided'}"</span>.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-10 py-8 bg-slate-100/80 border-t border-slate-200 flex items-center justify-between">
          <div className="flex gap-2">
            <div className={`w-2 h-2 rounded-full ${step === 1 ? 'bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)]' : 'bg-slate-300'}`}></div>
            <div className={`w-2 h-2 rounded-full ${step === 2 ? 'bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)]' : 'bg-slate-300'}`}></div>
            <div className={`w-2 h-2 rounded-full ${step === 3 ? 'bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)]' : 'bg-slate-300'}`}></div>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => step === 1 ? onClose() : setStep(step - 1)}
              className="clinical-btn-secondary"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>
            <button 
              onClick={() => step < 3 ? setStep(step + 1) : handleSubmit()}
              disabled={loading}
              className="clinical-btn-primary min-w-[140px]"
            >
              {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
              {step < 3 ? 'Next' : 'Complete Assessment'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function VitalInput({ label, value, onChange, icon, step = 1 }: { label: string, value: number, onChange: (v: number) => void, icon?: React.ReactNode, step?: number }) {
  return (
    <div className="space-y-2 group">
      <label className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest group-hover:text-blue-600 transition-colors ml-1">
        {icon} {label}
      </label>
      <div className="relative flex items-center">
        <button 
          type="button"
          onClick={() => onChange(Math.max(0, value - step))}
          className="absolute left-2 w-8 h-8 flex items-center justify-center bg-white/50 text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all z-10 shadow-sm border border-slate-200"
        >
          -
        </button>
        <input 
          type="number" 
          className="w-full p-4 px-12 bg-white/50 border border-slate-200 rounded-2xl font-black text-slate-900 text-center focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5 transition-all outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-inner"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        <button 
          type="button"
          onClick={() => onChange(value + step)}
          className="absolute right-2 w-8 h-8 flex items-center justify-center bg-white/50 text-slate-400 rounded-lg hover:bg-blue-600 hover:text-white transition-all z-10 shadow-sm border border-slate-200"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, active, onToggle }: { label: string, active: boolean, onToggle: () => void }) {
  return (
    <button 
      onClick={onToggle}
      className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
        active 
          ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-sm' 
          : 'bg-white/50 border-slate-200 text-slate-400 hover:border-slate-300'
      }`}
    >
      <span className="text-sm font-black">{label}</span>
      <div className={`w-10 h-6 rounded-full relative transition-colors ${active ? 'bg-blue-600' : 'bg-slate-200'}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${active ? 'left-5' : 'left-1'}`}></div>
      </div>
    </button>
  );
}

function AuditTrail({ logs }: { logs: AuditLog[] }) {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter">Audit Trail</h2>
          <p className="micro-label !text-slate-500 mt-1">Immutable clinical event logging</p>
        </div>
        <div className="flex items-center gap-3 text-emerald-600 bg-emerald-50 px-5 py-2 rounded-2xl micro-label !text-current border border-emerald-100 shadow-sm">
          <ShieldCheck size={16} /> HIPAA Compliant
        </div>
      </div>
      <div className="metallic-panel rounded-[40px] overflow-hidden bg-white/30">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/50 border-b border-slate-200">
              <th className="px-10 py-6 micro-label text-slate-500">Timestamp</th>
              <th className="px-10 py-6 micro-label text-slate-500">User Identity</th>
              <th className="px-10 py-6 micro-label text-slate-500">Action</th>
              <th className="px-10 py-6 micro-label text-slate-500">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-white/40 transition-colors group">
                <td className="px-10 py-6">
                  <span className="text-xs font-bold text-slate-400">
                    {log.timestamp?.toDate ? new Date(log.timestamp.toDate()).toLocaleString() : new Date(log.timestamp).toLocaleString()}
                  </span>
                </td>
                <td className="px-10 py-6">
                  <p className="text-sm font-black text-slate-900">{log.userEmail}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{log.userId.slice(0, 8)}...</p>
                </td>
                <td className="px-10 py-6">
                  <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black border border-blue-100 uppercase tracking-wider">
                    {log.action}
                  </span>
                </td>
                <td className="px-10 py-6 text-sm text-slate-600 font-serif italic">"{log.details || '-'}"</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProfileModal({ profile, onSave, onClose }: { profile: Staff, onSave: (p: Staff) => void, onClose: () => void }) {
  const [formData, setFormData] = useState<Staff>(profile);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="metallic-panel !rounded-[40px] p-10 max-w-md w-full"
      >
        <div className="flex items-center gap-4 mb-8">
          <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-900/10">
            <Settings className="text-white" size={24} />
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Local Profile</h3>
            <p className="micro-label !text-blue-600/70">Manage Local Identity</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Display Name</label>
            <input 
              className="w-full p-5 bg-white/50 border border-slate-200 rounded-[24px] text-sm text-slate-900 outline-none transition-all shadow-inner focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Clinical Role</label>
            <div className="relative">
              <select 
                className="w-full p-5 bg-white/50 border border-slate-200 rounded-[24px] text-sm text-slate-900 outline-none transition-all shadow-inner focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5 appearance-none"
                value={formData.role}
                onChange={e => setFormData({...formData, role: e.target.value as any})}
              >
                <option value="Administrator / Auditor">Administrator / Auditor</option>
                <option value="Clinician">Clinician</option>
                <option value="Team-leader">Team-leader</option>
                <option value="Nurse">Nurse</option>
                <option value="Charge Nurse">Charge Nurse</option>
                <option value="Physician">Physician</option>
              </select>
              <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown size={18} />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Data Management</p>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => {
                  const dataString = storage.exportFullDatabase();
                  const blob = new Blob([dataString], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `acuitysync_backup_${new Date().toISOString().split('T')[0]}.json`;
                  a.click();
                  logAction('SYSTEM_EXPORT', 'ALL', 'Full clinical database exported to local file');
                }}
                className="p-4 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-500 hover:border-blue-600 transition-all flex flex-col items-center gap-2 shadow-sm group"
              >
                <Download size={16} className="text-blue-600 group-hover:scale-110 transition-transform" />
                Export Census
              </button>
              <label className="p-4 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-500 hover:border-blue-600 transition-all flex flex-col items-center gap-2 cursor-pointer shadow-sm group">
                <ArrowRightLeft size={16} className="text-blue-600 group-hover:scale-110 transition-transform" />
                Import Backup
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const success = storage.importFullDatabase(event.target?.result as string);
                      if (success) {
                        logAction('SYSTEM_IMPORT', 'ALL', 'Full clinical database imported from local file');
                        window.location.reload();
                      } else {
                        alert('Critical Error: Invalid or corrupted backup file.');
                      }
                    };
                    reader.readAsText(file);
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-4 mt-10">
          <button 
            onClick={onClose}
            className="clinical-btn-secondary flex-1"
          >
            Cancel
          </button>
          <button 
            onClick={() => onSave(formData)}
            className="clinical-btn-primary flex-1"
          >
            Save Changes
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// --- ICU/HDU-Handover tool PRO ---

function HandoverTool({ patients, assessments, handovers, staff, onRefresh, onGenerateSBAR, onGenerateSummary }: { 
  patients: Patient[], 
  assessments: ShiftAssessment[],
  handovers: any[],
  staff: Staff,
  onRefresh: () => void,
  onGenerateSBAR: (patient: Patient) => void,
  onGenerateSummary: () => void
}) {
  const [view, setView] = useState<'bedside' | 'charge' | 'leadership'>('bedside');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activeHandover, setActiveHandover] = useState<any | null>(null);

  const handleStartHandover = (patient: Patient) => {
    setSelectedPatient(patient);
    // Check if there's a draft
    const draft = handovers.find(h => h.patientId === patient.id && h.status === 'draft');
    setActiveHandover(draft || {
      patientId: patient.id,
      status: 'draft',
      identification: {
        name: patient.name,
        mrn: patient.hisId,
        ageSex: `${new Date().getFullYear() - new Date(patient.dob).getFullYear()}Y / ${Math.random() > 0.5 ? 'M' : 'F'}`,
        oncologyDiagnosis: '',
        medicalDiagnosis: 'Pending clinical update...',
        admissionSource: 'IPU1',
        bedNumber: patient.bedNumber,
        sendingStaff: staff.name,
        receivingStaff: ''
      },
      illnessSeverity: patient.riskLevel === 'Critical' ? 'Unstable' : patient.riskLevel === 'High' ? 'Watcher' : 'Stable',
      summary: '',
      airway: { status: 'Intact', device: 'None', settings: '' },
      circulation: { rhythm: 'SR', map: '', pressors: [] },
      neurology: { gcs: '15', sedation: '0', pain: '0' },
      renal: { uo: '', fluidStatus: 'Euvolmic', dialysis: 'No' },
      lines: [],
      deviceList: [],
      medicationList: [],
      labs: '',
      meds: '',
      nursingConcerns: '',
      actionList: [],
      contingency: '',
      planNext12: '',
      synthesis: '',
      codeStatus: 'Full Code'
    });
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-900 flex items-center gap-3 tracking-tighter">
            <Handshake size={40} className="text-blue-600" />
            ICU/HDU-Handover tool <span className="text-blue-600">PRO</span>
          </h2>
          <p className="micro-label !text-blue-600/70 mt-2">Hybrid ISBAR + I-PASS Handover System</p>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={onGenerateSummary}
            className="clinical-btn-secondary"
            title="Generate AI Summary for all patients"
          >
            <Brain size={18} className="text-blue-600" />
            <span className="micro-label !text-current">Unit AI Summary</span>
          </button>

          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner">
            <button 
              onClick={() => setView('bedside')}
              className={`px-6 py-2.5 rounded-xl micro-label !text-current transition-all ${view === 'bedside' ? 'bg-blue-600 !text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Bedside
            </button>
            <button 
              onClick={() => setView('charge')}
              className={`px-6 py-2.5 rounded-xl micro-label !text-current transition-all ${view === 'charge' ? 'bg-blue-600 !text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Charge Nurse
            </button>
            <button 
              onClick={() => setView('leadership')}
              className={`px-6 py-2.5 rounded-xl micro-label !text-current transition-all ${view === 'leadership' ? 'bg-blue-600 !text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Leadership
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {view === 'bedside' && (
          <motion.div 
            key="bedside"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            <div className="lg:col-span-2 space-y-6">
              <div className="flex flex-col gap-4">
                {patients.map(patient => (
                  <HandoverPatientCard 
                    key={patient.id} 
                    patient={patient} 
                    handovers={handovers.filter(h => h.patientId === patient.id)}
                    onStart={() => handleStartHandover(patient)}
                    onAISummarize={() => onGenerateSBAR(patient)}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-6">
              <HandoverStats handovers={handovers} patients={patients} />
              <HandoverRecentActivity handovers={handovers} patients={patients} />
            </div>
          </motion.div>
        )}

        {view === 'charge' && (
          <motion.div 
            key="charge"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <ChargeNurseDashboard patients={patients} handovers={handovers} />
          </motion.div>
        )}

        {view === 'leadership' && (
          <motion.div 
            key="leadership"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <LeadershipDashboard patients={patients} handovers={handovers} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isFormOpen && selectedPatient && (
          <HandoverForm 
            patient={selectedPatient}
            handover={activeHandover}
            staff={staff}
            onClose={() => setIsFormOpen(false)}
            onSave={async (data) => {
              await storage.saveHandover(data);
              await logAction('HANDOVER_SAVED', selectedPatient.id, `Handover ${data.status} saved by ${staff.name}`);
              onRefresh();
              setIsFormOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function HandoverPatientCard({ patient, handovers, onStart, onAISummarize }: { patient: Patient, handovers: any[], onStart: () => void, onAISummarize: () => void }) {
  const lastHandover = handovers.find(h => h.status === 'finalized');
  const draft = handovers.find(h => h.status === 'draft');

  return (
    <div className="metallic-panel p-4 rounded-[32px] group hover:border-blue-500/50 transition-all bg-white/40 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
      <div className="flex items-center gap-4 shrink-0">
        <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg border border-white/10 shrink-0">
          <span className="text-[10px] font-black uppercase tracking-tighter">Bed {patient.bedNumber.split('-')[1] || patient.bedNumber}</span>
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-black text-slate-900 tracking-tight truncate">{patient.name}</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400">{patient.hisId}</span>
            <AcuityBadge level={patient.currentAcuity} />
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 items-center">
        <div className="hidden md:block px-4 border-l border-slate-200">
          <p className="micro-label !text-slate-500 mb-0.5">Last Handover</p>
          <p className="text-xs font-bold text-slate-700">
            {lastHandover ? new Date(lastHandover.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'None'}
          </p>
        </div>
        
        <div className="px-4 border-l border-slate-200">
          <p className="micro-label !text-slate-500 mb-0.5">Status</p>
          {draft ? (
            <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider">Draft</span>
          ) : lastHandover ? (
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">Complete</span>
          ) : (
            <span className="text-[10px] font-black text-red-600 uppercase tracking-wider">Pending</span>
          )}
        </div>

        {patient.medicalHistory && (
          <div className="hidden lg:block px-4 border-l border-slate-200 min-w-0">
            <p className="micro-label !text-blue-600 mb-0.5">History</p>
            <p className="text-[10px] text-slate-500 truncate font-medium">{patient.medicalHistory}</p>
          </div>
        )}
      </div>

      <div className="flex gap-2 shrink-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-slate-100">
        <button 
          onClick={onAISummarize}
          className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all flex items-center justify-center border border-blue-200 shadow-sm shrink-0"
          title="AI Summarize"
        >
          <Brain size={16} />
        </button>
        <button 
          onClick={onStart}
          className="flex-1 sm:flex-none px-6 h-10 bg-white text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all flex items-center justify-center gap-2 shadow-sm group"
        >
          <Handshake size={14} className="group-hover:scale-110 transition-transform" />
          <span className="whitespace-nowrap">{draft ? 'Continue' : 'Start'}</span>
        </button>
      </div>
    </div>
  );
}

function getMissingFields(data: any) {
  const missing = [];
  if (!data.identification.receivingStaff) missing.push('Receiving Staff');
  if (!data.summary) missing.push('Patient Summary');
  if (!data.situation) missing.push('Situation');
  if (!data.background) missing.push('Background');
  if (!data.recommendation) missing.push('Recommendation');
  if (!data.airway.settings) missing.push('Airway Settings');
  if (!data.circulation.map) missing.push('Circulation Goals');
  if (!data.contingency) missing.push('Contingency Plan');
  if (!data.synthesis) missing.push('Synthesis');
  return missing;
}

function HandoverForm({ patient, handover, staff, onClose, onSave }: { 
  patient: Patient, 
  handover: any, 
  staff: Staff, 
  onClose: () => void, 
  onSave: (data: any) => void 
}) {
  const [formData, setFormData] = useState({
    ...handover,
    situation: handover.situation || '',
    background: handover.background || '',
    recommendation: handover.recommendation || '',
  });
  const [openSections, setOpenSections] = useState<string[]>(['identification']);

  const toggleSection = (id: string) => {
    if (openSections.includes(id)) {
      setOpenSections(openSections.filter(s => s !== id));
    } else {
      setOpenSections([...openSections, id]);
    }
  };

  const sections = [
    { id: 'identification', label: 'Identification', icon: <Users size={14} /> },
    { id: 'situation', label: 'Situation', icon: <Info size={14} /> },
    { id: 'background', label: 'Background', icon: <History size={14} /> },
    { id: 'assessment', label: 'Assessment', icon: <Stethoscope size={14} /> },
    { id: 'recommendation', label: 'Recommendation', icon: <ArrowUpRight size={14} /> },
    { id: 'severity', label: 'Illness Severity', icon: <AlertCircle size={14} /> },
    { id: 'summary', label: 'Patient Summary', icon: <ClipboardList size={14} /> },
    { id: 'actions', label: 'Action List', icon: <CheckCircle2 size={14} /> },
    { id: 'contingency', label: 'Situation Awareness', icon: <ShieldCheck size={14} /> },
    { id: 'synthesis', label: 'Synthesis', icon: <Handshake size={14} /> }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="metallic-panel !rounded-[48px] w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col"
      >
        <div className="px-10 py-8 border-b border-slate-200 flex items-center justify-between bg-white/50">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-blue-600 border border-slate-200 shadow-sm">
              <Handshake size={28} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-black text-slate-900 tracking-tighter">ICU Handover PRO</h2>
                <span className="px-3 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded shadow-lg shadow-blue-900/10 uppercase tracking-widest">v2.0</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="micro-label !text-slate-500">{patient.name}</span>
                <span className="w-1 h-1 rounded-full bg-slate-200"></span>
                <span className="text-[10px] font-bold text-slate-400">Bed {patient.bedNumber}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={onClose} className="w-12 h-12 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl transition-all flex items-center justify-center group">
              <LogOut size={20} className="text-slate-400 group-hover:text-red-600 transition-colors" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar bg-white/30">
          <div className="metallic-panel p-6 rounded-[32px] flex items-center justify-between bg-white/50 border border-slate-200">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center border border-amber-100">
                <AlertCircle size={20} />
              </div>
              <div>
                <p className="micro-label !text-slate-500">Safety Check Protocol</p>
                <p className="text-sm font-black text-slate-900">{getMissingFields(formData).length} Critical Items Missing</p>
              </div>
            </div>
            {getMissingFields(formData).length > 0 && (
              <div className="flex gap-2">
                {getMissingFields(formData).slice(0, 3).map(f => (
                  <span key={f} className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-[10px] font-black border border-red-100 uppercase tracking-wider">{f}</span>
                ))}
              </div>
            )}
          </div>

          <CollapsibleSection 
            title="Identification" 
            icon={<Users size={18} />} 
            isOpen={openSections.includes('identification')}
            onToggle={() => toggleSection('identification')}
          >
            <div className="grid grid-cols-2 gap-6">
              <HandoverField label="Patient Name" value={formData.identification.name} readOnly />
              <HandoverField label="MRN / HIS ID" value={formData.identification.mrn} readOnly />
              <div className="space-y-4">
                <HandoverField label="Age / Sex" value={formData.identification.ageSex} onChange={v => setFormData({...formData, identification: {...formData.identification, ageSex: v}})} />
                <QuickPresets 
                  label="Age/Sex" 
                  options={['Adult Male', 'Adult Female', 'Geriatric Male', 'Geriatric Female', 'Pediatric']}
                  onSelect={v => setFormData({...formData, identification: {...formData.identification, ageSex: v}})}
                />
              </div>
              <HandoverField label="Bed Number" value={formData.identification.bedNumber} readOnly />
              
              <div className="col-span-2 space-y-4">
                <HandoverField label="1st Oncology Diagnosis" value={formData.identification.oncologyDiagnosis} onChange={v => setFormData({...formData, identification: {...formData.identification, oncologyDiagnosis: v}})} textarea />
                <QuickPresets 
                  label="Oncology" 
                  options={['Leukemia', 'Lymphoma', 'Multiple Myeloma', 'Breast Cancer', 'Lung Cancer', 'Colorectal Cancer', 'Pancreatic Cancer', 'Glioblastoma']}
                  onSelect={v => setFormData({...formData, identification: {...formData.identification, oncologyDiagnosis: v}})}
                />
              </div>

              <div className="col-span-2 space-y-4">
                <HandoverField label="Intensive / Medical Primary Diagnosis" value={formData.identification.medicalDiagnosis} onChange={v => setFormData({...formData, identification: {...formData.identification, medicalDiagnosis: v}})} textarea />
                <QuickPresets 
                  label="Medical" 
                  options={['Sepsis', 'Septic Shock', 'ARDS', 'Post-Op CABG', 'DKA', 'Multi-Organ Failure', 'Trauma / TBI', 'Pneumonia']}
                  onSelect={v => setFormData({...formData, identification: {...formData.identification, medicalDiagnosis: v}})}
                />
              </div>

              <div className="col-span-2">
                <HandoverSelectField 
                  label="Admission Source" 
                  value={formData.identification.admissionSource || 'IPU1'} 
                  options={['IPU1', 'IPU2', 'IPU3', 'DCU', 'OPD', 'UCC', 'Outside Referral']}
                  onChange={v => setFormData({...formData, identification: {...formData.identification, admissionSource: v}})} 
                />
              </div>

              <HandoverField label="Sending Staff" value={formData.identification.sendingStaff} readOnly />
              <HandoverField label="Receiving Staff" value={formData.identification.receivingStaff} onChange={v => setFormData({...formData, identification: {...formData.identification, receivingStaff: v}})} placeholder="Enter name..." />
            </div>
          </CollapsibleSection>

          <CollapsibleSection 
            title="Situation" 
            icon={<Info size={18} />} 
            isOpen={openSections.includes('situation')}
            onToggle={() => toggleSection('situation')}
          >
            <div className="grid grid-cols-1 gap-6">
              <HandoverSelectField 
                label="Current Status" 
                value={formData.situationStatus || 'Stable'} 
                options={['Stable', 'Improving', 'Deteriorating', 'Critical', 'Post-Op Recovery']}
                onChange={v => setFormData({...formData, situationStatus: v})} 
              />
              <div className="space-y-4">
                <HandoverField 
                  label="Major Events / Changes in Last 12h" 
                  value={formData.situation} 
                  onChange={v => setFormData({...formData, situation: v})} 
                  textarea 
                  placeholder="New arrhythmias, bleeding episodes, changes in vent settings..." 
                />
                <QuickPresets 
                  label="Events" 
                  options={['New AFib', 'Hypotensive Episode', 'Desaturation', 'Successful Weaning', 'Line Inserted', 'Transfused', 'Physician Review']}
                  onSelect={v => setFormData({...formData, situation: formData.situation ? `${formData.situation}\n- ${v}` : `- ${v}`})}
                />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection 
            title="Background" 
            icon={<History size={18} />} 
            isOpen={openSections.includes('background')}
            onToggle={() => toggleSection('background')}
          >
            <div className="grid grid-cols-1 gap-6">
              <HandoverSelectField 
                label="Code Status" 
                value={formData.codeStatus || 'Full Code'} 
                options={['Full Code', 'DNR']}
                onChange={v => setFormData({...formData, codeStatus: v})} 
              />
              <div className="space-y-4">
                <HandoverField 
                  label="Past Medical History & Allergies" 
                  value={formData.background} 
                  onChange={v => setFormData({...formData, background: v})} 
                  textarea 
                  placeholder="Relevant comorbidities, known allergies, prior surgeries..." 
                />
                <QuickPresets 
                  label="PMH" 
                  options={['HTN', 'DM Type 2', 'CKD', 'CAD', 'COPD', 'Asthma', 'Atrial Fibrillation', 'No Known Allergies']}
                  onSelect={v => setFormData({...formData, background: formData.background ? `${formData.background}, ${v}` : v})}
                />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection 
            title="Assessment" 
            icon={<Stethoscope size={18} />} 
            isOpen={openSections.includes('assessment')}
            onToggle={() => toggleSection('assessment')}
          >
            <div className="space-y-10">
              <div className="space-y-6">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest border-b border-blue-900/30 pb-2">Airway & Breathing</p>
                <div className="grid grid-cols-1 gap-6">
                  <HandoverSelectField 
                    label="Airway Status" 
                    value={formData.airway.status} 
                    options={['Intact', 'Intubated', 'Tracheostomy', 'LMA', 'Difficult Airway', 'Oral Airway', 'Nasal Airway']}
                    onChange={v => setFormData({...formData, airway: {...formData.airway, status: v}})} 
                  />
                  <HandoverSelectField 
                    label="Device / Mode" 
                    value={formData.airway.device} 
                    options={['None', 'AC', 'SIMV', 'PRVC', 'CPAP', 'BiPAP', 'T-Piece', 'Nasal Cannula', 'High Flow', 'Venturi Mask', 'Non-Rebreather']}
                    onChange={v => setFormData({...formData, airway: {...formData.airway, device: v}})} 
                  />
                  <HandoverField label="Settings / Trends (FiO2, PEEP, RR)" value={formData.airway.settings} onChange={v => setFormData({...formData, airway: {...formData.airway, settings: v}})} textarea placeholder="e.g. FiO2 40%, PEEP 8, PS 10..." />
                </div>
              </div>

              <div className="space-y-6">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest border-b border-blue-900/30 pb-2">Circulation</p>
                <div className="grid grid-cols-1 gap-6">
                  <HandoverSelectField 
                    label="Rhythm" 
                    value={formData.circulation.rhythm} 
                    options={['SR', 'AFib', 'A-Flutter', 'SVT', 'VTach', 'Paced', 'SB', 'Junctional', 'PVCs']}
                    onChange={v => setFormData({...formData, circulation: {...formData.circulation, rhythm: v}})} 
                  />
                  <HandoverField label="MAP / BP Goals" value={formData.circulation.map} onChange={v => setFormData({...formData, circulation: {...formData.circulation, map: v}})} placeholder="e.g. MAP > 65" />
                  <HandoverMultiSelectField 
                    label="Vasopressors / Inotropes" 
                    values={Array.isArray(formData.circulation.pressors) ? formData.circulation.pressors : []}
                    options={['None', 'Noradrenaline', 'Adrenaline', 'Dopamine', 'Dobutamine', 'Vasopressin', 'Milrinone', 'Phenylephrine']}
                    onChange={v => setFormData({...formData, circulation: {...formData.circulation, pressors: v}})} 
                  />
                </div>
              </div>

              <div className="space-y-6">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest border-b border-blue-900/30 pb-2">Neurology & Renal</p>
                <div className="grid grid-cols-1 gap-6">
                  <div className="grid grid-cols-3 gap-6">
                    <HandoverSelectField 
                      label="GCS" 
                      value={formData.neurology.gcs} 
                      options={['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15']}
                      onChange={v => setFormData({...formData, neurology: {...formData.neurology, gcs: v}})} 
                    />
                    <HandoverSelectField 
                      label="Sedation (RASS)" 
                      value={formData.neurology.sedation} 
                      options={['-5', '-4', '-3', '-2', '-1', '0', '+1', '+2']}
                      onChange={v => setFormData({...formData, neurology: {...formData.neurology, sedation: v}})} 
                    />
                    <HandoverSelectField 
                      label="Pain (NRS/CPOT)" 
                      value={formData.neurology.pain} 
                      options={['0', '1-3', '4-6', '7-10']}
                      onChange={v => setFormData({...formData, neurology: {...formData.neurology, pain: v}})} 
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-6">
                    <HandoverField label="UO (ml/h)" value={formData.renal.uo} onChange={v => setFormData({...formData, renal: {...formData.renal, uo: v}})} />
                    <HandoverSelectField 
                      label="Fluid Status" 
                      value={formData.renal.fluidStatus} 
                      options={['Euvolmic', 'Overloaded', 'Dehydrated']}
                      onChange={v => setFormData({...formData, renal: {...formData.renal, fluidStatus: v}})} 
                    />
                    <HandoverSelectField 
                      label="Dialysis / CRRT" 
                      value={formData.renal.dialysis} 
                      options={['No', 'CRRT', 'IHD', 'SLED']}
                      onChange={v => setFormData({...formData, renal: {...formData.renal, dialysis: v}})} 
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest border-b border-blue-900/30 pb-2">Devices & Lines</p>
                <div className="grid grid-cols-1 gap-8">
                  <HandoverMultiSelectField 
                    label="Active Medications" 
                    values={Array.isArray(formData.medicationList) ? formData.medicationList : []}
                    options={['Antibiotics', 'Sedatives', 'Analgesics', 'Anticoagulants', 'Insulin', 'Diuretics', 'Antihypertensives', 'Steroids', 'Antiarrhythmics']}
                    onChange={v => setFormData({...formData, medicationList: v})}
                  />
                  <HandoverMultiSelectField 
                    label="Common Devices" 
                    values={Array.isArray(formData.deviceList) ? formData.deviceList : []}
                    options={['CVC', 'Art-Line', 'Foley', 'NGT', 'OGT', 'Chest Tube', 'EVD', 'IABP', 'Impella', 'CRRT Catheter']}
                    onChange={v => setFormData({...formData, deviceList: v})}
                  />
                  <HandoverField 
                    label="Device Details & Locations" 
                    value={formData.lines} 
                    onChange={v => setFormData({...formData, lines: v})} 
                    textarea 
                    placeholder="Specific details about lines, drains, and tube locations..." 
                  />
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection 
            title="Recommendation" 
            icon={<ArrowUpRight size={18} />} 
            isOpen={openSections.includes('recommendation')}
            onToggle={() => toggleSection('recommendation')}
          >
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-4">
                <HandoverField 
                  label="Key Recommendations for Next Shift" 
                  value={formData.recommendation} 
                  onChange={v => setFormData({...formData, recommendation: v})} 
                  textarea 
                  placeholder="Specific clinical recommendations, weaning plans, or review requests..." 
                />
                <QuickPresets 
                  label="Plan" 
                  options={['Continue Current Plan', 'Wean Sedation', 'Extubation Plan', 'Physio Review', 'Repeat Labs', 'Physician Review', 'Mobility Goal']}
                  onSelect={v => setFormData({...formData, recommendation: formData.recommendation ? `${formData.recommendation}\n- ${v}` : `- ${v}`})}
                />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection 
            title="Illness Severity" 
            icon={<AlertCircle size={18} />} 
            isOpen={openSections.includes('severity')}
            onToggle={() => toggleSection('severity')}
          >
            <div className="grid grid-cols-3 gap-4">
              {(['Stable', 'Watcher', 'Unstable'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFormData({...formData, illnessSeverity: s})}
                  className={`p-6 rounded-3xl border-2 transition-all flex flex-col items-center gap-3 ${formData.illnessSeverity === s ? 'bg-blue-600 border-blue-500 text-white shadow-xl glow-blue' : 'bg-blue-950/20 border-blue-500/10 text-slate-500 hover:border-blue-500/30'}`}
                >
                  <div className={`w-3 h-3 rounded-full ${s === 'Stable' ? 'bg-emerald-500 glow-emerald' : s === 'Watcher' ? 'bg-amber-500 glow-amber' : 'bg-red-500 glow-red'}`}></div>
                  <span className="text-sm font-black uppercase tracking-widest">{s}</span>
                </button>
              ))}
            </div>
          </CollapsibleSection>

          <CollapsibleSection 
            title="Patient Summary" 
            icon={<ClipboardList size={18} />} 
            isOpen={openSections.includes('summary')}
            onToggle={() => toggleSection('summary')}
          >
            <div className="grid grid-cols-1 gap-6">
              <HandoverField 
                label="Concise Patient Summary" 
                value={formData.summary} 
                onChange={v => setFormData({...formData, summary: v})} 
                textarea 
                placeholder="Admission reason, major events, current clinical picture..." 
              />
              <QuickPresets 
                label="Common Diagnoses" 
                options={['Post-Op CABG', 'Sepsis / Septic Shock', 'ARDS', 'DKA', 'Multi-Organ Failure', 'Trauma / TBI']}
                onSelect={v => setFormData({...formData, identification: {...formData.identification, diagnosis: v}})}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection 
            title="Action List" 
            icon={<CheckCircle2 size={18} />} 
            isOpen={openSections.includes('actions')}
            onToggle={() => toggleSection('actions')}
          >
            <div className="grid grid-cols-1 gap-6">
              <QuickPresets 
                label="Common Tasks" 
                options={['Repeat Labs', 'Physician Review', 'Physio Review', 'Weaning Trial', 'Extubation Plan', 'CT Scan', 'Line Change']}
                onSelect={v => setFormData({...formData, meds: formData.meds ? `${formData.meds}\n- ${v}` : `- ${v}`})}
              />
              <HandoverField 
                label="Immediate Priorities & Pending Tasks" 
                value={formData.meds} 
                onChange={v => setFormData({...formData, meds: v})} 
                textarea 
                placeholder="Labs to repeat, procedures expected, reviews needed..." 
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection 
            title="Situation Awareness" 
            icon={<ShieldCheck size={18} />} 
            isOpen={openSections.includes('contingency')}
            onToggle={() => toggleSection('contingency')}
          >
            <div className="grid grid-cols-1 gap-8">
              <HandoverMultiSelectField 
                label="Potential Risks" 
                values={Array.isArray(formData.riskList) ? formData.riskList : []}
                options={['Agitation', 'Hypotension', 'Desaturation', 'Arrhythmia', 'Bleeding', 'Re-intubation Risk']}
                onChange={v => setFormData({...formData, riskList: v})}
              />
              <HandoverField 
                label="What could go wrong? Plan?" 
                value={formData.contingency} 
                onChange={v => setFormData({...formData, contingency: v})} 
                textarea 
                placeholder="Deterioration risks, when to call physician, escalation plan..." 
              />
              <HandoverField 
                label="Plan for Next 12 Hours" 
                value={formData.planNext12} 
                onChange={v => setFormData({...formData, planNext12: v})} 
                textarea 
                placeholder="Treatment goals, ventilator goals, mobility plan..." 
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection 
            title="Synthesis" 
            icon={<Handshake size={18} />} 
            isOpen={openSections.includes('synthesis')}
            onToggle={() => toggleSection('synthesis')}
          >
            <div className="bg-blue-950/20 p-8 rounded-[40px] border border-blue-500/10 space-y-6">
              <p className="text-sm text-slate-400 font-medium italic leading-relaxed">"Receiver repeats back key priorities, confirms understanding of critical risks and pending tasks."</p>
              <HandoverField label="Read-back Confirmation Notes" value={formData.synthesis} onChange={v => setFormData({...formData, synthesis: v})} textarea />
              <div className="flex items-center gap-3 p-4 bg-emerald-900/20 border border-emerald-900/30 rounded-2xl text-emerald-400">
                <CheckCircle2 size={20} />
                <span className="text-xs font-black uppercase tracking-widest">Ready to Finalize Handover</span>
              </div>
            </div>
          </CollapsibleSection>

          <div className="glass-panel rounded-[32px] hardware-border overflow-hidden bg-blue-950/20">
            <button 
              onClick={() => toggleSection('history')}
              className={`w-full px-8 py-6 flex items-center justify-between group transition-all ${openSections.includes('history') ? 'bg-blue-600/10' : 'hover:bg-blue-950/30'}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${openSections.includes('history') ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'bg-blue-950 text-slate-500 group-hover:text-slate-300'}`}>
                  <History size={18} />
                </div>
                <h3 className={`text-lg font-black tracking-tight transition-colors ${openSections.includes('history') ? 'text-slate-50' : 'text-slate-400 group-hover:text-slate-200'}`}>
                  Handover History
                </h3>
              </div>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${openSections.includes('history') ? 'bg-blue-900/30 text-slate-200 rotate-180' : 'bg-blue-950 text-slate-600 group-hover:text-slate-400'}`}>
                <ChevronDown size={18} />
              </div>
            </button>
            
            <AnimatePresence>
              {openSections.includes('history') && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                >
                  <div className="px-8 pb-8 pt-2 border-t border-blue-500/10 space-y-4">
                    {storage.getHandovers()
                      .filter((h: any) => h.patientId === patient.id && h.status === 'finalized')
                      .map((h: any) => (
                        <div key={h.id} className="glass-panel p-6 rounded-3xl hardware-border bg-blue-950/30 space-y-4">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <Clock size={16} className="text-slate-500" />
                              <span className="data-value text-xs text-slate-300">{new Date(h.timestamp).toLocaleString()}</span>
                            </div>
                            <span className="micro-label !text-blue-400">By: {h.identification.sendingStaff}</span>
                          </div>
                          <p className="text-sm text-slate-400 leading-relaxed line-clamp-2 font-serif italic">"{h.summary}"</p>
                          <button 
                            onClick={() => {
                              const doc = new jsPDF();
                              doc.text(`Handover History: ${patient.name}`, 20, 20);
                              doc.text(`Date: ${new Date(h.timestamp).toLocaleString()}`, 20, 30);
                              doc.text(`Summary: ${h.summary}`, 20, 40);
                              doc.save(`handover_history_${h.id}.pdf`);
                            }}
                            className="micro-label !text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-2"
                          >
                            <Download size={12} /> Download PDF
                          </button>
                        </div>
                      ))}
                    {storage.getHandovers().filter((h: any) => h.patientId === patient.id && h.status === 'finalized').length === 0 && (
                      <div className="text-center py-12 bg-blue-950/30 rounded-[32px] border-2 border-dashed border-blue-500/10 hardware-border">
                        <History size={40} className="text-blue-800 mx-auto mb-4" />
                        <p className="micro-label opacity-40">No previous handovers found</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="px-10 py-8 bg-blue-950/50 border-t border-blue-500/10 flex items-center justify-between">
          <div className="flex gap-4">
            <button 
              onClick={() => {
                const doc = new jsPDF();
                doc.setFontSize(20);
                doc.text(`ICU Handover: ${patient.name}`, 20, 20);
                doc.setFontSize(12);
                doc.text(`Bed: ${patient.bedNumber} | MRN: ${patient.hisId}`, 20, 30);
                doc.text(`Severity: ${formData.illnessSeverity}`, 20, 40);
                doc.text(`Summary: ${formData.summary}`, 20, 50);
                doc.save(`handover_${patient.hisId}.pdf`);
              }}
              className="px-6 py-3.5 bg-blue-950/40 text-slate-300 rounded-2xl micro-label hover:bg-blue-900/40 transition-all flex items-center gap-3 hardware-border shadow-inner"
            >
              <Printer size={16} /> Print / PDF
            </button>
          </div>
          <div className="flex gap-6 items-center">
            <button 
              onClick={() => onSave({...formData, status: 'draft'})}
              className="micro-label !text-slate-500 hover:text-slate-300 transition-colors"
            >
              Save Draft
            </button>
            <button 
              onClick={() => onSave({...formData, status: 'finalized'})}
              className="px-10 py-4 bg-blue-600 text-white rounded-2xl micro-label !text-current shadow-xl shadow-blue-900/30 hover:bg-blue-500 transition-all flex items-center gap-3 glow-blue"
            >
              <CheckCircle2 size={18} />
              Finalize Handover
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function HandoverField({ label, value, onChange, readOnly, textarea, placeholder }: { 
  label: string, 
  value: string, 
  onChange?: (v: string) => void, 
  readOnly?: boolean,
  textarea?: boolean,
  placeholder?: string
}) {
  return (
    <div className="space-y-3">
      <label className="micro-label !text-slate-500 ml-1">{label}</label>
      {textarea ? (
        <textarea 
          className={`w-full p-5 bg-white/50 border border-slate-200 rounded-[24px] text-sm text-slate-900 outline-none transition-all min-h-[140px] shadow-inner ${readOnly ? 'opacity-50 cursor-not-allowed' : 'focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5'}`}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
        />
      ) : (
        <input 
          className={`w-full p-5 bg-white/50 border border-slate-200 rounded-[24px] text-sm text-slate-900 outline-none transition-all shadow-inner ${readOnly ? 'opacity-50 cursor-not-allowed' : 'focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/5'}`}
          value={value}
          onChange={e => onChange?.(e.target.value)}
          readOnly={readOnly}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

function HandoverSelectField({ label, value, options, onChange, readOnly }: {
  label: string,
  value: string,
  options: string[],
  onChange: (v: string) => void,
  readOnly?: boolean
}) {
  return (
    <div className="space-y-3">
      <label className="micro-label !text-slate-500 ml-1">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            disabled={readOnly}
            onClick={() => onChange(opt)}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${value === opt ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-900/10' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-600 hover:text-blue-600 shadow-sm'}`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function HandoverMultiSelectField({ label, values, options, onChange, readOnly }: {
  label: string,
  values: string[],
  options: string[],
  onChange: (v: string[]) => void,
  readOnly?: boolean
}) {
  const toggle = (opt: string) => {
    if (values.includes(opt)) {
      onChange(values.filter(v => v !== opt));
    } else {
      onChange([...values, opt]);
    }
  };

  return (
    <div className="space-y-3">
      <label className="micro-label !text-slate-500 ml-1">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            disabled={readOnly}
            onClick={() => toggle(opt)}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${values.includes(opt) ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-900/10' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-600 hover:text-blue-600 shadow-sm'}`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon, children, isOpen, onToggle }: { 
  title: string, 
  icon: React.ReactNode, 
  children: React.ReactNode, 
  isOpen: boolean, 
  onToggle: () => void 
}) {
  return (
    <div className={`metallic-panel rounded-[32px] overflow-hidden transition-all duration-500 ${isOpen ? 'bg-white/60 shadow-xl' : 'bg-white/30 hover:bg-white/40'}`}>
      <button 
        onClick={onToggle}
        className="w-full px-8 py-6 flex items-center justify-between group"
      >
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/10' : 'bg-white text-slate-400 border border-slate-200 group-hover:text-blue-600 group-hover:border-blue-600'}`}>
            {icon}
          </div>
          <h3 className={`text-lg font-black tracking-tight transition-colors ${isOpen ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-900'}`}>
            {title}
          </h3>
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isOpen ? 'bg-blue-50 text-blue-600 rotate-180' : 'bg-slate-50 text-slate-400 group-hover:text-slate-600'}`}>
          <ChevronDown size={18} />
        </div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="px-8 pb-8 pt-2 border-t border-slate-100">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function QuickPresets({ label, options, onSelect }: { label: string, options: string[], onSelect: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label} Presets</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onSelect(opt)}
            className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-600 transition-all shadow-sm"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function HandoverStats({ handovers, patients }: { handovers: any[], patients: Patient[] }) {
  const finalizedCount = patients.filter(p => handovers.some(h => h.patientId === p.id && h.status === 'finalized')).length;
  const draftCount = patients.filter(p => handovers.some(h => h.patientId === p.id && h.status === 'draft')).length;
  const pendingCount = patients.length - finalizedCount - draftCount;

  return (
    <div className="metallic-panel p-8 rounded-[40px] space-y-6 bg-white/40">
      <h3 className="text-lg font-black text-slate-900">Shift Compliance</h3>
      <div className="space-y-4">
        <StatRow label="Finalized" value={finalizedCount} total={patients.length} color="bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
        <StatRow label="In Progress" value={draftCount} total={patients.length} color="bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
        <StatRow label="Pending" value={pendingCount} total={patients.length} color="bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
      </div>
    </div>
  );
}

function StatRow({ label, value, total, color }: { label: string, value: number, total: number, color: string }) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-700">{value} / {total}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={`h-full ${color}`}
        />
      </div>
    </div>
  );
}

function HandoverRecentActivity({ handovers, patients }: { handovers: any[], patients: Patient[] }) {
  const recent = handovers.slice(0, 5);
  return (
    <div className="metallic-panel p-8 rounded-[40px] space-y-6 bg-white/40">
      <h3 className="text-lg font-black text-slate-900">Recent Activity</h3>
      <div className="space-y-4">
        {recent.map(h => {
          const patient = patients.find(p => p.id === h.patientId);
          return (
            <div key={h.id} className="flex items-start gap-3 p-3 bg-white/50 rounded-2xl border border-slate-100">
              <div className={`w-2 h-2 rounded-full mt-1.5 ${h.status === 'finalized' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'}`}></div>
              <div>
                <p className="text-xs font-black text-slate-900">{patient?.name || 'Unknown'}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{h.status} • {new Date(h.timestamp).toLocaleTimeString()}</p>
              </div>
            </div>
          );
        })}
        {recent.length === 0 && <p className="text-xs text-slate-400 font-bold text-center py-4">No recent handovers</p>}
      </div>
    </div>
  );
}

function ChargeNurseDashboard({ patients, handovers }: { patients: Patient[], handovers: any[] }) {
  const unstablePatients = patients.filter(p => p.riskLevel === 'Critical' || p.riskLevel === 'High');
  const incompleteHandovers = patients.filter(p => !handovers.some(h => h.patientId === p.id && h.status === 'finalized'));

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ChargeStatCard label="Critical Patients" value={unstablePatients.length} icon={<AlertCircle className="text-red-600" />} />
        <ChargeStatCard label="Incomplete Handovers" value={incompleteHandovers.length} icon={<ClipboardList className="text-amber-600" />} />
        <ChargeStatCard label="Staffing Ratio" value="1:1.2" icon={<Users className="text-blue-600" />} />
      </div>

      <div className="metallic-panel p-8 rounded-[40px] bg-white/40">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Unit Oversight</h3>
            <p className="micro-label !text-slate-500 mt-1">Real-time patient safety monitoring</p>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-white rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 border border-slate-200 hover:text-blue-600 hover:border-blue-600 transition-all shadow-sm">Export Report</button>
            <button className="px-4 py-2 bg-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-900/10">Live View</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-4 micro-label !text-slate-500">Bed</th>
                <th className="pb-4 micro-label !text-slate-500">Patient</th>
                <th className="pb-4 micro-label !text-slate-500">Acuity</th>
                <th className="pb-4 micro-label !text-slate-500">Handover Status</th>
                <th className="pb-4 micro-label !text-slate-500 text-right">Last Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {patients.map(p => {
                const h = handovers.find(h => h.patientId === p.id);
                return (
                  <tr key={p.id} className="group hover:bg-white/40 transition-all">
                    <td className="py-5 text-xs font-bold text-slate-400">{p.bedNumber}</td>
                    <td className="py-5">
                      <p className="text-sm font-black text-slate-900">{p.name}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">{p.hisId}</p>
                    </td>
                    <td className="py-5"><AcuityBadge level={p.currentAcuity} /></td>
                    <td className="py-5">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${h?.status === 'finalized' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : h?.status === 'draft' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                        {h?.status || 'Pending'}
                      </span>
                    </td>
                    <td className="py-5 text-right">
                      <span className="text-xs font-bold text-slate-400">{h ? new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value, total, color, glow }: { label: string, value: number, total: number, color: string, glow: string }) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-slate-900">{value}</span>
          <span className="text-[10px] text-slate-400 font-black">/ {total}</span>
        </div>
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden shadow-inner">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={`h-full ${color} ${glow} rounded-full transition-all duration-500`}
        />
      </div>
    </div>
  );
}

function ChargeStatCard({ label, value, icon }: { label: string, value: string | number, icon: React.ReactNode }) {
  return (
    <div className="metallic-panel p-6 rounded-[32px] flex items-center gap-5 bg-white/40">
      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-inner border border-slate-200">
        {icon}
      </div>
      <div>
        <p className="micro-label !text-slate-500 mb-1">{label}</p>
        <p className="text-3xl font-black text-slate-900 tracking-tighter">{value}</p>
      </div>
    </div>
  );
}

function LeadershipDashboard({ patients, handovers }: { patients: Patient[], handovers: any[] }) {
  const compliance = patients.length > 0 ? (handovers.filter(h => h.status === 'finalized').length / patients.length) * 100 : 0;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="metallic-panel p-10 rounded-[48px] flex flex-col items-center justify-center text-center space-y-6 bg-white/40">
          <div className="relative w-48 h-48">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="8" className="shadow-inner" />
              <motion.circle 
                cx="50" cy="50" r="45" fill="none" stroke="#2563eb" strokeWidth="8" 
                strokeDasharray="283"
                initial={{ strokeDashoffset: 283 }}
                animate={{ strokeDashoffset: 283 - (283 * compliance) / 100 }}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                className="shadow-[0_0_12px_rgba(37,99,235,0.3)]"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-black text-slate-900 tracking-tighter">{Math.round(compliance)}%</span>
              <span className="micro-label text-slate-500 mt-1">Compliance</span>
            </div>
          </div>
          <div>
            <p className="text-lg font-black text-slate-900 tracking-tight">Shift Completion Rate</p>
            <p className="micro-label text-slate-500 mt-1">Handover protocol adherence for current unit census</p>
          </div>
        </div>

        <div className="metallic-panel p-10 rounded-[48px] space-y-8 bg-white/40">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Safety Audit Logs</h3>
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 border border-slate-200 shadow-sm">
              <ShieldCheck size={20} />
            </div>
          </div>
          <div className="space-y-4">
            <AuditMetric label="Critical Omissions" value="0" color="text-emerald-600" />
            <AuditMetric label="Overdue Handovers" value={patients.length - handovers.filter(h => h.status === 'finalized').length} color="text-red-600" />
            <AuditMetric label="AI Safety Flags" value="2" color="text-amber-600" />
          </div>
          <button className="w-full py-4 bg-white text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:text-blue-600 hover:border-blue-600 transition-all shadow-sm">
            Download Full Audit Report
          </button>
        </div>
      </div>
    </div>
  );
}

function AuditMetric({ label, value, color }: { label: string, value: string | number, color: string }) {
  return (
    <div className="flex justify-between items-center p-5 metallic-panel rounded-2xl bg-white/50">
      <span className="micro-label !text-slate-500">{label}</span>
      <span className={`text-2xl font-black ${color}`}>{value}</span>
    </div>
  );
}

function QuickStatCard({ label, value, color }: { label: string, value: string, color: string }) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="metallic-panel p-6 rounded-[32px] text-center bg-white/40"
    >
      <h3 className="micro-label mb-4">{label}</h3>
      <span className={`text-4xl font-black ${color}`}>{value}</span>
    </motion.div>
  );
}
