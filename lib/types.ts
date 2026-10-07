// ─── Vision Model Response Schema ─────────────────────────────────────
// This is the exact JSON shape we require from Gemini. Validated server-side.

export interface VisionFoodItem {
  name: string;
  estimated_grams: number;
  confidence: number;
}

export interface VisionResponse {
  is_food: boolean;
  confidence: number;
  items: VisionFoodItem[];
  reason: string;
}

// ─── Nutrition Data (from USDA / Open Food Facts) ─────────────────────

export interface NutritionPer100g {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  source: 'openfoodfacts' | 'usda' | 'local' | 'not_found';
}

export interface FoodItemResult {
  name: string;
  estimated_grams: number;
  confidence: number;
  nutrition_per_100g: NutritionPer100g;
  // Calculated values (nutrition_per_100g * estimated_grams / 100)
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  nutrition_found: boolean;
}

// ─── Full Analysis Result ─────────────────────────────────────────────

export interface AnalysisResult {
  is_food: boolean;
  confidence: number;
  confidence_level: 'high' | 'low' | 'rejected';
  reason: string;
  items: FoodItemResult[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_fiber: number;
  raw_vision_response: VisionResponse; // For debugging
}

// ─── API Error ────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  details?: string;
  retryable: boolean;
}
