import { NextRequest, NextResponse } from 'next/server';
import type { VisionResponse, AnalysisResult, FoodItemResult, NutritionPer100g } from '@/lib/types';
import { searchFoodDatabase, getFoodByName, type FoodEntry } from '@/lib/food-database';

// ─── In-memory cache (keyed by image hash) ───────────────────────────
const analysisCache = new Map<string, AnalysisResult>();

// ─── Gemini Vision API call with retry + backoff ──────────────────────

const GEMINI_SYSTEM_PROMPT = `You are a food recognition system. First decide if the image contains edible food or drink. If it does not, return is_food=false. Never guess. If unsure, lower the confidence.

You MUST respond with ONLY valid JSON matching this exact schema (no markdown, no code fences):
{
  "is_food": boolean,
  "confidence": number between 0 and 1,
  "items": [{ "name": string, "estimated_grams": number, "confidence": number between 0 and 1 }],
  "reason": string explaining your assessment
}

Rules:
- If the image does not contain food or drink, set is_food to false, confidence to a low number, and items to an empty array.
- If you can see food, list each distinct food item with its estimated weight in grams.
- Be conservative with confidence scores. Only use >0.8 when you are very certain.
- The "name" should be a common food name in English, suitable for searching food databases (e.g. "banana", "white rice", "pepperoni pizza").
- "estimated_grams" should be your best estimate of the visible portion weight.`;

async function callGeminiVision(
  base64Image: string,
  retries = 3
): Promise<VisionResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    throw new Error('NO_API_KEY');
  }

  const model = 'gemini-2.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: GEMINI_SYSTEM_PROMPT },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Image,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        // Rate limited — backoff
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[Gemini] 429 rate limited, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, backoffMs));
        lastError = new Error('RATE_LIMITED');
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[Gemini] API error ${response.status}:`, errorBody);
        throw new Error(`Gemini API returned ${response.status}: ${errorBody}`);
      }

      const data = await response.json();
      console.log('[Gemini] Raw API response:', JSON.stringify(data, null, 2));

      // Extract text content from Gemini response
      const textContent =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textContent) {
        throw new Error('No text content in Gemini response');
      }

      console.log('[Gemini] Extracted text:', textContent);

      // Parse the JSON response
      const parsed = JSON.parse(textContent) as VisionResponse;

      // Validate schema
      const validated = validateVisionResponse(parsed);
      console.log('[Gemini] Validated response:', JSON.stringify(validated, null, 2));

      return validated;
    } catch (err: any) {
      lastError = err;
      if (err.name === 'AbortError') {
        console.error(`[Gemini] Request timed out (attempt ${attempt + 1}/${retries})`);
        lastError = new Error('REQUEST_TIMEOUT');
      } else if (err.message !== 'RATE_LIMITED') {
        console.error(`[Gemini] Error (attempt ${attempt + 1}/${retries}):`, err.message);
      }

      if (attempt < retries - 1) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }

  if (lastError?.message === 'RATE_LIMITED') {
    throw new Error('Too many requests. Please try again in a minute.');
  }
  if (lastError?.message === 'REQUEST_TIMEOUT') {
    throw new Error('The analysis took too long. Please try again.');
  }
  throw lastError || new Error('Failed to analyze image');
}

// ─── Validate the vision response schema ──────────────────────────────

function validateVisionResponse(data: any): VisionResponse {
  if (typeof data.is_food !== 'boolean') {
    data.is_food = false;
  }

  if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) {
    data.confidence = 0;
  }

  if (!Array.isArray(data.items)) {
    data.items = [];
  }

  data.items = data.items
    .filter((item: any) => item && typeof item.name === 'string')
    .map((item: any) => ({
      name: String(item.name).trim(),
      estimated_grams: typeof item.estimated_grams === 'number' && item.estimated_grams > 0
        ? item.estimated_grams
        : 100,
      confidence: typeof item.confidence === 'number'
        ? Math.max(0, Math.min(1, item.confidence))
        : 0.5,
    }));

  if (typeof data.reason !== 'string') {
    data.reason = '';
  }

  return data as VisionResponse;
}

// ─── Nutrition lookup: Local DB first, then Open Food Facts fallback ──

function lookupNutritionLocal(foodName: string): NutritionPer100g | null {
  // Try exact match first
  const exact = getFoodByName(foodName);
  if (exact) {
    return {
      calories: exact.calories,
      protein: exact.protein,
      carbs: exact.carbs,
      fat: exact.fat,
      fiber: exact.fiber,
      source: 'local',
    };
  }

  // Try fuzzy search
  const results = searchFoodDatabase(foodName, 1);
  if (results.length > 0) {
    const best = results[0];
    return {
      calories: best.calories,
      protein: best.protein,
      carbs: best.carbs,
      fat: best.fat,
      fiber: best.fiber,
      source: 'local',
    };
  }

  return null;
}

async function lookupNutritionOpenFoodFacts(foodName: string): Promise<NutritionPer100g | null> {
  try {
    const query = encodeURIComponent(foodName);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,nutriments`,
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[Nutrition] Open Food Facts returned ${response.status} for "${foodName}"`);
      return null;
    }

    const data = await response.json();
    const products = data?.products;

    if (!products || products.length === 0) {
      return null;
    }

    // Find best match — prefer items with complete nutriment data
    for (const product of products) {
      const n = product?.nutriments;
      if (!n) continue;

      const calories = n['energy-kcal_100g'] ?? n['energy-kcal'] ?? null;
      const protein = n['proteins_100g'] ?? n['proteins'] ?? null;
      const carbs = n['carbohydrates_100g'] ?? n['carbohydrates'] ?? null;
      const fat = n['fat_100g'] ?? n['fat'] ?? null;

      if (calories !== null && calories !== undefined) {
        return {
          calories: round(Number(calories)),
          protein: round(Number(protein) || 0),
          carbs: round(Number(carbs) || 0),
          fat: round(Number(fat) || 0),
          fiber: round(Number(n['fiber_100g'] ?? n['fiber'] ?? 0)),
          source: 'openfoodfacts',
        };
      }
    }

    return null;
  } catch (err: any) {
    console.error(`[Nutrition] Open Food Facts error for "${foodName}":`, err.message);
    return null;
  }
}

async function lookupNutrition(foodName: string): Promise<NutritionPer100g> {
  // 1) Try local database first (instant, no network)
  const localResult = lookupNutritionLocal(foodName);
  if (localResult) {
    console.log(`[Nutrition] Found "${foodName}" in local database`);
    return localResult;
  }

  // 2) Fallback to Open Food Facts API
  console.log(`[Nutrition] "${foodName}" not in local DB, trying Open Food Facts...`);
  const offResult = await lookupNutritionOpenFoodFacts(foodName);
  if (offResult) {
    console.log(`[Nutrition] Found "${foodName}" via Open Food Facts`);
    return offResult;
  }

  // 3) Not found anywhere
  console.warn(`[Nutrition] No nutrition data found for "${foodName}"`);
  return {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    source: 'not_found',
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

// ─── Get estimated grams from local DB if vision didn't provide good data ──

function getEstimatedGrams(foodName: string, visionEstimate: number): number {
  // If vision gave a reasonable estimate, use it
  if (visionEstimate > 0 && visionEstimate !== 100) {
    return visionEstimate;
  }

  // Otherwise use typical serving from our database
  const entry = getFoodByName(foodName);
  if (entry) {
    return entry.typical_serving_g;
  }

  const results = searchFoodDatabase(foodName, 1);
  if (results.length > 0) {
    return results[0].typical_serving_g;
  }

  return visionEstimate || 100; // Default fallback
}

// ─── Main POST handler ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image_base64, image_hash, manual_items } = body;

    // ─── MANUAL MODE: User typed food names directly ────────────
    if (manual_items && Array.isArray(manual_items)) {
      console.log('[Analyze] Manual mode with items:', manual_items);

      const itemResults: FoodItemResult[] = await Promise.all(
        manual_items.map(async (item: { name: string; grams?: number }) => {
          const nutrition = await lookupNutrition(item.name);
          const entry = getFoodByName(item.name) || searchFoodDatabase(item.name, 1)[0];
          const grams = item.grams || entry?.typical_serving_g || 100;
          const gramsMultiplier = grams / 100;

          return {
            name: entry?.name || item.name,
            estimated_grams: grams,
            confidence: 1.0,
            nutrition_per_100g: nutrition,
            calories: round(nutrition.calories * gramsMultiplier),
            protein: round(nutrition.protein * gramsMultiplier),
            carbs: round(nutrition.carbs * gramsMultiplier),
            fat: round(nutrition.fat * gramsMultiplier),
            fiber: round(nutrition.fiber * gramsMultiplier),
            nutrition_found: nutrition.source !== 'not_found',
          };
        })
      );

      const result: AnalysisResult = {
        is_food: true,
        confidence: 1.0,
        confidence_level: 'high',
        reason: 'Manually entered food items with nutrition from local database.',
        items: itemResults,
        total_calories: round(itemResults.reduce((s, i) => s + i.calories, 0)),
        total_protein: round(itemResults.reduce((s, i) => s + i.protein, 0)),
        total_carbs: round(itemResults.reduce((s, i) => s + i.carbs, 0)),
        total_fat: round(itemResults.reduce((s, i) => s + i.fat, 0)),
        total_fiber: round(itemResults.reduce((s, i) => s + i.fiber, 0)),
        raw_vision_response: {
          is_food: true,
          confidence: 1.0,
          items: manual_items.map((i: any) => ({ name: i.name, estimated_grams: i.grams || 100, confidence: 1.0 })),
          reason: 'Manual entry',
        },
      };

      return NextResponse.json(result);
    }

    // ─── IMAGE MODE: Analyze image with Gemini Vision ───────────
    if (!image_base64 || typeof image_base64 !== 'string') {
      return NextResponse.json(
        { error: 'Missing image_base64 field', retryable: false },
        { status: 400 }
      );
    }

    // Check cache
    if (image_hash && analysisCache.has(image_hash)) {
      console.log('[Cache] Returning cached result for hash:', image_hash);
      return NextResponse.json(analysisCache.get(image_hash)!);
    }

    // STEP 1: Call Gemini Vision
    let visionResult: VisionResponse;
    try {
      visionResult = await callGeminiVision(image_base64);
    } catch (err: any) {
      if (err.message === 'NO_API_KEY') {
        // Return a special response telling the frontend to use manual mode
        return NextResponse.json(
          {
            error: 'NO_API_KEY',
            details: 'Gemini API key is not configured. Please add your free API key to .env.local or use manual food entry mode.',
            retryable: false,
          },
          { status: 503 }
        );
      }
      throw err; // Re-throw other errors
    }

    // STEP 2: Apply rejection rules
    const confidence_level: 'high' | 'low' | 'rejected' =
      !visionResult.is_food || visionResult.confidence < 0.6
        ? 'rejected'
        : visionResult.confidence < 0.8
          ? 'low'
          : 'high';

    if (confidence_level === 'rejected') {
      const result: AnalysisResult = {
        is_food: visionResult.is_food,
        confidence: visionResult.confidence,
        confidence_level: 'rejected',
        reason: visionResult.reason || "This doesn't look like food.",
        items: [],
        total_calories: 0,
        total_protein: 0,
        total_carbs: 0,
        total_fat: 0,
        total_fiber: 0,
        raw_vision_response: visionResult,
      };

      if (image_hash) analysisCache.set(image_hash, result);
      return NextResponse.json(result);
    }

    // STEP 3: Look up nutrition for each detected item (local DB first)
    const itemResults: FoodItemResult[] = await Promise.all(
      visionResult.items.map(async (item) => {
        const nutrition = await lookupNutrition(item.name);
        const estimatedGrams = getEstimatedGrams(item.name, item.estimated_grams);
        const gramsMultiplier = estimatedGrams / 100;

        return {
          name: item.name,
          estimated_grams: estimatedGrams,
          confidence: item.confidence,
          nutrition_per_100g: nutrition,
          calories: round(nutrition.calories * gramsMultiplier),
          protein: round(nutrition.protein * gramsMultiplier),
          carbs: round(nutrition.carbs * gramsMultiplier),
          fat: round(nutrition.fat * gramsMultiplier),
          fiber: round(nutrition.fiber * gramsMultiplier),
          nutrition_found: nutrition.source !== 'not_found',
        };
      })
    );

    const result: AnalysisResult = {
      is_food: true,
      confidence: visionResult.confidence,
      confidence_level,
      reason: visionResult.reason,
      items: itemResults,
      total_calories: round(itemResults.reduce((s, i) => s + i.calories, 0)),
      total_protein: round(itemResults.reduce((s, i) => s + i.protein, 0)),
      total_carbs: round(itemResults.reduce((s, i) => s + i.carbs, 0)),
      total_fat: round(itemResults.reduce((s, i) => s + i.fat, 0)),
      total_fiber: round(itemResults.reduce((s, i) => s + i.fiber, 0)),
      raw_vision_response: visionResult,
    };

    if (image_hash) analysisCache.set(image_hash, result);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[Analyze] Error:', err.message);

    const isRetryable =
      err.message?.includes('try again') ||
      err.message?.includes('RATE_LIMITED') ||
      err.message?.includes('timeout');

    return NextResponse.json(
      {
        error: err.message || 'Analysis failed',
        retryable: isRetryable,
      },
      { status: isRetryable ? 429 : 500 }
    );
  }
}
