'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, Scan, Sparkles, ChevronRight, Cpu, Brain, Activity, AlertTriangle, XCircle, Search, Plus, Minus, Utensils, X, Keyboard } from 'lucide-react';
import ScannerOverlay from '@/components/nutrivision/ScannerOverlay';
import ResultsCard from '@/components/nutrivision/ResultsCard';
import { REFERENCE_OBJECTS } from '@/lib/food-data';
import { resizeAndCompressImage, hashImageBase64, urlToFile, validateImage } from '@/lib/image-utils';
import type { AnalysisResult } from '@/lib/types';

type AppState = 'landing' | 'preview' | 'scanning' | 'results' | 'rejected' | 'error' | 'manual_entry';

interface ManualFoodItem {
  name: string;
  grams: number;
  category?: string;
  calories?: number;
}

interface FoodSearchResult {
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  typical_serving_g: number;
}

const DEMO_IMAGES = [
  'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?w=600',
  'https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?w=600',
  'https://images.pexels.com/photos/842571/pexels-photo-842571.jpeg?w=600',
  'https://images.pexels.com/photos/566566/pexels-photo-566566.jpeg?w=600',
];

export default function NutriVisionApp() {
  const [state, setState] = useState<AppState>('landing');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [selectedRef, setSelectedRef] = useState('credit-card');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [scanProgress, setScanProgress] = useState<string>('Preparing image...');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Manual Entry State ────────────────────────────────────────────
  const [manualItems, setManualItems] = useState<ManualFoodItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FoodSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Food Search (debounced) ───────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=8`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate image
    const validation = validateImage(file);
    if (!validation.valid) {
      setErrorMessage(validation.error || 'Invalid image');
      setState('error');
      return;
    }

    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setState('preview');
  };

  const handleDemoImage = (url: string) => {
    setImageUrl(url);
    setState('preview');
  };

  const handleScan = async () => {
    setState('scanning');
    setErrorMessage('');

    try {
      // Step 1: Resize and compress
      setScanProgress('Resizing image...');
      const file = await urlToFile(imageUrl);
      const base64 = await resizeAndCompressImage(file);

      // Step 2: Compute hash for caching
      setScanProgress('Preparing upload...');
      const imageHash = await hashImageBase64(base64);

      // Step 3: Call the analysis API
      setScanProgress('Analyzing with AI...');
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: base64,
          image_hash: imageHash,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle NO_API_KEY — switch to manual entry mode
        if (errorData.error === 'NO_API_KEY') {
          setState('manual_entry');
          return;
        }

        const message = errorData.error || `Analysis failed (${response.status})`;

        if (response.status === 429) {
          throw new Error('Too many requests. Please try again in a minute.');
        }
        throw new Error(message);
      }

      const result: AnalysisResult = await response.json();

      // Log raw vision response for debugging
      console.log('[NutriVision] Raw vision response:', JSON.stringify(result.raw_vision_response, null, 2));
      console.log('[NutriVision] Full analysis result:', JSON.stringify(result, null, 2));

      setAnalysisResult(result);

      if (result.confidence_level === 'rejected') {
        setState('rejected');
      } else {
        setState('results');
      }
    } catch (err: any) {
      console.error('[NutriVision] Scan error:', err);
      setErrorMessage(err.message || 'Something went wrong. Please try again.');
      setState('error');
    }
  };

  // ─── Manual Entry Handlers ─────────────────────────────────────────

  const addManualItem = (food: FoodSearchResult) => {
    setManualItems((prev) => [
      ...prev,
      {
        name: food.name,
        grams: food.typical_serving_g,
        category: food.category,
        calories: food.calories,
      },
    ]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeManualItem = (index: number) => {
    setManualItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateManualItemGrams = (index: number, grams: number) => {
    setManualItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, grams: Math.max(1, grams) } : item))
    );
  };

  const handleManualAnalyze = async () => {
    if (manualItems.length === 0) return;

    setState('scanning');
    setScanProgress('Looking up nutrition data...');

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manual_items: manualItems.map((item) => ({
            name: item.name,
            grams: item.grams,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Analysis failed');
      }

      const result: AnalysisResult = await response.json();
      setAnalysisResult(result);
      setState('results');
    } catch (err: any) {
      console.error('[NutriVision] Manual analyze error:', err);
      setErrorMessage(err.message || 'Something went wrong.');
      setState('error');
    }
  };

  const handleReset = () => {
    setImageUrl('');
    setAnalysisResult(null);
    setErrorMessage('');
    setManualItems([]);
    setSearchQuery('');
    setSearchResults([]);
    setState('landing');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const refObj = REFERENCE_OBJECTS.find((r) => r.id === selectedRef) ?? REFERENCE_OBJECTS[0];

  return (
    <div className="min-h-screen bg-[#050508] text-white font-sans">
      {/* Background grid + glows */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-teal-500/8 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-4 pb-8">
        {/* Header */}
        <header className="pt-12 pb-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-4 py-1.5 mb-6"
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs text-cyan-400 font-medium tracking-wide">AI-Powered Vision</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl font-black tracking-tight"
          >
            <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              Nutri
            </span>
            <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
              Vision
            </span>
            <span className="text-white/30 text-2xl ml-1 font-light">AI</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-white/40 mt-2 max-w-xs mx-auto"
          >
            Point. Scan. Know exactly what you&apos;re eating.
          </motion.p>
        </header>

        {/* Main content area */}
        <AnimatePresence mode="wait">

          {/* LANDING STATE */}
          {state === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              {/* Upload zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative rounded-3xl border-2 border-dashed border-white/10 hover:border-cyan-500/40 bg-white/[0.02] hover:bg-white/[0.04] transition-all cursor-pointer group overflow-hidden"
              >
                <div className="py-14 flex flex-col items-center gap-4">
                  <motion.div
                    className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/30 flex items-center justify-center group-hover:scale-110 transition-transform"
                    animate={{ boxShadow: ['0 0 0 0 rgba(34,211,238,0)', '0 0 0 16px rgba(34,211,238,0.05)', '0 0 0 0 rgba(34,211,238,0)'] }}
                    transition={{ duration: 2.5, repeat: Infinity }}
                  >
                    <Camera className="w-9 h-9 text-cyan-400" />
                  </motion.div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-lg">Scan Your Food</p>
                    <p className="text-white/40 text-sm mt-1">Tap to upload a photo</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/30">
                    <Upload className="w-3 h-3" />
                    <span>JPG, PNG, HEIC supported</span>
                  </div>
                </div>

                {/* Corner accents */}
                <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-cyan-500/30 rounded-tl-lg" />
                <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-cyan-500/30 rounded-tr-lg" />
                <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-cyan-500/30 rounded-bl-lg" />
                <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-cyan-500/30 rounded-br-lg" />
              </div>

              {/* Manual entry button */}
              <motion.button
                onClick={() => setState('manual_entry')}
                whileTap={{ scale: 0.97 }}
                className="w-full py-3.5 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-teal-500/40 hover:bg-white/[0.06] text-white/70 hover:text-white font-medium text-sm flex items-center justify-center gap-2.5 transition-all"
              >
                <Keyboard className="w-4 h-4 text-teal-400" />
                Or type food names manually
              </motion.button>

              {/* Demo images */}
              <div>
                <p className="text-xs text-white/30 uppercase tracking-widest font-medium mb-3">
                  Or try a demo
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {DEMO_IMAGES.map((url, i) => (
                    <motion.button
                      key={i}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleDemoImage(url)}
                      className="aspect-square rounded-xl overflow-hidden border border-white/10 hover:border-cyan-500/40 transition-all hover:scale-105"
                    >
                      <img src={url} alt={`Demo ${i + 1}`} className="w-full h-full object-cover" />
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-2">
                {[
                  { icon: <Brain className="w-3 h-3" />, label: 'Gemini Vision AI' },
                  { icon: <Scan className="w-3 h-3" />, label: 'Real Nutrition Data' },
                  { icon: <Activity className="w-3 h-3" />, label: 'Macro Tracking' },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5"
                  >
                    <span className="text-cyan-400">{f.icon}</span>
                    <span className="text-xs text-white/50">{f.label}</span>
                  </div>
                ))}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'Gemini', label: 'AI Model' },
                  { value: '200+', label: 'Foods in DB' },
                  { value: 'Live', label: 'Analysis' },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-3 text-center"
                  >
                    <p className="text-xl font-black bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
                      {s.value}
                    </p>
                    <p className="text-xs text-white/30 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* PREVIEW STATE */}
          {state === 'preview' && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Image preview */}
              <div className="relative rounded-2xl overflow-hidden border border-white/10">
                <img src={imageUrl} alt="Food preview" className="w-full aspect-square object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-3 left-3">
                  <span className="text-xs text-white/60 bg-black/40 backdrop-blur-sm rounded-full px-3 py-1 border border-white/10">
                    Ready to scan
                  </span>
                </div>
              </div>

              {/* Reference object picker */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  <p className="text-sm font-semibold text-white">Portion Calibration</p>
                </div>
                <p className="text-xs text-white/40 mb-3">
                  Select a reference object visible in your photo for accurate portion sizing
                </p>
                <div className="space-y-2">
                  {REFERENCE_OBJECTS.map((obj) => (
                    <button
                      key={obj.id}
                      onClick={() => setSelectedRef(obj.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        selectedRef === obj.id
                          ? 'border-cyan-500/50 bg-cyan-500/10'
                          : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          selectedRef === obj.id ? 'bg-cyan-500/20' : 'bg-white/5'
                        }`}
                      >
                        {obj.icon === 'card' && (
                          <div className="w-4 h-3 border border-current rounded-sm" style={{ color: selectedRef === obj.id ? '#22d3ee' : '#ffffff40' }} />
                        )}
                        {obj.icon === 'spoon' && (
                          <div className="w-1.5 h-5 bg-current rounded-full" style={{ color: selectedRef === obj.id ? '#22d3ee' : '#ffffff40' }} />
                        )}
                        {obj.icon === 'hand' && (
                          <div className="flex gap-0.5 items-end">
                            {[3,4,4,3,2].map((h,i) => (
                              <div key={i} className="w-1 rounded-t-full" style={{ height: `${h * 4}px`, backgroundColor: selectedRef === obj.id ? '#22d3ee' : 'rgba(255,255,255,0.25)' }} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${selectedRef === obj.id ? 'text-cyan-300' : 'text-white/70'}`}>
                          {obj.label}
                        </p>
                        <p className="text-xs text-white/30 mt-0.5 truncate">{obj.dimensions}</p>
                      </div>
                      {selectedRef === obj.id && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-4 h-4 rounded-full bg-cyan-500 flex items-center justify-center shrink-0"
                        >
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </motion.div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scan button */}
              <motion.button
                onClick={handleScan}
                whileTap={{ scale: 0.97 }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-bold text-lg flex items-center justify-center gap-3 shadow-2xl shadow-cyan-500/30 hover:from-cyan-500 hover:to-teal-500 transition-all"
              >
                <Scan className="w-5 h-5" />
                Analyze with AI
                <ChevronRight className="w-5 h-5" />
              </motion.button>

              <button
                onClick={handleReset}
                className="w-full py-3 text-sm text-white/30 hover:text-white/50 transition-colors"
              >
                Choose different photo
              </button>
            </motion.div>
          )}

          {/* SCANNING STATE */}
          {state === 'scanning' && (
            <motion.div
              key="scanning"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-4"
            >
              <div className="text-center mb-2">
                <p className="text-xs text-cyan-400 uppercase tracking-widest font-medium">
                  AI Analysis in Progress
                </p>
              </div>
              {imageUrl ? (
                <ScannerOverlay imageUrl={imageUrl} statusMessage={scanProgress} />
              ) : (
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-8 text-center">
                  <motion.div
                    className="w-16 h-16 mx-auto rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center mb-4"
                    animate={{ scale: [1, 1.1, 1], opacity: [1, 0.7, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Utensils className="w-8 h-8 text-cyan-400" />
                  </motion.div>
                  <p className="text-sm text-white/60">{scanProgress}</p>
                </div>
              )}
              <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-2 h-2 rounded-full bg-cyan-400"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <p className="text-xs text-white/50">
                    {imageUrl ? (
                      <>Using <span className="text-cyan-400">{refObj.label}</span> for portion depth calibration</>
                    ) : (
                      <>Looking up nutrition from <span className="text-cyan-400">local database</span></>
                    )}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* MANUAL ENTRY STATE */}
          {state === 'manual_entry' && (
            <motion.div
              key="manual_entry"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Header card */}
              <div className="rounded-2xl bg-gradient-to-br from-teal-500/10 to-cyan-500/10 border border-teal-500/20 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center">
                    <Keyboard className="w-5 h-5 text-teal-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Manual Food Entry</p>
                    <p className="text-xs text-white/40">Search &amp; add foods from our database of 200+ items</p>
                  </div>
                </div>
              </div>

              {/* Search bar */}
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search food... (e.g. roti, biryani, apple)"
                    className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white/[0.05] border border-white/10 focus:border-cyan-500/50 focus:bg-white/[0.08] text-sm text-white placeholder:text-white/30 outline-none transition-all"
                    autoFocus
                  />
                  {isSearching && (
                    <motion.div
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                  )}
                </div>

                {/* Search results dropdown */}
                <AnimatePresence>
                  {searchResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="absolute z-20 w-full mt-2 rounded-xl bg-[#0d0d12] border border-white/10 shadow-2xl shadow-black/50 overflow-hidden max-h-64 overflow-y-auto"
                    >
                      {searchResults.map((food, i) => (
                        <button
                          key={`${food.name}-${i}`}
                          onClick={() => addManualItem(food)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.06] transition-colors text-left border-b border-white/5 last:border-b-0"
                        >
                          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                            <Plus className="w-4 h-4 text-cyan-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{food.name}</p>
                            <p className="text-xs text-white/30">
                              {food.calories} kcal/100g · {food.typical_serving_g}g serving
                            </p>
                          </div>
                          <span className="text-[10px] text-white/20 bg-white/5 rounded-full px-2 py-0.5 uppercase tracking-wider shrink-0">
                            {food.category}
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Added items list */}
              {manualItems.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-white/40 uppercase tracking-widest font-medium">
                    Your meal ({manualItems.length} item{manualItems.length > 1 ? 's' : ''})
                  </p>
                  {manualItems.map((item, index) => (
                    <motion.div
                      key={`${item.name}-${index}`}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="rounded-xl bg-white/[0.04] border border-white/10 p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/20 flex items-center justify-center shrink-0">
                          <Utensils className="w-4 h-4 text-teal-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{item.name}</p>
                          <p className="text-xs text-white/30">{item.calories || '—'} kcal/100g</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => updateManualItemGrams(index, item.grams - 10)}
                            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                          >
                            <Minus className="w-3 h-3 text-white/50" />
                          </button>
                          <input
                            type="number"
                            value={item.grams}
                            onChange={(e) => updateManualItemGrams(index, parseInt(e.target.value) || 0)}
                            className="w-14 text-center text-sm font-medium text-cyan-300 bg-white/[0.05] border border-white/10 rounded-lg py-1 outline-none focus:border-cyan-500/50"
                          />
                          <span className="text-xs text-white/30">g</span>
                          <button
                            onClick={() => updateManualItemGrams(index, item.grams + 10)}
                            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                          >
                            <Plus className="w-3 h-3 text-white/50" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeManualItem(index)}
                          className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors"
                        >
                          <X className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Analyze button */}
              <motion.button
                onClick={handleManualAnalyze}
                whileTap={{ scale: 0.97 }}
                disabled={manualItems.length === 0}
                className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${
                  manualItems.length > 0
                    ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-2xl shadow-cyan-500/30 hover:from-cyan-500 hover:to-teal-500'
                    : 'bg-white/5 text-white/20 cursor-not-allowed'
                }`}
              >
                <Sparkles className="w-5 h-5" />
                {manualItems.length > 0
                  ? `Analyze ${manualItems.length} item${manualItems.length > 1 ? 's' : ''}`
                  : 'Add food items to analyze'}
              </motion.button>

              <button
                onClick={handleReset}
                className="w-full py-3 text-sm text-white/30 hover:text-white/50 transition-colors"
              >
                ← Back to home
              </button>
            </motion.div>
          )}

          {/* REJECTED STATE — not food or low confidence below threshold */}
          {state === 'rejected' && (
            <motion.div
              key="rejected"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Image with rejection overlay */}
              <div className="relative rounded-2xl overflow-hidden border border-red-500/30">
                <img src={imageUrl} alt="Rejected" className="w-full aspect-square object-cover opacity-50" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                    className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center"
                  >
                    <XCircle className="w-8 h-8 text-red-400" />
                  </motion.div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-white">Not Food Detected</p>
                    <p className="text-sm text-white/50 mt-2 max-w-xs">
                      This doesn&apos;t look like food. Try a clearer photo of your meal.
                    </p>
                  </div>
                </div>
              </div>

              {/* Reason from AI */}
              {analysisResult?.reason && (
                <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-red-400 font-medium uppercase tracking-wider mb-1">AI Analysis</p>
                      <p className="text-sm text-white/60">{analysisResult.reason}</p>
                      <p className="text-xs text-white/30 mt-2">
                        Confidence: {Math.round((analysisResult.confidence || 0) * 100)}%
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <motion.button
                onClick={handleReset}
                whileTap={{ scale: 0.97 }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-bold text-lg flex items-center justify-center gap-3 shadow-2xl shadow-cyan-500/30 hover:from-cyan-500 hover:to-teal-500 transition-all"
              >
                <Camera className="w-5 h-5" />
                Try Another Photo
              </motion.button>
            </motion.div>
          )}

          {/* ERROR STATE */}
          {state === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                  className="w-14 h-14 mx-auto rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mb-4"
                >
                  <AlertTriangle className="w-7 h-7 text-amber-400" />
                </motion.div>
                <p className="text-lg font-bold text-white mb-2">Analysis Failed</p>
                <p className="text-sm text-white/50">{errorMessage}</p>
              </div>

              <div className="flex gap-3">
                <motion.button
                  onClick={() => setState('manual_entry')}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 py-3.5 rounded-2xl bg-white/[0.06] border border-white/10 hover:border-teal-500/40 text-white font-medium text-sm flex items-center justify-center gap-2 transition-all"
                >
                  <Keyboard className="w-4 h-4 text-teal-400" />
                  Manual Entry
                </motion.button>
                <motion.button
                  onClick={handleReset}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
                >
                  <Camera className="w-4 h-4" />
                  Try Again
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* RESULTS STATE */}
          {state === 'results' && analysisResult && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="text-center mb-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 ${
                    analysisResult.confidence_level === 'low'
                      ? 'bg-amber-500/10 border border-amber-500/20'
                      : 'bg-emerald-500/10 border border-emerald-500/20'
                  }`}
                >
                  {analysisResult.confidence_level === 'low' ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs text-amber-400 font-medium">Low Confidence — Verify Results</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs text-emerald-400 font-medium">Analysis Complete</span>
                    </>
                  )}
                </motion.div>
              </div>
              <ResultsCard
                result={analysisResult}
                imageUrl={imageUrl}
                referenceObject={refObj.label}
                onReset={handleReset}
              />
            </motion.div>
          )}

        </AnimatePresence>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
}
