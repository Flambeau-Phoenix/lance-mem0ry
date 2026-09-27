import React, { useState, useRef } from 'react';
import { ProjectPartition, LanceMemoryRecord } from '../types';
import { DedupScanPanel } from './DedupScanPanel';
import { TokenEstimator } from './TokenEstimator';
import { reindexProject, exportProject, importProject } from '../api/client';
import {
  FlaskConical,
  RefreshCw,
  Download,
  Upload,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileJson,
  Database,
} from 'lucide-react';

interface MaintenanceLabProps {
  project: ProjectPartition;
  onRefreshProject: () => void;
}

type LabTab = 'dedup' | 'tokens' | 'reindex' | 'transfer';

export const MaintenanceLab: React.FC<MaintenanceLabProps> = ({
  project,
  onRefreshProject,
}) => {
  const [activeTab, setActiveTab] = useState<LabTab>('dedup');

  // Reindex state
  const [isReindexing, setIsReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<{
    reindexed: boolean;
    fts_index_status: string;
    timestamp: string;
  } | null>(null);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    record_count: number;
    exported_at: string;
  } | null>(null);

  // Import state
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported_count: number;
  } | null>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReindex = async () => {
    setIsReindexing(true);
    setReindexResult(null);
    try {
      const data = await reindexProject(project.id);
      setReindexResult(data);
      onRefreshProject();
    } catch (err) {
      console.error('Reindex failed:', err);
    } finally {
      setIsReindexing(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportResult(null);
    try {
      const data = await exportProject(project.id);
      setExportResult(data);
      // Auto-download the JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.id}-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setIsImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const parsed = JSON.parse(importText);
      const records = Array.isArray(parsed) ? parsed : parsed.records;
      if (!Array.isArray(records)) {
        throw new Error('Expected an array of records or { records: [...] }');
      }
      const data = await importProject(project.id, records);
      setImportResult(data);
      setImportText('');
      onRefreshProject();
    } catch (err: any) {
      setImportError(err.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const records = Array.isArray(parsed) ? parsed : parsed.records;
      if (!Array.isArray(records)) {
        throw new Error('Expected an array of records or { records: [...] }');
      }
      const data = await importProject(project.id, records);
      setImportResult(data);
      onRefreshProject();
    } catch (err: any) {
      setImportError(err.message || 'File import failed');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const tabs: { id: LabTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dedup', label: 'Dedup Scan', icon: <Database className="h-3.5 w-3.5" /> },
    { id: 'tokens', label: 'Token Lab', icon: <FlaskConical className="h-3.5 w-3.5" /> },
    { id: 'reindex', label: 'Reindex', icon: <RefreshCw className="h-3.5 w-3.5" /> },
    { id: 'transfer', label: 'Export/Import', icon: <FileJson className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/20 text-violet-400 border border-violet-500/30">
          <FlaskConical className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Quality Control & Maintenance Lab
          </h2>
          <p className="text-xs text-slate-400">
            Vector deduplication, token estimation, FTS re-indexing, and data portability for{' '}
            <span className="font-mono text-violet-300">{project.name}</span>
          </p>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 rounded-lg border border-[#262c3e] bg-[#0e1018] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[#1b2030] text-violet-300 border border-[#2b334a]'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Dedup Scan */}
      {activeTab === 'dedup' && (
        <DedupScanPanel project={project} onRefreshProject={onRefreshProject} />
      )}

      {/* Token Estimator */}
      {activeTab === 'tokens' && <TokenEstimator project={project} />}

      {/* Reindex */}
      {activeTab === 'reindex' && (
        <div className="rounded-xl border border-[#232839] bg-[#111420] p-5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#212638] pb-4">
            <div>
              <h3 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-amber-400" />
                <span>FTS Re-index Trigger</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Rebuilds the LanceDB full-text search indexes on <code className="text-amber-300">text</code> and{' '}
                <code className="text-amber-300">symbol</code> columns. Use after bulk imports or when FTS
                results appear stale.
              </p>
            </div>
            <button
              onClick={handleReindex}
              disabled={isReindexing}
              className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {isReindexing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span>{isReindexing ? 'Rebuilding...' : 'Trigger Reindex'}</span>
            </button>
          </div>

          <div className="mt-4">
            {reindexResult ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4 flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-emerald-300">
                    FTS Index Rebuilt Successfully
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Project: <span className="font-mono text-cyan-300">{project.id}</span>
                    {' · '}Status: <span className="font-mono text-emerald-300">{reindexResult.fts_index_status}</span>
                    {' · '}At: {new Date(reindexResult.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-[#212638] bg-[#141824] p-4 text-center text-xs text-slate-400">
                Click <span className="font-semibold text-amber-300">"Trigger Reindex"</span> to rebuild
                full-text search indexes for this partition.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Export/Import */}
      {activeTab === 'transfer' && (
        <div className="space-y-5">
          {/* Export */}
          <div className="rounded-xl border border-[#232839] bg-[#111420] p-5 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#212638] pb-4">
              <div>
                <h3 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                  <Download className="h-4 w-4 text-cyan-400" />
                  <span>Export Records</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Download all records with vectors as JSON. Suitable for backup, migration, or external analysis.
                </p>
              </div>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-50"
              >
                {isExporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                <span>{isExporting ? 'Exporting...' : 'Export JSON'}</span>
              </button>
            </div>
            {exportResult && (
              <div className="mt-3 rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3 flex items-center gap-2 text-xs text-cyan-300">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>
                  Exported {exportResult.record_count} records at {new Date(exportResult.exported_at).toLocaleString()}.
                  Check your downloads folder.
                </span>
              </div>
            )}
          </div>

          {/* Import */}
          <div className="rounded-xl border border-[#232839] bg-[#111420] p-5 shadow-lg">
            <div className="border-b border-[#212638] pb-4">
              <h3 className="text-sm font-bold text-white font-sans flex items-center gap-2">
                <Upload className="h-4 w-4 text-violet-400" />
                <span>Import Records</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Import records with embeddings. Each record must have at minimum a{' '}
                <code className="text-violet-300">text</code> field. Vectors are auto-generated via Ollama
                if not provided.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex gap-2">
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='[{"text": "Record text...", "category": "key_facts", "verified": true}]'
                  rows={5}
                  className="flex-1 rounded-lg border border-[#272d40] bg-[#161a27] p-2.5 text-xs text-slate-200 font-mono focus:border-violet-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleImport}
                    disabled={isImporting || !importText.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-violet-400 transition-colors disabled:opacity-50"
                  >
                    {isImporting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    <span>{isImporting ? 'Importing...' : 'Import JSON'}</span>
                  </button>

                  <label className="flex items-center gap-1.5 rounded-lg border border-[#2b334a] bg-[#171c2b] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-violet-500/50 hover:bg-[#1c2236] transition-all cursor-pointer">
                    <FileJson className="h-3.5 w-3.5 text-violet-400" />
                    <span>Upload File</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleFileImport}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {importError && (
                <div className="rounded-lg border border-red-500/30 bg-red-950/20 p-3 flex items-center gap-2 text-xs text-red-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {importResult && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>Successfully imported {importResult.imported_count} records.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
