/**
 * Component to display damage counts by type (dark theme)
 */
interface DamageCountProps {
  damageCounts: Record<string, number>;
}

export function DamageCount({ damageCounts }: DamageCountProps) {
  const damageTypeLabels: Record<string, string> = {
    missing_shingles: 'Missing Shingles',
    torn_shingles: 'Torn Shingles',
    water_stains: 'Water Stains',
    hail_impact: 'Hail Impact',
    cracks: 'Cracks',
    sagging: 'Sagging',
    discoloration: 'Discoloration',
    exposed_underlayment: 'Exposed Underlayment',
    damaged_shingles: 'Damaged Shingles',
    unknown: 'Unknown Damage',
  };

  const damageTypeColors: Record<string, string> = {
    missing_shingles: 'bg-red-900/40 text-red-300 border-red-700/50',
    torn_shingles: 'bg-orange-900/40 text-orange-300 border-orange-700/50',
    water_stains: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
    hail_impact: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/50',
    cracks: 'bg-purple-900/40 text-purple-300 border-purple-700/50',
    sagging: 'bg-pink-900/40 text-pink-300 border-pink-700/50',
    discoloration: 'bg-cyan-900/40 text-cyan-300 border-cyan-700/50',
    exposed_underlayment: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
    damaged_shingles: 'bg-rose-900/40 text-rose-300 border-rose-700/50',
    unknown: 'bg-slate-700/40 text-slate-300 border-slate-600/50',
  };

  if (Object.keys(damageCounts).length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
        <p className="text-slate-400">No damage detected</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-4">
      <h3 className="text-lg font-semibold text-white mb-4">Damage Summary</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(damageCounts).map(([damageType, count]) => (
          <div
            key={damageType}
            className={`${damageTypeColors[damageType] || damageTypeColors.unknown} border rounded-xl p-3 flex items-center justify-between`}
          >
            <span className="font-medium">{damageTypeLabels[damageType] || damageType.replace(/_/g, ' ')}:</span>
            <span className="font-bold text-lg">{count}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-slate-700">
        <p className="text-sm text-slate-400">
          Total damage areas: <span className="font-semibold text-white">{Object.values(damageCounts).reduce((a, b) => a + b, 0)}</span>
        </p>
      </div>
    </div>
  );
}

