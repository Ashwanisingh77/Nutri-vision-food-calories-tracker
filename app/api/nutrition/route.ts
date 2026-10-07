import { NextRequest, NextResponse } from 'next/server';
import type { NutritionPer100g } from '@/lib/types';

// ─── Nutrition lookup for user corrections ────────────────────────────
// When the user edits the food name, we re-query nutrition data.

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

async function lookupNutrition(foodName: string): Promise<NutritionPer100g> {
  try {
    const query = encodeURIComponent(foodName);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${query}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,nutriments`,
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      return notFound();
    }

    const data = await response.json();
    const products = data?.products;

    if (!products || products.length === 0) {
      return notFound();
    }

    for (const product of products) {
      const n = product?.nutriments;
      if (!n) continue;

      const calories = n['energy-kcal_100g'] ?? n['energy-kcal'] ?? null;

      if (calories !== null && calories !== undefined) {
        return {
          calories: round(Number(calories)),
          protein: round(Number(n['proteins_100g'] ?? n['proteins'] ?? 0)),
          carbs: round(Number(n['carbohydrates_100g'] ?? n['carbohydrates'] ?? 0)),
          fat: round(Number(n['fat_100g'] ?? n['fat'] ?? 0)),
          fiber: round(Number(n['fiber_100g'] ?? n['fiber'] ?? 0)),
          source: 'openfoodfacts',
        };
      }
    }

    return notFound();
  } catch (err: any) {
    console.error(`[Nutrition] Lookup error for "${foodName}":`, err.message);
    return notFound();
  }
}

function notFound(): NutritionPer100g {
  return {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    source: 'not_found',
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { food_name, grams } = body;

    if (!food_name || typeof food_name !== 'string') {
      return NextResponse.json(
        { error: 'Missing food_name field', retryable: false },
        { status: 400 }
      );
    }

    const estimatedGrams = typeof grams === 'number' && grams > 0 ? grams : 100;
    const nutrition = await lookupNutrition(food_name);
    const multiplier = estimatedGrams / 100;

    return NextResponse.json({
      food_name,
      grams: estimatedGrams,
      nutrition_per_100g: nutrition,
      calories: round(nutrition.calories * multiplier),
      protein: round(nutrition.protein * multiplier),
      carbs: round(nutrition.carbs * multiplier),
      fat: round(nutrition.fat * multiplier),
      fiber: round(nutrition.fiber * multiplier),
      nutrition_found: nutrition.source !== 'not_found',
    });
  } catch (err: any) {
    console.error('[Nutrition] Error:', err.message);
    return NextResponse.json(
      { error: err.message || 'Nutrition lookup failed', retryable: true },
      { status: 500 }
    );
  }
}
