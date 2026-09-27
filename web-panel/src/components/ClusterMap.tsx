import React, { useState, useEffect } from 'react';
import { ClusterPoint, ProjectPartition } from '../types';
import { Activity, ShieldCheck, Clock, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ClusterMapProps {
  project: ProjectPartition;
  onSelectRecord: (recordId: string) => void;
}

export const ClusterMap: React.FC<ClusterMapProps> = ({ project, onSelectRecord }) => {
  const [points, setPoints] = useState<ClusterPoint[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<ClusterPoint | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchClusters() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/projects/${project.id}/clusters`);
        const data = await res.json();
        setPoints(data || []);
      } catch (err) {
        console.error('Failed to load cluster points:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchClusters();
  }, [project.id]);

  const getBucketColor = (bucket: string) => {
    switch (bucket) {
      case 'fact':
        return '#10b981'; // emerald
      case 'decision':
        return '#a855f7'; // violet
      case 'state':
        return '#f59e0b'; // amber
      default:
        return '#38bdf8'; // sky
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#232839] pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white font-sans">
              2D Vector Embedding Cluster Galaxy
            </h2>
            <span className="rounded bg-[#1a1f2e] px-2 py-0.5 text-xs font-mono text-cyan-300 border border-cyan-500/30">
              {points.length} Embedded Vectors
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            2D PCA projection of the 768-dimensional <code className="text-cyan-400 font-mono">nomic-embed-text</code> embeddings. Near points represent high cosine semantic similarity.
          </p>
        </div>

        {/* Legend & Zoom Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
              <span>Fact</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full bg-violet-400 shadow-[0_0_8px_#a855f7]" />
              <span>Decision</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b]" />
              <span>State (WIP)</span>
            </span>
          </div>

          <div className="flex items-center gap-1 bg-[#161a27] p-1 rounded-lg border border-[#272d40]">
            <button
              onClick={() => setZoom(z => Math.min(2.5, z + 0.2))}
              className="p-1 text-slate-400 hover:text-white"
              title="Zoom in"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoom(z => Math.max(0.6, z - 0.2))}
              className="p-1 text-slate-400 hover:text-white"
              title="Zoom out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoom(1)}
              className="p-1 text-slate-400 hover:text-white"
              title="Reset zoom"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Galaxy SVG Canvas */}
      <div className="relative h-[480px] w-full overflow-hidden rounded-2xl border border-[#23283a] bg-[#0c0e15] shadow-2xl">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e2436_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />

        {isLoading ? (
          <div className="flex h-full items-center justify-center font-mono text-xs text-slate-400">
            Projecting 768-dimensional embeddings to 2D manifold...
          </div>
        ) : (
          <svg className="h-full w-full" viewBox="-200 -200 400 400">
            {/* Center Axes */}
            <line x1="-190" y1="0" x2="190" y2="0" stroke="#1d2334" strokeWidth="1" strokeDasharray="4 4" />
            <line x1="0" y1="-190" x2="0" y2="190" stroke="#1d2334" strokeWidth="1" strokeDasharray="4 4" />

            {/* Vector Points */}
            <g transform={`scale(${zoom})`}>
              {points.map((pt) => {
                const color = getBucketColor(pt.bucket);
                const isHovered = hoveredPoint?.record_id === pt.record_id;

                return (
                  <g
                    key={pt.record_id}
                    transform={`translate(${pt.x}, ${pt.y})`}
                    className="cursor-pointer transition-transform"
                    onMouseEnter={() => setHoveredPoint(pt)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    onClick={() => onSelectRecord(pt.record_id)}
                  >
                    {/* Ripple halo on hover */}
                    {isHovered && (
                      <circle
                        r="16"
                        fill={color}
                        fillOpacity="0.2"
                        className="animate-ping"
                      />
                    )}

                    {/* Vector node dot */}
                    <circle
                      r={isHovered ? 8 : 5.5}
                      fill={color}
                      stroke="#0c0e15"
                      strokeWidth={isHovered ? 2 : 1.5}
                      className="transition-all duration-200"
                    />

                    {/* Node label */}
                    <text
                      x="9"
                      y="3.5"
                      fontSize="9"
                      fontFamily="monospace"
                      fill={isHovered ? '#ffffff' : '#94a3b8'}
                      className="pointer-events-none select-none"
                    >
                      {pt.symbol || pt.category}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {/* Hovered Point Inspector Card */}
        {hoveredPoint && (
          <div className="absolute bottom-4 left-4 max-w-sm rounded-xl border border-[#2c3349] bg-[#121520]/95 p-3.5 shadow-2xl backdrop-blur-md animate-in fade-in">
            <div className="flex items-center justify-between gap-2 border-b border-[#222736] pb-1.5">
              <span className="font-mono text-xs font-bold text-cyan-300">
                {hoveredPoint.symbol || hoveredPoint.category}
              </span>
              <span className="text-[10px] font-mono text-slate-400 uppercase">
                {hoveredPoint.bucket}
              </span>
            </div>
            <p className="mt-2 text-xs font-sans text-slate-200 line-clamp-3 leading-relaxed">
              {hoveredPoint.text}
            </p>
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>Verified: {hoveredPoint.verified ? 'Yes (Ratified Fact)' : 'No (Blueprint)'}</span>
              <span className="text-cyan-400 font-semibold">Click to view</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
