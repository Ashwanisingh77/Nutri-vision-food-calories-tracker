import { NextRequest, NextResponse } from 'next/server';
import { searchFoodDatabase, getAllCategories, getFoodsByCategory } from '@/lib/food-database';

// ─── GET: Search food database ───────────────────────────────────────
// Query params: q (search term), category (optional filter), limit (default 10)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const category = searchParams.get('category') || '';
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  if (!query && !category) {
    // Return all categories for browsing
    const categories = getAllCategories();
    return NextResponse.json({ categories });
  }

  if (category && !query) {
    // Return all items in a category
    const items = getFoodsByCategory(category as any);
    return NextResponse.json({
      items: items.map((e) => ({
        name: e.name,
        category: e.category,
        calories: e.calories,
        protein: e.protein,
        carbs: e.carbs,
        fat: e.fat,
        fiber: e.fiber,
        typical_serving_g: e.typical_serving_g,
      })),
    });
  }

  // Search by query
  const results = searchFoodDatabase(query, limit);

  return NextResponse.json({
    query,
    results: results.map((e) => ({
      name: e.name,
      category: e.category,
      calories: e.calories,
      protein: e.protein,
      carbs: e.carbs,
      fat: e.fat,
      fiber: e.fiber,
      typical_serving_g: e.typical_serving_g,
    })),
  });
}
