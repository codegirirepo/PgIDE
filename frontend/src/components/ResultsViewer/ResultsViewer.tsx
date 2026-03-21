import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '@/services/api';
import type { QueryResult } from '@/types';
import {
  ArrowUpDown, ArrowUp, ArrowDown, Download, Copy, Clock, AlertCircle, CheckCircle2, PenLine, Loader2,
} from 'lucide-react';

const ROW_HEIGHT = 30;

function ResultGrid({ result, onLoadMore, isLoadingMore, hasMore }: { result: QueryResult; onLoadMore?: () => void; isLoadingMore?: boolean; hasMore?: boolean }) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [colFilter, setColFilter] = useState<Record<string, string>>({});
  const [editCell, setEditCell] = useState<{ row: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ col: string; startX: number; startW: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const updateTab = useAppStore(s => s.updateTab);
  const activeTabId = useAppStore(s => s.activeTabId);
  const addTab = useAppStore(s => s.addTab);
  const activeConnectionId = useAppStore(s => s.activeConnectionId);

  // Reset state only when columns change (new query), not when rows are appended
  const colKey = result.columns.map(c => c.name).join(',');
  useEffect(() => {
    setSortCol(null);
    setColFilter({});
    setEditCell(null);
    setColWidths({});
  }, [colKey]);

  const getColWidth = (name: string) => colWidths[name] || 150;
  const totalWidth = 60 + result.columns.reduce((sum, c) => sum + getColWidth(c.name), 0);

  const onResizeStart = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[col] || 150;
    resizingRef.current = { col, startX, startW };

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const newW = Math.max(60, resizingRef.current.startW + delta);
      setColWidths(prev => ({ ...prev, [resizingRef.current!.col]: newW }));
    };
    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [colWidths]);

  const filteredRows = useMemo(() => {
    if (!result?.rows) return [];
    let rows = result.rows;

    const activeFilters = Object.entries(colFilter).filter(([, v]) => v);
    if (activeFilters.length > 0) {
      rows = rows.filter(row =>
        activeFilters.every(([col, val]) =>
          String(row[col] ?? '').toLowerCase().includes(val.toLowerCase())
        )
      );
    }

    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const va = a[sortCol] ?? '';
        const vb = b[sortCol] ?? '';
        const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return rows;
  }, [result, sortCol, sortDir, colFilter]);

  const commitEdit = useCallback((rowIdx: number, colName: string, newVal: string) => {
    const row = filteredRows[rowIdx];
    if (!row) return;
    const oldVal = row[colName];
    if (String(oldVal ?? '') === newVal) { setEditCell(null); return; }

    const whereParts = result.columns
      .filter(c => row[c.name] !== null && row[c.name] !== undefined)
      .slice(0, 5)
      .map(c => {
        const v = row[c.name];
        return typeof v === 'number' ? `"${c.name}" = ${v}` : `"${c.name}" = '${String(v).replace(/'/g, "''")}'`;
      });

    const setClause = newVal === '' || newVal.toUpperCase() === 'NULL'
      ? `"${colName}" = NULL`
      : `"${colName}" = '${newVal.replace(/'/g, "''")}'`;

    const sql = `UPDATE <table> SET ${setClause} WHERE ${whereParts.join(' AND ')} LIMIT 1;\n-- ⚠️ Replace <table> with actual schema.table name. Review before executing.`;

    addTab(activeConnectionId);
    setTimeout(() => {
      const tabId = useAppStore.getState().activeTabId;
      if (tabId) updateTab(tabId, { sql });
    }, 0);
    setEditCell(null);
  }, [filteredRows, result.columns, updateTab, addTab, activeConnectionId]);

  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 30,
  });

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  if (result.columns.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {result.error ? result.error : `${result.command || 'Query'} executed successfully. ${result.rowCount} row(s) affected.`}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sticky header */}
      <div className="shrink-0 overflow-x-auto border-b bg-card" onScroll={e => {
        if (scrollRef.current) scrollRef.current.scrollLeft = (e.target as HTMLDivElement).scrollLeft;
      }}>
        <div className="flex" style={{ minWidth: `${totalWidth}px` }}>
          <div className="w-[50px] shrink-0 border-r px-2 py-1.5 text-center text-[10px] text-muted-foreground font-medium">
            <button onClick={() => setEditMode(m => !m)} title={editMode ? 'Disable edit mode' : 'Enable edit mode'} className={`rounded p-0.5 ${editMode ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
              <PenLine className="h-3 w-3" />
            </button>
          </div>
          {result.columns.map(col => (
            <div key={col.name} className="shrink-0 border-r px-2 py-1 relative" style={{ width: getColWidth(col.name) }}>
              <div className="flex items-center gap-1 cursor-pointer text-xs font-medium" onClick={() => toggleSort(col.name)}>
                <span className="truncate">{col.name}</span>
                <span className="text-[9px] text-muted-foreground">({col.dataType})</span>
                {sortCol === col.name ? (
                  sortDir === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />
                ) : (
                  <ArrowUpDown className="h-3 w-3 shrink-0 opacity-30" />
                )}
              </div>
              <input
                placeholder="Filter..."
                value={colFilter[col.name] || ''}
                onChange={e => setColFilter(f => ({ ...f, [col.name]: e.target.value }))}
                className="mt-0.5 h-5 w-full rounded border border-input bg-background px-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-ring"
                onClick={e => e.stopPropagation()}
              />
              {/* Resize handle */}
              <div
                className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
                onMouseDown={e => onResizeStart(col.name, e)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Virtualized rows */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto min-h-0"
        onScroll={e => {
          const el = e.target as HTMLDivElement;
          const header = el.previousElementSibling as HTMLDivElement;
          if (header) header.scrollLeft = el.scrollLeft;
          // Lazy load: trigger when within 100px of bottom
          if (hasMore && !isLoadingMore && onLoadMore && el.scrollHeight - el.scrollTop - el.clientHeight < 100) {
            onLoadMore();
          }
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: `${totalWidth}px`,
            minWidth: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const row = filteredRows[virtualRow.index];
            return (
              <div
                key={virtualRow.index}
                className="flex border-b hover:bg-accent/50"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${ROW_HEIGHT}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="w-[50px] shrink-0 border-r px-2 flex items-center justify-center text-[10px] text-muted-foreground">
                  {virtualRow.index + 1}
                </div>
                {result.columns.map(col => {
                  const isEditing = editCell?.row === virtualRow.index && editCell?.col === col.name;
                  return (
                    <div
                      key={col.name}
                      className={`shrink-0 border-r px-2 flex items-center text-xs truncate ${editMode ? 'cursor-text' : ''}`}
                      style={{ width: getColWidth(col.name) }}
                      title={String(row[col.name] ?? '')}
                      onDoubleClick={() => {
                        if (!editMode) return;
                        setEditCell({ row: virtualRow.index, col: col.name });
                        setEditValue(row[col.name] === null ? '' : String(row[col.name]));
                      }}
                    >
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => commitEdit(virtualRow.index, col.name, editValue)}
                          onKeyDown={e => { if (e.key === 'Enter') commitEdit(virtualRow.index, col.name, editValue); if (e.key === 'Escape') setEditCell(null); }}
                          className="h-full w-full bg-primary/10 border-0 outline-none text-xs px-0"
                        />
                      ) : (
                        row[col.name] === null
                          ? <span className="italic text-muted-foreground">NULL</span>
                          : String(row[col.name])
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Row count footer */}
      <div className="shrink-0 border-t px-3 py-1 text-[10px] text-muted-foreground bg-card flex items-center gap-2">
        Showing {filteredRows.length} of {result.rows.length} rows
        {result.totalRows != null && result.totalRows > result.rows.length && ` (${result.totalRows} total in table)`}
        {isLoadingMore && <Loader2 className="h-3 w-3 animate-spin" />}
        {hasMore && !isLoadingMore && <span className="text-primary">· Scroll down to load more</span>}
      </div>
    </div>
  );
}

export default function ResultsViewer() {
  const activeTab = useAppStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useAppStore(s => s.updateTab);
  const appendRows = useAppStore(s => s.appendRows);
  const batch = activeTab?.batchResult;
  const activeIdx = activeTab?.activeResultIndex ?? 0;
  const [activeView, setActiveView] = useState<'results' | 'messages'>('results');

  const loadMore = useCallback(async () => {
    if (!activeTab?.connectionId || !activeTab.lastExecutedSql || activeTab.isLoadingMore) return;
    const offset = activeTab.loadedOffset || 0;
    updateTab(activeTab.id, { isLoadingMore: true });
    try {
      const batch = await api.executeQuery(activeTab.connectionId, activeTab.lastExecutedSql, offset, 1000);
      const newResult = batch.results[activeIdx];
      if (newResult && newResult.rows.length > 0) {
        appendRows(activeTab.id, activeIdx, newResult, offset + newResult.rows.length);
      } else {
        updateTab(activeTab.id, { isLoadingMore: false });
      }
    } catch {
      updateTab(activeTab.id, { isLoadingMore: false });
    }
  }, [activeTab, activeIdx, updateTab, appendRows]);

  if (!batch) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Execute a query to see results
      </div>
    );
  }

  const results = batch.results;
  const current = results[activeIdx];

  const copyToClipboard = (format: 'csv' | 'json') => {
    if (!current || current.columns.length === 0) return;
    if (format === 'json') {
      navigator.clipboard.writeText(JSON.stringify(current.rows, null, 2));
    } else {
      const header = current.columns.map(c => c.name).join(',');
      const rows = current.rows.map(r => current.columns.map(c => JSON.stringify(r[c.name] ?? '')).join(','));
      navigator.clipboard.writeText([header, ...rows].join('\n'));
    }
  };

  const downloadFile = (format: 'csv' | 'json') => {
    if (!current || current.columns.length === 0) return;
    let content: string, mime: string, ext: string;
    if (format === 'json') {
      content = JSON.stringify(current.rows, null, 2); mime = 'application/json'; ext = 'json';
    } else {
      const header = current.columns.map(c => c.name).join(',');
      const rows = current.rows.map(r => current.columns.map(c => JSON.stringify(r[c.name] ?? '')).join(','));
      content = [header, ...rows].join('\n'); mime = 'text/csv'; ext = 'csv';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `query-result-${activeIdx + 1}.${ext}`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Status bar */}
      <div className="flex items-center gap-3 border-b px-3 py-1.5 text-xs flex-wrap shrink-0">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveView('results')}
            className={`rounded px-2 py-0.5 ${activeView === 'results' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          >
            Results
          </button>
          <button
            onClick={() => setActiveView('messages')}
            className={`rounded px-2 py-0.5 ${activeView === 'messages' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          >
            Messages
          </button>
        </div>

        {results.length > 1 && (
          <div className="flex items-center gap-1 border-l pl-3">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => activeTab && updateTab(activeTab.id, { activeResultIndex: i })}
                className={`rounded px-2 py-0.5 ${i === activeIdx ? 'bg-secondary text-secondary-foreground font-medium' : 'hover:bg-accent text-muted-foreground'}`}
              >
                {r.error ? (
                  <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-destructive" /> #{i + 1}</span>
                ) : (
                  <span>#{i + 1} {r.command}{r.columns.length > 0 ? ` (${r.rowCount})` : ''}</span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3 w-3" /> {current?.duration}ms (total: {batch.totalDuration}ms)
        </div>
        {current?.error ? (
          <span className="flex items-center gap-1 text-destructive"><AlertCircle className="h-3 w-3" /> Error</span>
        ) : (
          <span className="flex items-center gap-1 text-green-500"><CheckCircle2 className="h-3 w-3" /> {current?.command} — {current?.rowCount} rows</span>
        )}
        <div className="ml-auto flex gap-1">
          <button onClick={() => copyToClipboard('csv')} className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-accent" title="Copy CSV">
            <Copy className="h-3 w-3" /> CSV
          </button>
          <button onClick={() => copyToClipboard('json')} className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-accent" title="Copy JSON">
            <Copy className="h-3 w-3" /> JSON
          </button>
          <button onClick={() => downloadFile('csv')} className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-accent" title="Download CSV">
            <Download className="h-3 w-3" /> Export
          </button>
        </div>
      </div>

      {activeView === 'messages' ? (
        <div className="flex-1 overflow-auto p-3 font-mono text-xs space-y-2">
          {results.map((r, i) => (
            <div key={i}>
              {r.error ? (
                <div className="text-destructive whitespace-pre-wrap">
                  <span className="font-bold">Statement #{i + 1}:</span> {r.error}
                </div>
              ) : (
                <div className="text-green-500">
                  Statement #{i + 1}: {r.command} — {r.rowCount} row(s) affected. ({r.duration}ms)
                </div>
              )}
            </div>
          ))}
          <div className="text-muted-foreground border-t pt-2 mt-2">
            Total: {results.length} statement(s) executed in {batch.totalDuration}ms
          </div>
        </div>
      ) : (
        current && <ResultGrid result={current} onLoadMore={current.hasMore ? loadMore : undefined} isLoadingMore={activeTab?.isLoadingMore} hasMore={current.hasMore} />
      )}
    </div>
  );
}
