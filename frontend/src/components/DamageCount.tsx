/**
 * Component to display damage counts by type
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
    unknown: 'Unknown Damage',
  };

  const damageTypeColors: Record<string, string> = {
    missing_shingles: 'bg-red-100 text-red-800',
    torn_shingles: 'bg-orange-100 text-orange-800',
    water_stains: 'bg-blue-100 text-blue-800',
    hail_impact: 'bg-yellow-100 text-yellow-800',
    cracks: 'bg-purple-100 text-purple-800',
    sagging: 'bg-pink-100 text-pink-800',
    discoloration: 'bg-cyan-100 text-cyan-800',
    unknown: 'bg-gray-100 text-gray-800',
  };

  if (Object.keys(damageCounts).length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <p className="text-gray-600">No damage detected</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">Damage Summary</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(damageCounts).map(([damageType, count]) => (
          <div
            key={damageType}
            className={`${damageTypeColors[damageType] || damageTypeColors.unknown} rounded-lg p-3 flex items-center justify-between`}
          >
            <span className="font-medium">{damageTypeLabels[damageType] || damageType}:</span>
            <span className="font-bold text-lg">{count}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-600">
          Total damage areas: <span className="font-semibold">{Object.values(damageCounts).reduce((a, b) => a + b, 0)}</span>
        </p>
      </div>
    </div>
  );
}

