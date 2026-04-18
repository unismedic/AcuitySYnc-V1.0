
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
  // Patients
  getPatients: () => getLocalData<any>(STORAGE_KEYS.PATIENTS),
  savePatient: (patient: any) => {
    const patients = storage.getPatients();
    const index = patients.findIndex((p: any) => p.id === patient.id);
    if (index >= 0) {
      patients[index] = { ...patients[index], ...patient };
    } else {
      patients.push({ ...patient, id: patient.id || crypto.randomUUID() });
    }
    saveLocalData(STORAGE_KEYS.PATIENTS, patients);
    return patients;
  },
  deletePatient: (id: string) => {
    const patients = storage.getPatients().filter((p: any) => p.id !== id);
    saveLocalData(STORAGE_KEYS.PATIENTS, patients);
    
    // Also cleanup assessments for this patient
    const assessments = storage.getAssessments().filter((a: any) => a.patientId !== id);
    saveLocalData(STORAGE_KEYS.ASSESSMENTS, assessments);
    
    // Cleanup handovers
    const handovers = storage.getHandovers().filter((h: any) => h.patientId !== id);
    saveLocalData(STORAGE_KEYS.HANDOVERS, handovers);
    
    return patients;
  },

  // Assessments
  getAssessments: () => getLocalData<any>(STORAGE_KEYS.ASSESSMENTS),
  saveAssessment: (assessment: any) => {
    const assessments = storage.getAssessments();
    const newAssessment = { 
      ...assessment, 
      id: assessment.id || crypto.randomUUID(),
      timestamp: new Date().toISOString() 
    };
    assessments.unshift(newAssessment); // Newest first
    saveLocalData(STORAGE_KEYS.ASSESSMENTS, assessments);
    return assessments;
  },

  // Handovers
  getHandovers: () => getLocalData<any>(STORAGE_KEYS.HANDOVERS),
  saveHandover: (handover: any) => {
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
    return handovers;
  },

  // Audit Logs
  getAuditLogs: () => getLocalData<any>(STORAGE_KEYS.AUDIT_LOGS),
  saveAuditLog: (log: any) => {
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
