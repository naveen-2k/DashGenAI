import React, { useState, useMemo } from 'react';
import { 
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { 
  Trash2, Maximize2, Minimize2, Download, RefreshCw, BarChart2, 
  Settings2, Eye, EyeOff, Calendar, FileJson, TrendingUp, Info
} from 'lucide-react';
import { Widget, ChartType } from '../types';
import { aggregateData } from '../utils/csvHelper';

interface ChartWidgetProps {
  key?: string;
  widget: Widget;
  data: Record<string, any>[];
  columns: string[];
  onUpdate: (updatedWidget: Widget) => void;
  onDelete: () => void;
}

const COLORS = [
  '#4f46e5', '#10b981', '#f43f5e', '#f59e0b', 
  '#06b6d4', '#ec4899', '#8b5cf6', '#14b8a6',
  '#84cc16', '#eab308', '#a855f7', '#3b82f6'
];

export default function ChartWidget({ widget, data, columns, onUpdate, onDelete }: ChartWidgetProps) {
  const [showConfig, setShowConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<'view' | 'data'>('view');

  // Local widget editing state
  const { title, chartType, xAxisKey, yAxisKeys, secondaryAxisKey, size, aggregation } = widget;

  // Process data for charts
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Support Candlestick and Heatmap raw, or other aggregations
    if (chartType === 'candlestick' || chartType === 'heatmap') {
      return data;
    }
    
    return aggregateData(data, xAxisKey, yAxisKeys, aggregation || 'none');
  }, [data, xAxisKey, yAxisKeys, aggregation, chartType]);

  // Export CSV
  const handleExportCSV = () => {
    if (chartData.length === 0) return;
    const headers = Object.keys(chartData[0]);
    const csvContent = [
      headers.join(','),
      ...chartData.map(row => headers.map(h => {
        const val = row[h];
        return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${title.replace(/\s+/g, '_')}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Widget JSON
  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(widget, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${title.replace(/\s+/g, '_')}_config.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Custom CandleStick Chart Renderer (Beautiful bespoke financial SVG chart)
  const renderCandlestick = () => {
    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-400">
          No data available for Candlestick
        </div>
      );
    }

    // Try to map Open, High, Low, Close (Case insensitive or matching widget keys)
    const openKey = yAxisKeys[0] || 'Open';
    const highKey = yAxisKeys[1] || 'High';
    const lowKey = yAxisKeys[2] || 'Low';
    const closeKey = yAxisKeys[3] || 'Close';

    const points = chartData.map(row => {
      return {
        date: String(row[xAxisKey] || ''),
        open: Number(row[openKey] || 0),
        high: Number(row[highKey] || 0),
        low: Number(row[lowKey] || 0),
        close: Number(row[closeKey] || 0),
      };
    }).filter(p => !isNaN(p.open) && !isNaN(p.high) && !isNaN(p.low) && !isNaN(p.close));

    if (points.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400 p-4 text-center">
          <Info className="w-8 h-8 text-amber-500 mb-2" />
          <p className="text-sm font-medium">Candlestick requires Open, High, Low, Close numeric columns.</p>
          <p className="text-xs text-gray-500 mt-1">Please configure your Y-Axis keys to map to those columns.</p>
        </div>
      );
    }

    // Find min and max for bounds
    const prices = points.flatMap(p => [p.open, p.high, p.low, p.close]);
    const minPrice = Math.min(...prices) * 0.99;
    const maxPrice = Math.max(...prices) * 1.01;
    const priceRange = maxPrice - minPrice;

    return (
      <div className="w-full h-full min-h-[280px] flex flex-col justify-between font-sans">
        <div className="flex-1 relative w-full h-[240px] border border-gray-100 rounded-lg p-2 bg-slate-50/50">
          <svg className="w-full h-full" viewBox="0 0 1000 300" preserveAspectRatio="none">
            {/* Draw grid lines */}
            {[0.25, 0.5, 0.75].map((ratio, idx) => (
              <line 
                key={idx}
                x1="0" 
                y1={300 * ratio} 
                x2="1000" 
                y2={300 * ratio} 
                stroke="#e2e8f0" 
                strokeDasharray="4 4" 
                strokeWidth="1"
              />
            ))}

            {/* Render candlesticks */}
            {points.map((p, index) => {
              const xRatio = (index + 0.5) / points.length;
              const x = xRatio * 1000;
              const candleWidth = Math.max(4, 800 / points.length);

              // Map price to SVG coordinate (y increases downwards)
              const getY = (price: number) => {
                return 300 - ((price - minPrice) / priceRange) * 300;
              };

              const yOpen = getY(p.open);
              const yClose = getY(p.close);
              const yHigh = getY(p.high);
              const yLow = getY(p.low);

              const isGreen = p.close >= p.open;
              const candleColor = isGreen ? '#10b981' : '#ef4444';

              return (
                <g key={index} className="group cursor-pointer">
                  <title>
                    {`Date: ${p.date}\nOpen: ${p.open}\nHigh: ${p.high}\nLow: ${p.low}\nClose: ${p.close}`}
                  </title>
                  {/* Wick */}
                  <line 
                    x1={x} 
                    y1={yHigh} 
                    x2={x} 
                    y2={yLow} 
                    stroke={candleColor} 
                    strokeWidth="2" 
                  />
                  {/* Candle body */}
                  <rect 
                    x={x - candleWidth / 2} 
                    y={Math.min(yOpen, yClose)} 
                    width={candleWidth} 
                    height={Math.max(2, Math.abs(yOpen - yClose))} 
                    fill={candleColor} 
                    rx="1"
                  />
                </g>
              );
            })}
          </svg>

          {/* Min/Max indicators */}
          <div className="absolute top-2 right-2 text-[10px] bg-white/80 border border-gray-100 rounded px-1.5 py-0.5 text-gray-500 font-mono">
            High: {maxPrice.toFixed(2)}
          </div>
          <div className="absolute bottom-2 right-2 text-[10px] bg-white/80 border border-gray-100 rounded px-1.5 py-0.5 text-gray-500 font-mono">
            Low: {minPrice.toFixed(2)}
          </div>
        </div>

        {/* X-axis indicators */}
        <div className="flex justify-between text-[10px] text-gray-400 font-mono mt-1.5 px-2">
          <span>{points[0]?.date}</span>
          <span>{points[Math.floor(points.length / 2)]?.date}</span>
          <span>{points[points.length - 1]?.date}</span>
        </div>
      </div>
    );
  };

  // Custom Heatmap Renderer (Beautiful grid visualizer)
  const renderHeatmap = () => {
    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-400">
          No data available for Heatmap
        </div>
      );
    }

    const valKey = yAxisKeys[0];
    const secKey = secondaryAxisKey || yAxisKeys[1] || xAxisKey;

    if (!valKey) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400 p-4 text-center">
          <Info className="w-8 h-8 text-amber-500 mb-2" />
          <p className="text-sm font-medium">Heatmap requires at least one numeric metric key.</p>
          <p className="text-xs text-gray-500 mt-1">Please select a metric column in your Y-Axis keys list.</p>
        </div>
      );
    }

    // Prepare distinct values for X axis and Y axis to make a matrix
    const xValues: string[] = Array.from(new Set(chartData.map(d => String(d[xAxisKey] || '')))).slice(0, 15) as string[];
    const yValues: string[] = Array.from(new Set(chartData.map(d => String(d[secKey] || '')))).slice(0, 10) as string[];

    // Map data to coordinate cells
    const cells: { x: string; y: string; value: number; raw: any }[] = [];
    chartData.forEach(row => {
      const xVal = String(row[xAxisKey] || '');
      const yVal = String(row[secKey] || '');
      const value = Number(row[valKey] || 0);
      if (xValues.includes(xVal) && yValues.includes(yVal)) {
        cells.push({ x: xVal, y: yVal, value, raw: row });
      }
    });

    const allValues = cells.map(c => c.value);
    const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1;
    const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
    const valRange = maxVal - minVal || 1;

    // Heatmap cell color based on density/intensity
    const getCellColor = (val: number) => {
      const intensity = (val - minVal) / valRange; // 0 to 1
      // Soft blue gradient: from light gray-blue to deep royal blue
      if (intensity < 0.25) return 'bg-blue-50 text-blue-900 border-blue-100';
      if (intensity < 0.5) return 'bg-blue-200 text-blue-900 border-blue-300';
      if (intensity < 0.75) return 'bg-blue-400 text-white border-blue-500';
      return 'bg-blue-600 text-white border-blue-700 font-medium';
    };

    return (
      <div className="w-full h-full flex flex-col justify-between select-none">
        <div className="flex-1 overflow-auto max-h-[300px] border border-gray-100 rounded-lg p-3 bg-slate-50/50">
          <div className="grid gap-1" style={{ gridTemplateColumns: `auto repeat(${xValues.length}, minmax(40px, 1fr))` }}>
            {/* Top Empty Corner Cell */}
            <div className="text-[10px] text-gray-400 font-medium self-end pb-1 pr-2 truncate max-w-[80px]">
              {secKey} \\ {xAxisKey}
            </div>

            {/* X-Axis Header Cells */}
            {xValues.map(xv => (
              <div key={xv} className="text-[9px] font-mono text-gray-500 text-center pb-1 truncate" title={xv}>
                {xv.length > 8 ? xv.substring(5, 10) : xv}
              </div>
            ))}

            {/* Grid rows */}
            {yValues.map(yv => {
              return (
                <React.Fragment key={yv}>
                  {/* Row header */}
                  <div className="text-[9px] font-mono text-gray-500 font-medium self-center pr-2 truncate max-w-[80px]" title={yv}>
                    {yv}
                  </div>

                  {/* Matrix Cells */}
                  {xValues.map(xv => {
                    const matched = cells.find(c => c.x === xv && c.y === yv);
                    const val = matched ? matched.value : 0;
                    return (
                      <div 
                        key={`${xv}-${yv}`}
                        className={`h-8 rounded flex items-center justify-center text-[10px] border transition-colors ${getCellColor(val)}`}
                        title={`X: ${xv}\nY: ${yv}\nValue: ${val}`}
                      >
                        {val.toFixed(1)}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
        <div className="flex justify-between items-center text-[10px] text-gray-400 mt-2 px-1">
          <span>Min: {minVal.toFixed(1)}</span>
          <div className="flex gap-1 items-center">
            <span className="w-3 h-3 bg-blue-50 border border-blue-100 rounded"></span>
            <span className="w-3 h-3 bg-blue-200 border border-blue-300 rounded"></span>
            <span className="w-3 h-3 bg-blue-400 border border-blue-500 rounded"></span>
            <span className="w-3 h-3 bg-blue-600 border border-blue-700 rounded"></span>
            <span className="ml-1 text-gray-500">Density Legend</span>
          </div>
          <span>Max: {maxVal.toFixed(1)}</span>
        </div>
      </div>
    );
  };

  // Render core charting
  const renderChart = () => {
    if (chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm italic">
          No records matching current criteria
        </div>
      );
    }

    switch (chartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height="100%" minHeight={260}>
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey={xAxisKey} stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 12 }} />
              {yAxisKeys.map((key, idx) => (
                <Line 
                  key={key} 
                  type="monotone" 
                  dataKey={key} 
                  stroke={COLORS[idx % COLORS.length]} 
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 1.5 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%" minHeight={260}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey={xAxisKey} stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 12 }} />
              {yAxisKeys.map((key, idx) => (
                <Bar 
                  key={key} 
                  dataKey={key} 
                  fill={COLORS[idx % COLORS.length]} 
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%" minHeight={260}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
              <defs>
                {yAxisKeys.map((key, idx) => (
                  <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.4}/>
                    <stop offset="95%" stopColor={COLORS[idx % COLORS.length]} stopOpacity={0.0}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey={xAxisKey} stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 12 }} />
              {yAxisKeys.map((key, idx) => (
                <Area 
                  key={key} 
                  type="monotone" 
                  dataKey={key} 
                  stroke={COLORS[idx % COLORS.length]} 
                  fillOpacity={1} 
                  fill={`url(#grad-${key})`}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'pie':
        const pieData = chartData.map(d => ({
          name: String(d[xAxisKey] || ''),
          value: yAxisKeys.length > 0 ? Number(d[yAxisKeys[0]] || 0) : 0
        })).filter(p => p.value > 0);

        return (
          <ResponsiveContainer width="100%" height="100%" minHeight={260}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'scatter':
        const xKey = xAxisKey;
        const yKey = secondaryAxisKey || yAxisKeys[0];

        // Ensure columns are numeric
        const scatterData = chartData.map(d => ({
          x: Number(d[xKey]),
          y: Number(d[yKey]),
          label: String(d[columns[0]] || '') // Reference column for label
        })).filter(d => !isNaN(d.x) && !isNaN(d.y));

        return (
          <ResponsiveContainer width="100%" height="100%" minHeight={260}>
            <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis 
                type="number" 
                dataKey="x" 
                name={xKey} 
                stroke="#94a3b8" 
                fontSize={11} 
                label={{ value: xKey, position: 'bottom', offset: -5, fontSize: 11, fill: '#64748b' }}
              />
              <YAxis 
                type="number" 
                dataKey="y" 
                name={yKey} 
                stroke="#94a3b8" 
                fontSize={11} 
                label={{ value: yKey, angle: -90, position: 'insideLeft', offset: 0, fontSize: 11, fill: '#64748b' }}
              />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }} 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const p = payload[0].payload;
                    return (
                      <div className="bg-white border border-gray-100 rounded-lg p-2.5 shadow-sm text-xs space-y-0.5">
                        <p className="font-medium text-gray-700">{p.label}</p>
                        <p className="text-gray-500">{xKey}: <span className="font-mono text-gray-900 font-semibold">{p.x}</span></p>
                        <p className="text-gray-500">{yKey}: <span className="font-mono text-gray-900 font-semibold">{p.y}</span></p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Scatter name={`${xKey} vs ${yKey}`} data={scatterData} fill="#ec4899" />
            </ScatterChart>
          </ResponsiveContainer>
        );

      case 'candlestick':
        return renderCandlestick();

      case 'heatmap':
        return renderHeatmap();

      default:
        return <div className="text-gray-400 italic text-sm">Unsupported chart type</div>;
    }
  };

  const sizeClass = {
    sm: 'col-span-1 md:col-span-1 lg:col-span-4 h-96',
    md: 'col-span-1 md:col-span-2 lg:col-span-6 h-[420px]',
    lg: 'col-span-1 md:col-span-2 lg:col-span-8 h-[440px]',
    full: 'col-span-1 md:col-span-2 lg:col-span-12 h-[480px]'
  }[size || 'md'];

  return (
    <div 
      id={widget.id}
      className={`bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md/5 transition-all p-5 flex flex-col justify-between ${sizeClass}`}
    >
      {/* Widget Header */}
      <div className="flex items-start justify-between pb-3 border-b border-slate-50 mb-4">
        <div className="space-y-0.5 max-w-[70%]">
          <h3 className="font-semibold text-slate-800 tracking-tight text-base truncate" title={title}>
            {title}
          </h3>
          <p className="text-[10px] text-slate-400 font-mono truncate">
            Source: {widget.csvFilename}
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-slate-400">
          <button 
            onClick={() => setActiveTab(activeTab === 'view' ? 'data' : 'view')}
            className={`p-1.5 rounded-lg hover:bg-slate-50 transition-colors ${activeTab === 'data' ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-50' : ''}`}
            title={activeTab === 'data' ? 'Show Chart' : 'Show Data Table'}
          >
            <BarChart2 className="w-4 h-4" />
          </button>
          
          <button 
            onClick={() => setShowConfig(!showConfig)}
            className={`p-1.5 rounded-lg hover:bg-slate-50 transition-colors ${showConfig ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-50' : ''}`}
            title="Configure Chart"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          <div className="h-4 w-[1px] bg-slate-100 mx-0.5"></div>

          <button 
            onClick={handleExportCSV}
            className="p-1.5 rounded-lg hover:bg-slate-50 hover:text-slate-600 transition-colors"
            title="Export CSV"
          >
            <Download className="w-4 h-4" />
          </button>

          <button 
            onClick={handleExportJSON}
            className="p-1.5 rounded-lg hover:bg-slate-50 hover:text-slate-600 transition-colors"
            title="Export Widget JSON"
          >
            <FileJson className="w-4 h-4" />
          </button>

          <button 
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-colors"
            title="Delete Widget"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Widget Configuration Panel */}
      {showConfig && (
        <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-3.5 mb-4 space-y-3 text-xs text-slate-600">
          <div className="grid grid-cols-2 gap-3.5">
            {/* Chart Type Selection */}
            <div>
              <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Chart Type</label>
              <select 
                value={chartType} 
                onChange={(e) => onUpdate({ ...widget, chartType: e.target.value as ChartType })}
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 outline-none focus:border-indigo-500"
              >
                <option value="line">Line Graph</option>
                <option value="bar">Bar Chart</option>
                <option value="area">Area Graph</option>
                <option value="pie">Pie Chart</option>
                <option value="scatter">Scatter Correlation</option>
                <option value="candlestick">Candlestick (Stock)</option>
                <option value="heatmap">Density Heatmap</option>
              </select>
            </div>

            {/* Size selection */}
            <div>
              <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Widget Width</label>
              <select 
                value={size} 
                onChange={(e) => onUpdate({ ...widget, size: e.target.value as any })}
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 outline-none focus:border-indigo-500"
              >
                <option value="sm">Small (1/3 Width)</option>
                <option value="md">Medium (1/2 Width)</option>
                <option value="lg">Large (2/3 Width)</option>
                <option value="full">Full Screen Width</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* X Axis */}
            <div>
              <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">X-Axis Variable</label>
              <select 
                value={xAxisKey} 
                onChange={(e) => onUpdate({ ...widget, xAxisKey: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none focus:border-indigo-500"
              >
                {columns.map(col => <option key={col} value={col}>{col}</option>)}
              </select>
            </div>

            {/* Y Axis Metrics (First Key) */}
            <div>
              <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                {chartType === 'candlestick' ? 'Open Price Column' : chartType === 'scatter' ? 'X-Axis Scatter Var' : 'Y-Axis Metric'}
              </label>
              <select 
                value={yAxisKeys[0] || ''} 
                onChange={(e) => {
                  const keys = [...yAxisKeys];
                  keys[0] = e.target.value;
                  onUpdate({ ...widget, yAxisKeys: keys });
                }}
                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none focus:border-indigo-500"
              >
                <option value="">(None)</option>
                {columns.map(col => <option key={col} value={col}>{col}</option>)}
              </select>
            </div>

            {/* Aggregation Selection */}
            {chartType !== 'candlestick' && chartType !== 'heatmap' && chartType !== 'scatter' ? (
              <div>
                <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Group By Formula</label>
                <select 
                  value={aggregation || 'none'} 
                  onChange={(e) => onUpdate({ ...widget, aggregation: e.target.value as any })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none focus:border-indigo-500"
                >
                  <option value="none">Raw Data (None)</option>
                  <option value="sum">Sum values</option>
                  <option value="avg">Average values</option>
                  <option value="count">Count records</option>
                </select>
              </div>
            ) : chartType === 'scatter' || chartType === 'heatmap' ? (
              <div>
                <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Y-Axis Scatter Var</label>
                <select 
                  value={secondaryAxisKey || ''} 
                  onChange={(e) => onUpdate({ ...widget, secondaryAxisKey: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none focus:border-indigo-500"
                >
                  <option value="">(Same as X-Axis)</option>
                  {columns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">High Price Column</label>
                <select 
                  value={yAxisKeys[1] || ''} 
                  onChange={(e) => {
                    const keys = [...yAxisKeys];
                    keys[1] = e.target.value;
                    onUpdate({ ...widget, yAxisKeys: keys });
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none focus:border-indigo-500"
                >
                  {columns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Candlestick Special configurations */}
          {chartType === 'candlestick' && (
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100 mt-2">
              <div>
                <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Low Price Column</label>
                <select 
                  value={yAxisKeys[2] || ''} 
                  onChange={(e) => {
                    const keys = [...yAxisKeys];
                    keys[2] = e.target.value;
                    onUpdate({ ...widget, yAxisKeys: keys });
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none"
                >
                  {columns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Close Price Column</label>
                <select 
                  value={yAxisKeys[3] || ''} 
                  onChange={(e) => {
                    const keys = [...yAxisKeys];
                    keys[3] = e.target.value;
                    onUpdate({ ...widget, yAxisKeys: keys });
                  }}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-700 outline-none"
                >
                  {columns.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Content Area (View vs Data Grid) */}
      <div className="flex-1 w-full h-[80%] overflow-hidden">
        {activeTab === 'view' ? (
          <div className="w-full h-full min-h-[250px] relative">
            {renderChart()}
          </div>
        ) : (
          <div className="w-full h-full overflow-auto max-h-[300px] border border-slate-100 rounded-xl bg-slate-50/50">
            <table className="w-full text-left border-collapse text-[11px] font-sans">
              <thead>
                <tr className="bg-slate-100/80 sticky top-0 text-slate-600 border-b border-slate-200">
                  <th className="p-2.5 font-semibold font-mono">{xAxisKey}</th>
                  {yAxisKeys.map(yk => (
                    <th key={yk} className="p-2.5 font-semibold font-mono">{yk}</th>
                  ))}
                  {secondaryAxisKey && <th className="p-2.5 font-semibold font-mono">{secondaryAxisKey}</th>}
                </tr>
              </thead>
              <tbody>
                {chartData.slice(0, 50).map((row, idx) => (
                  <tr key={idx} className="border-b border-slate-100 bg-white hover:bg-slate-50 transition-colors">
                    <td className="p-2 text-slate-700 font-mono font-medium">{String(row[xAxisKey] || '')}</td>
                    {yAxisKeys.map(yk => (
                      <td key={yk} className="p-2 text-slate-600 font-mono">{row[yk] !== null && row[yk] !== undefined ? String(row[yk]) : '-'}</td>
                    ))}
                    {secondaryAxisKey && <td className="p-2 text-slate-600 font-mono">{row[secondaryAxisKey] !== null && row[secondaryAxisKey] !== undefined ? String(row[secondaryAxisKey]) : '-'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {chartData.length > 50 && (
              <div className="p-2.5 text-center text-[10px] text-slate-400 bg-white border-t border-slate-100 italic">
                Showing top 50 records. Click export to download complete dataset.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
