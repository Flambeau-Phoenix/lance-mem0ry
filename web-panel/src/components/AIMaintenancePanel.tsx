import React, { useState, useEffect } from 'react';
import { ProjectPartition, ScheduledMaintenanceTask, MaintenanceRunLog, DuplicateCandidate } from '../types';
import { Sparkles, Play, Clock, CheckCircle, AlertTriangle, ShieldCheck, RefreshCw, Layers, Cpu, Check, AlertCircle, Trash2 } from 'lucide-react';
import { safeFetchJson } from '../utils/apiClient';

interface AIMaintenancePanelProps {
  project: ProjectPartition;
  onRefreshProject: () => void;
}

export const AIMaintenancePanel: React.FC<AIMaintenancePanelProps> = ({
  project,
  onRefreshProject,
}) => {
  const [tasks, setTasks] = useState<ScheduledMaintenanceTask[]>([]);
  const [logs, setLogs] = useState<MaintenanceRunLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeRunningTask, setActiveRunningTask] = useState<string | null>(null);
  const [runningFeedback, setRunningFeedback] = useState<string | null>(null);

  // Deduplication scan state
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [isScanningDedup, setIsScanningDedup] = useState(false);
  const [dedupThreshold, setDedupThreshold] = useState(0.35);

  // New task modal
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskFreq, setTaskFreq] = useState<'hourly' | 'nightly' | 'weekly'>('nightly');
  const [taskType, setTaskType] = useState<'dedup_scan' | 'blueprint_audit' | 'category_consistency' | 'fts_reindex'>('dedup_scan');
  const [taskProvider, setTaskProvider] = useState<'local_ollama' | 'cloud_gemini'>('local_ollama');

  const fetchTasksAndLogs = async () => {
    setIsLoading(true);
    try {
      const data = await safeFetchJson<any>('/api/maintenance/tasks');
      if (data) {
        setTasks(data.tasks || []);
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.warn('Maintenance tasks fetch deferred:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasksAndLogs();
  }, []);

  const handleRunTask = async (task: ScheduledMaintenanceTask) => {
    setActiveRunningTask(task.id);
    setRunningFeedback(`AI Engine executing ${task.name} on partition "${project.name}"...`);
    try {
      const res = await fetch(`/api/maintenance/run/${task.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id }),
      });
      const logEntry: MaintenanceRunLog = await res.json();
      setLogs(prev => [logEntry, ...prev]);
      setRunningFeedback(`Task "${task.name}" completed successfully. ${logEntry.summary}`);
      onRefreshProject();
      setTimeout(() => setRunningFeedback(null), 5000);
    } catch (err) {
      setRunningFeedback(`Error running task ${task.name}`);
    } finally {
      setActiveRunningTask(null);
    }
  };

  const handleToggleTask = async (taskId: string, currentEnabled: boolean) => {
    try {
      const res = await fetch(`/api/maintenance/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      const updated = await res.json();
      setTasks(prev => prev.map(t => (t.id === taskId ? updated : t)));
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const handleRunDedupScan = async () => {
    setIsScanningDedup(true);
    setDuplicates([]);
    try {
      const res = await fetch(`/api/projects/${project.id}/dedup-scan?threshold=${dedupThreshold}`, {
        method: 'POST',
      });
      const data = await res.json();
      setDuplicates(data.duplicate_candidates || []);
    } catch (err) {
      console.error('Dedup scan failed:', err);
    } finally {
      setIsScanningDedup(false);
    }
  };

  const handleArchiveDuplicate = async (recordId: string) => {
    try {
      await fetch(`/api/projects/${project.id}/memories/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      setDuplicates(prev => prev.filter(d => d.mem1.record_id !== recordId && d.mem2.record_id !== recordId));
      onRefreshProject();
    } catch (err) {
      console.error('Failed to archive duplicate:', err);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim() || !taskDesc.trim()) return;

    try {
      const res = await fetch('/api/maintenance/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: taskName.trim(),
          description: taskDesc.trim(),
          frequency: taskFreq,
          task_type: taskType,
          scope: project.id,
          ai_provider: taskProvider,
        }),
      });
      const created = await res.json();
      setTasks(prev => [...prev, created]);
      setIsScheduleModalOpen(false);
      setTaskName('');
      setTaskDesc('');
    } catch (err) {
      console.error('Failed to schedule maintenance:', err);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 space-y-6">
      {/* Top Banner: Local & Cloud AI Configuration */}
      <div className="rounded-xl border border-[#262c3e] bg-gradient-to-r from-[#111420] via-[#161a27] to-[#121622] p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white font-sans">
                  Autonomous Memory Maintenance Engine
                </h2>
                <p className="text-xs text-slate-400">
                  Dual AI Architecture: Local Ollama (<code className="text-cyan-400 font-mono">nomic-embed-text</code>) for zero-cost vector math & Cloud Gemini (<code className="text-violet-400 font-mono">gemini-3.8-flash</code>) for semantic audits.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsScheduleModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[#2b334a] bg-[#171c2b] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-amber-500/50 hover:bg-[#1c2236] transition-all"
            >
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span>Schedule New Routine</span>
            </button>
          </div>
        </div>

        {runningFeedback && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-950/40 p-3 text-xs text-cyan-300 animate-in fade-in">
            <RefreshCw className="h-4 w-4 shrink-0 text-cyan-400 animate-spin" />
            <span>{runningFeedback}</span>
          </div>
        )}
      </div>

      {/* SECTION 1: On-Demand Pairwise Deduplication Lab */}
      <div className="rounded-xl border border-[#232839] bg-[#111420] p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#212638] pb-4">
          <div>
            <h3 className="text-sm font-bold text-white font-sans flex items-center gap-2">
              <Cpu className="h-4 w-4 text-cyan-400" />
              <span>Pairwise Cosine Deduplication Scanner</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Calculates pairwise cosine distances between all 768-dim embeddings in <span className="font-mono text-cyan-300 font-bold">{project.name}</span>. Records with cosine distance &lt; 0.15 represent near-duplicate semantic overlap.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <span>Threshold:</span>
              <select
                value={dedupThreshold}
                onChange={(e) => setDedupThreshold(Number(e.target.value))}
                className="rounded border border-[#262c3e] bg-[#161a27] px-2 py-1 text-xs text-cyan-300 font-mono focus:outline-none"
              >
                <option value={0.15}>0.15 (Strict Near-Duplicates)</option>
                <option value={0.25}>0.25 (Moderate Overlap)</option>
                <option value={0.35}>0.35 (Broad Semantic Proximity)</option>
              </select>
            </div>

            <button
              onClick={handleRunDedupScan}
              disabled={isScanningDedup}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isScanningDedup ? 'animate-spin' : ''}`} />
              <span>{isScanningDedup ? 'Scanning Vectors...' : 'Scan For Duplicates'}</span>
            </button>
          </div>
        </div>

        {/* Scan Results */}
        <div className="mt-4">
          {isScanningDedup ? (
            <div className="p-8 text-center text-xs text-slate-400 font-mono">
              Comparing vector embeddings in LanceDB partition...
            </div>
          ) : duplicates.length > 0 ? (
            <div className="space-y-4">
              <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span>Found {duplicates.length} potential duplicate pair(s):</span>
              </div>
              {duplicates.map((dup) => (
                <div key={dup.pair_id} className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 text-xs font-mono">
                    <span className="text-amber-400 font-bold">
                      Cosine Distance: {dup.cosine_distance} • Similarity: {dup.similarity_pct}%
                    </span>
                    <span className="text-slate-400 text-[11px]">{dup.recommendation}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    {/* Memory 1 */}
                    <div className="rounded border border-[#2b334a] bg-[#141825] p-3 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1.5 border-b border-[#212638]">
                        <span className="font-mono text-cyan-400">Record 1 [{dup.mem1.record_id.slice(0, 8)}]</span>
                        <span className="font-mono text-[10px]">{dup.mem1.category}</span>
                      </div>
                      <p className="text-slate-200 mt-2 font-sans">{dup.mem1.text}</p>
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => handleArchiveDuplicate(dup.mem1.record_id)}
                          className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Archive This Copy</span>
                        </button>
                      </div>
                    </div>

                    {/* Memory 2 */}
                    <div className="rounded border border-[#2b334a] bg-[#141825] p-3 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1.5 border-b border-[#212638]">
                        <span className="font-mono text-violet-400">Record 2 [{dup.mem2.record_id.slice(0, 8)}]</span>
                        <span className="font-mono text-[10px]">{dup.mem2.category}</span>
                      </div>
                      <p className="text-slate-200 mt-2 font-sans">{dup.mem2.text}</p>
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => handleArchiveDuplicate(dup.mem2.record_id)}
                          className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300"
                        >
                          <Trash2 className="h-3 w-3" />
                          <span>Archive This Copy</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-[#212638] bg-[#141824] p-4 text-center text-xs text-slate-400 font-sans">
              Click <span className="font-semibold text-cyan-300">"Scan For Duplicates"</span> to evaluate pairwise semantic distance across the {project.name} vector table.
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: Scheduled Maintenance Routines */}
      <div className="rounded-xl border border-[#232839] bg-[#111420] p-5 shadow-lg">
        <div className="flex items-center justify-between border-b border-[#212638] pb-4">
          <div>
            <h3 className="text-sm font-bold text-white font-sans flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <span>Scheduled Autonomous Routines</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Automated maintenance loops executed by local and cloud AI workers to audit memory consistency and promote verified state.
            </p>
          </div>
        </div>

        <div className="mt-4 divide-y divide-[#1e2334]">
          {tasks.map((task) => (
            <div key={task.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#141824] p-2 rounded-lg transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <span className="font-sans font-bold text-white text-xs sm:text-sm">{task.name}</span>
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase font-semibold ${task.ai_provider === 'cloud_gemini' ? 'border-violet-500/40 bg-violet-950/40 text-violet-300' : 'border-cyan-500/40 bg-cyan-950/40 text-cyan-300'}`}>
                    {task.ai_provider === 'cloud_gemini' ? 'Cloud Gemini' : 'Local Ollama'}
                  </span>
                  <span className="rounded bg-[#1e2333] px-2 py-0.5 text-[10px] font-mono text-slate-400 border border-[#262c3e]">
                    {task.frequency} ({task.cron_expression})
                  </span>
                </div>
                <p className="text-xs text-slate-400 max-w-2xl">{task.description}</p>
                <div className="text-[11px] font-mono text-slate-500 flex items-center gap-3">
                  <span>Last run: {task.last_run_at ? new Date(task.last_run_at).toLocaleString() : 'Never'}</span>
                  <span>Scope: {task.scope}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleToggleTask(task.id, task.enabled)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-mono font-semibold transition-colors ${
                    task.enabled
                      ? 'border border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                      : 'border border-slate-700 bg-slate-800 text-slate-400'
                  }`}
                >
                  {task.enabled ? 'Enabled' : 'Paused'}
                </button>

                <button
                  onClick={() => handleRunTask(task)}
                  disabled={activeRunningTask === task.id}
                  className="flex items-center gap-1.5 rounded-lg bg-[#202638] px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-[#283046] transition-colors border border-[#2b334a] disabled:opacity-50"
                >
                  <Play className={`h-3 w-3 ${activeRunningTask === task.id ? 'animate-spin' : ''}`} />
                  <span>Run Now</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3: Historical Maintenance Logs */}
      <div className="rounded-xl border border-[#232839] bg-[#111420] p-5 shadow-lg">
        <h3 className="text-sm font-bold text-white font-sans flex items-center gap-2 border-b border-[#212638] pb-3">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Audit Trail & Execution History</span>
        </h3>

        <div className="mt-4 space-y-3">
          {logs.slice(0, 6).map((log) => (
            <div key={log.id} className="rounded-lg border border-[#23283a] bg-[#141825] p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 text-[11px] font-mono text-slate-400 border-b border-[#1f2434]">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{log.task_name}</span>
                  <span className="text-cyan-400 font-mono">[{log.project_id}]</span>
                  <span className="text-slate-500">{new Date(log.executed_at).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{log.duration_ms}ms</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase font-bold ${log.status === 'success' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40' : 'bg-amber-950 text-amber-400 border border-amber-500/40'}`}>
                    {log.status}
                  </span>
                </div>
              </div>

              <p className="mt-2 text-slate-200 font-sans leading-relaxed">{log.summary}</p>

              {log.details && log.details.length > 0 && (
                <ul className="mt-2 list-disc list-inside space-y-0.5 text-[11px] text-slate-400 font-sans">
                  {log.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Schedule Routine Modal */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#2b334a] bg-[#121520] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white font-sans">
              Schedule New AI Maintenance Routine
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Configure scheduled background audits to keep vector embeddings, categories, and blueprints clean.
            </p>

            <form onSubmit={handleCreateSchedule} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Routine Name
                </label>
                <input
                  type="text"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="e.g. Weekly Blueprint Ratification Audit"
                  className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  placeholder="Explains what this routine validates."
                  className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Frequency
                  </label>
                  <select
                    value={taskFreq}
                    onChange={(e) => setTaskFreq(e.target.value as any)}
                    className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2 text-xs text-slate-200 font-mono focus:outline-none"
                  >
                    <option value="hourly">Hourly (0 * * * *)</option>
                    <option value="nightly">Nightly (0 3 * * *)</option>
                    <option value="weekly">Weekly (0 4 * * 0)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    AI Worker Provider
                  </label>
                  <select
                    value={taskProvider}
                    onChange={(e) => setTaskProvider(e.target.value as any)}
                    className="w-full rounded-lg border border-[#272d40] bg-[#161a27] p-2 text-xs text-slate-200 font-mono focus:outline-none"
                  >
                    <option value="local_ollama">Local Ollama (nomic-embed-text)</option>
                    <option value="cloud_gemini">Cloud Gemini (gemini-3.8-flash)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#222736]">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="rounded-lg border border-[#282e42] bg-[#161926] px-3.5 py-2 text-xs font-medium text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
