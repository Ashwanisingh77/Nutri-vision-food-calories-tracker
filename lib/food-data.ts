// ─── Reference objects for portion calibration UI ─────────────────────
// Kept from original design. The actual portion estimation now comes from
// the vision model's estimated_grams field.

export const REFERENCE_OBJECTS = [
  {
    id: 'credit-card',
    label: 'Credit Card',
    icon: 'card',
    dimensions: '85.6 × 54mm',
    description: 'Place a credit/debit card next to your food',
  },
  {
    id: 'tablespoon',
    label: 'Tablespoon',
    icon: 'spoon',
    dimensions: '15ml volume',
    description: 'Use a standard tablespoon for reference',
  },
  {
    id: 'hand',
    label: 'Your Hand',
    icon: 'hand',
    dimensions: 'Palm ≈ 85g',
    description: 'Hold your hand flat next to the food',
  },
];
