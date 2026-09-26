import React, { useState } from 'react';

export interface FeeItem {
  label: string;
  amount: string;
  currency?: string;
  tooltip?: string;
}

export interface FeeBreakdownProps {
  baseFee: FeeItem;
  gasFee: FeeItem;
  bridgeFee: FeeItem;
  totalFee?: FeeItem;
  /** Optional additional fees */
  extraFees?: FeeItem[];
}

const Tooltip: React.FC<{ text: string }> = ({ text }) => {
  const [visible, setVisible] = useState(false);

  return (
    <span style={{ position: 'relative', display: 'inline-block', marginLeft: 4 }}>
      <button
        type="button"
        aria-label={`Info: ${text}`}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        style={{
          background: 'none',
          border: '1px solid currentColor',
          borderRadius: '50%',
          cursor: 'pointer',
          fontSize: 11,
          lineHeight: 1,
          padding: '0 4px',
          verticalAlign: 'middle',
        }}
      >
        ?
      </button>
      {visible && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: '120%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1f2937',
            color: '#f9fafb',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 12,
            whiteSpace: 'nowrap',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
};

const FeeRow: React.FC<{ item: FeeItem; bold?: boolean }> = ({ item, bold }) => (
  <tr>
    <td style={{ padding: '4px 8px', fontWeight: bold ? 'bold' : 'normal' }}>
      {item.label}
      {item.tooltip && <Tooltip text={item.tooltip} />}
    </td>
    <td
      style={{
        padding: '4px 8px',
        textAlign: 'right',
        fontWeight: bold ? 'bold' : 'normal',
      }}
    >
      {item.amount} {item.currency ?? ''}
    </td>
  </tr>
);

/**
 * FeeBreakdown — displays base fee, gas fee, bridge fee, and optional extras
 * with tooltip explanations for each line item.
 */
export const FeeBreakdown: React.FC<FeeBreakdownProps> = ({
  baseFee,
  gasFee,
  bridgeFee,
  totalFee,
  extraFees = [],
}) => {
  const computedTotal: FeeItem = totalFee ?? {
    label: 'Total',
    amount: 'See above',
  };

  return (
    <section aria-label="Fee breakdown">
      <h3 style={{ marginBottom: 8 }}>Fee Breakdown</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <FeeRow item={baseFee} />
          <FeeRow item={gasFee} />
          <FeeRow item={bridgeFee} />
          {extraFees.map((fee, i) => (
            <FeeRow key={i} item={fee} />
          ))}
          <tr>
            <td colSpan={2}>
              <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
            </td>
          </tr>
          <FeeRow item={computedTotal} bold />
        </tbody>
      </table>
    </section>
  );
};

export default FeeBreakdown;
