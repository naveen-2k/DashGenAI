export function detectDateColumn(columns: string[]): string | null {
  const dateKeywords = ['date', 'time', 'timestamp', 'created_at', 'updated_at'];
  for (const col of columns) {
    const lower = col.toLowerCase();
    if (dateKeywords.some(keyword => lower.includes(keyword))) {
      return col;
    }
  }
  return null;
}

export function filterByDateRange(
  data: Record<string, any>[],
  dateCol: string,
  range: '7d' | '30d' | '90d' | 'all'
): Record<string, any>[] {
  if (range === 'all') return data;

  const now = new Date('2026-06-24T07:35:48-07:00'); // Use the provided current metadata time!
  const filterDate = new Date(now);

  if (range === '7d') {
    filterDate.setDate(now.getDate() - 7);
  } else if (range === '30d') {
    filterDate.setDate(now.getDate() - 30);
  } else if (range === '90d') {
    filterDate.setDate(now.getDate() - 90);
  }

  return data.filter(row => {
    const val = row[dateCol];
    if (!val) return false;
    const d = new Date(val);
    return !isNaN(d.getTime()) && d >= filterDate;
  });
}

export function aggregateData(
  data: Record<string, any>[],
  xAxisKey: string,
  yAxisKeys: string[],
  type: 'none' | 'sum' | 'avg' | 'count'
): Record<string, any>[] {
  if (type === 'none' || !type) return data;

  const groups: Record<string, { key: any; counts: number; values: Record<string, number> }> = {};

  data.forEach(row => {
    const xVal = row[xAxisKey];
    const groupKey = xVal === null || xVal === undefined ? '(Blank)' : String(xVal);

    if (!groups[groupKey]) {
      groups[groupKey] = {
        key: xVal,
        counts: 0,
        values: {}
      };
      yAxisKeys.forEach(yk => {
        groups[groupKey].values[yk] = 0;
      });
    }

    groups[groupKey].counts += 1;
    yAxisKeys.forEach(yk => {
      const num = Number(row[yk]);
      if (!isNaN(num)) {
        groups[groupKey].values[yk] += num;
      }
    });
  });

  return Object.values(groups).map(g => {
    const result: Record<string, any> = { [xAxisKey]: g.key };
    
    yAxisKeys.forEach(yk => {
      if (type === 'sum') {
        result[yk] = parseFloat(g.values[yk].toFixed(2));
      } else if (type === 'avg') {
        result[yk] = parseFloat((g.values[yk] / (g.counts || 1)).toFixed(2));
      } else if (type === 'count') {
        result[yk] = g.counts;
      }
    });

    return result;
  });
}
