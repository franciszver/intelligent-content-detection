interface AgentStatusListProps {
  statuses: Record<
    string,
    {
      label: string;
      status: string;
      details?: string;
    }
  >;
}

const STATUS_STYLES: Record<string, string> = {
  idle: 'text-gray-500 bg-gray-100',
  pending: 'text-yellow-700 bg-yellow-100',
  running: 'text-blue-700 bg-blue-100',
  completed: 'text-green-700 bg-green-100',
  failed: 'text-red-700 bg-red-100',
};

export function AgentStatusList({ statuses }: AgentStatusListProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-8">
      {Object.entries(statuses).map(([key, state]) => {
        const style = STATUS_STYLES[state.status] || STATUS_STYLES.idle;
        return (
          <div key={key} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-gray-900">{state.label}</p>
              <span className={`text-xs font-semibold px-2 py-1 rounded ${style}`}>
                {state.status.charAt(0).toUpperCase() + state.status.slice(1)}
              </span>
            </div>
            {state.details && (
              <p className="text-xs text-red-600 mt-2 break-words">Details: {state.details}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

