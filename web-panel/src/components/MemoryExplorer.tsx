import React, { useState, useMemo } from 'react';
import { LanceMemoryRecord, ProjectPartition, SemanticBucket } from '../types';
import { MemoryCard } from './MemoryCard';
import { Search, Filter, ShieldCheck, Clock, SlidersHorizontal, Download, Sparkles, Database, Layers } from 'lucide-react';

interface MemoryExplorerProps {
  project: ProjectPartition;
  memories: LanceMemoryRecord[];
  onSearch: (query: string, mode: 'hybrid' | 'vector' | 'fts') => Promise<void>;
  onPromote: (recordId: string) => void;
  onEdit: (memory: LanceMemoryRecord) => void;
  onArchive: (recordId: string) => void;
  onDelete: (recordId: string) => void;
  onViewDetails: (memory: LanceMemoryRecord) => void;
  onOpenNewMemory: () => void;
}

export const MemoryExplorer: React.FC<MemoryExplorerProps> = ({
  project,
  memories,
  onSearch,
  onPromote,
  onEdit,
  onArchive,
  onDelete,
  onViewDetails,
  onOpenNewMemory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'hybrid' | 'vector' | 'fts'>('hybrid');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBucket, setSelectedBucket] = useState<string>('all');
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'blueprint'>('all');
  const [isSearching, setIsSearching] = useState(false);

  // Filter memories locally
  const filteredMemories = useMemo(() => {
    const list: LanceMemoryRecord[] = Array.isArray(memories)
      ? memories
      : Array.isArray((memories as any)?.records)
        ? (memories as any).records
        : [];

    return list.filter((m) => {
      if (!m) return false;
      // The partition endpoint already scopes results; only reject a row that
      // positively belongs to a different partition.
      if (m.project_id && m.project_id !== project.id) return false;
      if (m.status === 'deleted') return false;

      if (selectedCategory !== 'all' && m.category !== selectedCategory) return false;
      if (selectedBucket !== 'all' && m.bucket !== selectedBucket) return false;
      if (verifiedFilter === 'verified' && !m.verified) return false;
      if (verifiedFilter === 'blueprint' && m.verified) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText = m.text?.toLowerCase().includes(q);
        const matchesSymbol = m.symbol?.toLowerCase().includes(q);
        const matchesTag = Array.isArray(m.tags) && m.tags.some(t => t.toLowerCase().includes(q));
        const matchesCat = m.category?.toLowerCase().includes(q);
        if (!matchesText && !matchesSymbol && !matchesTag && !matchesCat) return false;
      }

      return true;
    });
  }, [memories, project.id, selectedCategory, selectedBucket, verifiedFilter, searchQuery]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      await onSearch(searchQuery.trim(), searchMode);
    } finally {
      setIsSearching(false);
    }
  };

  const handleExportJSON = () => {
    // Clean export stripping raw vectors unless user wants complete dump
    const payload = {
      project_id: project.id,
      exported_at: new Date().toISOString(),
      embedding_model: 'nomic-embed-text',
      embedding_dimensions: 768,
      categories: project.categories,
      records: filteredMemories.map(({ vector, ...rest }) => rest),
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${project.id}_memories_export.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const categories = Object.keys(project.categories);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 space-y-5">
      {/* Search Header Bar */}
      <div className="rounded-2xl border border-[#232839] bg-[#111420] p-4 sm:p-5 shadow-lg space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-stretch gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories by keyword, symbol, or semantic meaning..."
              className="w-full rounded-xl border border-[#262c3e] bg-[#161a27] py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-sans"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Search Mode Switcher */}
            <select
              value={searchMode}
              onChange={(e) => setSearchMode(e.target.value as any)}
              className="rounded-xl border border-[#262c3e] bg-[#161a27] px-3.5 py-2.5 text-xs font-mono text-cyan-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="hybrid">Hybrid (RRF Dense + Sparse)</option>
              <option value="vector">Vector Only (Cosine Similarity)</option>
              <option value="fts">Keyword Only (Tantivy BM25)</option>
            </select>

            <button
              type="submit"
              disabled={isSearching}
              className="flex items-center gap-1.5 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors shadow-md shadow-cyan-500/20 disabled:opacity-50 shrink-0"
            >
              <Sparkles className="h-4 w-4" />
              <span>{isSearching ? 'Recalling...' : 'Query'}</span>
            </button>
          </div>
        </form>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1e2334] pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-slate-400 font-mono text-[11px] uppercase mr-1">
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              <span>Filters:</span>
            </span>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-lg border border-[#242a3a] bg-[#141824] px-2.5 py-1 text-xs font-mono text-slate-300 focus:outline-none"
            >
              <option value="all">All Categories ({categories.length})</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Bucket Filter */}
            <select
              value={selectedBucket}
              onChange={(e) => setSelectedBucket(e.target.value)}
              className="rounded-lg border border-[#242a3a] bg-[#141824] px-2.5 py-1 text-xs font-mono text-slate-300 focus:outline-none"
            >
              <option value="all">All Buckets</option>
              <option value="fact">fact (Ratified Truths)</option>
              <option value="decision">decision (Architecture)</option>
              <option value="constraint">constraint (Invariants)</option>
              <option value="preference">preference (Config / Style)</option>
              <option value="procedure">procedure (Workflows)</option>
              <option value="state">state (WIP / Handoff)</option>
            </select>

            {/* Verified Filter */}
            <div className="inline-flex rounded-lg border border-[#242a3a] bg-[#141824] p-0.5">
              <button
                onClick={() => setVerifiedFilter('all')}
                className={`rounded px-2 py-0.5 text-[11px] font-mono transition-colors ${
                  verifiedFilter === 'all' ? 'bg-[#23293c] text-white font-semibold' : 'text-slate-400'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setVerifiedFilter('verified')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-mono transition-colors ${
                  verifiedFilter === 'verified' ? 'bg-emerald-950 text-emerald-300 font-semibold' : 'text-slate-400'
                }`}
              >
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                <span>Ratified Facts</span>
              </button>
              <button
                onClick={() => setVerifiedFilter('blueprint')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-mono transition-colors ${
                  verifiedFilter === 'blueprint' ? 'bg-amber-950 text-amber-300 font-semibold' : 'text-slate-400'
                }`}
              >
                <Clock className="h-3 w-3 text-amber-400" />
                <span>Blueprints</span>
              </button>
            </div>
          </div>

          {/* Export Action */}
          <button
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 rounded-lg border border-[#262c3e] bg-[#141824] px-2.5 py-1 text-xs text-slate-300 hover:bg-[#1a2030] transition-colors"
            title="Export filtered records as JSON"
          >
            <Download className="h-3.5 w-3.5 text-slate-400" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Memory Results Count & Status Bar */}
      <div className="flex items-center justify-between px-1 text-xs font-mono text-slate-400">
        <div>
          Showing <span className="text-white font-bold">{filteredMemories.length}</span> of{' '}
          <span className="text-cyan-400">{project.total_records}</span> memories in partition{' '}
          <span className="text-slate-200 font-bold font-sans">"{project.name}"</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>{filteredMemories.filter(m => m.verified).length} Facts</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span>{filteredMemories.filter(m => !m.verified).length} Blueprints</span>
          </span>
        </div>
      </div>

      {/* Memory Cards Grid */}
      {filteredMemories.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredMemories.map((memory) => (
            <MemoryCard
              key={memory.record_id}
              memory={memory}
              onPromote={onPromote}
              onEdit={onEdit}
              onArchive={onArchive}
              onDelete={onDelete}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#2b3248] p-12 text-center">
          <Database className="mx-auto h-10 w-10 text-slate-600 mb-3" />
          <h3 className="text-base font-bold text-white">No memory records matched your criteria</h3>
          <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
            Try adjusting search terms or filters, or add a new verified memory or blueprint to {project.name}.
          </p>
          <button
            onClick={onOpenNewMemory}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 shadow-md shadow-cyan-500/20"
          >
            Add First Memory
          </button>
        </div>
      )}
    </div>
  );
};
