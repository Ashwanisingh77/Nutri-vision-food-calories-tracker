'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { AnalysisResult, FoodItemResult } from '@/lib/types';
import {
  CircleCheck as CheckCircle,
  Zap,
  Dumbbell,
  Wheat,
  Droplets,
  RotateCcw,
  Share2,
  Pencil,
  AlertTriangle,
  Loader2,
  SearchX,
} from 'lucide-react';

interface ResultsCardProps {
  result: AnalysisResult;
  imageUrl: string;
  referenceObject: string;
  onReset: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

export default function ResultsCard({ result, imageUrl, referenceObject, onReset }: ResultsCardProps) {
  const [items, setItems] = useState<FoodItemResult[]>(result.items);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editGrams, setEditGrams] = useState('');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Compute totals from items
  const totals = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
      fiber: acc.fiber + item.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );

  const totalCals = round(totals.calories);
  const proteinCals = round(totals.protein * 4);
  const carbsCals = round(totals.carbs * 4);
  const fatCals = round(totals.fat * 9);

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditName(items[index].name);
    setEditGrams(String(items[index].estimated_grams));
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditName('');
    setEditGrams('');
  };

  const recalculateItem = useCallback(
    async (index: number, name: string, grams: number) => {
      setIsRecalculating(true);
      try {
        const response = await fetch('/api/nutrition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ food_name: name, grams }),
        });

        if (!response.ok) throw new Error('Lookup failed');

        const data = await response.json();

        setItems((prev) => {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            name,
            estimated_grams: grams,
            nutrition_per_100g: data.nutrition_per_100g,
            calories: data.calories,
            protein: data.protein,
            carbs: data.carbs,
            fat: data.fat,
            fiber: data.fiber,
            nutrition_found: data.nutrition_found,
          };
          return updated;
        });
      } catch (err) {
        console.error('[ResultsCard] Recalculation error:', err);
      } finally {
        setIsRecalculating(false);
      }
    },
    []
  );

  const handleSaveEdit = (index: number) => {
    const grams = parseFloat(editGrams) || items[index].estimated_grams;
    const name = editName.trim() || items[index].name;

    setEditingIndex(null);

    // Debounce the API call
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      recalculateItem(index, name, grams);
    }, 300);
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const confidencePct = Math.round((result.confidence || 0) * 100);
  const isLowConfidence = result.confidence_level === 'low';

  const macroData = [
    {
      label: 'Protein',
      value: round(totals.protein),
      unit: 'g',
      color: 'from-cyan-500 to-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
      icon: <Dumbbell className="w-4 h-4 text-cyan-400" />,
      max: 60,
    },
    {
      label: 'Carbs',
      value: round(totals.carbs),
      unit: 'g',
      color: 'from-amber-500 to-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      icon: <Wheat className="w-4 h-4 text-amber-400" />,
      max: 60,
    },
    {
      label: 'Fat',
      value: round(totals.fat),
      unit: 'g',
      color: 'from-rose-500 to-rose-400',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
      icon: <Droplets className="w-4 h-4 text-rose-400" />,
      max: 40,
    },
  ];

  return (
    <motion.div
      className="w-full space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header with food image + name */}
      <motion.div
        variants={itemVariants}
        className="relative rounded-2xl overflow-hidden border border-white/10"
      >
        <img src={imageUrl} alt="Analyzed food" className="w-full h-48 object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

        {/* Confidence badge */}
        <div
          className={`absolute top-3 right-3 flex items-center gap-1.5 backdrop-blur-sm rounded-full px-3 py-1 ${
            isLowConfidence
              ? 'bg-amber-500/20 border border-amber-500/30'
              : 'bg-emerald-500/20 border border-emerald-500/30'
          }`}
        >
          {isLowConfidence ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-xs font-semibold text-amber-400">{confidencePct}% confidence</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400">{confidencePct}% match</span>
            </>
          )}
        </div>

        {/* Recalculating indicator */}
        {isRecalculating && (
          <div className="absolute top-3 left-3 bg-cyan-500/20 backdrop-blur-sm border border-cyan-500/30 rounded-full px-3 py-1 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 text-cyan-400 animate-spin" />
            <span className="text-xs text-cyan-400">Updating...</span>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h2 className="text-2xl font-bold text-white">
            {items.length === 1 ? items[0].name : `${items.length} items detected`}
          </h2>
          <p className="text-sm text-white/60 mt-0.5">
            {items.map((it) => `${it.estimated_grams}g`).join(' + ')} detected
          </p>
        </div>
      </motion.div>

      {/* Low confidence warning */}
      {isLowConfidence && (
        <motion.div
          variants={itemVariants}
          className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-amber-400 font-medium">Low Confidence Result</p>
              <p className="text-xs text-white/50 mt-1">
                The AI isn&apos;t very sure about this identification. You can edit the food name and portion below.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Detected items — editable */}
      {items.map((item, index) => (
        <motion.div
          key={index}
          variants={itemVariants}
          className="rounded-xl bg-white/[0.03] border border-white/10 p-4"
        >
          {editingIndex === index ? (
            /* Editing mode */
            <div className="space-y-3">
              <div>
                <label className="text-xs text-white/40 uppercase tracking-wider mb-1 block">Food Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-white/40 uppercase tracking-wider mb-1 block">Estimated Grams</label>
                <input
                  type="number"
                  value={editGrams}
                  onChange={(e) => setEditGrams(e.target.value)}
                  min="1"
                  max="5000"
                  className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSaveEdit(index)}
                  className="flex-1 py-2 rounded-lg bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-500 transition-colors"
                >
                  Update & Recalculate
                </button>
                <button
                  onClick={cancelEditing}
                  className="px-4 py-2 rounded-lg bg-white/5 text-white/50 text-xs font-medium hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Display mode */
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">{item.name}</p>
                  {!item.nutrition_found && (
                    <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 rounded-full px-2 py-0.5">
                      <SearchX className="w-3 h-3" />
                      No data
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/40 mt-0.5">
                  {item.estimated_grams}g · {Math.round(item.confidence * 100)}% confidence
                </p>
                {!item.nutrition_found && (
                  <p className="text-xs text-amber-400/70 mt-1">
                    Nutrition data not found. Try editing the name.
                  </p>
                )}
              </div>
              <button
                onClick={() => startEditing(index)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-cyan-400 transition-all"
                title="Edit food name and portion"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          )}
        </motion.div>
      ))}

      {/* Calories hero card */}
      <motion.div
        variants={itemVariants}
        className="glass-card rounded-2xl p-5 border border-white/10 bg-white/5 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-widest font-medium">Total Calories</p>
            <div className="flex items-end gap-2 mt-1">
              <motion.span
                className="text-5xl font-black text-white"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
              >
                {Math.round(totalCals)}
              </motion.span>
              <span className="text-white/40 text-lg mb-1">kcal</span>
            </div>
          </div>
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/30 flex items-center justify-center">
            <Zap className="w-7 h-7 text-cyan-400" />
          </div>
        </div>

        {/* Calorie donut split */}
        {totalCals > 0 && (
          <div className="mt-4 flex gap-3">
            {[
              { label: 'Protein', pct: Math.round((proteinCals / totalCals) * 100), color: 'bg-cyan-500' },
              { label: 'Carbs', pct: Math.round((carbsCals / totalCals) * 100), color: 'bg-amber-500' },
              { label: 'Fat', pct: Math.round((fatCals / totalCals) * 100), color: 'bg-rose-500' },
            ].map((item) => (
              <div key={item.label} className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-white/50">{item.label}</span>
                  <span className="text-xs text-white/70 font-semibold">{item.pct}%</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${item.color}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${item.pct}%` }}
                    transition={{ delay: 0.6, duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Macros */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3">
        {macroData.map((macro, i) => (
          <motion.div
            key={macro.label}
            className={`rounded-xl p-3.5 border ${macro.border} ${macro.bg} backdrop-blur-xl`}
            whileHover={{ scale: 1.03 }}
            transition={{ type: 'spring', stiffness: 400 }}
          >
            <div className="flex items-center gap-1.5 mb-2">{macro.icon}</div>
            <div className="text-xl font-bold text-white">
              {macro.value}
              <span className="text-xs font-normal text-white/40 ml-0.5">{macro.unit}</span>
            </div>
            <p className="text-xs text-white/50 mt-0.5">{macro.label}</p>
            <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full bg-gradient-to-r ${macro.color}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((macro.value / macro.max) * 100, 100)}%` }}
                transition={{ delay: 0.5 + i * 0.1, duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Portion estimation */}
      <motion.div
        variants={itemVariants}
        className="rounded-2xl p-4 border border-white/10 bg-white/5 backdrop-blur-xl"
      >
        <p className="text-xs text-white/40 uppercase tracking-widest font-medium mb-3">
          Portion Analysis
        </p>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
            <div className="w-5 h-5 rounded-sm border-2 border-teal-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-white font-semibold">
              Calibrated via {referenceObject}
            </p>
            <p className="text-xs text-white/40 mt-0.5">
              Estimated weight: ~{items.reduce((s, i) => s + i.estimated_grams, 0)}g total
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-teal-400">
              {items.reduce((s, i) => s + i.estimated_grams, 0)}g
            </p>
            <p className="text-xs text-white/30">detected</p>
          </div>
        </div>
        <div className="mt-3 p-3 rounded-xl bg-teal-500/5 border border-teal-500/10">
          <p className="text-xs text-white/50 leading-relaxed">
            AI estimated portion sizes for{' '}
            <span className="text-teal-400 font-medium">
              {items.map((it) => it.name).join(', ')}
            </span>
            . Tap the edit icon to adjust.
          </p>
        </div>
      </motion.div>

      {/* Fiber stat */}
      <motion.div
        variants={itemVariants}
        className="rounded-xl px-4 py-3 border border-white/10 bg-white/5 backdrop-blur-xl flex items-center justify-between"
      >
        <span className="text-sm text-white/60">Dietary Fiber</span>
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((round(totals.fiber) / 12) * 100, 100)}%` }}
              transition={{ delay: 0.9, duration: 0.8 }}
            />
          </div>
          <span className="text-sm font-bold text-white">{round(totals.fiber)}g</span>
        </div>
      </motion.div>

      {/* Nutrition source attribution */}
      <motion.div
        variants={itemVariants}
        className="rounded-xl px-4 py-3 border border-white/10 bg-white/[0.02] flex items-center justify-between"
      >
        <span className="text-xs text-white/30">Nutrition data</span>
        <span className="text-xs text-white/50">Open Food Facts Database</span>
      </motion.div>

      {/* Action buttons */}
      <motion.div variants={itemVariants} className="flex gap-3 pb-4">
        <button
          onClick={onReset}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl border border-white/10 bg-white/5 text-white/70 text-sm font-medium hover:bg-white/10 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Scan Again
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 text-white text-sm font-semibold hover:from-cyan-500 hover:to-teal-500 transition-all shadow-lg shadow-cyan-500/20">
          <Share2 className="w-4 h-4" />
          Save Meal
        </button>
      </motion.div>
    </motion.div>
  );
}
