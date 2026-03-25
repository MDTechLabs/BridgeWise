import { useState, useEffect } from "react";

interface UseSlippageAlertProps {
  token: string;
  sourceChain: string;
  destinationChain: string;
  maxSlippagePercent: number;
}

interface UseSlippageAlertResult {
  slippage: number;
  threshold: number;
  exceeded: boolean;
  errors: string[];
}

export const useSlippageAlert = ({
  token,
  sourceChain,
  destinationChain,
  maxSlippagePercent,
}: UseSlippageAlertProps): UseSlippageAlertResult => {
  const [slippage, setSlippage] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const fetchSlippage = async () => {
      try {
        // Simulate API call to fetch slippage data
        const response = await fetch(
          `/api/slippage?token=${token}&sourceChain=${sourceChain}&destinationChain=${destinationChain}`
        );
        const data = await response.json();
        setSlippage(data.slippage);
      } catch (error) {
        setErrors((prev) => [...prev, "Failed to fetch slippage data"]);
      }
    };

    fetchSlippage();
  }, [token, sourceChain, destinationChain]);

  const exceeded = slippage > maxSlippagePercent;

  return {
    slippage,
    threshold: maxSlippagePercent,
    exceeded,
    errors,
  };
};