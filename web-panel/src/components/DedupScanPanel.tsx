import React, { useState } from 'react';
import { ProjectPartition, DuplicateCandidate } from '../types';
import { dedupScan } from '../api/client';
import { RefreshCw, AlertTriangle, Trash2, CheckCircle, Cpu } from 'lucide-react';

interface DedupScanPanelProps {
  project: ProjectPartition;
  onRefreshProject: () => void;
}

export const DedupScanPanel: React.FC<DedupScanPanelProps> = ({
  project,
  onRefreshProject,
}) => {
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [threshold, setThreshold] = useState(85);
  const [scannedCount, setScannedCount] = useState(0);
  const [hasScanned, setHasScanned] = useState(false);

  const handleScan = async () => {
    setIsScanning(true);
    setDuplicates([]);
    try {
      const data = await dedupScan(project.id, threshold);
      setDuplicates(data.duplicates || []);
      setScannedCount(data.scanned_count || 0);
      setHasScanned(true);
    } catch (err) {
      console.error('Dedup scan failed:', err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleArchive = async (recordId: string) => {
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

  return (
    <div className="rounded-xl border border-[#232839] bg-[#111420] p-5 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#212638] pb-4">
        <div>
          <h3 className="text-sm font-bold text-white font-sans flex items-center gap-2">
            <Cpu className="h-4 w-4 text-cyan-400" />
            <span>Vector Deduplication Scanner</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Pairwise cosine similarity across all {project.embedding_dimensions}-dim embeddings in{' '}
            <span className="font-mono text-cyan-300 font-bold">{project.name}</span>. Pairs above the
            threshold are flagged as potential duplicates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>Threshold:</span>
            <select
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="rounded border border-[#262c3e] bg-[#161a27] px-2 py-1 text-xs text-cyan-300 font-mono focus:outline-none"
            >
              <option value={95}>95% (Near-Identical)</option>
              <option value={90}>90% (Very Similar)</option>
              <option value={85}>85% (Similar)</option>
              <option value={75}>75% (Loose Match)</option>
            </select>
          </div>

          <button
            onClick={handleScan}
            disabled={isScanning}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning...' : 'Scan'}</span>
          </button>
        </div>
      </div>

      <div className="mt-4">
        {isScanning ? (
          <div className="p-8 text-center text-xs text-slate-400 font-mono">
            Comparing vector embeddings in LanceDB partition...
          </div>
        ) : hasScanned && duplicates.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span>Found {duplicates.length} duplicate pair(s) from {scannedCount} records</span>
              </div>
            </div>
            {duplicates.map((dup) => (
              <div key={dup.pair_id} className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 text-xs font-mono">
                  <span className="text-amber-400 font-bold">
                    Similarity: {dup.similarity_pct.toFixed(1)}%
                  </span>
                  <span className="text-slate-400 text-[11px]">{dup.recommendation}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <div className="rounded border border-[#2b334a] bg-[#141825] p-3 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1.5 border-b border-[#212638]">
                      <span className="font-mono text-cyan-400">[{dup.mem1.record_id.slice(0, 8)}]</span>
                      <span className="font-mono text-[10px]">{dup.mem1.category}</span>
                    </div>
                    <p className="text-slate-200 mt-2 font-sans line-clamp-3">{dup.mem1.text}</p>
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => handleArchive(dup.mem1.record_id)}
                        className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Archive</span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded border border-[#2b334a] bg-[#141825] p-3 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1.5 border-b border-[#212638]">
                      <span className="font-mono text-violet-400">[{dup.mem2.record_id.slice(0, 8)}]</span>
                      <span className="font-mono text-[10px]">{dup.mem2.category}</span>
                    </div>
                    <p className="text-slate-200 mt-2 font-sans line-clamp-3">{dup.mem2.text}</p>
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => handleArchive(dup.mem2.record_id)}
                        className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Archive</span>
                      </button>
                    </div>
                  </div>
                </div>

                {dup.common_tags.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span>Common tags:</span>
                    {dup.common_tags.map(tag => (
                      <span key={tag} className="rounded bg-[#1e2333] px-1.5 py-0.5 font-mono">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : hasScanned ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-4 text-center text-xs text-emerald-300 flex items-center justify-center gap-2">
            <CheckCircle className="h-4 w-4" />
            <span>No duplicate pairs found at {threshold}% threshold across {scannedCount} records.</span>
          </div>
        ) : (
          <div className="rounded-lg border border-[#212638] bg-[#141824] p-4 text-center text-xs text-slate-400 font-sans">
            Click <span className="font-semibold text-cyan-300">"Scan"</span> to evaluate pairwise
            semantic distance across the {project.name} vector table.
          </div>
        )}
      </div>
    </div>
  );
};
