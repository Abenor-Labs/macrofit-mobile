import { Food, Exercise, ExerciseCategory } from '../types'

export const FOOD_DATABASE: Food[] = [
  // === FRUITS ===
  { id: 'f001', name: 'Apple (medium)', category: 'Fruits', servingSize: 182, servingUnit: 'g', calories: 95, protein: 0.5, carbs: 25, fat: 0.3, fiber: 4.4, sugar: 19, sodium: 2, potassium: 195, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 1, vitaminC: 14, calcium: 1, iron: 1 },
  { id: 'f002', name: 'Banana (medium)', category: 'Fruits', servingSize: 118, servingUnit: 'g', calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1, sugar: 14, sodium: 1, potassium: 422, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 1, vitaminC: 17, calcium: 1, iron: 2 },
  { id: 'f003', name: 'Blueberries (1 cup)', category: 'Fruits', servingSize: 148, servingUnit: 'g', calories: 84, protein: 1.1, carbs: 21, fat: 0.5, fiber: 3.6, sugar: 15, sodium: 1, potassium: 114, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 1, vitaminC: 24, calcium: 1, iron: 2 },
  { id: 'f004', name: 'Strawberries (1 cup)', category: 'Fruits', servingSize: 152, servingUnit: 'g', calories: 49, protein: 1, carbs: 12, fat: 0.5, fiber: 3, sugar: 7, sodium: 2, potassium: 233, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 1, vitaminC: 141, calcium: 2, iron: 4 },
  { id: 'f005', name: 'Orange (medium)', category: 'Fruits', servingSize: 131, servingUnit: 'g', calories: 62, protein: 1.2, carbs: 15, fat: 0.2, fiber: 3.1, sugar: 12, sodium: 0, potassium: 237, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 4, vitaminC: 116, calcium: 6, iron: 1 },
  { id: 'f006', name: 'Mango (1 cup)', category: 'Fruits', servingSize: 165, servingUnit: 'g', calories: 107, protein: 0.8, carbs: 28, fat: 0.4, fiber: 3, sugar: 24, sodium: 3, potassium: 277, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 25, vitaminC: 76, calcium: 2, iron: 1 },
  { id: 'f007', name: 'Grapes (1 cup)', category: 'Fruits', servingSize: 151, servingUnit: 'g', calories: 104, protein: 1.1, carbs: 27, fat: 0.2, fiber: 1.4, sugar: 23, sodium: 3, potassium: 288, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 1, vitaminC: 27, calcium: 2, iron: 3 },
  { id: 'f008', name: 'Watermelon (1 cup)', category: 'Fruits', servingSize: 154, servingUnit: 'g', calories: 46, protein: 0.9, carbs: 12, fat: 0.2, fiber: 0.6, sugar: 9, sodium: 2, potassium: 170, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 17, vitaminC: 21, calcium: 1, iron: 2 },
  { id: 'f009', name: 'Avocado (1/2 medium)', category: 'Fruits', servingSize: 68, servingUnit: 'g', calories: 114, protein: 1.3, carbs: 6, fat: 10.5, fiber: 4.6, sugar: 0.2, sodium: 5, potassium: 345, cholesterol: 0, saturatedFat: 1.5, transFat: 0, vitaminA: 2, vitaminC: 10, calcium: 1, iron: 2 },
  { id: 'f010', name: 'Pineapple (1 cup)', category: 'Fruits', servingSize: 165, servingUnit: 'g', calories: 82, protein: 0.9, carbs: 22, fat: 0.2, fiber: 2.3, sugar: 16, sodium: 2, potassium: 180, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 1, vitaminC: 131, calcium: 2, iron: 3 },

  // === VEGETABLES ===
  { id: 'v001', name: 'Broccoli (1 cup, chopped)', category: 'Vegetables', servingSize: 91, servingUnit: 'g', calories: 31, protein: 2.6, carbs: 6, fat: 0.3, fiber: 2.4, sugar: 1.5, sodium: 30, potassium: 288, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 11, vitaminC: 135, calcium: 4, iron: 4 },
  { id: 'v002', name: 'Spinach (1 cup)', category: 'Vegetables', servingSize: 30, servingUnit: 'g', calories: 7, protein: 0.9, carbs: 1.1, fat: 0.1, fiber: 0.7, sugar: 0.1, sodium: 24, potassium: 167, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 56, vitaminC: 14, calcium: 3, iron: 5 },
  { id: 'v003', name: 'Sweet Potato (medium)', category: 'Vegetables', servingSize: 130, servingUnit: 'g', calories: 112, protein: 2, carbs: 26, fat: 0.1, fiber: 3.9, sugar: 5.4, sodium: 72, potassium: 438, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 214, vitaminC: 35, calcium: 4, iron: 4 },
  { id: 'v004', name: 'Carrots (1 cup, chopped)', category: 'Vegetables', servingSize: 128, servingUnit: 'g', calories: 52, protein: 1.2, carbs: 12, fat: 0.3, fiber: 3.6, sugar: 6, sodium: 88, potassium: 390, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 428, vitaminC: 13, calcium: 4, iron: 2 },
  { id: 'v005', name: 'Bell Pepper (red, 1 cup)', category: 'Vegetables', servingSize: 149, servingUnit: 'g', calories: 46, protein: 1.5, carbs: 9, fat: 0.4, fiber: 3.1, sugar: 6.3, sodium: 6, potassium: 314, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 93, vitaminC: 317, calcium: 1, iron: 4 },
  { id: 'v006', name: 'Cucumber (1 cup, sliced)', category: 'Vegetables', servingSize: 119, servingUnit: 'g', calories: 16, protein: 0.7, carbs: 3.8, fat: 0.1, fiber: 0.5, sugar: 1.8, sodium: 2, potassium: 193, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 4, vitaminC: 5, calcium: 2, iron: 2 },
  { id: 'v007', name: 'Tomato (medium)', category: 'Vegetables', servingSize: 123, servingUnit: 'g', calories: 22, protein: 1.1, carbs: 4.8, fat: 0.2, fiber: 1.5, sugar: 3.2, sodium: 6, potassium: 292, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 20, vitaminC: 28, calcium: 1, iron: 2 },
  { id: 'v008', name: 'Kale (1 cup)', category: 'Vegetables', servingSize: 67, servingUnit: 'g', calories: 34, protein: 2.2, carbs: 6.7, fat: 0.5, fiber: 1.3, sugar: 1.6, sodium: 29, potassium: 299, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 206, vitaminC: 134, calcium: 9, iron: 6 },
  { id: 'v009', name: 'Zucchini (1 cup, sliced)', category: 'Vegetables', servingSize: 124, servingUnit: 'g', calories: 21, protein: 1.5, carbs: 3.9, fat: 0.4, fiber: 1.2, sugar: 3.1, sodium: 10, potassium: 325, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 6, vitaminC: 35, calcium: 2, iron: 3 },
  { id: 'v010', name: 'Cauliflower (1 cup)', category: 'Vegetables', servingSize: 107, servingUnit: 'g', calories: 27, protein: 2.1, carbs: 5.3, fat: 0.3, fiber: 2.5, sugar: 2, sodium: 32, potassium: 320, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 0, vitaminC: 77, calcium: 2, iron: 3 },
  { id: 'v011', name: 'Asparagus (1 cup)', category: 'Vegetables', servingSize: 134, servingUnit: 'g', calories: 27, protein: 3, carbs: 5, fat: 0.2, fiber: 2.8, sugar: 2.5, sodium: 25, potassium: 271, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 20, vitaminC: 13, calcium: 4, iron: 16 },

  // === GRAINS & CEREALS ===
  { id: 'g001', name: 'Brown Rice (1 cup, cooked)', category: 'Grains & Cereals', servingSize: 195, servingUnit: 'g', calories: 216, protein: 5, carbs: 45, fat: 1.8, fiber: 3.5, sugar: 0.7, sodium: 10, potassium: 154, cholesterol: 0, saturatedFat: 0.4, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 2, iron: 5 },
  { id: 'g002', name: 'White Rice (1 cup, cooked)', category: 'Grains & Cereals', servingSize: 186, servingUnit: 'g', calories: 242, protein: 4.4, carbs: 53, fat: 0.4, fiber: 0.6, sugar: 0, sodium: 0, potassium: 55, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 2, iron: 15 },
  { id: 'g003', name: 'Oatmeal (1 cup, cooked)', category: 'Grains & Cereals', servingSize: 234, servingUnit: 'g', calories: 166, protein: 5.9, carbs: 28, fat: 3.6, fiber: 4, sugar: 0.6, sodium: 115, potassium: 164, cholesterol: 0, saturatedFat: 0.7, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 2, iron: 12 },
  { id: 'g004', name: 'Whole Wheat Bread (1 slice)', category: 'Grains & Cereals', servingSize: 28, servingUnit: 'g', calories: 69, protein: 3.6, carbs: 12, fat: 1.1, fiber: 1.9, sugar: 1.4, sodium: 132, potassium: 71, cholesterol: 0, saturatedFat: 0.2, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 2, iron: 5 },
  { id: 'g005', name: 'Pasta (1 cup, cooked)', category: 'Grains & Cereals', servingSize: 140, servingUnit: 'g', calories: 220, protein: 8.1, carbs: 43, fat: 1.3, fiber: 2.5, sugar: 0.6, sodium: 1, potassium: 62, cholesterol: 0, saturatedFat: 0.2, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 1, iron: 10 },
  { id: 'g006', name: 'Quinoa (1 cup, cooked)', category: 'Grains & Cereals', servingSize: 185, servingUnit: 'g', calories: 222, protein: 8.1, carbs: 39, fat: 3.6, fiber: 5.2, sugar: 1.6, sodium: 13, potassium: 318, cholesterol: 0, saturatedFat: 0.4, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 3, iron: 15 },
  { id: 'g007', name: 'Bagel (plain)', category: 'Grains & Cereals', servingSize: 98, servingUnit: 'g', calories: 270, protein: 10.5, carbs: 53, fat: 1.5, fiber: 2.1, sugar: 5, sodium: 443, potassium: 101, cholesterol: 0, saturatedFat: 0.2, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 8, iron: 19 },
  { id: 'g008', name: 'Granola (1/4 cup)', category: 'Grains & Cereals', servingSize: 29, servingUnit: 'g', calories: 132, protein: 3.1, carbs: 18, fat: 5.6, fiber: 1.5, sugar: 6.2, sodium: 7, potassium: 107, cholesterol: 0, saturatedFat: 0.7, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 2, iron: 6 },

  // === DAIRY ===
  { id: 'd001', name: 'Greek Yogurt (plain, 1 cup)', category: 'Dairy', servingSize: 245, servingUnit: 'g', calories: 130, protein: 22.5, carbs: 9, fat: 0.7, fiber: 0, sugar: 9, sodium: 68, potassium: 343, cholesterol: 14, saturatedFat: 0.2, transFat: 0, vitaminA: 1, vitaminC: 0, calcium: 25, iron: 1 },
  { id: 'd002', name: 'Whole Milk (1 cup)', category: 'Dairy', servingSize: 244, servingUnit: 'ml', calories: 149, protein: 8, carbs: 12, fat: 8, fiber: 0, sugar: 12, sodium: 105, potassium: 322, cholesterol: 24, saturatedFat: 4.6, transFat: 0.2, vitaminA: 5, vitaminC: 0, calcium: 28, iron: 0 },
  { id: 'd003', name: '2% Milk (1 cup)', category: 'Dairy', servingSize: 244, servingUnit: 'ml', calories: 122, protein: 8.1, carbs: 11.7, fat: 4.8, fiber: 0, sugar: 11.7, sodium: 115, potassium: 366, cholesterol: 20, saturatedFat: 3, transFat: 0.1, vitaminA: 9, vitaminC: 0, calcium: 29, iron: 0 },
  { id: 'd004', name: 'Cheddar Cheese (1 oz)', category: 'Dairy', servingSize: 28, servingUnit: 'g', calories: 114, protein: 7, carbs: 0.4, fat: 9.4, fiber: 0, sugar: 0.1, sodium: 176, potassium: 28, cholesterol: 30, saturatedFat: 6, transFat: 0.3, vitaminA: 6, vitaminC: 0, calcium: 20, iron: 1 },
  { id: 'd005', name: 'Cottage Cheese (1/2 cup)', category: 'Dairy', servingSize: 113, servingUnit: 'g', calories: 92, protein: 12.4, carbs: 5, fat: 2.6, fiber: 0, sugar: 3.4, sodium: 310, potassium: 104, cholesterol: 11, saturatedFat: 1.7, transFat: 0, vitaminA: 2, vitaminC: 0, calcium: 6, iron: 0 },
  { id: 'd006', name: 'Mozzarella (1 oz)', category: 'Dairy', servingSize: 28, servingUnit: 'g', calories: 85, protein: 6.3, carbs: 0.6, fat: 6.3, fiber: 0, sugar: 0.3, sodium: 176, potassium: 19, cholesterol: 22, saturatedFat: 3.9, transFat: 0.1, vitaminA: 4, vitaminC: 0, calcium: 14, iron: 1 },
  { id: 'd007', name: 'Butter (1 tbsp)', category: 'Dairy', servingSize: 14, servingUnit: 'g', calories: 102, protein: 0.1, carbs: 0, fat: 11.5, fiber: 0, sugar: 0, sodium: 91, potassium: 3, cholesterol: 31, saturatedFat: 7.3, transFat: 0.5, vitaminA: 7, vitaminC: 0, calcium: 0, iron: 0 },
  { id: 'd008', name: 'Cream Cheese (2 tbsp)', category: 'Dairy', servingSize: 29, servingUnit: 'g', calories: 101, protein: 1.7, carbs: 1.2, fat: 10, fiber: 0, sugar: 1.2, sodium: 91, potassium: 34, cholesterol: 32, saturatedFat: 6.3, transFat: 0.3, vitaminA: 10, vitaminC: 0, calcium: 2, iron: 1 },
  { id: 'd009', name: 'Whey Protein Powder (1 scoop)', category: 'Dairy', brand: 'Generic', servingSize: 30, servingUnit: 'g', calories: 120, protein: 24, carbs: 3, fat: 1.5, fiber: 0, sugar: 2, sodium: 130, potassium: 180, cholesterol: 35, saturatedFat: 1, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 15, iron: 0 },

  // === MEAT & POULTRY ===
  { id: 'm001', name: 'Chicken Breast (cooked, 4 oz)', category: 'Meat & Poultry', servingSize: 113, servingUnit: 'g', calories: 187, protein: 35, carbs: 0, fat: 4, fiber: 0, sugar: 0, sodium: 84, potassium: 358, cholesterol: 96, saturatedFat: 1.1, transFat: 0, vitaminA: 1, vitaminC: 0, calcium: 1, iron: 4 },
  { id: 'm002', name: 'Ground Beef 80/20 (3 oz, cooked)', category: 'Meat & Poultry', servingSize: 85, servingUnit: 'g', calories: 218, protein: 22, carbs: 0, fat: 13.5, fiber: 0, sugar: 0, sodium: 76, potassium: 270, cholesterol: 77, saturatedFat: 5.2, transFat: 0.7, vitaminA: 0, vitaminC: 0, calcium: 1, iron: 12 },
  { id: 'm003', name: 'Ground Beef 93/7 (3 oz, cooked)', category: 'Meat & Poultry', servingSize: 85, servingUnit: 'g', calories: 164, protein: 24, carbs: 0, fat: 7, fiber: 0, sugar: 0, sodium: 72, potassium: 295, cholesterol: 72, saturatedFat: 2.8, transFat: 0.3, vitaminA: 0, vitaminC: 0, calcium: 1, iron: 14 },
  { id: 'm004', name: 'Turkey Breast (sliced, 3 oz)', category: 'Meat & Poultry', servingSize: 85, servingUnit: 'g', calories: 90, protein: 18, carbs: 2, fat: 1, fiber: 0, sugar: 1, sodium: 670, potassium: 170, cholesterol: 40, saturatedFat: 0.3, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 0, iron: 6 },
  { id: 'm005', name: 'Steak (sirloin, 3 oz, cooked)', category: 'Meat & Poultry', servingSize: 85, servingUnit: 'g', calories: 160, protein: 26, carbs: 0, fat: 5.5, fiber: 0, sugar: 0, sodium: 54, potassium: 346, cholesterol: 76, saturatedFat: 2.2, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 1, iron: 17 },
  { id: 'm006', name: 'Pork Tenderloin (3 oz, cooked)', category: 'Meat & Poultry', servingSize: 85, servingUnit: 'g', calories: 122, protein: 22, carbs: 0, fat: 3.2, fiber: 0, sugar: 0, sodium: 48, potassium: 382, cholesterol: 74, saturatedFat: 1.1, transFat: 0, vitaminA: 0, vitaminC: 1, calcium: 2, iron: 7 },
  { id: 'm007', name: 'Bacon (2 slices, cooked)', category: 'Meat & Poultry', servingSize: 16, servingUnit: 'g', calories: 87, protein: 5.9, carbs: 0.2, fat: 6.8, fiber: 0, sugar: 0, sodium: 356, potassium: 76, cholesterol: 19, saturatedFat: 2.3, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 0, iron: 2 },
  { id: 'm008', name: 'Chicken Thigh (bone-in, 3 oz)', category: 'Meat & Poultry', servingSize: 85, servingUnit: 'g', calories: 179, protein: 18, carbs: 0, fat: 11, fiber: 0, sugar: 0, sodium: 82, potassium: 218, cholesterol: 81, saturatedFat: 3, transFat: 0.1, vitaminA: 2, vitaminC: 0, calcium: 1, iron: 6 },
  { id: 'm009', name: 'Egg (large)', category: 'Meat & Poultry', servingSize: 50, servingUnit: 'g', calories: 72, protein: 6.3, carbs: 0.4, fat: 5, fiber: 0, sugar: 0.2, sodium: 71, potassium: 69, cholesterol: 186, saturatedFat: 1.6, transFat: 0, vitaminA: 6, vitaminC: 0, calcium: 3, iron: 5 },
  { id: 'm010', name: 'Egg Whites (3 large)', category: 'Meat & Poultry', servingSize: 99, servingUnit: 'g', calories: 51, protein: 10.8, carbs: 0.7, fat: 0.2, fiber: 0, sugar: 0.7, sodium: 165, potassium: 163, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 1, iron: 0 },

  // === FISH & SEAFOOD ===
  { id: 's001', name: 'Salmon (Atlantic, 3 oz, cooked)', category: 'Fish & Seafood', servingSize: 85, servingUnit: 'g', calories: 177, protein: 17, carbs: 0, fat: 11, fiber: 0, sugar: 0, sodium: 52, potassium: 326, cholesterol: 54, saturatedFat: 2.1, transFat: 0, vitaminA: 2, vitaminC: 4, calcium: 1, iron: 2 },
  { id: 's002', name: 'Tuna (canned in water, 3 oz)', category: 'Fish & Seafood', servingSize: 85, servingUnit: 'g', calories: 109, protein: 25, carbs: 0, fat: 2.5, fiber: 0, sugar: 0, sodium: 287, potassium: 201, cholesterol: 26, saturatedFat: 0.7, transFat: 0, vitaminA: 1, vitaminC: 0, calcium: 1, iron: 6 },
  { id: 's003', name: 'Shrimp (3 oz, cooked)', category: 'Fish & Seafood', servingSize: 85, servingUnit: 'g', calories: 84, protein: 18, carbs: 0, fat: 0.9, fiber: 0, sugar: 0, sodium: 190, potassium: 155, cholesterol: 166, saturatedFat: 0.2, transFat: 0, vitaminA: 2, vitaminC: 3, calcium: 5, iron: 15 },
  { id: 's004', name: 'Tilapia (3 oz, cooked)', category: 'Fish & Seafood', servingSize: 85, servingUnit: 'g', calories: 111, protein: 23, carbs: 0, fat: 2.3, fiber: 0, sugar: 0, sodium: 48, potassium: 380, cholesterol: 57, saturatedFat: 0.8, transFat: 0, vitaminA: 1, vitaminC: 0, calcium: 1, iron: 4 },
  { id: 's005', name: 'Cod (3 oz, cooked)', category: 'Fish & Seafood', servingSize: 85, servingUnit: 'g', calories: 89, protein: 19, carbs: 0, fat: 0.7, fiber: 0, sugar: 0, sodium: 66, potassium: 439, cholesterol: 47, saturatedFat: 0.1, transFat: 0, vitaminA: 1, vitaminC: 1, calcium: 1, iron: 5 },

  // === LEGUMES ===
  { id: 'l001', name: 'Black Beans (1/2 cup, cooked)', category: 'Legumes', servingSize: 86, servingUnit: 'g', calories: 114, protein: 7.6, carbs: 20, fat: 0.5, fiber: 7.5, sugar: 0.3, sodium: 1, potassium: 305, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 2, iron: 10 },
  { id: 'l002', name: 'Chickpeas (1/2 cup, cooked)', category: 'Legumes', servingSize: 82, servingUnit: 'g', calories: 134, protein: 7.3, carbs: 22.5, fat: 2.1, fiber: 6.2, sugar: 3.9, sodium: 6, potassium: 239, cholesterol: 0, saturatedFat: 0.2, transFat: 0, vitaminA: 0, vitaminC: 2, calcium: 4, iron: 12 },
  { id: 'l003', name: 'Lentils (1/2 cup, cooked)', category: 'Legumes', servingSize: 99, servingUnit: 'g', calories: 115, protein: 9, carbs: 20, fat: 0.4, fiber: 7.8, sugar: 1.8, sodium: 2, potassium: 365, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 0, vitaminC: 2, calcium: 2, iron: 18 },
  { id: 'l004', name: 'Edamame (1/2 cup, shelled)', category: 'Legumes', servingSize: 78, servingUnit: 'g', calories: 94, protein: 9.2, carbs: 7.8, fat: 4.1, fiber: 3.8, sugar: 1.7, sodium: 9, potassium: 338, cholesterol: 0, saturatedFat: 0.5, transFat: 0, vitaminA: 4, vitaminC: 13, calcium: 5, iron: 11 },
  { id: 'l005', name: 'Kidney Beans (1/2 cup, cooked)', category: 'Legumes', servingSize: 88, servingUnit: 'g', calories: 112, protein: 7.7, carbs: 20, fat: 0.4, fiber: 5.7, sugar: 0.3, sodium: 1, potassium: 358, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 0, vitaminC: 2, calcium: 3, iron: 13 },
  { id: 'l006', name: 'Peanut Butter (2 tbsp)', category: 'Nuts & Seeds', servingSize: 32, servingUnit: 'g', calories: 190, protein: 8, carbs: 7, fat: 16, fiber: 2, sugar: 3, sodium: 140, potassium: 200, cholesterol: 0, saturatedFat: 3, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 2, iron: 4 },

  // === NUTS & SEEDS ===
  { id: 'n001', name: 'Almonds (1 oz)', category: 'Nuts & Seeds', servingSize: 28, servingUnit: 'g', calories: 164, protein: 6, carbs: 6.1, fat: 14, fiber: 3.5, sugar: 1.2, sodium: 1, potassium: 200, cholesterol: 0, saturatedFat: 1.1, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 8, iron: 6 },
  { id: 'n002', name: 'Walnuts (1 oz)', category: 'Nuts & Seeds', servingSize: 28, servingUnit: 'g', calories: 185, protein: 4.3, carbs: 3.9, fat: 18.5, fiber: 1.9, sugar: 0.7, sodium: 1, potassium: 125, cholesterol: 0, saturatedFat: 1.7, transFat: 0, vitaminA: 0, vitaminC: 1, calcium: 3, iron: 5 },
  { id: 'n003', name: 'Chia Seeds (1 tbsp)', category: 'Nuts & Seeds', servingSize: 12, servingUnit: 'g', calories: 58, protein: 2, carbs: 5, fat: 3.7, fiber: 4.1, sugar: 0, sodium: 2, potassium: 44, cholesterol: 0, saturatedFat: 0.4, transFat: 0, vitaminA: 0, vitaminC: 1, calcium: 8, iron: 8 },
  { id: 'n004', name: 'Flaxseeds (1 tbsp)', category: 'Nuts & Seeds', servingSize: 10, servingUnit: 'g', calories: 55, protein: 1.9, carbs: 3, fat: 4.3, fiber: 2.8, sugar: 0.2, sodium: 3, potassium: 84, cholesterol: 0, saturatedFat: 0.4, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 3, iron: 6 },
  { id: 'n005', name: 'Sunflower Seeds (1 oz)', category: 'Nuts & Seeds', servingSize: 28, servingUnit: 'g', calories: 165, protein: 5.5, carbs: 6.5, fat: 14, fiber: 2.4, sugar: 1, sodium: 1, potassium: 241, cholesterol: 0, saturatedFat: 1.5, transFat: 0, vitaminA: 0, vitaminC: 1, calcium: 2, iron: 6 },

  // === BEVERAGES ===
  { id: 'b001', name: 'Orange Juice (1 cup)', category: 'Beverages', servingSize: 248, servingUnit: 'ml', calories: 112, protein: 1.7, carbs: 26, fat: 0.5, fiber: 0.5, sugar: 21, sodium: 2, potassium: 496, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 4, vitaminC: 207, calcium: 2, iron: 2 },
  { id: 'b002', name: 'Coffee (black, 1 cup)', category: 'Beverages', servingSize: 240, servingUnit: 'ml', calories: 2, protein: 0.3, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 5, potassium: 116, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 0, iron: 0 },
  { id: 'b003', name: 'Almond Milk (unsweetened, 1 cup)', category: 'Beverages', servingSize: 240, servingUnit: 'ml', calories: 30, protein: 1, carbs: 1, fat: 2.5, fiber: 0.5, sugar: 0, sodium: 150, potassium: 35, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 10, vitaminC: 0, calcium: 45, iron: 4 },
  { id: 'b004', name: 'Green Tea (1 cup)', category: 'Beverages', servingSize: 240, servingUnit: 'ml', calories: 2, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 2, potassium: 20, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 0, iron: 0 },
  { id: 'b005', name: 'Protein Shake (ready-to-drink)', category: 'Beverages', brand: 'Generic', servingSize: 355, servingUnit: 'ml', calories: 160, protein: 30, carbs: 6, fat: 3, fiber: 2, sugar: 2, sodium: 280, potassium: 400, cholesterol: 70, saturatedFat: 1, transFat: 0, vitaminA: 15, vitaminC: 60, calcium: 40, iron: 15 },

  // === SNACKS ===
  { id: 'sn001', name: 'Rice Cakes (2 plain)', category: 'Snacks', servingSize: 18, servingUnit: 'g', calories: 70, protein: 1.4, carbs: 15, fat: 0.6, fiber: 0.4, sugar: 0, sodium: 60, potassium: 26, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 0, iron: 2 },
  { id: 'sn002', name: 'Popcorn (3 cups, air-popped)', category: 'Snacks', servingSize: 24, servingUnit: 'g', calories: 93, protein: 3, carbs: 18.6, fat: 1.1, fiber: 3.6, sugar: 0.2, sodium: 2, potassium: 78, cholesterol: 0, saturatedFat: 0.1, transFat: 0, vitaminA: 1, vitaminC: 0, calcium: 1, iron: 4 },
  { id: 'sn003', name: 'Protein Bar (generic)', category: 'Snacks', brand: 'Generic', servingSize: 60, servingUnit: 'g', calories: 200, protein: 20, carbs: 22, fat: 7, fiber: 3, sugar: 7, sodium: 180, potassium: 150, cholesterol: 10, saturatedFat: 3, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 15, iron: 10 },
  { id: 'sn004', name: 'Hummus (2 tbsp)', category: 'Snacks', servingSize: 30, servingUnit: 'g', calories: 50, protein: 2, carbs: 6, fat: 2.6, fiber: 1.5, sugar: 0.1, sodium: 95, potassium: 65, cholesterol: 0, saturatedFat: 0.4, transFat: 0, vitaminA: 0, vitaminC: 3, calcium: 2, iron: 4 },
  { id: 'sn005', name: 'Potato Chips (1 oz)', category: 'Snacks', servingSize: 28, servingUnit: 'g', calories: 152, protein: 2, carbs: 15, fat: 9.8, fiber: 1.4, sugar: 0.1, sodium: 149, potassium: 361, cholesterol: 0, saturatedFat: 3, transFat: 0, vitaminA: 0, vitaminC: 10, calcium: 1, iron: 2 },
  { id: 'sn006', name: 'Dark Chocolate (1 oz)', category: 'Snacks', servingSize: 28, servingUnit: 'g', calories: 155, protein: 1.4, carbs: 17, fat: 9, fiber: 2, sugar: 14, sodium: 6, potassium: 163, cholesterol: 1, saturatedFat: 5.5, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 2, iron: 11 },
  { id: 'sn007', name: 'Celery with Peanut Butter (2 stalks + 1 tbsp)', category: 'Snacks', servingSize: 50, servingUnit: 'g', calories: 115, protein: 4.5, carbs: 5, fat: 8, fiber: 1.5, sugar: 1.5, sodium: 100, potassium: 190, cholesterol: 0, saturatedFat: 1.5, transFat: 0, vitaminA: 6, vitaminC: 3, calcium: 3, iron: 3 },

  // === FAST FOOD ===
  { id: 'ff001', name: 'Burger (plain, regular)', category: 'Fast Food', servingSize: 110, servingUnit: 'g', calories: 300, protein: 15, carbs: 31, fat: 13, fiber: 1, sugar: 5, sodium: 520, potassium: 200, cholesterol: 40, saturatedFat: 5, transFat: 0.5, vitaminA: 2, vitaminC: 2, calcium: 10, iron: 15 },
  { id: 'ff002', name: 'French Fries (medium)', category: 'Fast Food', servingSize: 117, servingUnit: 'g', calories: 365, protein: 4, carbs: 48, fat: 17, fiber: 4, sugar: 0.5, sodium: 400, potassium: 677, cholesterol: 0, saturatedFat: 2.5, transFat: 0, vitaminA: 0, vitaminC: 9, calcium: 2, iron: 5 },
  { id: 'ff003', name: 'Caesar Salad (no croutons)', category: 'Fast Food', servingSize: 120, servingUnit: 'g', calories: 184, protein: 4, carbs: 8, fat: 16, fiber: 2, sugar: 2, sodium: 400, potassium: 200, cholesterol: 20, saturatedFat: 3, transFat: 0, vitaminA: 45, vitaminC: 25, calcium: 8, iron: 6 },
  { id: 'ff004', name: 'Subway 6" Turkey (no cheese)', category: 'Fast Food', brand: 'Subway', servingSize: 233, servingUnit: 'g', calories: 280, protein: 18, carbs: 46, fat: 4.5, fiber: 4, sugar: 7, sodium: 800, potassium: 320, cholesterol: 25, saturatedFat: 1, transFat: 0, vitaminA: 6, vitaminC: 10, calcium: 10, iron: 20 },
  { id: 'ff005', name: 'Chipotle Bowl (chicken, rice, beans)', category: 'Fast Food', brand: 'Chipotle', servingSize: 450, servingUnit: 'g', calories: 615, protein: 40, carbs: 76, fat: 16, fiber: 11, sugar: 3, sodium: 1425, potassium: 870, cholesterol: 100, saturatedFat: 5, transFat: 0, vitaminA: 15, vitaminC: 30, calcium: 10, iron: 25 },

  // === CONDIMENTS ===
  { id: 'c001', name: 'Olive Oil (1 tbsp)', category: 'Oils & Fats', servingSize: 14, servingUnit: 'g', calories: 119, protein: 0, carbs: 0, fat: 13.5, fiber: 0, sugar: 0, sodium: 0, potassium: 0, cholesterol: 0, saturatedFat: 1.9, transFat: 0, vitaminA: 0, vitaminC: 0, calcium: 0, iron: 1 },
  { id: 'c002', name: 'Ketchup (1 tbsp)', category: 'Condiments', servingSize: 17, servingUnit: 'g', calories: 19, protein: 0.3, carbs: 4.7, fat: 0, fiber: 0.1, sugar: 3.7, sodium: 154, potassium: 57, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 3, vitaminC: 2, calcium: 0, iron: 1 },
  { id: 'c003', name: 'Hot Sauce (1 tsp)', category: 'Condiments', servingSize: 5, servingUnit: 'g', calories: 1, protein: 0.1, carbs: 0.2, fat: 0, fiber: 0, sugar: 0.1, sodium: 190, potassium: 14, cholesterol: 0, saturatedFat: 0, transFat: 0, vitaminA: 2, vitaminC: 2, calcium: 0, iron: 0 },

  // === SWEETS & DESSERTS ===
  { id: 'sw001', name: 'Banana Protein Pancake (2)', category: 'Sweets & Desserts', servingSize: 120, servingUnit: 'g', calories: 220, protein: 18, carbs: 26, fat: 5, fiber: 2, sugar: 8, sodium: 200, potassium: 350, cholesterol: 100, saturatedFat: 1.5, transFat: 0, vitaminA: 4, vitaminC: 5, calcium: 8, iron: 8 },
  { id: 'sw002', name: 'Ice Cream (vanilla, 1/2 cup)', category: 'Sweets & Desserts', servingSize: 66, servingUnit: 'g', calories: 137, protein: 2.3, carbs: 16, fat: 7.3, fiber: 0.5, sugar: 14, sodium: 53, potassium: 131, cholesterol: 29, saturatedFat: 4.5, transFat: 0.2, vitaminA: 6, vitaminC: 0, calcium: 8, iron: 0 },
]

export const EXERCISE_DATABASE: Exercise[] = [
  { id: 'e001', name: 'Running (6 mph)', category: 'Cardio' as ExerciseCategory, metValue: 9.8 },
  { id: 'e002', name: 'Walking (3.5 mph)', category: 'Cardio' as ExerciseCategory, metValue: 4.3 },
  { id: 'e003', name: 'Cycling (moderate)', category: 'Cardio' as ExerciseCategory, metValue: 8 },
  { id: 'e004', name: 'Swimming (moderate)', category: 'Cardio' as ExerciseCategory, metValue: 7 },
  { id: 'e005', name: 'Elliptical (moderate)', category: 'Cardio' as ExerciseCategory, metValue: 5.5 },
  { id: 'e006', name: 'Jump Rope', category: 'Cardio' as ExerciseCategory, metValue: 12.3 },
  { id: 'e007', name: 'Rowing Machine (moderate)', category: 'Cardio' as ExerciseCategory, metValue: 7 },
  { id: 'e008', name: 'Weight Training (general)', category: 'Strength' as ExerciseCategory, metValue: 3.5 },
  { id: 'e009', name: 'Weight Training (vigorous)', category: 'Strength' as ExerciseCategory, metValue: 6 },
  { id: 'e010', name: 'Yoga', category: 'Flexibility' as ExerciseCategory, metValue: 2.5 },
  { id: 'e011', name: 'Pilates', category: 'Flexibility' as ExerciseCategory, metValue: 3 },
  { id: 'e012', name: 'Basketball', category: 'Sports' as ExerciseCategory, metValue: 8 },
  { id: 'e013', name: 'Soccer', category: 'Sports' as ExerciseCategory, metValue: 10 },
  { id: 'e014', name: 'Tennis', category: 'Sports' as ExerciseCategory, metValue: 7.3 },
  { id: 'e015', name: 'HIIT', category: 'Cardio' as ExerciseCategory, metValue: 12 },
  { id: 'e016', name: 'Hiking', category: 'Cardio' as ExerciseCategory, metValue: 6 },
  { id: 'e017', name: 'Dancing', category: 'Cardio' as ExerciseCategory, metValue: 5 },
  { id: 'e018', name: 'Rock Climbing', category: 'Strength' as ExerciseCategory, metValue: 8.8 },
  { id: 'e019', name: 'Stretching', category: 'Flexibility' as ExerciseCategory, metValue: 2.3 },
  { id: 'e020', name: 'CrossFit', category: 'Strength' as ExerciseCategory, metValue: 10 },
]

export function searchFoods(query: string, limit = 20): Food[] {
  if (!query.trim()) return FOOD_DATABASE.slice(0, limit)
  const q = query.toLowerCase()
  return FOOD_DATABASE.filter(
    f =>
      f.name.toLowerCase().includes(q) ||
      f.brand?.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q)
  ).slice(0, limit)
}

export function getFoodById(id: string): Food | undefined {
  return FOOD_DATABASE.find(f => f.id === id)
}
