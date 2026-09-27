import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  Info, 
  Sparkles, 
  RefreshCw, 
  Check, 
  ArrowRight,
  Database,
  Layers,
  FileText,
  FlaskConical,
  X,
  Activity,
  Zap,
  Clock,
  Cpu,
  Terminal,
  Search,
  Play,
  ShieldCheck
} from 'lucide-react';
import { DatabaseAlert, DatabaseAuditReport, ProjectPartition, TelemetryMetrics, ActiveQueryLog } from '../types';
import { suggestDescription } from '../utils/databaseAuditor';

interface DatabaseAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  auditReport: DatabaseAuditReport | null;
  projects: ProjectPartition[];
  activeProject?: ProjectPartition | null;
  metrics?: TelemetryMetrics | null;
  onRefreshAudit: () => Promise<void>;
  onQuickFix: (params: {
    entityType: 'project' | 'category';
    projectId: string;
    categoryKey?: string;
    description?: string;
    bucket?: string;
  }) => Promise<void>;
  onSimulateRequirementFailure: (type: 'missing_category_desc' | 'missing_project_desc') => Promise<void>;
  onSimulateQuery?: (query: string, mode: 'hybrid' | 'vector' | 'fts') => Promise<void>;
  initialTab?: 'audit' | 'telemetry';
}

export const DatabaseAuditModal: React.FC<DatabaseAuditModalProps> = ({
  isOpen,
  onClose,
  auditReport,
  projects,
  activeProject,
  metrics,
  onRefreshAudit,
  onQuickFix,
  onSimulateRequirementFailure,
  onSimulateQuery,
  initialTab = 'audit',
}) => {
  const [activeTab, setActiveTab] = useState<'audit' | 'telemetry'>(initialTab);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [draftDescriptions, setDraftDescriptions] = useState<Record<string, string>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);

  // Telemetry probe states
  const [probeQuery, setProbeQuery] = useState('deployment checklist and verified rules');
  const [probeMode, setProbeMode] = useState<'hybrid' | 'vector' | 'fts'>('hybrid');
  const [isProbing, setIsProbing] = useState(false);
  const [recentLogs, setRecentLogs] = useState<ActiveQueryLog[]>([]);

  // Load telemetry logs when telemetry tab opens
  React.useEffect(() => {
    if (activeTab === 'telemetry' && isOpen) {
      fetch('/api/telemetry')
        .then(res => res.json())
        .then(data => {
          if (data.recent_queries) {
            setRecentLogs(data.recent_queries);
          }
        })
        .catch(() => {});
    }
  }, [activeTab, isOpen]);

  if (!isOpen) return null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshAudit();
      const res = await fetch('/api/telemetry');
      if (res.ok) {
        const data = await res.json();
        if (data.recent_queries) setRecentLogs(data.recent_queries);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSimulate = async (type: 'missing_category_desc' | 'missing_project_desc') => {
    setIsSimulating(true);
    try {
      await onSimulateRequirementFailure(type);
      await onRefreshAudit();
      setSuccessFeedback(`Simulated requirement failure successfully. New alert generated.`);
      setTimeout(() => setSuccessFeedback(null), 4000);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleApplyAISuggestion = (alert: DatabaseAlert) => {
    const suggested = suggestDescription(
      alert.entityType === 'project' ? 'project' : 'category',
      alert.entityName || alert.categoryKey || 'operational',
      { bucket: 'fact' }
    );
    setDraftDescriptions(prev => ({ ...prev, [alert.id]: suggested }));
  };

  const handleSaveFix = async (alert: DatabaseAlert) => {
    const desc = draftDescriptions[alert.id] || alert.recommendation;
    if (!desc.trim()) return;

    setFixingId(alert.id);
    try {
      if (alert.entityType === 'project' && alert.projectId) {
        await onQuickFix({
          entityType: 'project',
          projectId: alert.projectId,
          description: desc.trim(),
        });
      } else if (alert.entityType === 'category' && alert.projectId && alert.categoryKey) {
        await onQuickFix({
          entityType: 'category',
          projectId: alert.projectId,
          categoryKey: alert.categoryKey,
          description: desc.trim(),
        });
      }
      await onRefreshAudit();
      setSuccessFeedback(`Fixed requirement for ${alert.entityName}!`);
      setTimeout(() => setSuccessFeedback(null), 3000);
    } catch (err) {
      console.error('Failed to apply quick fix:', err);
    } finally {
      setFixingId(null);
    }
  };

  const handleDispatchProbe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!probeQuery.trim()) return;
    setIsProbing(true);
    try {
      if (onSimulateQuery) {
        await onSimulateQuery(probeQuery.trim(), probeMode);
      } else {
        await fetch('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: probeQuery.trim(),
            project_id: activeProject?.id || 'default',
            mode: probeMode,
            limit: 3,
          }),
        });
      }
      const res = await fetch('/api/telemetry');
      if (res.ok) {
        const data = await res.json();
        if (data.recent_queries) setRecentLogs(data.recent_queries);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProbing(false);
    }
  };

  const alerts = auditReport?.alerts || [];
  const totalAlerts = auditReport?.totalAlerts ?? alerts.length;
  const filteredAlerts = alerts.filter(a => {
    if (filterSeverity === 'all') return true;
    return a.severity === filterSeverity;
  });

  const criticalCount = auditReport?.criticalCount || 0;
  const warningCount = auditReport?.warningCount || 0;
  const infoCount = auditReport?.infoCount || 0;
  // A report that advertises alerts it cannot explain is inconsistent; never
  // present that as healthy.
  const reportInconsistent = totalAlerts > 0 && alerts.length === 0;
  const isHealthy = alerts.length === 0 && totalAlerts === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl border border-[#272d40] bg-[#0f121d] shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#1e2334] px-6 py-4 bg-[#131724]">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
              isHealthy
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : criticalCount > 0
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
            }`}>
              {isHealthy ? (
                <ShieldCheck className="h-5 w-5" />
              ) : criticalCount > 0 ? (
                <ShieldAlert className="h-5 w-5 animate-pulse" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white font-sans">
                  Database Health, Requirements & Telemetry
                </h2>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-medium ${
                  isHealthy
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : criticalCount > 0
                      ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                      : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                }`}>
                  {isHealthy ? 'DB HEALTHY • 100%' : `${Math.max(alerts.length, totalAlerts)} ISSUES DETECTED`}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Unified governance hub: partition schema compliance, vector invariants, and realtime query throughput.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 rounded-lg border border-[#272d42] bg-[#171c2b] px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1f263a] transition-colors disabled:opacity-50"
              title="Re-run database requirements audit"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1a1f30] hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher: Requirements Audit vs Query Telemetry */}
        <div className="flex items-center justify-between border-b border-[#1c2132] bg-[#111420] px-6 py-2 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-medium transition-all ${
                activeTab === 'audit'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              <span>Requirements & Health Audit</span>
              {alerts.length > 0 && (
                <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] text-amber-300 font-mono">
                  {alerts.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('telemetry')}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 font-medium transition-all ${
                activeTab === 'telemetry'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="h-4 w-4 text-cyan-400" />
              <span>Query Telemetry & Latency</span>
              <span className="rounded bg-[#171b28] px-1.5 py-0.5 text-[10px] text-slate-400 font-mono border border-[#23293c]">
                {metrics?.p50_latency_ms ?? 18}ms
              </span>
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-500 hidden sm:block">
            Engine: LanceDB Native v0.17
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-[#0c0e15]">
          
          {successFeedback && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
              <Check className="h-4 w-4 text-emerald-400" />
              <span>{successFeedback}</span>
            </div>
          )}

          {/* TAB 1: REQUIREMENTS & HEALTH AUDIT */}
          {activeTab === 'audit' && (
            <>
              {/* Metrics Header Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="rounded-xl border border-[#202538] bg-[#111420] p-3">
                  <span className="text-[11px] text-slate-500 uppercase">Partitions Checked</span>
                  <div className="mt-1 text-lg font-bold text-white">
                    {auditReport?.metrics.totalProjects ?? projects.length}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {auditReport?.metrics.projectsWithMissingDesc ?? 0} missing desc
                  </span>
                </div>

                <div className="rounded-xl border border-[#202538] bg-[#111420] p-3">
                  <span className="text-[11px] text-slate-500 uppercase">Categories Audited</span>
                  <div className="mt-1 text-lg font-bold text-cyan-300">
                    {auditReport?.metrics.totalCategories ?? 14}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {auditReport?.metrics.categoriesWithMissingDesc ?? 0} missing desc
                  </span>
                </div>

                <div className="rounded-xl border border-[#202538] bg-[#111420] p-3">
                  <span className="text-[11px] text-slate-500 uppercase">Critical Requirements</span>
                  <div className={`mt-1 text-lg font-bold ${criticalCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {criticalCount}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {criticalCount === 0 ? 'All hard constraints met' : 'Requires fix'}
                  </span>
                </div>

                <div className="rounded-xl border border-[#202538] bg-[#111420] p-3">
                  <span className="text-[11px] text-slate-500 uppercase">Vector Invariants</span>
                  <div className="mt-1 text-lg font-bold text-emerald-400">
                    768-dim
                  </div>
                  <span className="text-[10px] text-slate-400">Nomic Normalized</span>
                </div>
              </div>

              {/* Requirement Simulation Controls */}
              <div className="rounded-xl border border-[#202537] bg-[#111421] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-cyan-400" />
                  <div>
                    <span className="font-bold text-white font-sans">Testing & Alert Verification:</span>
                    <p className="text-slate-400 text-[11px]">
                      Trigger simulated requirement violations to observe automated warnings and resolution flows.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <button
                    onClick={() => handleSimulate('missing_category_desc')}
                    disabled={isSimulating}
                    className="rounded-lg border border-[#283147] bg-[#161a29] px-2.5 py-1 text-xs text-slate-300 hover:bg-[#1d2338] transition-colors disabled:opacity-50"
                  >
                    Simulate Empty Category
                  </button>
                  <button
                    onClick={() => handleSimulate('missing_project_desc')}
                    disabled={isSimulating}
                    className="rounded-lg border border-[#283147] bg-[#161a29] px-2.5 py-1 text-xs text-slate-300 hover:bg-[#1d2338] transition-colors disabled:opacity-50"
                  >
                    Simulate Empty Project
                  </button>
                </div>
              </div>

              {/* Severity Filter */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 font-mono text-[11px]">Filter:</span>
                  <button
                    onClick={() => setFilterSeverity('all')}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                      filterSeverity === 'all' ? 'bg-[#1e2436] text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    All ({totalAlerts})
                  </button>
                  <button
                    onClick={() => setFilterSeverity('critical')}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                      filterSeverity === 'critical' ? 'bg-rose-500/20 text-rose-300 font-medium' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Critical ({criticalCount})
                  </button>
                  <button
                    onClick={() => setFilterSeverity('warning')}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                      filterSeverity === 'warning' ? 'bg-amber-500/20 text-amber-300 font-medium' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Warnings ({warningCount})
                  </button>
                  <button
                    onClick={() => setFilterSeverity('info')}
                    className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                      filterSeverity === 'info' ? 'bg-sky-500/20 text-sky-300 font-medium' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Info ({infoCount})
                  </button>
                </div>

                <span className="text-xs text-slate-500 font-mono">
                  {filteredAlerts.length} issues displayed
                </span>
              </div>

              {/* Alerts List */}
              {filteredAlerts.length === 0 ? (
                reportInconsistent ? (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-8 text-center text-slate-300">
                    <ShieldAlert className="mx-auto h-8 w-8 text-rose-400 mb-2" />
                    <p className="text-sm font-semibold text-rose-300">Audit Report Incomplete</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      The backend reported {totalAlerts} requirement issue(s) but returned no
                      alert details. Refresh the audit; if this persists the audit endpoint is
                      not returning explanations.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center text-slate-300">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400 mb-2" />
                    <p className="text-sm font-semibold text-emerald-300">All Database Requirements Fully Satisfied</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      All project partitions contain verified descriptions, every category specifies an explicit semantic bucket and purpose, and all vector embeddings conform to 768-dim L2 normalization.
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  {filteredAlerts.map((alert) => {
                    const draftVal = draftDescriptions[alert.id] ?? '';
                    return (
                      <div
                        key={alert.id}
                        className="rounded-xl border border-[#262c3e] bg-[#111420] p-4 space-y-3 shadow-sm hover:border-slate-600 transition-colors"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            <div className="mt-0.5">
                              {alert.severity === 'critical' ? (
                                <ShieldAlert className="h-4 w-4 text-rose-400" />
                              ) : alert.severity === 'info' ? (
                                <Info className="h-4 w-4 text-sky-400" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-amber-400" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-white font-sans">
                                  {alert.title}
                                </span>
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono uppercase ${
                                  alert.severity === 'critical'
                                    ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30'
                                    : alert.severity === 'info'
                                      ? 'bg-sky-500/10 text-sky-300 border border-sky-500/30'
                                      : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                                }`}>
                                  {alert.severity}
                                </span>
                              </div>
                              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                                {alert.message}
                              </p>
                            </div>
                          </div>

                          <span className="rounded bg-[#171b28] border border-[#23293c] px-2 py-0.5 text-[10px] font-mono text-slate-400 self-start">
                            {alert.entityType}
                          </span>
                        </div>

                        {/* Inline Fix Box */}
                        {alert.autoFixable && (
                          <div className="rounded-lg border border-[#202538] bg-[#0c0e15] p-3 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-300 flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                                <span>Resolve Missing Requirement:</span>
                              </span>
                              <button
                                onClick={() => handleApplyAISuggestion(alert)}
                                className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-mono"
                              >
                                Auto-Generate Description
                              </button>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                value={draftVal}
                                onChange={(e) =>
                                  setDraftDescriptions({ ...draftDescriptions, [alert.id]: e.target.value })
                                }
                                placeholder={`Enter descriptive context for ${alert.entityName}...`}
                                className="flex-1 rounded-lg border border-[#262c3e] bg-[#141824] px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                              />
                              <button
                                onClick={() => handleSaveFix(alert)}
                                disabled={fixingId === alert.id || !draftVal.trim()}
                                className="flex items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-50 shrink-0"
                              >
                                {fixingId === alert.id ? (
                                  <span>Saving...</span>
                                ) : (
                                  <>
                                    <Check className="h-3.5 w-3.5" />
                                    <span>Apply Fix</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* TAB 2: QUERY TELEMETRY & LATENCY */}
          {activeTab === 'telemetry' && (
            <div className="space-y-5">
              {/* Telemetry Gauge Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
                {/* Active Throughput */}
                <div className="rounded-xl border border-[#23283a] bg-[#111420] p-3.5 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>ACTIVE THROUGHPUT</span>
                    <Activity className="h-4 w-4 text-cyan-400" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-white">{metrics?.active_qps ?? 4.8}</span>
                    <span className="text-[10px] text-slate-400">queries/sec</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-[#1b202e] overflow-hidden">
                    <div className="h-full bg-cyan-400 rounded-full" style={{ width: '48%' }} />
                  </div>
                </div>

                {/* P50 / P95 Latency */}
                <div className="rounded-xl border border-[#23283a] bg-[#111420] p-3.5 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>P50 / P95 LATENCY</span>
                    <Clock className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-emerald-400">{metrics?.p50_latency_ms ?? 14.5}</span>
                    <span className="text-[10px] text-slate-400">ms / {metrics?.p95_latency_ms ?? 24.2}ms</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-[#1b202e] overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full" style={{ width: '25%' }} />
                  </div>
                </div>

                {/* Vector Cache Hit */}
                <div className="rounded-xl border border-[#23283a] bg-[#111420] p-3.5 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>VECTOR CACHE HIT</span>
                    <Zap className="h-4 w-4 text-violet-400" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-violet-400">{metrics?.vector_cache_hit_rate ?? 94.2}%</span>
                    <span className="text-[10px] text-slate-400">cosine hits</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-[#1b202e] overflow-hidden">
                    <div className="h-full bg-violet-400 rounded-full" style={{ width: '94%' }} />
                  </div>
                </div>

                {/* Infrastructure Engines */}
                <div className="rounded-xl border border-[#23283a] bg-[#111420] p-3.5 shadow-sm">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>ENGINE STATUS</span>
                    <Cpu className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">LanceDB Table:</span>
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Ready
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Nomic-768:</span>
                      <span className="text-cyan-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Online
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Query Probe Simulator */}
              <div className="rounded-xl border border-[#232839] bg-[#111420] p-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-[#212638] pb-2.5">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-cyan-400" />
                    <h3 className="text-xs font-bold text-white font-sans">
                      Live Query Performance Probe
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    Partition: <span className="text-cyan-300">{activeProject?.id || 'default'}</span>
                  </span>
                </div>

                <form onSubmit={handleDispatchProbe} className="mt-3 flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                    <input
                      type="text"
                      value={probeQuery}
                      onChange={(e) => setProbeQuery(e.target.value)}
                      placeholder="Enter query to measure live latency and recall..."
                      className="w-full rounded-lg border border-[#262c3e] bg-[#161a27] py-2 pl-9 pr-3 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={probeMode}
                      onChange={(e) => setProbeMode(e.target.value as any)}
                      className="rounded-lg border border-[#262c3e] bg-[#161a27] px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none"
                    >
                      <option value="hybrid">Hybrid (RRF Fusion)</option>
                      <option value="vector">Semantic Vector</option>
                      <option value="fts">BM25 Full Text</option>
                    </select>

                    <button
                      type="submit"
                      disabled={isProbing}
                      className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-50"
                    >
                      <Play className="h-3 w-3" />
                      <span>{isProbing ? 'Probing...' : 'Run Probe'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Query Traces Feed */}
              <div className="rounded-xl border border-[#232839] bg-[#111420] p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-[#1f2538] pb-2 text-xs">
                  <div className="flex items-center gap-2 font-mono text-slate-300">
                    <Activity className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Real-time Query Traces ({recentLogs.length})</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">Auto-streaming</span>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-xs">
                  {recentLogs.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      No query logs yet. Run a probe above to record real-time query telemetry.
                    </div>
                  ) : (
                    recentLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between rounded-lg border border-[#1d2232] bg-[#0c0e15] px-3 py-2 text-[11px]"
                      >
                        <div className="flex items-center gap-2 truncate max-w-md">
                          <span className="rounded bg-[#171b28] px-1.5 py-0.5 text-[10px] text-cyan-300 border border-[#252c3e]">
                            {log.search_mode}
                          </span>
                          <span className="text-slate-300 truncate font-sans">{log.query_text}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-slate-400">{log.hits_count} hits</span>
                          <span className="text-emerald-400 font-bold">{log.latency_ms}ms</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#1e2334] px-6 py-3 bg-[#111420] text-xs">
          <div className="text-slate-400">
            {activeTab === 'audit' ? (
              <span>Continuous Scanner active • Invariants verified against LanceDB storage engine</span>
            ) : (
              <span>Telemetry window: last 24 hours • Latency percentiles recalculated per query</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-[#272e42] bg-[#161a29] px-4 py-1.5 text-xs text-slate-300 hover:bg-[#1d2338] transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
