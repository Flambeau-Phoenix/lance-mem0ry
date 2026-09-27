import React from 'react';
import { ProjectPartition, TelemetryMetrics } from '../types';
import { CheckCircle2, AlertTriangle, Cpu, Zap, Search, Clock, Info } from 'lucide-react';

interface ProjectStatusTrackerProps {
  project: ProjectPartition | null;
  metrics: TelemetryMetrics | null;
  onRunMaintenanceQuick: () => void;
}

export const ProjectStatusTracker: React.FC<ProjectStatusTrackerProps> = ({
  project,
  metrics,
  onRunMaintenanceQuick,
}) => {
  if (!project) return null;

  // High-contrast accent color styling for status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return {
          bg: 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.35)]',
          dot: 'bg-emerald-400 animate-pulse shadow-[0_0_10px_#10b981]',
          label: 'Active & Verified',
          icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
        };
      case 'syncing':
        return {
          bg: 'bg-cyan-950/80 border-cyan-500/60 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.35)]',
          dot: 'bg-cyan-400 animate-pulse shadow-[0_0_10px_#06b6d4]',
          label: 'FastMCP Synced',
          icon: <Zap className="h-4 w-4 text-cyan-400" />,
        };
      case 'maintenance_due':
        return {
          bg: 'bg-amber-950/80 border-amber-500/70 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.35)]',
          dot: 'bg-amber-400 shadow-[0_0_10px_#f59e0b]',
          label: 'Maintenance Due',
          icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
        };
      case 'indexed':
        return {
          bg: 'bg-violet-950/80 border-violet-500/60 text-violet-300 shadow-[0_0_15px_rgba(168,85,247,0.35)]',
          dot: 'bg-violet-400 shadow-[0_0_10px_#a855f7]',
          label: 'BM25 FTS Indexed',
          icon: <Search className="h-4 w-4 text-violet-400" />,
        };
      default:
        return {
          bg: 'bg-slate-900 border-slate-700 text-slate-300',
          dot: 'bg-slate-400',
          label: 'Online',
          icon: <CheckCircle2 className="h-4 w-4 text-slate-400" />,
        };
    }
  };

  const statusInfo = getStatusBadge(project.status);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-5 pb-3">
      {/* Top Banner Card */}
      <div className="relative overflow-hidden rounded-xl border border-[#232839] bg-[#111420] p-4 sm:p-5 shadow-lg">
        {/* Subtle decorative glow */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-24 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Project Title & High-Contrast Status Badge */}
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans">
                {project.name}
              </h1>

              {/* High-Contrast Status Pill */}
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase font-mono ${statusInfo.bg}`}
              >
                <div className={`h-2 w-2 rounded-full ${statusInfo.dot}`} />
                <span>{statusInfo.label}</span>
              </div>

              {/* Vector Dimensions Badge */}
              <div className="inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-950/40 px-2.5 py-0.5 text-xs font-mono font-medium text-cyan-300">
                <Cpu className="h-3 w-3 text-cyan-400" />
                <span>768-dim float32</span>
              </div>

              {/* Tantivy FTS status */}
              <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-0.5 text-xs font-mono font-medium text-emerald-300">
                <Search className="h-3 w-3 text-emerald-400" />
                <span>Tantivy BM25 FTS Ready</span>
              </div>
            </div>

            {/* Context & Description */}
            <div className="flex items-start gap-2 pt-1">
              <Info className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
                <span className="font-semibold text-white">Project Context: </span>
                {project.description}
              </p>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0 pt-2 lg:pt-0">
            {/* Total Records */}
            <div className="rounded-lg border border-[#262c3e] bg-[#141824] p-2.5 text-left">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Total Vectors</span>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-lg font-bold font-mono text-cyan-400">{project.total_records}</span>
                <span className="text-[10px] text-slate-400 font-mono">records</span>
              </div>
            </div>

            {/* Query Latency */}
            <div className="rounded-lg border border-[#262c3e] bg-[#141824] p-2.5 text-left">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">p50 Latency</span>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-lg font-bold font-mono text-emerald-400">{metrics?.p50_latency_ms ?? 11.8}</span>
                <span className="text-[10px] text-slate-400 font-mono">ms</span>
              </div>
            </div>

            {/* Cache Hit Rate */}
            <div className="rounded-lg border border-[#262c3e] bg-[#141824] p-2.5 text-left">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Cache Hit Rate</span>
              <div className="mt-0.5 flex items-baseline gap-1">
                <span className="text-lg font-bold font-mono text-violet-400">{metrics?.vector_cache_hit_rate ?? 94.2}%</span>
              </div>
            </div>

            {/* Fast Maintenance Trigger */}
            <button
              onClick={onRunMaintenanceQuick}
              className="flex flex-col justify-center items-start rounded-lg border border-amber-500/40 bg-amber-950/20 p-2.5 hover:bg-amber-950/40 hover:border-amber-400 transition-all text-left group"
            >
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Audit Partition</span>
              </span>
              <span className="mt-0.5 text-xs font-semibold text-amber-200 group-hover:text-amber-100">
                Run Dedup Scan
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
