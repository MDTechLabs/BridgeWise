import React from 'react';

export type FailureRisk = 'high' | 'medium' | 'low';

interface RouteRiskWarningProps {
  failureRisk: FailureRisk;
  riskFactors: string[];
}

const RISK_CONFIG: Record<
  Exclude<FailureRisk, 'low'>,
  { title: string; containerClass: string; titleClass: string; bulletClass: string; iconColor: string }
> = {
  high: {
    title: 'High failure risk',
    containerClass: 'bg-red-50 border border-red-200 rounded-lg p-3',
    titleClass: 'text-red-700 font-semibold text-xs',
    bulletClass: 'text-red-600',
    iconColor: 'text-red-500',
  },
  medium: {
    title: 'Moderate failure risk',
    containerClass: 'bg-yellow-50 border border-yellow-200 rounded-lg p-3',
    titleClass: 'text-yellow-700 font-semibold text-xs',
    bulletClass: 'text-yellow-600',
    iconColor: 'text-yellow-500',
  },
};

export const RouteRiskWarning: React.FC<RouteRiskWarningProps> = ({
  failureRisk,
  riskFactors,
}) => {
  if (failureRisk === 'low') return null;

  const config = RISK_CONFIG[failureRisk];

  return (
    <div className={config.containerClass} role="alert">
      <div className="flex items-center gap-1.5 mb-1.5">
        <WarningIcon className={`w-3.5 h-3.5 flex-shrink-0 ${config.iconColor}`} />
        <span className={config.titleClass}>{config.title}</span>
      </div>
      {riskFactors.length > 0 && (
        <ul className="space-y-0.5 pl-5 list-disc">
          {riskFactors.map((factor) => (
            <li key={factor} className={`text-xs ${config.bulletClass}`}>
              {factor}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Inline SVG to avoid a lucide-react dependency in this component
const WarningIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
