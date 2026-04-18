import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, ScatterChart, Scatter, ZAxis
} from 'recharts';
import { 
  TrendingUp, TrendingDown, AlertTriangle, Activity, Users, Clock, ShieldCheck, 
  Calendar, Filter, ChevronDown, Download, FileText, Search, X
} from 'lucide-react';

// --- Mock Data ---
const mockTrends = [
  { date: 'Oct 01', utilization: 85, completion: 90, requiredStaff: 12, actualStaff: 11, icuLos: 4.2, hduLos: 2.1 },
  { date: 'Oct 02', utilization: 88, completion: 92, requiredStaff: 12, actualStaff: 12, icuLos: 4.1, hduLos: 2.2 },
  { date: 'Oct 03', utilization: 86, completion: 89, requiredStaff: 13, actualStaff: 11, icuLos: 4.3, hduLos: 2.0 },
  { date: 'Oct 04', utilization: 92, completion: 95, requiredStaff: 12, actualStaff: 12, icuLos: 4.0, hduLos: 1.9 },
  { date: 'Oct 05', utilization: 95, completion: 98, requiredStaff: 14, actualStaff: 12, icuLos: 3.8, hduLos: 1.8 },
  { date: 'Oct 06', utilization: 94, completion: 97, requiredStaff: 12, actualStaff: 12, icuLos: 3.9, hduLos: 2.1 },
  { date: 'Oct 07', utilization: 96, completion: 99, requiredStaff: 13, actualStaff: 13, icuLos: 3.7, hduLos: 2.0 },
];

const mockShiftCompletion = [
  { name: 'Day Shift', rate: 98 },
  { name: 'Night Shift', rate: 92 },
];

const mockDeteriorationTypes = [
  { name: 'Vasopressor Initiation', value: 45 },
  { name: 'Intubation', value: 30 },
  { name: 'Cardiac Arrest', value: 10 },
  { name: 'Neuro Decline', value: 15 },
];

const mockUnplannedTransfers = [
  { day: 'Mon', count: 2 },
  { day: 'Tue', count: 1 },
  { day: 'Wed', count: 3 },
  { day: 'Thu', count: 0 },
  { day: 'Fri', count: 1 },
  { day: 'Sat', count: 4 },
  { day: 'Sun', count: 2 },
];

const mockAcuityMix = [
  { shift: 'Oct 01 D', icu: 8, hdu: 6 },
  { shift: 'Oct 01 N', icu: 8, hdu: 7 },
  { shift: 'Oct 02 D', icu: 9, hdu: 5 },
  { shift: 'Oct 02 N', icu: 9, hdu: 6 },
  { shift: 'Oct 03 D', icu: 10, hdu: 4 },
];

const mockScatterData = [
  { gap: 0, events: 1 },
  { gap: 0.5, events: 2 },
  { gap: 1, events: 3 },
  { gap: 1.5, events: 5 },
  { gap: 2, events: 8 },
  { gap: 2.5, events: 12 },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

// --- Components ---

function KpiCard({ title, value, target, trend, trendValue, icon, onClick }: any) {
  const isPositive = trend === 'up';
  return (
    <div 
      onClick={onClick}
      className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-slate-50 rounded-2xl text-blue-600 group-hover:bg-blue-50 transition-colors">
          {icon}
        </div>
        {trendValue && (
          <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trendValue}
          </div>
        )}
      </div>
      <h3 className="text-slate-500 text-sm font-bold mb-1">{title}</h3>
      <div className="flex items-end gap-3">
        <span className="text-3xl font-black text-slate-900 tracking-tight">{value}</span>
        {target && <span className="text-xs font-bold text-slate-400 mb-1.5">Target: {target}</span>}
      </div>
    </div>
  );
}

function DrillDownModal({ title, isOpen, onClose, data }: any) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[32px] w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900">{title} Drill-down</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Detailed Line-Level Data</p>
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2">
              <Download size={14} /> Export CSV
            </button>
            <button onClick={onClose} className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-6">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Date/Time</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Patient ID</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Unit</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Shift</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Details</th>
                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Status</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <tr key={i} className="hover:bg-slate-50 border-b border-slate-100 last:border-0">
                  <td className="p-3 text-sm text-slate-700">2023-10-0{i} 08:30</td>
                  <td className="p-3 text-sm font-mono text-slate-600">MRN-{99880 + i}</td>
                  <td className="p-3 text-sm text-slate-700">ICU-A</td>
                  <td className="p-3 text-sm text-slate-700">{i % 2 === 0 ? 'Night' : 'Day'}</td>
                  <td className="p-3 text-sm text-slate-700">Sample detail record {i}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-emerald-50 text-emerald-600 rounded text-[10px] font-bold uppercase">Complete</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

export default function KPIDashboard({ auditLogs }: { auditLogs?: any[] }) {
  const [activeTab, setActiveTab] = useState('handover');
  const [drillDown, setDrillDown] = useState<{ isOpen: boolean, title: string }>({ isOpen: false, title: '' });

  const mortalityRate = useMemo(() => {
    if (!auditLogs || auditLogs.length === 0) return "1.2%";
    const deaths = auditLogs.filter(log => log.action === 'PATIENT_DECEASED').length;
    const discharges = auditLogs.filter(log => log.action === 'PATIENT_DISCHARGED').length;
    const totalOutcomes = deaths + discharges;
    if (totalOutcomes === 0) return "0.0%";
    return ((deaths / totalOutcomes) * 100).toFixed(1) + "%";
  }, [auditLogs]);

  const openDrillDown = (title: string) => setDrillDown({ isOpen: true, title });

  return (
    <div className="flex flex-col h-full">
      {/* Header & Filters */}
      <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm mb-8 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Activity className="text-blue-600" size={32} />
            KPI Analytics
          </h2>
          <p className="text-sm font-bold text-slate-500 mt-1">Clinical Safety & Performance Monitoring</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-200">
            <Calendar size={16} className="text-slate-400" />
            <span className="text-sm font-bold text-slate-700">Last 30 Days</span>
            <ChevronDown size={14} className="text-slate-400 ml-2" />
          </div>
          <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-200">
            <Filter size={16} className="text-slate-400" />
            <span className="text-sm font-bold text-slate-700">All Units</span>
            <ChevronDown size={14} className="text-slate-400 ml-2" />
          </div>
          <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-200">
            <Clock size={16} className="text-slate-400" />
            <span className="text-sm font-bold text-slate-700">All Shifts</span>
            <ChevronDown size={14} className="text-slate-400 ml-2" />
          </div>
          <button className="px-4 py-2.5 bg-blue-600 text-white rounded-2xl text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm">
            <Download size={16} /> Export Report
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 custom-scrollbar">
        {[
          { id: 'handover', label: 'Handover Quality', icon: <FileText size={16} /> },
          { id: 'safety', label: 'Clinical Safety', icon: <ShieldCheck size={16} /> },
          { id: 'staffing', label: 'Staffing & Acuity', icon: <Users size={16} /> },
          { id: 'outcomes', label: 'Performance & Outcomes', icon: <TrendingUp size={16} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === tab.id 
                ? 'bg-slate-900 text-white shadow-md' 
                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          className="space-y-8"
        >
          {activeTab === 'handover' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KpiCard title="Tool Utilization Rate" value="94.5%" target=">95%" trend="up" trendValue="+2.1%" icon={<Activity size={24} />} onClick={() => openDrillDown('Tool Utilization')} />
                <KpiCard title="Handover Completion" value="98.2%" target="100%" trend="up" trendValue="+0.5%" icon={<ShieldCheck size={24} />} onClick={() => openDrillDown('Handover Completion')} />
                <KpiCard title="Avg Time to Complete" value="14m" target="<15m" trend="down" trendValue="-2m" icon={<Clock size={24} />} onClick={() => openDrillDown('Completion Time')} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-6 uppercase tracking-widest">Utilization & Completion Trend</h3>
                  <div className="h-72 w-full relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={300}>
                      <LineChart data={mockTrends}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} domain={[80, 100]} />
                        <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Line type="monotone" dataKey="utilization" name="Utilization %" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="completion" name="Completion %" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-6 uppercase tracking-widest">Completion by Shift Type</h3>
                  <div className="h-72 w-full relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={300}>
                      <BarChart data={mockShiftCompletion} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 'bold' }} width={100} />
                        <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="rate" name="Completion Rate %" fill="#3b82f6" radius={[0, 8, 8, 0]} barSize={32}>
                          {mockShiftCompletion.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'safety' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KpiCard title="24h Deterioration Rate" value="3.1%" target="<5%" trend="down" trendValue="-0.4%" icon={<AlertTriangle size={24} />} onClick={() => openDrillDown('Deterioration Events')} />
                <KpiCard title="Unplanned HDU->ICU (24h)" value="1.5%" target="<2%" trend="up" trendValue="+0.2%" icon={<TrendingUp size={24} />} onClick={() => openDrillDown('Unplanned Transfers')} />
                <KpiCard title="Code Blue Events" value="2" target="0" trend="up" trendValue="+1" icon={<Activity size={24} />} onClick={() => openDrillDown('Code Blue Events')} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-6 uppercase tracking-widest">Deterioration Types</h3>
                  <div className="h-72 w-full relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={300}>
                      <PieChart>
                        <Pie data={mockDeteriorationTypes} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                          {mockDeteriorationTypes.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-6 uppercase tracking-widest">Unplanned Transfers by Day</h3>
                  <div className="h-72 w-full relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={300}>
                      <BarChart data={mockUnplannedTransfers}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="count" name="Transfers" fill="#ef4444" radius={[8, 8, 0, 0]} barSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'staffing' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KpiCard title="Avg Required Nurses" value="12.5" trend="up" trendValue="+0.5" icon={<Users size={24} />} onClick={() => openDrillDown('Required Staffing')} />
                <KpiCard title="Avg Actual Nurses" value="11.8" trend="down" trendValue="-0.2" icon={<Users size={24} />} onClick={() => openDrillDown('Actual Staffing')} />
                <KpiCard title="Unsafe Staffing Shifts" value="4" target="0" trend="up" trendValue="+2" icon={<AlertTriangle size={24} />} onClick={() => openDrillDown('Unsafe Shifts')} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-6 uppercase tracking-widest">Required vs Actual Staffing</h3>
                  <div className="h-72 w-full relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={300}>
                      <LineChart data={mockTrends}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} domain={[8, 16]} />
                        <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Line type="stepAfter" dataKey="requiredStaff" name="Required" stroke="#3b82f6" strokeWidth={3} dot={false} />
                        <Line type="stepAfter" dataKey="actualStaff" name="Actual" stroke="#f59e0b" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-6 uppercase tracking-widest">Acuity Mix (ICU vs HDU)</h3>
                  <div className="h-72 w-full relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={300}>
                      <AreaChart data={mockAcuityMix}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="shift" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Area type="monotone" dataKey="icu" name="ICU Patients" stackId="1" stroke="#ef4444" fill="#fca5a5" />
                        <Area type="monotone" dataKey="hdu" name="HDU Patients" stackId="1" stroke="#3b82f6" fill="#93c5fd" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'outcomes' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KpiCard title="Avg ICU LOS (Days)" value="3.9" target="<4.0" trend="down" trendValue="-0.2" icon={<Clock size={24} />} onClick={() => openDrillDown('ICU LOS')} />
                <KpiCard title="Avg HDU LOS (Days)" value="2.0" target="<2.5" trend="down" trendValue="-0.1" icon={<Clock size={24} />} onClick={() => openDrillDown('HDU LOS')} />
                <KpiCard title="Mortality Rate" value={mortalityRate} trend="down" trendValue="-0.1%" icon={<Activity size={24} />} onClick={() => openDrillDown('Mortality Rate')} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-6 uppercase tracking-widest">Length of Stay Trend</h3>
                  <div className="h-72 w-full relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={300}>
                      <LineChart data={mockTrends}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <RechartsTooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        <Line type="monotone" dataKey="icuLos" name="ICU LOS (Days)" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="hduLos" name="HDU LOS (Days)" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-700 mb-6 uppercase tracking-widest">Staffing Gap vs Deterioration</h3>
                  <div className="h-72 w-full relative">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={300}>
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" dataKey="gap" name="Staffing Gap" unit=" nurses" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <YAxis type="number" dataKey="events" name="Deterioration Events" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                        <ZAxis type="number" range={[100, 100]} />
                        <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Scatter name="Correlation" data={mockScatterData} fill="#8b5cf6" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <DrillDownModal 
        isOpen={drillDown.isOpen} 
        title={drillDown.title} 
        onClose={() => setDrillDown({ isOpen: false, title: '' })} 
      />
    </div>
  );
}
