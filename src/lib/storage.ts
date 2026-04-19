import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from './firebase';

// Local Storage Utility for AcuitySync
// Replaces Firestore for local-only operation

const STORAGE_KEYS = {
  PATIENTS: 'acuitysync_patients',
  ASSESSMENTS: 'acuitysync_assessments',
  AUDIT_LOGS: 'acuitysync_audit_logs',
  STAFF_PROFILE: 'acuitysync_staff_profile',
  HANDOVERS: 'acuitysync_handovers'
};

// Helper to get data from localStorage
const getLocalData = <T>(key: string): T[] => {
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
};

// Helper to save data to localStorage
const saveLocalData = <T>(key: string, data: T[]) => {
  localStorage.setItem(key, JSON.stringify(data));
};

export const storage = {
  // Sync Status
  isSyncing: false,

  // Patients
  getPatients: () => getLocalData<any>(STORAGE_KEYS.PATIENTS),
  savePatient: async (patient: any) => {
    const patients = storage.getPatients();
    const index = patients.findIndex((p: any) => p.id === patient.id);
    const updatedPatient = { ...patient, id: patient.id || crypto.randomUUID() };
    
    if (index >= 0) {
      patients[index] = { ...patients[index], ...updatedPatient };
    } else {
      patients.push(updatedPatient);
    }
    saveLocalData(STORAGE_KEYS.PATIENTS, patients);

    // Sync to Firestore if authenticated
    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'patients', updatedPatient.id), {
          ...updatedPatient,
          updatedAt: Timestamp.now()
        }, { merge: true });
      } catch (e) {
        console.warn("Firestore sync failed for patient", e);
      }
    }
    
    return patients;
  },
  deletePatient: async (id: string) => {
    const patients = storage.getPatients().filter((p: any) => p.id !== id);
    saveLocalData(STORAGE_KEYS.PATIENTS, patients);
    
    // Also cleanup assessments for this patient
    const assessments = storage.getAssessments().filter((a: any) => a.patientId !== id);
    saveLocalData(STORAGE_KEYS.ASSESSMENTS, assessments);
    
    // Cleanup handovers
    const handovers = storage.getHandovers().filter((h: any) => h.patientId !== id);
    saveLocalData(STORAGE_KEYS.HANDOVERS, handovers);

    // Sync to Firestore if authenticated
    if (auth.currentUser) {
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'patients', id));
        // Note: In real production, we'd also batch delete sub-records 
        // but for demo simple patient delete is enough
        await batch.commit();
      } catch (e) {
        console.warn("Firestore delete sync failed", e);
      }
    }
    
    return patients;
  },

  // Assessments
  getAssessments: () => getLocalData<any>(STORAGE_KEYS.ASSESSMENTS),
  saveAssessment: async (assessment: any) => {
    const assessments = storage.getAssessments();
    const newAssessment = { 
      ...assessment, 
      id: assessment.id || crypto.randomUUID(),
      timestamp: new Date().toISOString() 
    };
    assessments.unshift(newAssessment); // Newest first
    saveLocalData(STORAGE_KEYS.ASSESSMENTS, assessments);

    // Sync to Firestore if authenticated
    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'assessments', newAssessment.id), {
          ...newAssessment,
          timestamp: Timestamp.now()
        });
      } catch (e) {
        console.warn("Firestore assessment sync failed", e);
      }
    }

    return assessments;
  },

  // Handovers
  getHandovers: () => getLocalData<any>(STORAGE_KEYS.HANDOVERS),
  saveHandover: async (handover: any) => {
    const handovers = storage.getHandovers();
    const newHandover = {
      ...handover,
      id: handover.id || crypto.randomUUID(),
      timestamp: new Date().toISOString()
    };
    
    const index = handovers.findIndex((h: any) => h.id === newHandover.id);
    if (index >= 0) {
      handovers[index] = newHandover;
    } else {
      handovers.unshift(newHandover);
    }
    
    saveLocalData(STORAGE_KEYS.HANDOVERS, handovers);

    // Sync to Firestore
    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'handovers', newHandover.id), {
          ...newHandover,
          timestamp: Timestamp.now()
        });
      } catch (e) {
        console.warn("Firestore handover sync failed", e);
      }
    }

    return handovers;
  },

  // Audit Logs
  getAuditLogs: () => getLocalData<any>(STORAGE_KEYS.AUDIT_LOGS),
  saveAuditLog: async (log: any) => {
    const logs = storage.getAuditLogs();
    const newLog = { 
      ...log, 
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString() 
    };
    logs.unshift(newLog);
    // Keep only last 1000 logs to prevent localStorage bloat
    const limitedLogs = logs.slice(0, 1000);
    saveLocalData(STORAGE_KEYS.AUDIT_LOGS, limitedLogs);

    // Sync to Firestore
    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'auditLogs', newLog.id), {
          ...newLog,
          timestamp: Timestamp.now()
        });
      } catch (e) {
        console.warn("Firestore audit sync failed", e);
      }
    }

    return limitedLogs;
  },

  // Staff Profile
  getStaffProfile: () => {
    const profile = localStorage.getItem(STORAGE_KEYS.STAFF_PROFILE);
    if (profile) return JSON.parse(profile);
    return null;
  },
  updateStaffProfile: (profile: any) => {
    if (!profile) {
      localStorage.removeItem(STORAGE_KEYS.STAFF_PROFILE);
    } else {
      localStorage.setItem(STORAGE_KEYS.STAFF_PROFILE, JSON.stringify(profile));
    }
  },

  // Dark Mode
  getDarkMode: () => {
    return localStorage.getItem('acuitysync_dark_mode') === 'true';
  },
  saveDarkMode: (isDark: boolean) => {
    localStorage.setItem('acuitysync_dark_mode', String(isDark));
  },

  // Portability: Export/Import
  exportFullDatabase: () => {
    const data = {
      patients: storage.getPatients(),
      assessments: storage.getAssessments(),
      handovers: storage.getHandovers(),
      auditLogs: storage.getAuditLogs(),
      exportDate: new Date().toISOString(),
      appVersion: '1.0'
    };
    return JSON.stringify(data, null, 2);
  },
  importFullDatabase: (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      if (data.patients) saveLocalData(STORAGE_KEYS.PATIENTS, data.patients);
      if (data.assessments) saveLocalData(STORAGE_KEYS.ASSESSMENTS, data.assessments);
      if (data.handovers) saveLocalData(STORAGE_KEYS.HANDOVERS, data.handovers);
      if (data.auditLogs) saveLocalData(STORAGE_KEYS.AUDIT_LOGS, data.auditLogs);
      return true;
    } catch (e) {
      console.error("Import failed:", e);
      return false;
    }
  }
};
