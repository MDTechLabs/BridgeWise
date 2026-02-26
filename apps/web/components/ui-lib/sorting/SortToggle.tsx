import React from 'react';

export type SortOption = 'fee' | 'speed' | 'reliability' | 'recommended';

interface SortToggleProps {
  currentSort: SortOption;
  onSortChange: (sort: SortOption) => void;
  disabled?: boolean;
}

export const SortToggle: React.FC<SortToggleProps> = ({
  currentSort,
  onSortChange,
  disabled = false
}) => {
  const sortOptions = [
    { 
      value: 'recommended' as SortOption, 
      label: 'Recommended', 
      icon: '⭐',
      description: 'Best overall routes'
    },
    { 
      value: 'fee' as SortOption, 
      label: 'Lowest Fee', 
      icon: '💰',
      description: 'Cheapest routes first'
    },
    { 
      value: 'speed' as SortOption, 
      label: 'Fastest', 
      icon: '⚡',
      description: 'Quickest routes first'
    },
    { 
      value: 'reliability' as SortOption, 
      label: 'Most Reliable', 
      icon: '🛡️',
      description: 'Highest success rate'
    }
  ];

  return (
    <div className="flex items-center space-x-2 bg-gray-50 rounded-lg p-1">
      {sortOptions.map((option) => (
        <button
          key={option.value}
          onClick={() => onSortChange(option.value)}
          disabled={disabled}
          className={`
            flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium
            transition-all duration-200 ease-in-out
            ${currentSort === option.value
              ? 'bg-white text-blue-600 shadow-sm border border-blue-200'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }
            ${disabled 
              ? 'opacity-50 cursor-not-allowed' 
              : 'cursor-pointer'
            }
          `}
          title={option.description}
        >
          <span className="text-lg">{option.icon}</span>
          <span className="hidden sm:inline">{option.label}</span>
          <span className="sm:hidden text-xs">{option.label.split(' ')[0]}</span>
        </button>
      ))}
    </div>
  );
};
