import { SortOption } from './SortToggle';

// Define quote interface for sorting
interface Quote {
  id: string;
  provider?: string;
  estimatedTime?: string;
  outputAmount?: string;
  outputToken?: string;
  sourceAmount?: string;
  sourceToken?: string;
  sourceChain?: string;
  destinationChain?: string;
  fees?: {
    bridge?: number;
    gas?: number;
  };
  reliability?: number; // Success rate percentage (0-100)
  speed?: number; // Estimated time in minutes
}

/**
 * Parse estimated time string to minutes
 */
const parseTimeToMinutes = (timeStr?: string): number => {
  if (!timeStr) return 5; // Default fallback
  
  const lowerStr = timeStr.toLowerCase();
  
  if (lowerStr.includes('instant')) return 0;
  if (lowerStr.includes('< 1')) return 0.5;
  if (lowerStr.includes('~1')) return 1;
  if (lowerStr.includes('~2')) return 2;
  if (lowerStr.includes('~3')) return 3;
  if (lowerStr.includes('~5')) return 5;
  if (lowerStr.includes('~10')) return 10;
  
  // Extract numbers from string
  const numbers = lowerStr.match(/\d+/);
  return numbers ? parseInt(numbers[0]) : 5;
};

/**
 * Calculate total fees from quote
 */
const getTotalFees = (quote: Quote): number => {
  if (!quote.fees) return 0;
  return (quote.fees.bridge || 0) + (quote.fees.gas || 0);
};

/**
 * Sort quotes by different criteria
 */
export const sortQuotes = (quotes: Quote[], sortBy: SortOption): Quote[] => {
  const sortedQuotes = [...quotes]; // Create a copy to avoid mutation

  switch (sortBy) {
    case 'fee':
      return sortedQuotes.sort((a, b) => {
        const feeA = getTotalFees(a);
        const feeB = getTotalFees(b);
        return feeA - feeB;
      });

    case 'speed':
      return sortedQuotes.sort((a, b) => {
        const speedA = a.speed || parseTimeToMinutes(a.estimatedTime);
        const speedB = b.speed || parseTimeToMinutes(b.estimatedTime);
        return speedA - speedB;
      });

    case 'reliability':
      return sortedQuotes.sort((a, b) => {
        const reliabilityA = a.reliability || 95; // Default high reliability
        const reliabilityB = b.reliability || 95;
        return reliabilityB - reliabilityA; // Higher reliability first
      });

    case 'recommended':
    default:
      // Recommended sorting: Balance of fee, speed, and reliability
      return sortedQuotes.sort((a, b) => {
        const feeA = getTotalFees(a);
        const feeB = getTotalFees(b);
        const speedA = a.speed || parseTimeToMinutes(a.estimatedTime);
        const speedB = b.speed || parseTimeToMinutes(b.estimatedTime);
        const reliabilityA = a.reliability || 95;
        const reliabilityB = b.reliability || 95;

        // Calculate scores (lower is better for fees/speed, higher for reliability)
        const scoreA = (feeA / 10) + speedA + (100 - reliabilityA) / 10;
        const scoreB = (feeB / 10) + speedB + (100 - reliabilityB) / 10;

        return scoreA - scoreB;
      });
  }
};

/**
 * Get sort display information
 */
export const getSortInfo = (sortBy: SortOption) => {
  const info = {
    recommended: {
      label: 'Recommended',
      description: 'Best overall routes based on fee, speed, and reliability',
      icon: '⭐'
    },
    fee: {
      label: 'Lowest Fee',
      description: 'Routes with the lowest total fees',
      icon: '💰'
    },
    speed: {
      label: 'Fastest',
      description: 'Quickest completion times',
      icon: '⚡'
    },
    reliability: {
      label: 'Most Reliable',
      description: 'Routes with highest success rates',
      icon: '🛡️'
    }
  };

  return info[sortBy];
};

/**
 * Enhance quotes with additional sorting metadata
 */
export const enhanceQuotesForSorting = (quotes: any[]): Quote[] => {
  return quotes.map(quote => ({
    ...quote,
    // Add mock reliability if not present
    reliability: quote.reliability || Math.floor(Math.random() * 10) + 90, // 90-99%
    // Add mock speed if not present
    speed: quote.speed || parseTimeToMinutes(quote.estimatedTime)
  }));
};
