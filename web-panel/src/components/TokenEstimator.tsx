import React, { useState } from 'react';
import { ProjectPartition } from '../types';
import { tokenEstimate } from '../api/client';
import { FlaskConical, Play, FileText, Hash, BarChart3 } from 'lucide-react';

interface TokenEstimatorProps {
  project: ProjectPartition;
}

interface TokenEstimateRecord {
  record_id: string;
  memory_id: string;
  text_preview: string;
  estimated_tokens: number;
}

export const TokenEstimator: React.FC<TokenEstimatorProps> = ({ project }) => {
  const [sampleText, setSampleText] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [singleResult, setSingleResult] = useState<{
    text: string;
    estimated_tokens: number;
    character_count: number;
  } | null>(null);
  const [projectResult, setProjectResult] = useState<{
    total_records: number;
    total_estimated_tokens: number;
    records: TokenEstimateRecord[];
  } | null>(null);
  const [activeView, setActiveView] = useState<'single' | 'project'>('single');

  const handleEstimateSingle = async () => {
    if (!sampleText.trim()) return;
    setIsEstimating(true);
    try {
      const data = await tokenEstimate(project.id, sampleText);
      if (data.text && data.estimated_tokens !== undefined && data.character_count !== undefined) {
        setSingleResult({
          text: data.text,
          estimated_tokens: data.estimated_tokens,
          character_count: data.character_count,
        });
      }
      setActiveView('single');
    } catch (err) {
      console.error('Token estimate failed:', err);
    } finally {
      setIsEstimating(false);
    }
  };

  const handleEstimateProject = async () => {
    setIsEstimating(true);
    setProjectResult(null);
    try {
      const data = await tokenEstimate(project.id);
      if (data.total_records !== undefined && data.total_estimated_tokens !== undefined && data.records) {
        setProjectResult({
          total_records: data.total_records,
          total_estimated_tokens: data.total_estimated_tokens,
          records: data.records,
        });
      }
      setActiveView('project');
    } catch (err) {
      console.error('Project token estimate failed:', err);
    } finally {
      setIsEstimating(false);
    }
  };

  return (
    <div className="rounded-xl border border-[#232839] bg-[#111420] p-5 shadow-lg">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#212638] pb-4">
        <div>
          <h3 className="text-sm font-bold text-white font-sans flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-violet-400" />
            <span>Token Estimation Lab</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Approximate token counts for memory records using the standard ~4 chars/token heuristic.
            Useful for budgeting context windows and LLM input limits.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {/* Single text estimation */}
        <div className="rounded-lg border border-[#262c3e] bg-[#141824] p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-semibold text-slate-300">Estimate Single Text</span>
          </div>
          <div className="flex gap-2">
            <textarea
              value={sampleText}
              onChange={(e) => setSampleText(e.target.value)}
              placeholder="Enter text to estimate token count..."
              rows={3}
              className="flex-1 rounded-lg border border-[#272d40] bg-[#161a27] p-2.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none resize-none"
            />
            <button
              onClick={handleEstimateSingle}
              disabled={isEstimating || !sampleText.trim()}
              className="self-end flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Estimate</span>
            </button>
          </div>

          {activeView === 'single' && singleResult && (
            <div className="mt-3 flex items-center gap-4 rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-3">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-cyan-400" />
                <span className="text-lg font-bold text-cyan-300 font-mono">
                  {singleResult.estimated_tokens}
                </span>
                <span className="text-xs text-slate-400">tokens</span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                {singleResult.character_count} chars / ~4 = {singleResult.estimated_tokens} tokens
              </div>
            </div>
          )}
        </div>

        {/* Project-wide estimation */}
        <div className="rounded-lg border border-[#262c3e] bg-[#141824] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-violet-400" />
              <span className="text-xs font-semibold text-slate-300">
                Estimate All Records in {project.name}
              </span>
            </div>
            <button
              onClick={handleEstimateProject}
              disabled={isEstimating}
              className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-violet-400 transition-colors disabled:opacity-50"
            >
              <Play className={`h-3.5 w-3.5 ${isEstimating ? 'animate-spin' : ''}`} />
              <span>{isEstimating ? 'Estimating...' : 'Run Estimation'}</span>
            </button>
          </div>

          {activeView === 'project' && projectResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[#2b334a] bg-[#161a27] p-3 text-center">
                  <div className="text-lg font-bold text-violet-300 font-mono">
                    {projectResult.total_records}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Records</div>
                </div>
                <div className="rounded-lg border border-[#2b334a] bg-[#161a27] p-3 text-center">
                  <div className="text-lg font-bold text-cyan-300 font-mono">
                    {projectResult.total_estimated_tokens.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Total Tokens</div>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-[#212638]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#1a1e2e]">
                    <tr className="text-left text-slate-400">
                      <th className="px-3 py-2 font-medium">Record</th>
                      <th className="px-3 py-2 font-medium">Preview</th>
                      <th className="px-3 py-2 font-medium text-right">Tokens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2334]">
                    {projectResult.records.map((rec) => (
                      <tr key={rec.record_id} className="text-slate-300">
                        <td className="px-3 py-2 font-mono text-[10px] text-cyan-400">
                          {rec.record_id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 text-slate-400 max-w-xs truncate">
                          {rec.text_preview}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-violet-300">
                          {rec.estimated_tokens}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
