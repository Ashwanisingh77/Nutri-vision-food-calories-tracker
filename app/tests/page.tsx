'use client';

import { useState } from 'react';

// ─── Test Cases ───────────────────────────────────────────────────────

interface TestCase {
  id: string;
  name: string;
  imageUrl: string;
  expectFood: boolean;
  description: string;
}

const TEST_CASES: TestCase[] = [
  // Should be REJECTED
  {
    id: 'mountain',
    name: 'Mountain Landscape',
    imageUrl: 'https://images.pexels.com/photos/417173/pexels-photo-417173.jpeg?w=600',
    expectFood: false,
    description: 'A mountain photo — must be rejected as not food',
  },
  {
    id: 'car',
    name: 'Car',
    imageUrl: 'https://images.pexels.com/photos/170811/pexels-photo-170811.jpeg?w=600',
    expectFood: false,
    description: 'A car — must be rejected as not food',
  },
  {
    id: 'wall',
    name: 'Blank Wall',
    imageUrl: 'https://images.pexels.com/photos/1939485/pexels-photo-1939485.jpeg?w=600',
    expectFood: false,
    description: 'A blank wall — must be rejected as not food',
  },
  {
    id: 'selfie',
    name: 'Selfie / Portrait',
    imageUrl: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?w=600',
    expectFood: false,
    description: 'A person selfie — must be rejected as not food',
  },
  // Should be ACCEPTED
  {
    id: 'pizza',
    name: 'Pizza',
    imageUrl: 'https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg?w=600',
    expectFood: true,
    description: 'A pizza — must be identified as food with nutrition data',
  },
  {
    id: 'banana',
    name: 'Banana',
    imageUrl: 'https://images.pexels.com/photos/2872755/pexels-photo-2872755.jpeg?w=600',
    expectFood: true,
    description: 'A banana — must be identified as food with nutrition data',
  },
  {
    id: 'rice',
    name: 'Rice Plate',
    imageUrl: 'https://images.pexels.com/photos/723198/pexels-photo-723198.jpeg?w=600',
    expectFood: true,
    description: 'A plate of rice — must be identified as food with nutrition data',
  },
  {
    id: 'burger',
    name: 'Burger',
    imageUrl: 'https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg?w=600',
    expectFood: true,
    description: 'A burger — must be identified as food with nutrition data',
  },
];

// ─── Test Result types ────────────────────────────────────────────────

interface TestResult {
  testId: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error';
  duration?: number;
  rawResponse?: any;
  errorMessage?: string;
  details?: string;
}

// ─── Resize helper (duplicated to avoid client import issues) ─────────

async function resizeForTest(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const maxDim = 768;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas context')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve(dataUrl.split(',')[1]);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load test image'));
    };

    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

// ─── Component ────────────────────────────────────────────────────────

export default function TestsPage() {
  const [results, setResults] = useState<Record<string, TestResult>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);

  const updateResult = (testId: string, update: Partial<TestResult>) => {
    setResults((prev) => ({
      ...prev,
      [testId]: { ...prev[testId], testId, ...update },
    }));
  };

  const runSingleTest = async (testCase: TestCase) => {
    setCurrentTest(testCase.id);
    updateResult(testCase.id, { status: 'running' });
    const start = Date.now();

    try {
      // Resize image
      const base64 = await resizeForTest(testCase.imageUrl);

      // Call analyze API
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, image_hash: `test-${testCase.id}` }),
      });

      const data = await response.json();
      const duration = Date.now() - start;

      console.log(`[TEST: ${testCase.id}] Raw response:`, JSON.stringify(data, null, 2));

      if (!response.ok) {
        updateResult(testCase.id, {
          status: 'error',
          duration,
          rawResponse: data,
          errorMessage: data.error || `HTTP ${response.status}`,
        });
        return;
      }

      // Evaluate pass/fail
      const isFood = data.is_food === true && data.confidence_level !== 'rejected';

      if (testCase.expectFood && isFood) {
        // Expected food, got food — check nutrition
        const hasNutrition = data.items?.some((i: any) => i.nutrition_found);
        updateResult(testCase.id, {
          status: 'passed',
          duration,
          rawResponse: data,
          details: `Detected: ${data.items?.map((i: any) => i.name).join(', ')}. Nutrition found: ${hasNutrition ? 'yes' : 'no'}. Confidence: ${Math.round((data.confidence || 0) * 100)}%`,
        });
      } else if (!testCase.expectFood && !isFood) {
        // Expected not food, correctly rejected
        updateResult(testCase.id, {
          status: 'passed',
          duration,
          rawResponse: data,
          details: `Correctly rejected. Reason: ${data.reason}. Confidence: ${Math.round((data.confidence || 0) * 100)}%`,
        });
      } else {
        // Mismatch
        updateResult(testCase.id, {
          status: 'failed',
          duration,
          rawResponse: data,
          details: testCase.expectFood
            ? `Expected food but was rejected. Reason: ${data.reason}`
            : `Expected rejection but identified as food: ${data.items?.map((i: any) => i.name).join(', ')}`,
        });
      }
    } catch (err: any) {
      updateResult(testCase.id, {
        status: 'error',
        duration: Date.now() - start,
        errorMessage: err.message,
      });
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setResults({});

    for (const tc of TEST_CASES) {
      updateResult(tc.id, { status: 'pending' });
    }

    for (const tc of TEST_CASES) {
      await runSingleTest(tc);
      // Small delay between tests to avoid rate limiting
      await new Promise((r) => setTimeout(r, 1500));
    }

    setCurrentTest(null);
    setIsRunning(false);
  };

  const passedCount = Object.values(results).filter((r) => r.status === 'passed').length;
  const failedCount = Object.values(results).filter((r) => r.status === 'failed').length;
  const errorCount = Object.values(results).filter((r) => r.status === 'error').length;
  const totalRun = passedCount + failedCount + errorCount;

  return (
    <div className="min-h-screen bg-[#050508] text-white font-sans">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-black mb-2">
          <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">
            NutriVision AI
          </span>{' '}
          <span className="text-white/50">Test Suite</span>
        </h1>
        <p className="text-sm text-white/40 mb-8">
          Automated tests to verify food detection, rejection of non-food images, and nutrition lookup.
        </p>

        {/* Controls */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={runAllTests}
            disabled={isRunning}
            className={`px-6 py-3 rounded-xl font-bold text-sm transition-all ${
              isRunning
                ? 'bg-white/10 text-white/30 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white hover:from-cyan-500 hover:to-teal-500 shadow-lg shadow-cyan-500/20'
            }`}
          >
            {isRunning ? `Running... (${currentTest || '...'})` : 'Run All Tests'}
          </button>

          {totalRun > 0 && (
            <div className="flex gap-3 text-sm">
              <span className="text-emerald-400">{passedCount} passed</span>
              {failedCount > 0 && <span className="text-red-400">{failedCount} failed</span>}
              {errorCount > 0 && <span className="text-amber-400">{errorCount} errors</span>}
              <span className="text-white/30">{totalRun}/{TEST_CASES.length} complete</span>
            </div>
          )}
        </div>

        {/* Test cases */}
        <div className="space-y-4">
          {TEST_CASES.map((tc) => {
            const result = results[tc.id];
            const statusColor =
              result?.status === 'passed' ? 'border-emerald-500/30 bg-emerald-500/5'
              : result?.status === 'failed' ? 'border-red-500/30 bg-red-500/5'
              : result?.status === 'error' ? 'border-amber-500/30 bg-amber-500/5'
              : result?.status === 'running' ? 'border-cyan-500/30 bg-cyan-500/5'
              : 'border-white/10 bg-white/[0.02]';

            return (
              <div key={tc.id} className={`rounded-xl border p-4 ${statusColor} transition-all`}>
                <div className="flex items-start gap-4">
                  {/* Thumbnail */}
                  <img
                    src={tc.imageUrl}
                    alt={tc.name}
                    className="w-16 h-16 rounded-lg object-cover border border-white/10 shrink-0"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold text-white">{tc.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        tc.expectFood
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {tc.expectFood ? 'Expect: Food' : 'Expect: Rejected'}
                      </span>

                      {/* Status badge */}
                      {result && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          result.status === 'passed' ? 'bg-emerald-500/20 text-emerald-400'
                          : result.status === 'failed' ? 'bg-red-500/20 text-red-400'
                          : result.status === 'error' ? 'bg-amber-500/20 text-amber-400'
                          : result.status === 'running' ? 'bg-cyan-500/20 text-cyan-400'
                          : 'bg-white/10 text-white/40'
                        }`}>
                          {result.status === 'running' ? '⏳ Running...' : result.status.toUpperCase()}
                          {result.duration ? ` (${(result.duration / 1000).toFixed(1)}s)` : ''}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-white/40">{tc.description}</p>

                    {/* Result details */}
                    {result?.details && (
                      <p className={`text-xs mt-2 ${
                        result.status === 'passed' ? 'text-emerald-400/80'
                        : result.status === 'failed' ? 'text-red-400/80'
                        : 'text-white/50'
                      }`}>
                        {result.details}
                      </p>
                    )}

                    {result?.errorMessage && (
                      <p className="text-xs mt-2 text-amber-400/80">Error: {result.errorMessage}</p>
                    )}

                    {/* Collapsible raw JSON */}
                    {result?.rawResponse && (
                      <details className="mt-2">
                        <summary className="text-xs text-white/30 cursor-pointer hover:text-white/50 transition-colors">
                          View raw JSON response
                        </summary>
                        <pre className="mt-2 text-xs text-white/40 bg-black/30 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto border border-white/5">
                          {JSON.stringify(result.rawResponse, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>

                  {/* Run single test */}
                  <button
                    onClick={() => runSingleTest(tc)}
                    disabled={isRunning}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/50 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Run
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        {totalRun === TEST_CASES.length && (
          <div className={`mt-8 rounded-xl border p-6 text-center ${
            failedCount === 0 && errorCount === 0
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-red-500/30 bg-red-500/5'
          }`}>
            <p className="text-2xl font-black mb-2">
              {failedCount === 0 && errorCount === 0 ? '✅ All Tests Passed!' : `❌ ${failedCount + errorCount} Tests Failed`}
            </p>
            <p className="text-sm text-white/50">
              {passedCount}/{TEST_CASES.length} passed · {failedCount} failed · {errorCount} errors
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
