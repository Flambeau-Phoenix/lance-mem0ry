import React, { useState, useMemo } from 'react';
import { LanceMemoryRecord, ProjectPartition, SemanticBucket } from '../types';
import { 
  Search, 
  Filter, 
  ShieldCheck, 
  Clock, 
  Download, 
  Sparkles, 
  Database, 
  ChevronRight, 
  ChevronDown, 
  Edit3, 
  Trash2, 
  ExternalLink,
  Code2,
  Table as TableIcon,
  LayoutGrid,
  CheckCircle2,
  Tag,
  Folder,
  FolderKanban,
  Plus,
  Layers
} from 'lucide-react';
import { MemoryCard } from './MemoryCard';
import { CategoryConsole } from './CategoryConsole';
import { AssignFolderModal } from './AssignFolderModal';

interface LanceDBTableProps {
  project: ProjectPartition;
  projects: ProjectPartition[];
  memories: LanceMemoryRecord[];
  onSearch: (query: string, mode: 'hybrid' | 'vector' | 'fts') => Promise<void>;
  onPromote: (recordId: string) => void;
  onEdit: (memory: LanceMemoryRecord) => void;
  onArchive: (recordId: string) => void;
  onDelete: (recordId: string) => void;
  onViewDetails: (memory: LanceMemoryRecord) => void;
  onOpenNewMemory: () => void;
  onAssignFolder: (projectId: string, folderPath: string) => Promise<void>;
  onNavigateToRecent?: () => void;
  onAddCategory?: (data: { name: string; description: string; bucket: SemanticBucket }) => Promise<void>;
  onEditCategory?: (name: string, data: { newName?: string; description?: string; bucket?: SemanticBucket }) => Promise<void>;
  onMigrateCategory?: (data: { target_project_id: string; category: string; mode: 'copy' | 'move' }) => Promise<void>;
}

export const LanceDBTable: React.FC<LanceDBTableProps> = ({
  project,
  projects,
  memories,
  onSearch,
  onPromote,
  onEdit,
  onArchive,
  onDelete,
  onViewDetails,
  onOpenNewMemory,
  onAssignFolder,
  onNavigateToRecent,
  onAddCategory,
  onEditCategory,
  onMigrateCategory,
}) => {
  // Project View sub-tabs: 'records' | 'categories'
  const [projectTab, setProjectTab] = useState<'records' | 'categories'>('records');
  const [isAssignFolderOpen, setIsAssignFolderOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'hybrid' | 'vector' | 'fts'>('hybrid');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBucket, setSelectedBucket] = useState<string>('all');
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'blueprint'>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [inspectingVector, setInspectingVector] = useState<LanceMemoryRecord | null>(null);

  // Local filter for records
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

  const toggleRow = (recordId: string) => {
    setExpandedRows(prev => ({ ...prev, [recordId]: !prev[recordId] }));
  };

  const handleExportJSON = () => {
    const payload = {
      project_id: project.id,
      exported_at: new Date().toISOString(),
      target_project_folder: project.folder_path || `/workspace/${project.id}`,
      embedding_model: 'nomic-embed-text',
      embedding_dimensions: 768,
      categories: project.categories,
      records: filteredMemories.map(({ vector, ...rest }) => rest),
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${project.id}_lancedb_table.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const categories = Object.keys(project.categories || {});
  const folderPath = project.folder_path || `/workspace/${project.id}`;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5 space-y-4">
      {/* Project Master Area Header */}
      <div className="rounded-xl border border-[#212638] bg-[#111420] p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-bold text-white tracking-tight font-sans">
                Project Partition: <span className="font-mono text-cyan-400">{project.id}</span>
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LanceDB Native v0.17
              </span>
              <span className="rounded bg-[#1a1f2e] border border-[#2d3448] px-2 py-0.5 text-[10px] font-mono text-slate-400">
                768-dim Nomic
              </span>
            </div>

            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              {project.description}
            </p>

            {/* Target Project Codebase Location Banner / Quick Trigger */}
            <div className="flex items-center gap-2 pt-1 text-xs">
              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1" title="The source project folder these memories document">
                <Folder className="h-3 w-3 text-cyan-400" />
                <span>Target Codebase:</span>
              </span>
              <button
                onClick={() => setIsAssignFolderOpen(true)}
                className="group flex items-center gap-1.5 rounded-lg border border-[#262c3e] bg-[#0c0e15] px-2.5 py-1 font-mono text-xs text-cyan-300 hover:border-cyan-500 hover:bg-[#131724] transition-colors"
                title="The project/mod folder these memories are about. Click to change or re-point."
              >
                <span>{folderPath}</span>
                <Edit3 className="h-3 w-3 text-slate-500 group-hover:text-cyan-400 ml-1" />
              </button>
            </div>
          </div>

          {/* Project Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 self-start lg:self-center shrink-0">
            {/* Assign Target Project Folder Button */}
            <button
              onClick={() => setIsAssignFolderOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[#272e42] bg-[#141824] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#1b2132] hover:text-white hover:border-slate-500 transition-colors"
              title="Assign or re-point the target codebase/mod directory these memories pertain to"
            >
              <FolderKanban className="h-3.5 w-3.5 text-cyan-400" />
              <span>Project Folder</span>
            </button>

            {/* Recently Added Memories Button */}
            {onNavigateToRecent && (
              <button
                onClick={onNavigateToRecent}
                className="flex items-center gap-1.5 rounded-lg border border-[#272e42] bg-[#141824] px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#1b2132] hover:text-white hover:border-slate-500 transition-colors"
                title="View recent memory additions across the system"
              >
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span>Recent Memories</span>
              </button>
            )}

            {/* Add Record (Prominent Project-level action) */}
            <button
              onClick={onOpenNewMemory}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors shadow-sm"
              title="Insert a new verified fact or draft blueprint into this partition"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Record</span>
            </button>
          </div>
        </div>

        {/* Project Area Sub-Tabs: Records Table vs Categories */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1e2334] pt-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setProjectTab('records')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all ${
                projectTab === 'records'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Records Table</span>
              <span className="rounded bg-[#171b28] px-1.5 py-0.2 text-[10px] font-mono text-cyan-300 border border-[#23293c]">
                {filteredMemories.length}
              </span>
            </button>

            <button
              onClick={() => setProjectTab('categories')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition-all ${
                projectTab === 'categories'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Categories & Invariants</span>
              <span className="rounded bg-[#171b28] px-1.5 py-0.2 text-[10px] font-mono text-slate-400 border border-[#23293c]">
                {categories.length}
              </span>
            </button>
          </div>

          {projectTab === 'records' && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-lg border border-[#222738] bg-[#0c0e15] p-1 text-xs">
                <button
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-1 rounded px-2.5 py-1 transition-colors ${
                    viewMode === 'table' ? 'bg-[#1e2334] text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Table View"
                >
                  <TableIcon className="h-3.5 w-3.5" />
                  <span>Table</span>
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1 rounded px-2.5 py-1 transition-colors ${
                    viewMode === 'grid' ? 'bg-[#1e2334] text-white font-medium shadow-sm' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Grid Cards View"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Cards</span>
                </button>
              </div>

              <button
                onClick={handleExportJSON}
                className="flex items-center gap-1.5 rounded-lg border border-[#252b3d] bg-[#141824] px-2.5 py-1.5 text-xs text-slate-300 hover:bg-[#1a2030] transition-colors"
                title="Export table records as JSON"
              >
                <Download className="h-3.5 w-3.5 text-slate-400" />
                <span className="hidden sm:inline">Export JSON</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RENDER CATEGORIES TAB */}
      {projectTab === 'categories' && onAddCategory && onEditCategory && onMigrateCategory ? (
        <CategoryConsole
          project={project}
          projects={projects}
          onAddCategory={onAddCategory}
          onEditCategory={onEditCategory}
          onMigrateCategory={onMigrateCategory}
        />
      ) : (
        /* RENDER RECORDS TABLE & CONTROLS */
        <div className="space-y-4">
          {/* Compact Search & Query Bar */}
          <div className="rounded-xl border border-[#212638] bg-[#111420] p-4 shadow-sm space-y-3">
            <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row items-stretch gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search table by keyword, symbol, or semantic vector probe..."
                  className="w-full rounded-lg border border-[#262c3e] bg-[#141824] py-2 pl-9 pr-4 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={searchMode}
                  onChange={(e) => setSearchMode(e.target.value as any)}
                  className="rounded-lg border border-[#262c3e] bg-[#141824] px-3 py-2 text-xs font-mono text-cyan-300 focus:border-cyan-500 focus:outline-none"
                >
                  <option value="hybrid">Hybrid (Vector + BM25)</option>
                  <option value="vector">Vector Only (Cosine)</option>
                  <option value="fts">Keyword Only (FTS)</option>
                </select>

                <button
                  type="submit"
                  disabled={isSearching}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition-colors shadow-sm disabled:opacity-50 shrink-0"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{isSearching ? 'Searching...' : 'Run Query'}</span>
                </button>
              </div>
            </form>

            {/* Filter controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1e2334] pt-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 text-slate-500 font-mono text-[11px] uppercase mr-1">
                  <Filter className="h-3 w-3" />
                  <span>Filter:</span>
                </span>

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="rounded border border-[#242a3a] bg-[#141824] px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none"
                >
                  <option value="all">All Categories ({categories.length})</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <select
                  value={selectedBucket}
                  onChange={(e) => setSelectedBucket(e.target.value)}
                  className="rounded border border-[#242a3a] bg-[#141824] px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none"
                >
                  <option value="all">All Buckets</option>
                  <option value="fact">fact</option>
                  <option value="decision">decision</option>
                  <option value="constraint">constraint</option>
                  <option value="preference">preference</option>
                  <option value="procedure">procedure</option>
                  <option value="state">state</option>
                </select>

                <div className="inline-flex rounded border border-[#242a3a] bg-[#141824] p-0.5">
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
                    className={`rounded px-2 py-0.5 text-[11px] font-mono transition-colors ${
                      verifiedFilter === 'verified' ? 'bg-emerald-950 text-emerald-300 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    Verified Facts
                  </button>
                  <button
                    onClick={() => setVerifiedFilter('blueprint')}
                    className={`rounded px-2 py-0.5 text-[11px] font-mono transition-colors ${
                      verifiedFilter === 'blueprint' ? 'bg-amber-950 text-amber-300 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    Blueprints
                  </button>
                </div>
              </div>

              <div className="text-[11px] font-mono text-slate-400">
                {filteredMemories.length} rows returned
              </div>
            </div>
          </div>

          {/* Main Records Presentation */}
          {viewMode === 'table' ? (
            <div className="rounded-xl border border-[#212638] bg-[#10131d] overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#212638] bg-[#131724] text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                      <th className="py-2.5 px-3 w-8"></th>
                      <th className="py-2.5 px-3 font-semibold text-slate-300">Status</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-300">Symbol</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-300">Category</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-300">Memory Content</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-300">Embedding Vector</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-300 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1b2030]">
                    {filteredMemories.length > 0 ? (
                      filteredMemories.map((m) => {
                        const isExpanded = !!expandedRows[m.record_id];
                        return (
                          <React.Fragment key={m.record_id}>
                            <tr className="hover:bg-[#151928] transition-colors group">
                              {/* Expand Toggle */}
                              <td className="py-2.5 px-3">
                                <button
                                  onClick={() => toggleRow(m.record_id)}
                                  className="text-slate-500 hover:text-slate-300"
                                  title={isExpanded ? 'Collapse row' : 'Expand row'}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-cyan-400" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </td>

                              {/* Status */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                {m.verified ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono text-emerald-400 font-medium">
                                    <ShieldCheck className="h-3 w-3" />
                                    <span>Fact</span>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => onPromote(m.record_id)}
                                    title="Click to promote blueprint to verified fact"
                                    className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-mono text-amber-400 hover:bg-amber-500/20 transition-colors"
                                  >
                                    <Clock className="h-3 w-3" />
                                    <span>Blueprint ↗</span>
                                  </button>
                                )}
                              </td>

                              {/* Symbol */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className="font-mono text-cyan-300 text-xs font-medium">
                                  {m.symbol || m.record_id.slice(0, 8)}
                                </span>
                                {m.entity_type && (
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {m.entity_type}
                                  </div>
                                )}
                              </td>

                              {/* Category */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className="rounded bg-[#161a27] px-2 py-0.5 text-[11px] font-mono text-slate-300 border border-[#242a3e]">
                                  {m.category}
                                </span>
                                <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                                  bucket: {m.bucket}
                                </div>
                              </td>

                              {/* Text snippet */}
                              <td className="py-2.5 px-3 font-sans text-slate-200 max-w-md">
                                <p className="line-clamp-2 leading-relaxed">
                                  {m.text}
                                </p>
                                {Array.isArray(m.tags) && m.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {m.tags.slice(0, 3).map((tag) => (
                                      <span key={tag} className="rounded bg-[#161926] px-1 text-[10px] font-mono text-slate-400 border border-[#21273a]">
                                        #{tag}
                                      </span>
                                    ))}
                                    {m.tags.length > 3 && (
                                      <span className="text-[10px] font-mono text-slate-500">
                                        +{m.tags.length - 3}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Embedding inspection */}
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <button
                                  onClick={() => setInspectingVector(m)}
                                  className="inline-flex items-center gap-1 font-mono text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline"
                                >
                                  <Code2 className="h-3 w-3" />
                                  <span>[768-dim float32]</span>
                                </button>
                              </td>

                              {/* Actions */}
                              <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => onViewDetails(m)}
                                    title="View full record details"
                                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#1a2030]"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => onEdit(m)}
                                    title="Edit memory"
                                    className="p-1 rounded text-slate-400 hover:text-cyan-300 hover:bg-[#1a2030]"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => onDelete(m.record_id)}
                                    title="Delete memory record"
                                    className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-[#1a2030]"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* Expanded Detail Drawer */}
                            {isExpanded && (
                              <tr className="bg-[#0e1018] border-b border-[#1b2030]">
                                <td colSpan={7} className="p-4">
                                  <div className="rounded-lg border border-[#1f2537] bg-[#111420] p-3 space-y-2 text-xs">
                                    <div className="flex items-center justify-between border-b border-[#1c2132] pb-2 text-[11px] font-mono text-slate-400">
                                      <span>Memory ID: <strong className="text-white">{m.memory_id}</strong></span>
                                      <span>Record ID: <strong className="text-cyan-300">{m.record_id}</strong></span>
                                      <span>Updated: {new Date(m.updated_at || m.created_at).toLocaleString()}</span>
                                    </div>
                                    <p className="text-slate-200 font-sans leading-relaxed whitespace-pre-wrap">
                                      {m.text}
                                    </p>
                                    {m.agent_id && (
                                      <div className="pt-2 border-t border-[#1c2132] text-[11px] text-slate-400">
                                        <span className="font-mono text-slate-500">Author Agent: </span>
                                        <span className="font-mono text-cyan-300">{m.agent_id}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-500 font-sans">
                          <Database className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                          <p className="text-sm font-medium text-slate-300">No records found matching filters in table "{project.id}"</p>
                          <button
                            onClick={onOpenNewMemory}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Insert Memory into {project.id}</span>
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Grid Card View */
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
          )}
        </div>
      )}

      {/* Vector Inspector Modal */}
      {inspectingVector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-xl border border-[#282e42] bg-[#121520] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#212638] pb-3">
              <div>
                <h3 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-cyan-400" />
                  <span>768-Dimension Dense Embedding</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  Record: {inspectingVector.symbol} [{inspectingVector.record_id.slice(0, 8)}]
                </p>
              </div>
              <button
                onClick={() => setInspectingVector(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-[#1a1f30]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span>Model: <strong className="text-cyan-300">nomic-embed-text</strong></span>
                <span>Dimensions: <strong className="text-cyan-300">768</strong></span>
                <span>Format: <strong className="text-cyan-300">float32 normalized (L2=1.0)</strong></span>
              </div>
              <div className="rounded-lg border border-[#212638] bg-[#0c0e15] p-3 text-xs font-mono text-slate-300 max-h-64 overflow-y-auto leading-relaxed">
                {inspectingVector.vector && inspectingVector.vector.length > 0 ? (
                  `[${inspectingVector.vector.map(v => v.toFixed(5)).join(', ')}]`
                ) : (
                  <span className="text-slate-500">Vector embedding stored internally in LanceDB Arrow partition.</span>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectingVector(null)}
                className="rounded-lg bg-[#1f2436] px-4 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#272e44]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Storage Folder Assignment Modal */}
      <AssignFolderModal
        isOpen={isAssignFolderOpen}
        onClose={() => setIsAssignFolderOpen(false)}
        project={project}
        onAssignFolder={onAssignFolder}
      />
    </div>
  );
};
