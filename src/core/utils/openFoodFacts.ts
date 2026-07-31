import { Food, FoodCategory } from '../types'
import { fetchFoodJson } from './foodApiHttp'

/**
 * Open Food Facts — packaged and branded groceries.
 *
 * WHY THIS EXISTS ALONGSIDE USDA:
 * USDA FoodData Central is a US composition table. Its Indian coverage is close to nothing,
 * so a user searching "Amul butter", "Britannia Marie", "Maggi" or "Haldiram's" got an
 * empty list and concluded the app did not know their food. Open Food Facts is a
 * crowd-sourced barcode database with deep coverage of exactly those products.
 *
 * WHAT IT IS NOT:
 * A recipe or composition table. Search it for "dal" and it returns bags of uncooked dal,
 * not a katori of cooked dal. Home-cooked Indian food is answered by the `in###` entries in
 * ./../data/foodDatabase.ts, and the two are complementary rather than alternatives.
 *
 * The India-scoped host is tried first. Open Food Facts runs per-country subdomains over
 * one dataset, and `in.` ranks products actually sold in India ahead of the global
 * catalogue — which matters when "butter" would otherwise return Kerrygold before Amul.
 */

/** India first, then the global catalogue for anything it does not carry. */
const HOSTS = ['https://in.openfoodfacts.org', 'https://world.openfoodfacts.org'] as const

/**
 * Only the fields the mapper reads.
 *
 * Open Food Facts documents over 200 fields per product and returns all of them by default;
 * a 20-result page is several megabytes of JSON that Hermes then has to parse on the UI
 * thread. Naming the eight that matter turns that into a few kilobytes.
 */
const FIELDS = [
  'code',
  'product_name',
  'brands',
  'categories_tags',
  'nutriments',
  'serving_quantity',
  'serving_size',
  'quantity',
].join(',')

/**
 * Category mapping, best effort.
 *
 * Open Food Facts tags are a folksonomy: `en:biscuits`, `en:plant-based-foods`,
 * `en:snacks`, several per product and often contradictory. This reads the first tag that
 * maps onto one of our categories and gives up gracefully, because a wrong category is a
 * cosmetic filter problem while a wrong macro is a corrupted diary.
 */
const TAG_CATEGORY: ReadonlyArray<readonly [string, FoodCategory]> = [
  ['dairies', 'Dairy'],
  ['milk', 'Dairy'],
  ['cheese', 'Dairy'],
  ['yogurt', 'Dairy'],
  ['butters', 'Dairy'],
  ['meats', 'Meat & Poultry'],
  ['poultry', 'Meat & Poultry'],
  ['eggs', 'Meat & Poultry'],
  ['seafood', 'Fish & Seafood'],
  ['fishes', 'Fish & Seafood'],
  ['fruits', 'Fruits'],
  ['vegetables', 'Vegetables'],
  ['legumes', 'Legumes'],
  ['pulses', 'Legumes'],
  ['cereals', 'Grains & Cereals'],
  ['breads', 'Grains & Cereals'],
  ['pastas', 'Grains & Cereals'],
  ['rice', 'Grains & Cereals'],
  ['nuts', 'Nuts & Seeds'],
  ['seeds', 'Nuts & Seeds'],
  ['beverages', 'Beverages'],
  ['waters', 'Beverages'],
  ['snacks', 'Snacks'],
  ['biscuits', 'Snacks'],
  ['chips', 'Snacks'],
  ['desserts', 'Sweets & Desserts'],
  ['sweet-snacks', 'Sweets & Desserts'],
  ['chocolates', 'Sweets & Desserts'],
  ['confectioneries', 'Sweets & Desserts'],
  ['sauces', 'Condiments'],
  ['condiments', 'Condiments'],
  ['spreads', 'Condiments'],
  ['fats', 'Oils & Fats'],
  ['vegetable-oils', 'Oils & Fats'],
]

const categoryFromTags = (tags: unknown): FoodCategory => {
  if (!Array.isArray(tags)) return 'Custom'
  for (const tag of tags) {
    if (typeof tag !== 'string') continue
    // Tags are language-prefixed: 'en:biscuits'.
    const bare = tag.includes(':') ? tag.slice(tag.indexOf(':') + 1) : tag
    for (const [needle, category] of TAG_CATEGORY) {
      if (bare === needle || bare.endsWith(`-${needle}`)) return category
    }
  }
  return 'Custom'
}

/** Returns the finite, non-negative number, or 0. Negative nutriments are data entry noise. */
const amount = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 10) / 10
}

/**
 * Energy in kcal per 100 g.
 *
 * Roughly a third of the database carries only `energy_100g`, which is kilojoules. Reading
 * that as kilocalories overstates every such food by 4.184x — a 250 kcal biscuit logged as
 * 1046 — so the kJ field is only used when the kcal one is genuinely absent, and it is
 * converted.
 */
const energyKcal = (nutriments: Record<string, unknown>): number => {
  const kcal = amount(nutriments['energy-kcal_100g'])
  if (kcal > 0) return Math.round(kcal)
  const kj = amount(nutriments['energy_100g'])
  return kj > 0 ? Math.round(kj / 4.184) : 0
}

export interface OpenFoodFactsFood extends Food {
  /** The product barcode, kept so a future scanner can look the same item up directly. */
  barcode: string
}

/** Returns a usable Food, or null when the product cannot be trusted or identified. */
const mapProduct = (raw: unknown): OpenFoodFactsFood | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const product = raw as Record<string, unknown>

  const name = typeof product.product_name === 'string' ? product.product_name.trim() : ''
  if (name.length === 0) return null

  const code = typeof product.code === 'string' ? product.code : ''
  if (code.length === 0) return null

  const nutriments =
    typeof product.nutriments === 'object' && product.nutriments !== null
      ? (product.nutriments as Record<string, unknown>)
      : {}

  const calories = energyKcal(nutriments)
  // A crowd-sourced entry with no energy value is a product photo somebody uploaded and
  // never filled in. Rendering it as "0 kcal" invites logging a meal as nothing.
  if (calories === 0) return null

  // `brands` is a comma-separated list; the first is the manufacturer.
  const brands = typeof product.brands === 'string' ? product.brands.split(',')[0]?.trim() : ''

  return {
    id: `off-${code}`,
    barcode: code,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    brand: brands && brands.length > 0 ? brands : undefined,
    category: categoryFromTags(product.categories_tags),
    /*
      Fixed at 100 g, matching how the USDA results are mapped, because every `*_100g`
      nutriment below is per 100 g by definition. The product's own serving size is
      deliberately NOT used as the serving: it is free text ("1 biscuit", "30g", "2 rotis")
      and parsing it wrong silently rescales every macro. The serving editor in the picker
      is where a user states what they actually ate.
    */
    servingSize: 100,
    servingUnit: 'g',
    calories,
    protein: amount(nutriments.proteins_100g),
    carbs: amount(nutriments.carbohydrates_100g),
    fat: amount(nutriments.fat_100g),
    fiber: amount(nutriments.fiber_100g),
    sugar: amount(nutriments.sugars_100g),
    // Salt is given in grams; sodium is what the app tracks, in milligrams.
    sodium: Math.round(amount(nutriments.sodium_100g) * 1000),
    potassium: Math.round(amount(nutriments.potassium_100g) * 1000),
    cholesterol: Math.round(amount(nutriments.cholesterol_100g) * 1000),
    saturatedFat: amount(nutriments['saturated-fat_100g']),
    transFat: amount(nutriments['trans-fat_100g']),
    vitaminA: 0,
    vitaminC: 0,
    calcium: 0,
    iron: 0,
    isCustom: false,
  }
}

const searchHost = async (
  host: string,
  query: string,
  limit: number,
): Promise<OpenFoodFactsFood[]> => {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(limit),
    fields: FIELDS,
  })

  const json = (await fetchFoodJson(`${host}/cgi/search.pl?${params}`)) as
    | { products?: unknown[] }
    | null

  const products = Array.isArray(json?.products) ? json.products : []
  const foods: OpenFoodFactsFood[] = []
  for (const product of products) {
    const food = mapProduct(product)
    if (food !== null) foods.push(food)
  }
  return foods
}

/**
 * Searches Open Food Facts and returns products with usable macros.
 *
 * Tries the India catalogue first and falls back to the global one only when India returns
 * nothing at all — not when it returns few results. A partial Indian answer is still the
 * better answer, and paying a second round trip to append Kerrygold to a search for butter
 * would cost the user a second for a worse list.
 *
 * Throws on transport failure, matching `searchUSDA`, so the caller can tell "no matches"
 * apart from "could not ask".
 */
export const searchOpenFoodFacts = async (
  query: string,
  limit = 12,
): Promise<OpenFoodFactsFood[]> => {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  let lastError: unknown = null
  for (const host of HOSTS) {
    try {
      const foods = await searchHost(host, trimmed, limit)
      if (foods.length > 0) return foods
      lastError = null
    } catch (error) {
      lastError = error
    }
  }

  // Every host failed. An empty list here would read as "this food does not exist", which
  // is a different and much more discouraging claim than "we could not reach the database".
  if (lastError !== null) throw lastError
  return []
}
