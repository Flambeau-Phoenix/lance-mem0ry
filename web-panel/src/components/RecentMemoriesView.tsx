import React, { useState, useEffect, useMemo } from 'react';
import { LanceMemoryRecord, ProjectPartition, SemanticBucket } from '../types';
import { 
  Clock, 
  Search, 
  Filter, 
  ShieldCheck, 
  Sparkles, 
  Database, 
  ExternalLink, 
  Edit3, 
  ArrowUpRight, 
  Layers, 
  Tag, 
  CheckCircle2, 
  RefreshCw,
  Folder
} from 'lucide-react';
import { safeFetchJson } from '../utils/apiClient';
import { INITIAL_MEMORIES } from '../initialData';

interface RecentMemoriesViewProps {
  projects: ProjectPartition[];
  onSelectProject: (p: ProjectPartition) => void;
  onNavigateToTable: (projectId: string) => void;
  onViewDetails: (memory: LanceMemoryRecord) => void;
  onEditMemory: (memory: LanceMemoryRecord) => void;
}

export const RecentMemoriesView: React.FC<RecentMemoriesViewProps> = ({
  projects,
  onSelectProject,
  onNavigateToTable,
  onViewDetails,
  onEditMemory,
}) => {
  const [recentMemories, setRecentMemories] = useState<LanceMemoryRecord[]>(() => INITIAL_MEMORIES);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedBucket, setSelectedBucket] = useState<string>('all');
  const [selectedVerified, setSelectedVerified] = useState<'all' | 'verified' | 'unverified'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRecent = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '50');
      if (selectedProjectId !== 'all') params.append('project_id', selectedProjectId);
      if (selectedBucket !== 'all') params.append('bucket', selectedBucket);
      if (selectedVerified === 'verified') params.append('verified', 'true');
      if (selectedVerified === 'unverified') params.append('verified', 'false');

      const data = await safeFetchJson<{ recent: LanceMemoryRecord[] }>(`/api/memories/recent?${params.toString()}`);
      if (data && Array.isArray(data.recent)) {
        setRecentMemories(data.recent);
      } else {
        // Fallback filter over initial memories
        let filtered = [...INITIAL_MEMORIES];
        if (selectedProjectId !== 'all') filtered = filtered.filter(m => m.project_id === selectedProjectId);
        if (selectedBucket !== 'all') filtered = filtered.filter(m => m.bucket === selectedBucket);
        if (selectedVerified === 'verified') filtered = filtered.filter(m => m.verified);
        if (selectedVerified === 'unverified') filtered = filtered.filter(m => !m.verified);
        setRecentMemories(filtered);
      }
    } catch (err) {
      console.warn('Recent memories sync deferred (using cache):', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecent();
  }, [selectedProjectId, selectedBucket, selectedVerified]);

  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return recentMemories;
    const q = searchQuery.toLowerCase();
    return recentMemories.filter((m) => {
      const matchText = m.text?.toLowerCase().includes(q);
      const matchSymbol = m.symbol?.toLowerCase().includes(q);
      const matchTag = Array.isArray(m.tags) && m.tags.some((t) => t.toLowerCase().includes(q));
      const matchCat = m.category?.toLowerCase().includes(q);
      return matchText || matchSymbol || matchTag || matchCat;
    });
  }, [recentMemories, searchQuery]);

  const formatRelativeTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return 'Yesterday';
      return `${diffDays}d ago`;
    } catch {
      return timestamp;
    }
  };

  const getBucketColor = (bucket: SemanticBucket) => {
    switch (bucket) {
      case 'fact':
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
      case 'decision':
        return 'border-violet-500/30 bg-violet-500/10 text-violet-300';
      case 'state':
        return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
      default:
        return 'border-slate-700 bg-slate-800 text-slate-300';
    }
  };

  const handleJumpToProject = (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (proj) {
      onSelectProject(proj);
    }
    onNavigateToTable(projectId);
  };

  const totalVerified = recentMemories.filter(m => m.verified).length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5 space-y-5">
      {/* Header Banner */}
      <div className="rounded-2xl border border-[#23293c] bg-[#111420] p-5 sm:p-6 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight font-sans">
                  Recently Added & Updated Memories
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Database-wide timeline of vector records across all partitions and agent sessions.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              onClick={fetchRecent}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-lg border border-[#272e42] bg-[#141824] px-3 py-1.5 text-xs text-slate-300 hover:bg-[#1a2030] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Feed</span>
            </button>
          </div>
        </div>

        {/* Global Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-[#1e2434] text-xs">
          <div className="rounded-xl border border-[#1f2537] bg-[#0c0e15] p-3">
            <span className="text-[11px] font-mono text-slate-500 uppercase">Recent Feed Count</span>
            <div className="mt-1 text-lg font-bold font-mono text-cyan-300">{recentMemories.length}</div>
          </div>
          <div className="rounded-xl border border-[#1f2537] bg-[#0c0e15] p-3">
            <span className="text-[11px] font-mono text-slate-500 uppercase">Verified Records</span>
            <div className="mt-1 text-lg font-bold font-mono text-emerald-400">{totalVerified}</div>
          </div>
          <div className="rounded-xl border border-[#1f2537] bg-[#0c0e15] p-3">
            <span className="text-[11px] font-mono text-slate-500 uppercase">Active Partitions</span>
            <div className="mt-1 text-lg font-bold font-mono text-white">{projects.length}</div>
          </div>
          <div className="rounded-xl border border-[#1f2537] bg-[#0c0e15] p-3">
            <span className="text-[11px] font-mono text-slate-500 uppercase">Embedding Dim</span>
            <div className="mt-1 text-lg font-bold font-mono text-slate-300">768-dim</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-[#22283a] bg-[#111420] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search recent records by symbol, keyword, or tag..."
              className="w-full rounded-lg border border-[#262c3e] bg-[#141824] py-2 pl-9 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Project Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[11px] font-mono">Partition:</span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="rounded-lg border border-[#262c3e] bg-[#141824] px-2.5 py-1.5 text-xs font-mono text-cyan-300 focus:border-cyan-500 focus:outline-none"
              >
                <option value="all">All Partitions</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} ({p.total_records})
                  </option>
                ))}
              </select>
            </div>

            {/* Bucket Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[11px] font-mono">Bucket:</span>
              <select
                value={selectedBucket}
                onChange={(e) => setSelectedBucket(e.target.value)}
                className="rounded-lg border border-[#262c3e] bg-[#141824] px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="all">All Buckets</option>
                <option value="fact">fact</option>
                <option value="decision">decision</option>
                <option value="state">state</option>
              </select>
            </div>

            {/* Verification Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[11px] font-mono">Status:</span>
              <select
                value={selectedVerified}
                onChange={(e) => setSelectedVerified(e.target.value as any)}
                className="rounded-lg border border-[#262c3e] bg-[#141824] px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="all">All Records</option>
                <option value="verified">Verified Only</option>
                <option value="unverified">Draft / Blueprint</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Memory Feed List */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center font-mono text-xs text-slate-500">
          Loading recent memory records...
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="rounded-xl border border-[#212638] bg-[#111420] p-12 text-center text-slate-400">
          <Clock className="mx-auto h-8 w-8 text-slate-600 mb-2" />
          <p className="text-sm font-semibold text-slate-300">No recent memory records found</p>
          <p className="text-xs text-slate-500 mt-1">Try relaxing the search filter or add new records in a project partition.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredMemories.map((memory) => {
            const timeAgo = formatRelativeTime(memory.updated_at || memory.created_at);
            return (
              <div
                key={memory.record_id}
                className="group rounded-xl border border-[#202638] bg-[#111420] p-4 hover:border-cyan-500/40 hover:bg-[#131726] transition-all shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1b2030] pb-2.5 mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Project Partition Tag */}
                    <button
                      onClick={() => handleJumpToProject(memory.project_id)}
                      className="flex items-center gap-1 rounded bg-[#181d2c] border border-[#283146] px-2 py-0.5 text-[11px] font-mono text-cyan-300 hover:border-cyan-500/50 transition-colors"
                      title="Jump to this project's table"
                    >
                      <Database className="h-3 w-3 text-cyan-400" />
                      <span>{memory.project_id}</span>
                      <ArrowUpRight className="h-2.5 w-2.5 text-slate-500" />
                    </button>

                    {/* Symbol */}
                    <span className="font-mono text-xs font-semibold text-white">
                      {memory.symbol || 'unnamed_symbol'}
                    </span>

                    {/* Category */}
                    <span className="rounded bg-[#161a27] px-2 py-0.5 text-[11px] font-mono text-slate-400 border border-[#242a3e]">
                      {memory.category}
                    </span>

                    {/* Bucket */}
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase ${getBucketColor(memory.bucket)}`}>
                      {memory.bucket}
                    </span>

                    {/* Verified Shield */}
                    {memory.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                        Draft Blueprint
                      </span>
                    )}
                  </div>

                  {/* Relative timestamp */}
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                    <Clock className="h-3 w-3 text-slate-500" />
                    <span>{timeAgo}</span>
                  </div>
                </div>

                {/* Memory Content Text */}
                <p className="text-xs text-slate-200 font-sans leading-relaxed line-clamp-3">
                  {memory.text}
                </p>

                {/* Footer with Tags and Action Buttons */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#181d2c] text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {memory.agent_id && (
                      <span className="text-[10px] font-mono text-slate-500">
                        Agent: <span className="text-slate-400">{memory.agent_id}</span>
                      </span>
                    )}
                    {Array.isArray(memory.tags) && memory.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-[#161926] px-1.5 py-0.5 text-[10px] font-mono text-slate-400 border border-[#21273a]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onViewDetails(memory)}
                      className="flex items-center gap-1 rounded border border-[#252c3e] bg-[#141824] px-2.5 py-1 text-xs text-slate-300 hover:bg-[#1c2234] hover:text-white transition-colors"
                    >
                      <ExternalLink className="h-3 w-3 text-slate-400" />
                      <span>Inspect</span>
                    </button>

                    <button
                      onClick={() => onEditMemory(memory)}
                      className="flex items-center gap-1 rounded border border-[#252c3e] bg-[#141824] px-2.5 py-1 text-xs text-slate-300 hover:bg-[#1c2234] hover:text-white transition-colors"
                    >
                      <Edit3 className="h-3 w-3 text-slate-400" />
                      <span>Edit</span>
                    </button>

                    <button
                      onClick={() => handleJumpToProject(memory.project_id)}
                      className="flex items-center gap-1 rounded bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 text-xs text-cyan-300 hover:bg-cyan-500/20 transition-colors"
                    >
                      <span>Go to Table</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
