import { Food } from '../types'

/**
 * Indian home-cooked and street food.
 *
 * WHY THIS IS BUNDLED RATHER THAN FETCHED:
 * The two remote sources both answer the wrong question for this food. USDA FoodData
 * Central is a US composition table with essentially no Indian coverage. Open Food Facts is
 * a barcode database of packaged goods, so searching it for "dal" returns bags of uncooked
 * dal rather than a katori of the cooked thing somebody actually ate. Neither can answer
 * "2 rotis and dal", which for a large part of this app's users is most days.
 *
 * So it ships offline. It is instant, works on a train, and costs no API budget.
 *
 * SERVINGS ARE STATED IN THE UNIT PEOPLE THINK IN.
 * "1 roti (40 g)", "1 katori (150 g)", "1 idli (35 g)". A gram-only serving forces exactly
 * the mental arithmetic this app exists to remove: nobody weighs a chapati. The gram figure
 * is still carried so the serving editor can scale it, and so the macros stay checkable.
 *
 * ACCURACY, HONESTLY:
 * A home-cooked curry varies by well over 30% with how heavy the cook is with oil, and no
 * database can fix that. These are reference values for a typical domestic preparation,
 * drawn from IFCT 2017 (Indian Food Composition Tables, National Institute of Nutrition,
 * Hyderabad) where it covers the item and from standard recipe composition where it does
 * not. They are a starting point the user adjusts, not a measurement.
 *
 * Micronutrient percentages are 0 throughout. Every other dynamic source in the app does
 * the same — `searchUSDA`, the Open Food Facts mapper, and the chat food logger all write
 * 0 — and nothing in the UI reads them. Inventing 480 plausible-looking percentages would
 * be false precision on top of values that are already approximations.
 *
 * IDs are prefixed `in` so they cannot collide with the `f`/`v`/`g`/`d`/`m` series in
 * ./foodDatabase.ts.
 */

/** Shorthand so 120 rows stay readable and the fields that are always 0 stay out of the way. */
const dish = (
  id: string,
  name: string,
  category: Food['category'],
  servingSize: number,
  servingUnit: string,
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number,
  sugar: number,
  sodium: number,
  saturatedFat: number,
): Food => ({
  id,
  name,
  category,
  servingSize,
  servingUnit,
  calories,
  protein,
  carbs,
  fat,
  fiber,
  sugar,
  sodium,
  potassium: 0,
  cholesterol: 0,
  saturatedFat,
  transFat: 0,
  vitaminA: 0,
  vitaminC: 0,
  calcium: 0,
  iron: 0,
})

export const INDIAN_FOOD_DATABASE: Food[] = [
  // === BREADS ===
  dish('in001', 'Roti / Chapati (1, no ghee)', 'Grains & Cereals', 40, 'g', 104, 3.1, 20, 0.9, 2.7, 0.4, 2, 0.2),
  dish('in002', 'Phulka (1, small)', 'Grains & Cereals', 30, 'g', 78, 2.3, 15, 0.7, 2, 0.3, 2, 0.1),
  dish('in003', 'Roti with ghee (1)', 'Grains & Cereals', 45, 'g', 149, 3.1, 20, 5.9, 2.7, 0.4, 2, 3.2),
  dish('in004', 'Tandoori roti (1)', 'Grains & Cereals', 50, 'g', 130, 4, 25, 1.5, 3, 0.5, 180, 0.4),
  dish('in005', 'Plain paratha (1)', 'Grains & Cereals', 65, 'g', 210, 4.5, 27, 9.5, 3.2, 0.5, 190, 4.8),
  dish('in006', 'Aloo paratha (1)', 'Grains & Cereals', 100, 'g', 260, 5.5, 36, 10, 3.8, 1.2, 320, 5),
  dish('in007', 'Naan (1)', 'Grains & Cereals', 90, 'g', 262, 7.5, 45, 5.5, 2, 3, 400, 2.4),
  dish('in008', 'Butter naan (1)', 'Grains & Cereals', 100, 'g', 320, 7.5, 45, 12, 2, 3, 420, 6.5),
  dish('in009', 'Bhatura (1)', 'Grains & Cereals', 70, 'g', 265, 5, 30, 13.5, 1.5, 1, 260, 6),
  dish('in010', 'Puri (1)', 'Grains & Cereals', 25, 'g', 101, 1.8, 11, 5.6, 0.8, 0.2, 60, 2.4),
  dish('in011', 'Thepla (1)', 'Grains & Cereals', 45, 'g', 130, 3.2, 17, 5.5, 2.5, 0.5, 180, 2.4),
  dish('in012', 'Jowar bhakri (1)', 'Grains & Cereals', 50, 'g', 150, 3.5, 31, 1.2, 3.5, 0.4, 3, 0.3),
  dish('in013', 'Bajra roti (1)', 'Grains & Cereals', 50, 'g', 155, 4.2, 30, 2.2, 4, 0.4, 4, 0.5),

  // === RICE AND GRAINS ===
  dish('in014', 'Cooked white rice (1 katori)', 'Grains & Cereals', 150, 'g', 195, 4, 43, 0.4, 0.6, 0.1, 2, 0.1),
  dish('in015', 'Cooked brown rice (1 katori)', 'Grains & Cereals', 150, 'g', 175, 4.1, 36, 1.4, 2.7, 0.4, 5, 0.3),
  dish('in016', 'Jeera rice (1 katori)', 'Grains & Cereals', 150, 'g', 240, 4.2, 42, 6, 0.8, 0.2, 300, 3.2),
  dish('in017', 'Curd rice (1 katori)', 'Grains & Cereals', 200, 'g', 210, 6.5, 35, 4.5, 0.7, 3.5, 340, 2.4),
  dish('in018', 'Lemon rice (1 katori)', 'Grains & Cereals', 150, 'g', 245, 4.5, 40, 7.5, 1.2, 0.3, 350, 2),
  dish('in019', 'Tamarind rice (1 katori)', 'Grains & Cereals', 150, 'g', 260, 4.5, 41, 8.5, 1.5, 2, 420, 2.2),
  dish('in020', 'Veg pulao (1 katori)', 'Grains & Cereals', 150, 'g', 220, 4.5, 38, 5.5, 1.8, 1.2, 330, 2.8),
  dish('in021', 'Veg biryani (1 plate)', 'Grains & Cereals', 250, 'g', 380, 8.5, 58, 12, 3.5, 2.5, 620, 5.5),
  dish('in022', 'Chicken biryani (1 plate)', 'Grains & Cereals', 300, 'g', 520, 26, 62, 18, 2.5, 2.5, 780, 7),
  dish('in023', 'Mutton biryani (1 plate)', 'Grains & Cereals', 300, 'g', 580, 24, 62, 25, 2.5, 2.5, 800, 10),
  dish('in024', 'Khichdi (1 katori)', 'Grains & Cereals', 200, 'g', 235, 8, 38, 5.5, 3.5, 0.8, 380, 2.4),
  dish('in025', 'Idiyappam (2)', 'Grains & Cereals', 100, 'g', 175, 3, 38, 1, 1, 0.2, 5, 0.5),
  dish('in026', 'Appam (1)', 'Grains & Cereals', 60, 'g', 120, 2, 24, 2, 0.8, 1.5, 90, 1.4),
  dish('in027', 'Puttu (1 serving)', 'Grains & Cereals', 100, 'g', 195, 4, 40, 2, 2.5, 0.5, 8, 1.2),
  dish('in028', 'Ragi mudde (1)', 'Grains & Cereals', 100, 'g', 130, 3, 28, 0.8, 3, 0.3, 5, 0.2),

  // === DALS AND LEGUMES ===
  dish('in029', 'Toor dal, cooked (1 katori)', 'Legumes', 150, 'g', 145, 8, 20, 3.5, 4.5, 1.2, 340, 1.4),
  dish('in030', 'Moong dal, cooked (1 katori)', 'Legumes', 150, 'g', 135, 8.5, 19, 2.8, 4, 1, 330, 1.1),
  dish('in031', 'Chana dal, cooked (1 katori)', 'Legumes', 150, 'g', 165, 9, 24, 3.5, 5.5, 1.5, 340, 1.3),
  dish('in032', 'Masoor dal, cooked (1 katori)', 'Legumes', 150, 'g', 140, 8.5, 20, 2.8, 4.2, 1.1, 330, 1.1),
  dish('in033', 'Dal fry (1 katori)', 'Legumes', 150, 'g', 185, 8, 21, 7.5, 4.5, 1.5, 420, 3),
  dish('in034', 'Dal tadka (1 katori)', 'Legumes', 150, 'g', 190, 8, 21, 8, 4.5, 1.5, 430, 3.4),
  dish('in035', 'Dal makhani (1 katori)', 'Legumes', 150, 'g', 280, 9, 22, 17, 6, 2, 480, 9),
  dish('in036', 'Rajma curry (1 katori)', 'Legumes', 150, 'g', 175, 8, 24, 5, 6, 2, 420, 2),
  dish('in037', 'Chole / chana masala (1 katori)', 'Legumes', 150, 'g', 210, 8.5, 27, 7.5, 7, 3, 480, 2.6),
  dish('in038', 'Sambar (1 katori)', 'Legumes', 150, 'g', 120, 5.5, 15, 4, 3.5, 2, 420, 1.5),
  dish('in039', 'Rasam (1 katori)', 'Legumes', 150, 'g', 65, 2, 8, 2.5, 1.2, 1.5, 400, 0.9),
  dish('in040', 'Sprouts salad (1 katori)', 'Legumes', 100, 'g', 100, 7, 15, 1, 4.5, 2, 180, 0.2),
  dish('in041', 'Kadhi (1 katori)', 'Legumes', 150, 'g', 145, 5, 12, 8.5, 1, 3, 400, 3.4),
  dish('in042', 'Sundal (1 katori)', 'Legumes', 100, 'g', 145, 7, 20, 4, 5.5, 1.5, 260, 2.2),

  // === SOUTH INDIAN BREAKFAST ===
  dish('in043', 'Idli (1)', 'Grains & Cereals', 35, 'g', 58, 1.8, 12, 0.3, 0.6, 0.2, 110, 0.1),
  dish('in044', 'Rava idli (1)', 'Grains & Cereals', 45, 'g', 85, 2.2, 14, 2.2, 0.9, 0.3, 160, 1.2),
  dish('in045', 'Plain dosa (1)', 'Grains & Cereals', 70, 'g', 168, 3.5, 25, 5.5, 1.2, 0.4, 200, 2.4),
  dish('in046', 'Masala dosa (1)', 'Grains & Cereals', 150, 'g', 290, 6, 42, 11, 3, 1.5, 420, 4.8),
  dish('in047', 'Rava dosa (1)', 'Grains & Cereals', 100, 'g', 235, 4, 32, 10, 1.5, 0.5, 350, 4.4),
  dish('in048', 'Uttapam (1)', 'Grains & Cereals', 110, 'g', 210, 5, 32, 7, 2, 1.5, 320, 3),
  dish('in049', 'Upma (1 katori)', 'Grains & Cereals', 150, 'g', 230, 5, 33, 8.5, 2.5, 1.5, 400, 3.4),
  dish('in050', 'Ven pongal (1 katori)', 'Grains & Cereals', 150, 'g', 260, 7, 36, 9.5, 2.2, 0.6, 420, 5),
  dish('in051', 'Medu vada (1)', 'Snacks', 45, 'g', 145, 4, 15, 7.5, 1.8, 0.4, 250, 3.2),
  dish('in052', 'Poha (1 katori)', 'Grains & Cereals', 150, 'g', 205, 4, 33, 6.5, 2, 1.5, 380, 2.4),
  dish('in053', 'Coconut chutney (2 tbsp)', 'Condiments', 30, 'g', 68, 1.2, 3, 6, 1.5, 1, 110, 4.8),
  dish('in054', 'Green chutney (2 tbsp)', 'Condiments', 30, 'g', 25, 1, 3, 1, 1, 0.8, 150, 0.2),
  dish('in055', 'Mango pickle (1 tbsp)', 'Condiments', 15, 'g', 45, 0.2, 2, 4, 0.5, 1, 620, 0.5),

  // === PANEER AND VEGETABLE CURRIES ===
  dish('in056', 'Paneer butter masala (1 katori)', 'Dairy', 150, 'g', 340, 11, 14, 27, 2, 6, 560, 14),
  dish('in057', 'Palak paneer (1 katori)', 'Dairy', 150, 'g', 250, 11, 9, 19, 3, 2.5, 500, 9.5),
  dish('in058', 'Shahi paneer (1 katori)', 'Dairy', 150, 'g', 330, 11, 15, 26, 1.8, 7, 540, 13.5),
  dish('in059', 'Kadai paneer (1 katori)', 'Dairy', 150, 'g', 290, 11, 12, 22, 2.5, 4, 520, 11),
  dish('in060', 'Matar paneer (1 katori)', 'Dairy', 150, 'g', 265, 11, 15, 18, 3.5, 4.5, 510, 8.5),
  dish('in061', 'Malai kofta (1 katori)', 'Vegetables', 150, 'g', 350, 8, 22, 26, 2.5, 6, 540, 12),
  dish('in062', 'Aloo gobi (1 katori)', 'Vegetables', 150, 'g', 150, 3.5, 18, 7.5, 4, 3, 380, 1.5),
  dish('in063', 'Bhindi masala (1 katori)', 'Vegetables', 150, 'g', 160, 3, 13, 11, 4.5, 3, 360, 2),
  dish('in064', 'Baingan bharta (1 katori)', 'Vegetables', 150, 'g', 155, 3, 14, 10, 5, 5, 400, 2),
  dish('in065', 'Mixed veg curry (1 katori)', 'Vegetables', 150, 'g', 145, 3.5, 15, 8, 4, 4, 400, 2),
  dish('in066', 'Jeera aloo (1 katori)', 'Vegetables', 150, 'g', 175, 3, 24, 7.5, 3, 1.5, 350, 1.4),
  dish('in067', 'Dum aloo (1 katori)', 'Vegetables', 150, 'g', 210, 4, 26, 10, 3.5, 3.5, 450, 4),
  dish('in068', 'Sarson ka saag (1 katori)', 'Vegetables', 150, 'g', 165, 5, 11, 11, 5, 2.5, 420, 5),
  dish('in069', 'Cabbage poriyal (1 katori)', 'Vegetables', 100, 'g', 85, 2, 8, 5, 3, 3, 260, 3.2),
  dish('in070', 'Beans poriyal (1 katori)', 'Vegetables', 100, 'g', 95, 2.5, 9, 5.5, 3.5, 2.5, 270, 3.4),
  dish('in071', 'Avial (1 katori)', 'Vegetables', 150, 'g', 175, 4, 13, 12, 4.5, 4, 380, 8),
  dish('in072', 'Aloo matar (1 katori)', 'Vegetables', 150, 'g', 170, 4.5, 22, 7, 4.5, 3.5, 400, 1.5),
  dish('in073', 'Raita (1 katori)', 'Dairy', 100, 'g', 65, 3, 5, 3.5, 0.6, 4, 220, 2.2),

  // === MEAT, FISH AND EGG ===
  dish('in074', 'Chicken curry (1 katori)', 'Meat & Poultry', 150, 'g', 245, 21, 6, 15, 1.2, 2.5, 520, 4.5),
  dish('in075', 'Butter chicken (1 katori)', 'Meat & Poultry', 150, 'g', 320, 22, 9, 22, 1, 5, 580, 10),
  dish('in076', 'Chicken tikka (100 g)', 'Meat & Poultry', 100, 'g', 195, 26, 3, 8.5, 0.5, 1.5, 480, 3),
  dish('in077', 'Tandoori chicken (100 g)', 'Meat & Poultry', 100, 'g', 175, 25, 2.5, 7.5, 0.3, 1.2, 460, 2.4),
  dish('in078', 'Chicken 65 (100 g)', 'Meat & Poultry', 100, 'g', 245, 22, 10, 13, 0.6, 1.5, 620, 4),
  dish('in079', 'Mutton curry (1 katori)', 'Meat & Poultry', 150, 'g', 300, 22, 6, 21, 1.2, 2, 540, 8),
  dish('in080', 'Keema (100 g)', 'Meat & Poultry', 100, 'g', 265, 19, 5, 19, 1, 1.5, 480, 7.5),
  dish('in081', 'Fish curry (1 katori)', 'Fish & Seafood', 150, 'g', 200, 19, 5.5, 11, 1, 2, 500, 3.5),
  dish('in082', 'Fish fry (100 g)', 'Fish & Seafood', 100, 'g', 230, 21, 6, 13, 0.4, 0.5, 460, 3),
  dish('in083', 'Prawn curry (1 katori)', 'Fish & Seafood', 150, 'g', 190, 18, 6, 10, 1, 2, 560, 3),
  dish('in084', 'Egg curry (1 katori, 1 egg)', 'Meat & Poultry', 150, 'g', 205, 9.5, 7, 15, 1.5, 2.5, 460, 4.5),
  dish('in085', 'Egg bhurji (2 eggs)', 'Meat & Poultry', 100, 'g', 190, 12, 4, 14, 0.8, 1.5, 380, 4.2),
  dish('in086', 'Masala omelette (2 eggs)', 'Meat & Poultry', 110, 'g', 200, 13, 2, 15, 0.3, 1, 360, 4.4),
  dish('in087', 'Boiled egg (1)', 'Meat & Poultry', 50, 'g', 78, 6.3, 0.6, 5.3, 0, 0.2, 62, 1.6),

  // === SNACKS AND STREET FOOD ===
  dish('in088', 'Samosa (1)', 'Snacks', 60, 'g', 195, 3.5, 22, 10.5, 2, 1, 320, 4.5),
  dish('in089', 'Onion pakora (4 pieces)', 'Snacks', 50, 'g', 175, 4, 16, 10.5, 2.5, 1.2, 290, 4.4),
  dish('in090', 'Dhokla (2 pieces)', 'Snacks', 80, 'g', 130, 5, 20, 3.5, 1.5, 3, 340, 1.2),
  dish('in091', 'Vada pav (1)', 'Fast Food', 130, 'g', 300, 7, 43, 11, 3, 3, 620, 4.8),
  dish('in092', 'Pav bhaji (1 plate)', 'Fast Food', 250, 'g', 400, 9, 52, 17, 6, 6, 880, 8.5),
  dish('in093', 'Misal pav (1 plate)', 'Fast Food', 250, 'g', 400, 13, 52, 16, 8, 4, 860, 6),
  dish('in094', 'Bhel puri (1 plate)', 'Snacks', 100, 'g', 235, 5, 34, 9, 3.5, 4, 560, 3),
  dish('in095', 'Pani puri (6 pieces)', 'Snacks', 90, 'g', 175, 3.5, 27, 6, 2, 3, 480, 2.4),
  dish('in096', 'Sev puri (6 pieces)', 'Snacks', 100, 'g', 250, 5, 32, 11, 3, 5, 620, 4),
  dish('in097', 'Aloo tikki (1)', 'Snacks', 70, 'g', 160, 2.5, 21, 7.5, 2.2, 1.2, 320, 3),
  dish('in098', 'Veg momos (4)', 'Fast Food', 100, 'g', 175, 5, 28, 4.5, 2, 2, 380, 1.5),
  dish('in099', 'Chicken momos (4)', 'Fast Food', 110, 'g', 210, 11, 26, 6.5, 1.5, 1.8, 420, 2.2),
  dish('in100', 'Masala peanuts (30 g)', 'Nuts & Seeds', 30, 'g', 165, 6.5, 8, 12, 2.5, 1, 260, 2),
  dish('in101', 'Murukku (30 g)', 'Snacks', 30, 'g', 155, 3, 17, 8.5, 1.2, 0.4, 240, 3.5),
  dish('in102', 'Sev (25 g)', 'Snacks', 25, 'g', 130, 4, 12, 7.5, 1.8, 0.3, 260, 2.6),
  dish('in103', 'Roasted papad (1)', 'Snacks', 12, 'g', 40, 2.2, 6, 0.4, 1, 0.2, 400, 0.1),
  dish('in104', 'Poori bhaji (1 plate)', 'Fast Food', 200, 'g', 480, 8, 58, 24, 4.5, 3, 640, 11),

  // === DAIRY AND DRINKS ===
  dish('in105', 'Paneer, raw (100 g)', 'Dairy', 100, 'g', 296, 18.3, 3.6, 23, 0, 2.6, 22, 15),
  dish('in106', 'Curd / dahi (1 katori)', 'Dairy', 150, 'g', 90, 5, 7, 4.5, 0, 6.5, 70, 2.9),
  dish('in107', 'Buttermilk / chaas (1 glass)', 'Beverages', 200, 'ml', 40, 2.5, 4.5, 1.2, 0, 4, 320, 0.8),
  dish('in108', 'Sweet lassi (1 glass)', 'Beverages', 250, 'ml', 210, 7, 32, 6, 0, 30, 100, 3.8),
  dish('in109', 'Salted lassi (1 glass)', 'Beverages', 250, 'ml', 105, 6.5, 9, 5, 0, 8.5, 420, 3.2),
  dish('in110', 'Masala chai with sugar (1 cup)', 'Beverages', 150, 'ml', 90, 2.5, 12, 3.5, 0, 11, 40, 2.2),
  dish('in111', 'Filter coffee with sugar (1 cup)', 'Beverages', 150, 'ml', 95, 3, 12, 3.8, 0, 11, 45, 2.4),
  dish('in112', 'Full cream milk (1 glass)', 'Dairy', 200, 'ml', 130, 6.4, 9.6, 7, 0, 9.6, 90, 4.4),
  dish('in113', 'Toned milk (1 glass)', 'Dairy', 200, 'ml', 116, 6.4, 9.8, 5.6, 0, 9.8, 90, 3.5),
  dish('in114', 'Ghee (1 tsp)', 'Oils & Fats', 5, 'g', 45, 0, 0, 5, 0, 0, 0, 3.1),

  // === SWEETS ===
  dish('in115', 'Gulab jamun (1)', 'Sweets & Desserts', 40, 'g', 150, 2, 21, 6.5, 0.2, 18, 40, 3.2),
  dish('in116', 'Rasgulla (1)', 'Sweets & Desserts', 45, 'g', 106, 2.5, 21, 1.5, 0, 19, 30, 0.9),
  dish('in117', 'Jalebi (1)', 'Sweets & Desserts', 30, 'g', 120, 0.8, 20, 4.5, 0.1, 16, 15, 2.2),
  dish('in118', 'Kheer (1 katori)', 'Sweets & Desserts', 150, 'g', 205, 5, 30, 7, 0.5, 24, 80, 4.2),
  dish('in119', 'Gajar halwa (100 g)', 'Sweets & Desserts', 100, 'g', 260, 3.5, 32, 13, 2, 26, 70, 8),
  dish('in120', 'Besan laddu (1)', 'Sweets & Desserts', 40, 'g', 185, 3.5, 22, 9.5, 1.2, 15, 20, 5),
  dish('in121', 'Kaju barfi (1)', 'Sweets & Desserts', 25, 'g', 110, 2, 13, 5.5, 0.4, 11, 15, 2.4),
  dish('in122', 'Mysore pak (1)', 'Sweets & Desserts', 30, 'g', 165, 2, 18, 9.5, 0.5, 14, 12, 5.5),
  dish('in123', 'Payasam (1 katori)', 'Sweets & Desserts', 150, 'g', 195, 4, 29, 7, 0.4, 23, 75, 4),
  dish('in124', 'Rava kesari (100 g)', 'Sweets & Desserts', 100, 'g', 300, 3.5, 45, 12, 0.8, 28, 60, 7),
]
