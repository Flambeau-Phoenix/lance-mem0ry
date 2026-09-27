import React, { useState, useRef, useEffect } from 'react';
import { 
  Database, 
  ChevronDown, 
  Sparkles, 
  FolderPlus, 
  Table, 
  Home, 
  ShieldCheck, 
  AlertTriangle,
  Clock,
  Cpu,
  FlaskConical
} from 'lucide-react';
import { ProjectPartition, DatabaseAuditReport, TelemetryMetrics } from '../types';

export type ActiveNavTab = 'home' | 'table' | 'rules' | 'maintenance' | 'lab' | 'recent' | 'fastmcp';

interface HeaderProps {
  projects: ProjectPartition[];
  activeProject: ProjectPartition | null;
  onSelectProject: (p: ProjectPartition) => void;
  onOpenNewProject: () => void;
  activeTab: ActiveNavTab;
  onSelectTab: (tab: ActiveNavTab) => void;
  auditReport?: DatabaseAuditReport | null;
  metrics?: TelemetryMetrics | null;
  onOpenAudit?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  projects,
  activeProject,
  onSelectProject,
  onOpenNewProject,
  activeTab,
  onSelectTab,
  auditReport,
  metrics,
  onOpenAudit,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getStatusDot = (status?: string) => {
    switch (status) {
      case 'healthy':
      case 'indexed':
        return 'bg-emerald-500';
      case 'syncing':
        return 'bg-cyan-500 animate-pulse';
      case 'maintenance_due':
        return 'bg-amber-500';
      default:
        return 'bg-slate-500';
    }
  };

  const handleChooseProject = (p: ProjectPartition) => {
    onSelectProject(p);
    // Bring user straight to that project's LanceDB table
    onSelectTab('table');
    setDropdownOpen(false);
  };

  const hasAlerts = auditReport && auditReport.totalAlerts > 0;
  const p50 = metrics?.p50_latency_ms ?? 18;

  return (
    <header className="sticky top-0 z-40 border-b border-[#1f2434] bg-[#0c0e15]/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        
        {/* Left: Brand + Project Partition Selector */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => onSelectTab('home')}>
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#161a26] border border-[#262c3e] text-cyan-400 shadow-sm">
              <Database className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white font-sans text-sm">Memory Portal</span>
              <span className="hidden sm:inline rounded bg-[#171b28] px-1.5 py-0.5 text-[10px] font-mono text-slate-400 border border-[#23293c]">
                admin
              </span>
            </div>
          </div>

          <div className="h-4 w-[1px] bg-[#222736]" />

          {/* Project ID Dropdown Menu */}
          <div className="relative" ref={dropdownRef}>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono text-slate-500 hidden md:inline">Partition:</span>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-md border border-[#262c3e] bg-[#141724] px-2.5 py-1 text-xs font-mono text-slate-200 hover:border-cyan-500/50 hover:bg-[#181c2b] transition-colors"
                title="Select Active Project Partition"
              >
                <span className={`h-2 w-2 rounded-full ${getStatusDot(activeProject?.status)}`} />
                <span className="font-semibold text-cyan-300">
                  {activeProject?.id || 'select-project'}
                </span>
                <span className="text-[10px] text-slate-400">
                  ({activeProject?.total_records ?? 0})
                </span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>
            </div>

            {dropdownOpen && (
              <div className="absolute left-0 mt-2 w-80 origin-top-left rounded-xl border border-[#282e42] bg-[#111420] p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95">
                <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Project Partitions</span>
                  <span>{projects.length} Total</span>
                </div>
                <div className="space-y-1 max-h-72 overflow-y-auto">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleChooseProject(p)}
                      className={`flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition-all ${
                        activeProject?.id === p.id
                          ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                          : 'text-slate-300 hover:bg-[#161a27]'
                      }`}
                    >
                      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${getStatusDot(p.status)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-semibold text-white">{p.id}</span>
                          <span className="text-[10px] font-mono text-slate-400">{p.total_records} records</span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400 font-sans">{p.description}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-2 border-t border-[#1e2334] pt-1.5">
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenNewProject();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    <span>+ New Project Partition</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Database-Wide Global Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 text-xs">
          <button
            onClick={() => onSelectTab('home')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === 'home'
                ? 'bg-[#1b2030] text-cyan-300 border border-[#2b334a]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Home className="h-3.5 w-3.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => onSelectTab('table')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === 'table'
                ? 'bg-[#1b2030] text-cyan-300 border border-[#2b334a]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="h-3.5 w-3.5" />
            <span>LanceDB Table</span>
          </button>

          <button
            onClick={() => onSelectTab('rules')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === 'rules'
                ? 'bg-[#1b2030] text-cyan-300 border border-[#2b334a]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
            <span>Rules & Directives</span>
          </button>

          <button
            onClick={() => onSelectTab('maintenance')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === 'maintenance'
                ? 'bg-[#1b2030] text-amber-300 border border-[#2b334a]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>AI Maintenance</span>
          </button>

          <button
            onClick={() => onSelectTab('lab')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === 'lab'
                ? 'bg-[#1b2030] text-violet-300 border border-violet-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FlaskConical className="h-3.5 w-3.5 text-violet-400" />
            <span>QC Lab</span>
          </button>

          <button
            onClick={() => onSelectTab('recent')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === 'recent'
                ? 'bg-[#1b2030] text-cyan-300 border border-[#2b334a]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="h-3.5 w-3.5 text-cyan-400" />
            <span>Recent Memories</span>
          </button>

          <button
            onClick={() => onSelectTab('fastmcp')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
              activeTab === 'fastmcp'
                ? 'bg-[#1b2030] text-purple-300 border border-purple-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="h-3.5 w-3.5 text-purple-400" />
            <span>FastMCP Hub</span>
            <span className="rounded bg-purple-500/20 px-1 py-0.2 text-[9px] font-mono text-purple-300 border border-purple-500/30">
              5 Tools
            </span>
          </button>
        </nav>

        {/* Right: Unified Database Health & Telemetry Status Button */}
        <div className="flex items-center gap-2">
          {onOpenAudit && (
            <button
              onClick={onOpenAudit}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-mono transition-colors border shadow-sm ${
                !hasAlerts
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 animate-pulse'
              }`}
              title="Database Health, Requirements Audit & Real-time Telemetry"
            >
              {!hasAlerts ? (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="font-semibold text-emerald-300">DB Healthy</span>
                  <span className="text-slate-400 text-[10px] hidden lg:inline">• {p50}ms</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  <span className="font-semibold">{auditReport.totalAlerts} Alert{auditReport.totalAlerts === 1 ? '' : 's'}</span>
                  <span className="text-slate-400 text-[10px] hidden lg:inline">• {p50}ms</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Navigation Bar */}
      <div className="md:hidden flex overflow-x-auto border-t border-[#1e2334] bg-[#0c0e15] px-3 py-1.5 gap-2 text-xs">
        <button
          onClick={() => onSelectTab('home')}
          className={`flex items-center gap-1 whitespace-nowrap rounded px-2.5 py-1 ${
            activeTab === 'home' ? 'bg-[#1e2334] text-cyan-300' : 'text-slate-400'
          }`}
        >
          <Home className="h-3.5 w-3.5" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => onSelectTab('table')}
          className={`flex items-center gap-1 whitespace-nowrap rounded px-2.5 py-1 ${
            activeTab === 'table' ? 'bg-[#1e2334] text-cyan-300' : 'text-slate-400'
          }`}
        >
          <Table className="h-3.5 w-3.5" />
          <span>Table</span>
        </button>

        <button
          onClick={() => onSelectTab('rules')}
          className={`flex items-center gap-1 whitespace-nowrap rounded px-2.5 py-1 ${
            activeTab === 'rules' ? 'bg-[#1e2334] text-cyan-300' : 'text-slate-400'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
          <span>Rules</span>
        </button>

        <button
          onClick={() => onSelectTab('maintenance')}
          className={`flex items-center gap-1 whitespace-nowrap rounded px-2.5 py-1 ${
            activeTab === 'maintenance' ? 'bg-[#1e2334] text-amber-300' : 'text-slate-400'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          <span>Maintenance</span>
        </button>

        <button
          onClick={() => onSelectTab('lab')}
          className={`flex items-center gap-1 whitespace-nowrap rounded px-2.5 py-1 ${
            activeTab === 'lab' ? 'bg-[#1e2334] text-violet-300' : 'text-slate-400'
          }`}
        >
          <FlaskConical className="h-3.5 w-3.5 text-violet-400" />
          <span>QC Lab</span>
        </button>

        <button
          onClick={() => onSelectTab('recent')}
          className={`flex items-center gap-1 whitespace-nowrap rounded px-2.5 py-1 ${
            activeTab === 'recent' ? 'bg-[#1e2334] text-cyan-300' : 'text-slate-400'
          }`}
        >
          <Clock className="h-3.5 w-3.5 text-cyan-400" />
          <span>Recent</span>
        </button>

        <button
          onClick={() => onSelectTab('fastmcp')}
          className={`flex items-center gap-1 whitespace-nowrap rounded px-2.5 py-1 ${
            activeTab === 'fastmcp' ? 'bg-[#1e2334] text-purple-300' : 'text-slate-400'
          }`}
        >
          <Cpu className="h-3.5 w-3.5 text-purple-400" />
          <span>FastMCP</span>
        </button>
      </div>
    </header>
  );
};
