/* 食安警戒 Web 版核心逻辑
 * 依据 PRD v1.0 模块3(营养分析)、模块4(药食禁忌预警)
 * 本文件将后端 nutrition.service / warning.service 的算法移植到浏览器端，
 * 使 Web 演示版无需后端即可完整跑通「识别→营养→预警→评估」闭环。
 * 食物视觉识别由前端调用同源接口 /api/recognize（服务端使用通义千问 qwen-vl-plus 多模态模型），
 * 见 server.js。识别结果（食物名+重量）在此完成营养计算与药食禁忌分析。
 */

/* ============ 食物营养成分数据库（每100g） ============ */
const FOOD_DB = {
  '米饭': { cal: 116, protein: 2.6, fat: 0.3, carb: 25.9, fiber: 0.3, sugar: 0.1, sodium: 2, calcium: 7, vc: 0, iron: 0.3, purine: 18, chol: 0 },
  '面条': { cal: 110, protein: 3.5, fat: 0.5, carb: 23, fiber: 0.8, sugar: 0.5, sodium: 5, calcium: 10, vc: 0, iron: 0.5, purine: 20, chol: 0 },
  '馒头': { cal: 221, protein: 7, fat: 1.1, carb: 47, fiber: 1.5, sugar: 1, sodium: 170, calcium: 38, vc: 0, iron: 1.8, purine: 25, chol: 0 },
  '全麦面包': { cal: 246, protein: 9, fat: 3.4, carb: 44, fiber: 6.8, sugar: 4, sodium: 380, calcium: 60, vc: 0, iron: 2.5, purine: 18, chol: 0 },
  '燕麦': { cal: 377, protein: 13.5, fat: 6.7, carb: 66.3, fiber: 10.6, sugar: 1, sodium: 2, calcium: 54, vc: 0, iron: 4.7, purine: 25, chol: 0 },
  '红薯': { cal: 86, protein: 1.6, fat: 0.1, carb: 20.1, fiber: 3, sugar: 4.2, sodium: 28, calcium: 18, vc: 26, iron: 0.6, purine: 8, chol: 0 },
  '玉米': { cal: 112, protein: 4, fat: 1.2, carb: 22.8, fiber: 2.9, sugar: 3.2, sodium: 1, calcium: 4, vc: 8, iron: 0.6, purine: 15, chol: 0 },
  '鸡蛋': { cal: 143, protein: 13.3, fat: 8.8, carb: 2.8, fiber: 0, sugar: 2.8, sodium: 131, calcium: 56, vc: 0, iron: 2, purine: 0, chol: 585 },
  '牛奶': { cal: 54, protein: 3, fat: 3.2, carb: 3.4, fiber: 0, sugar: 3.4, sodium: 37, calcium: 104, vc: 1, iron: 0.1, purine: 0, chol: 15 },
  '酸奶': { cal: 72, protein: 3.5, fat: 2.7, carb: 9.3, fiber: 0, sugar: 9.3, sodium: 40, calcium: 118, vc: 0, iron: 0.1, purine: 0, chol: 12 },
  '豆腐': { cal: 81, protein: 8.1, fat: 3.7, carb: 4.2, fiber: 0.4, sugar: 0.5, sodium: 7, calcium: 164, vc: 0, iron: 1.9, purine: 68, chol: 0 },
  '豆浆': { cal: 31, protein: 2.9, fat: 1.6, carb: 1.2, fiber: 0.2, sugar: 0.5, sodium: 3, calcium: 10, vc: 0, iron: 0.5, purine: 28, chol: 0 },
  '苹果': { cal: 53, protein: 0.2, fat: 0.1, carb: 13.5, fiber: 1.7, sugar: 10, sodium: 1, calcium: 4, vc: 3, iron: 0.1, purine: 0, chol: 0 },
  '香蕉': { cal: 93, protein: 1.4, fat: 0.2, carb: 22, fiber: 2.6, sugar: 12, sodium: 1, calcium: 7, vc: 8, iron: 0.2, purine: 0, chol: 0 },
  '橙子': { cal: 47, protein: 0.9, fat: 0.1, carb: 11.8, fiber: 2.4, sugar: 9.4, sodium: 1, calcium: 35, vc: 53, iron: 0.2, purine: 0, chol: 0 },
  '葡萄': { cal: 69, protein: 0.7, fat: 0.2, carb: 18.1, fiber: 0.9, sugar: 15.5, sodium: 2, calcium: 10, vc: 10, iron: 0.4, purine: 0, chol: 0 },
  '西瓜': { cal: 30, protein: 0.6, fat: 0.1, carb: 7.6, fiber: 0.4, sugar: 6.2, sodium: 1, calcium: 7, vc: 6, iron: 0.2, purine: 0, chol: 0 },
  '草莓': { cal: 32, protein: 0.7, fat: 0.3, carb: 7.7, fiber: 2, sugar: 4.9, sodium: 1, calcium: 16, vc: 47, iron: 0.4, purine: 0, chol: 0 },
  '蓝莓': { cal: 57, protein: 0.7, fat: 0.3, carb: 14.5, fiber: 2.4, sugar: 10, sodium: 1, calcium: 6, vc: 9, iron: 0.3, purine: 0, chol: 0 },
  '猪肉': { cal: 395, protein: 14.6, fat: 37, carb: 0, fiber: 0, sugar: 0, sodium: 59, calcium: 6, vc: 0, iron: 1.6, purine: 126, chol: 80 },
  '鸡肉': { cal: 167, protein: 19.3, fat: 9.4, carb: 0, fiber: 0, sugar: 0, sodium: 63, calcium: 9, vc: 0, iron: 1.4, purine: 140, chol: 106 },
  '牛肉': { cal: 125, protein: 17.8, fat: 2, carb: 0.9, fiber: 0, sugar: 0, sodium: 59, calcium: 6, vc: 0, iron: 2.2, purine: 133, chol: 58 },
  '羊肉': { cal: 203, protein: 19, fat: 14.1, carb: 0, fiber: 0, sugar: 0, sodium: 80, calcium: 11, vc: 0, iron: 2.3, purine: 150, chol: 92 },
  '鱼肉': { cal: 113, protein: 16.6, fat: 5.2, carb: 0, fiber: 0, sugar: 0, sodium: 72, calcium: 38, vc: 0, iron: 0.8, purine: 130, chol: 86 },
  '虾': { cal: 87, protein: 18.6, fat: 0.8, carb: 0.2, fiber: 0, sugar: 0, sodium: 166, calcium: 62, vc: 0, iron: 1.5, purine: 137, chol: 193 },
  '海鲜': { cal: 90, protein: 18, fat: 1, carb: 0, fiber: 0, sugar: 0, sodium: 150, calcium: 50, vc: 0, iron: 1.2, purine: 150, chol: 100 },
  '鸭肉': { cal: 240, protein: 15.5, fat: 19.7, carb: 0.1, fiber: 0, sugar: 0, sodium: 65, calcium: 8, vc: 0, iron: 2.2, purine: 120, chol: 89 },
  '菠菜': { cal: 24, protein: 2.6, fat: 0.3, carb: 4.5, fiber: 2.6, sugar: 2.3, sodium: 79, calcium: 66, vc: 82, iron: 2.9, purine: 25, chol: 0 },
  '西兰花': { cal: 36, protein: 4.1, fat: 0.6, carb: 7.3, fiber: 3.1, sugar: 2.2, sodium: 18, calcium: 67, vc: 89, iron: 1, purine: 30, chol: 0 },
  '西红柿': { cal: 19, protein: 0.9, fat: 0.2, carb: 4.2, fiber: 1.2, sugar: 3.1, sodium: 5, calcium: 10, vc: 19, iron: 0.4, purine: 10, chol: 0 },
  '胡萝卜': { cal: 37, protein: 1, fat: 0.2, carb: 8.8, fiber: 3.2, sugar: 4.7, sodium: 71, calcium: 32, vc: 13, iron: 0.5, purine: 10, chol: 0 },
  '土豆': { cal: 76, protein: 2, fat: 0.1, carb: 17.2, fiber: 2.2, sugar: 0.8, sodium: 6, calcium: 8, vc: 16, iron: 0.5, purine: 12, chol: 0 },
  '黄瓜': { cal: 15, protein: 0.7, fat: 0.1, carb: 3.6, fiber: 0.9, sugar: 1.7, sodium: 2, calcium: 14, vc: 4, iron: 0.2, purine: 8, chol: 0 },
  '白菜': { cal: 13, protein: 1.5, fat: 0.1, carb: 2.2, fiber: 1.2, sugar: 1.2, sodium: 57, calcium: 50, vc: 31, iron: 0.5, purine: 12, chol: 0 },
  '芹菜': { cal: 14, protein: 0.7, fat: 0.1, carb: 3.4, fiber: 1.6, sugar: 1.8, sodium: 80, calcium: 34, vc: 8, iron: 0.4, purine: 10, chol: 0 },
  '西芹': { cal: 14, protein: 0.7, fat: 0.1, carb: 3.4, fiber: 1.6, sugar: 1.8, sodium: 80, calcium: 34, vc: 8, iron: 0.4, purine: 10, chol: 0 },
  '生菜': { cal: 13, protein: 1.3, fat: 0.2, carb: 2, fiber: 1.1, sugar: 0.8, sodium: 28, calcium: 36, vc: 9, iron: 0.5, purine: 8, chol: 0 },
  '茄子': { cal: 21, protein: 1.1, fat: 0.2, carb: 4.4, fiber: 2.5, sugar: 2.4, sodium: 3, calcium: 12, vc: 5, iron: 0.3, purine: 12, chol: 0 },
  '青椒': { cal: 22, protein: 1, fat: 0.2, carb: 5.2, fiber: 1.8, sugar: 3.2, sodium: 3, calcium: 11, vc: 72, iron: 0.4, purine: 8, chol: 0 },
  '洋葱': { cal: 39, protein: 1.1, fat: 0.1, carb: 9.3, fiber: 1.7, sugar: 4.2, sodium: 4, calcium: 24, vc: 7, iron: 0.2, purine: 10, chol: 0 },
  '西柚': { cal: 42, protein: 0.8, fat: 0.1, carb: 10.7, fiber: 0, sugar: 8, sodium: 1, calcium: 8, vc: 34, iron: 0.1, purine: 0, chol: 0 },
  '柚子': { cal: 42, protein: 0.8, fat: 0.1, carb: 10.7, fiber: 0, sugar: 8, sodium: 1, calcium: 8, vc: 34, iron: 0.1, purine: 0, chol: 0 },
  '啤酒': { cal: 43, protein: 0.4, fat: 0, carb: 3.7, fiber: 0, sugar: 0, sodium: 12, calcium: 6, vc: 0, iron: 0.1, purine: 12, chol: 0 },
  '可乐': { cal: 42, protein: 0, fat: 0, carb: 10.6, fiber: 0, sugar: 10.6, sodium: 4, calcium: 3, vc: 0, iron: 0, purine: 0, chol: 0 },
  '橙汁': { cal: 45, protein: 0.7, fat: 0.2, carb: 10.4, fiber: 0.2, sugar: 8.5, sodium: 2, calcium: 11, vc: 33, iron: 0.2, purine: 0, chol: 0 },
  '咖啡': { cal: 2, protein: 0.1, fat: 0, carb: 0.3, fiber: 0, sugar: 0, sodium: 2, calcium: 3, vc: 0, iron: 0.1, purine: 0, chol: 0 },
  '动物肝脏': { cal: 130, protein: 19, fat: 3.5, carb: 4, fiber: 0, sugar: 0, sodium: 70, calcium: 10, vc: 20, iron: 22, purine: 180, chol: 300 },
  '动物内脏': { cal: 130, protein: 18, fat: 4, carb: 3, fiber: 0, sugar: 0, sodium: 75, calcium: 12, vc: 15, iron: 18, purine: 175, chol: 280 },
  '梨': { cal: 57, protein: 0.4, fat: 0.2, carb: 15.3, fiber: 3.1, sugar: 9.8, sodium: 1, calcium: 5, vc: 4, iron: 0.2, purine: 0, chol: 0 },
  '桃子': { cal: 39, protein: 0.9, fat: 0.3, carb: 9.5, fiber: 1.5, sugar: 8.4, sodium: 0, calcium: 6, vc: 6, iron: 0.3, purine: 0, chol: 0 },
  '芒果': { cal: 60, protein: 0.8, fat: 0.4, carb: 15, fiber: 1.6, sugar: 13.7, sodium: 1, calcium: 11, vc: 36, iron: 0.2, purine: 0, chol: 0 },
  '猕猴桃': { cal: 61, protein: 1.1, fat: 0.5, carb: 14.7, fiber: 3, sugar: 9, sodium: 3, calcium: 34, vc: 92, iron: 0.3, purine: 0, chol: 0 },
  '菠萝': { cal: 50, protein: 0.5, fat: 0.1, carb: 13.1, fiber: 1.4, sugar: 9.9, sodium: 1, calcium: 13, vc: 47, iron: 0.3, purine: 0, chol: 0 },
  '蘑菇': { cal: 22, protein: 3.1, fat: 0.3, carb: 3.3, fiber: 1, sugar: 2, sodium: 5, calcium: 3, vc: 0, iron: 0.5, purine: 20, chol: 0 },
  '南瓜': { cal: 26, protein: 1, fat: 0.1, carb: 6.5, fiber: 0.5, sugar: 2.8, sodium: 1, calcium: 21, vc: 9, iron: 0.8, purine: 8, chol: 0 },
  '牛排': { cal: 271, protein: 25, fat: 19, carb: 0, fiber: 0, sugar: 0, sodium: 60, calcium: 20, vc: 0, iron: 2.3, purine: 130, chol: 80 },
  '披萨': { cal: 266, protein: 11, fat: 10, carb: 33, fiber: 2.3, sugar: 3.6, sodium: 598, calcium: 188, vc: 1, iron: 2.5, purine: 30, chol: 22 },
  '汉堡': { cal: 250, protein: 13, fat: 12, carb: 24, fiber: 1.5, sugar: 5, sodium: 497, calcium: 100, vc: 2, iron: 2, purine: 35, chol: 35 },
  '薯条': { cal: 312, protein: 3.4, fat: 15, carb: 41, fiber: 3.8, sugar: 0.3, sodium: 210, calcium: 18, vc: 9, iron: 1, purine: 15, chol: 0 },
  '三明治': { cal: 250, protein: 11, fat: 9, carb: 30, fiber: 2, sugar: 4, sodium: 600, calcium: 120, vc: 2, iron: 2, purine: 30, chol: 25 },
  '饺子': { cal: 200, protein: 8, fat: 6, carb: 28, fiber: 1.5, sugar: 1, sodium: 400, calcium: 20, vc: 1, iron: 1.5, purine: 25, chol: 20 },
  '沙拉': { cal: 33, protein: 1.5, fat: 0.5, carb: 6, fiber: 2, sugar: 3, sodium: 25, calcium: 30, vc: 20, iron: 0.6, purine: 10, chol: 0 }
};

/* ============ 禁忌规则库（移植自 contraindication_rules 种子数据） ============ */
/* 药物-食物禁忌 */
const DRUG_FOOD_RULES = {
  '华法林': { foods: ['菠菜', '西芹', '香菜', '西兰花', '动物肝脏'], risk: 'red',
    mechanism: '维生素K会抵消华法林的抗凝作用', advice: '避免大量食用富含维生素K的绿叶蔬菜' },
  '硝苯地平': { foods: ['西柚', '柚子'], risk: 'red',
    mechanism: '西柚中的呋喃香豆素抑制CYP3A4酶', advice: '服药期间避免西柚/柚子' },
  '阿托伐他汀': { foods: ['西柚', '柚子'], risk: 'red',
    mechanism: '西柚增加他汀血药浓度，升高肌病风险', advice: '避免西柚' },
  '二甲双胍': { foods: ['酒精', '高糖食物'], risk: 'yellow',
    mechanism: '酒精增加乳酸酸中毒风险', advice: '限制饮酒、控糖' },
  '降压药': { foods: ['西柚', '柚子', '高盐食物', '腌制食品', '咸菜'], risk: 'red',
    mechanism: '呋喃香豆素抑制CYP3A4，高盐抵消药效', advice: '避免西柚及高盐饮食' },
  '降脂药': { foods: ['西柚', '柚子', '高脂肪食物', '油炸食品'], risk: 'red',
    mechanism: '西柚增加血药浓度，高脂影响药效', advice: '避免西柚与高脂食物' },
  '降糖药': { foods: ['高糖食物', '酒精'], risk: 'yellow',
    mechanism: '影响血糖控制', advice: '控糖、谨慎饮酒' },
  '抗生素': { foods: ['酒精', '乳制品'], risk: 'red',
    mechanism: '双硫仑反应/影响吸收', advice: '禁酒，与乳制品间隔2小时' },
  '布洛芬': { foods: ['酒精'], risk: 'red',
    mechanism: '叠加胃肠道出血风险', advice: '避免饮酒' },
  '阿司匹林': { foods: ['酒精'], risk: 'red',
    mechanism: '叠加胃肠道出血风险', advice: '避免饮酒' },
  '左甲状腺素': { foods: ['高纤维食物', '豆制品'], risk: 'yellow',
    mechanism: '影响药物吸收', advice: '空腹服药，与豆制品间隔' },
  '钙片': { foods: ['菠菜'], risk: 'yellow',
    mechanism: '草酸与钙结合影响吸收', advice: '错开食用' },
  '铁剂': { foods: ['茶', '咖啡'], risk: 'yellow',
    mechanism: '鞣酸/多酚影响铁吸收', advice: '餐后2小时再服' }
};

/* 慢病-食物禁忌 */
const DISEASE_FOOD_RULES = {
  '高血压': { foods: ['高盐食物', '腌制食品', '咸菜'], risk: 'yellow', advice: '控钠，每日<6g' },
  '糖尿病': { foods: ['高糖食物', '精制碳水'], risk: 'yellow', advice: '选低GI食物' },
  '痛风': { foods: ['海鲜', '动物内脏', '啤酒', '浓肉汤'], risk: 'red',
    mechanism: '高嘌呤诱发痛风发作', advice: '严格限制高嘌呤食物' },
  '高血脂': { foods: ['高脂肪食物', '油炸食品', '动物内脏'], risk: 'yellow', advice: '减少饱和脂肪' },
  '肾病': { foods: ['高钾食物', '高蛋白食物'], risk: 'red',
    mechanism: '加重肾脏负担', advice: '遵医嘱控蛋白' }
};

/* 药物-药物相互作用 */
const DRUG_DRUG_RULES = [
  { drugs: ['阿托伐他汀', '克拉霉素'], risk: 'red',
    mechanism: '克拉霉素增加他汀血药浓度', advice: '立即咨询医生' },
  { drugs: ['华法林', '阿司匹林'], risk: 'red',
    mechanism: '叠加出血风险', advice: '咨询医生调整剂量' }
];

/* 食物别名匹配（检测名→规则名） */
function matchFood(detectedName) {
  for (const key in FOOD_DB) {
    if (detectedName.includes(key) || key.includes(detectedName)) return key;
  }
  // 类别匹配（高盐/高糖/高脂等）
  if (detectedName.includes('咸') || detectedName.includes('腌') || detectedName.includes('盐')) return '高盐食物';
  if (detectedName.includes('糖') || detectedName.includes('甜')) return '高糖食物';
  if (detectedName.includes('油炸') || detectedName.includes('油')) return '高脂肪食物';
  if (detectedName.includes('海鲜') || detectedName.includes('鱼') || detectedName.includes('蟹') || detectedName.includes('虾')) return '海鲜';
  if (detectedName.includes('内脏') || detectedName.includes('肝')) return '动物内脏';
  return null;
}

/* 默认营养（食物库没有、模型也没给营养时的近似值，每100g） */
const DEFAULT_DB = { cal: 100, protein: 5, fat: 2, carb: 15, fiber: 1, sugar: 2, sodium: 10, calcium: 20, vc: 5, iron: 0.5, purine: 20, chol: 0 };
/* 计算营养成分：优先用识别模型给出的每100g营养，缺项回退食物库/默认值 */
function calculateNutrients(foods) {
  const total = { cal: 0, protein: 0, fat: 0, carb: 0, fiber: 0, sugar: 0, sodium: 0, calcium: 0, vc: 0, iron: 0, purine: 0, chol: 0 };
  const details = [];
  for (const f of foods) {
    const key = matchFood(f.name);
    const base = (key && FOOD_DB[key]) ? FOOD_DB[key] : DEFAULT_DB;
    let db;
    if (f.nutrition) {
      db = {};
      for (const k in base) db[k] = (f.nutrition[k] != null) ? f.nutrition[k] : base[k];
    } else {
      db = base;
    }
    const r = f.weight / 100;
    const item = { name: f.name, weight: f.weight, cal: Math.round(db.cal * r), nutrition: f.nutrition || null };
    for (const k in total) {
      total[k] += (db[k] || 0) * r;
    }
    details.push(item);
  }
  for (const k in total) total[k] = Math.round(total[k] * 10) / 10;
  return { total, details };
}

/* 禁忌分析 */
function analyzeContraindications(foods, profile) {
  const warnings = [];
  const safeFoods = [];
  let hasRed = false;
  const diseases = profile.chronic_diseases || [];
  const meds = profile.medications || [];

  for (const food of foods) {
    const matched = matchFood(food.name);
    let foodWarning = null;

    // 药物-食物
    for (const med of meds) {
      const rule = DRUG_FOOD_RULES[med];
      if (rule && rule.foods.some(f => matched && (matched.includes(f) || f.includes(matched) || food.name.includes(f) || f.includes(food.name)))) {
        foodWarning = { food_name: food.name, risk: rule.risk, type: '药物-食物禁忌', trigger: med, mechanism: rule.mechanism, advice: rule.advice };
        if (rule.risk === 'red') hasRed = true;
        break;
      }
    }
    // 慢病-食物
    if (!foodWarning) {
      for (const dis of diseases) {
        const rule = DISEASE_FOOD_RULES[dis];
        if (rule && rule.foods.some(f => matched && (matched.includes(f) || f.includes(matched) || food.name.includes(f) || f.includes(food.name)))) {
          foodWarning = { food_name: food.name, risk: rule.risk, type: '慢病-食物禁忌', trigger: dis, mechanism: rule.mechanism || '', advice: rule.advice };
          if (rule.risk === 'red') hasRed = true;
          break;
        }
      }
    }
    if (foodWarning) warnings.push(foodWarning); else safeFoods.push(food.name);
  }

  // 药物-药物相互作用
  if (meds.length > 1) {
    for (const combo of DRUG_DRUG_RULES) {
      if (combo.drugs.every(d => meds.includes(d))) {
        warnings.push({ food_name: '-', risk: combo.risk, type: '药物-药物相互作用', trigger: meds.join(' + '), mechanism: combo.mechanism, advice: combo.advice });
        if (combo.risk === 'red') hasRed = true;
      }
    }
  }

  let overall = 'blue';
  if (warnings.some(w => w.risk === 'red')) overall = 'red';
  else if (warnings.some(w => w.risk === 'yellow')) overall = 'yellow';

  let suggestion;
  if (overall === 'red') suggestion = '⚠️ 发现严重禁忌，建议放弃食用或咨询医生！';
  else if (overall === 'yellow') suggestion = '⚠️ 发现潜在风险，建议谨慎食用或咨询药师。';
  else suggestion = '✅ 未发现禁忌，可以放心食用。';

  return { overall, hasRed, warnings, safeFoods, suggestion };
}

/* 营养均衡评估 */
function evaluateBalance(total) {
  let score = 0; const max = 100; const items = [];
  const totalCal = total.cal || 1;
  const pR = (total.protein * 4 / totalCal) * 100;
  if (pR >= 10 && pR <= 35) { score += 20; items.push({ n: '蛋白质供能比', s: '合理', v: pR.toFixed(1) + '%', c: '#4CAF50' }); }
  else { items.push({ n: '蛋白质供能比', s: pR > 35 ? '偏高' : '偏低', v: pR.toFixed(1) + '%', c: '#FF9800' }); }
  const fR = (total.fat * 9 / totalCal) * 100;
  if (fR >= 20 && fR <= 30) { score += 20; items.push({ n: '脂肪供能比', s: '合理', v: fR.toFixed(1) + '%', c: '#4CAF50' }); }
  else { items.push({ n: '脂肪供能比', s: fR > 30 ? '偏高' : '偏低', v: fR.toFixed(1) + '%', c: '#FF9800' }); }
  const cR = (total.carb * 4 / totalCal) * 100;
  if (cR >= 50 && cR <= 65) { score += 20; items.push({ n: '碳水供能比', s: '合理', v: cR.toFixed(1) + '%', c: '#4CAF50' }); }
  else { items.push({ n: '碳水供能比', s: cR > 65 ? '偏高' : '偏低', v: cR.toFixed(1) + '%', c: '#FF9800' }); }
  if (total.fiber >= 8) { score += 15; items.push({ n: '膳食纤维', s: '充足', v: total.fiber + 'g', c: '#4CAF50' }); }
  else if (total.fiber >= 4) { score += 8; items.push({ n: '膳食纤维', s: '偏少', v: total.fiber + 'g', c: '#FF9800' }); }
  else { items.push({ n: '膳食纤维', s: '缺乏', v: total.fiber + 'g', c: '#F44336' }); }
  if (total.sodium <= 400) { score += 15; items.push({ n: '钠摄入', s: '正常', v: total.sodium + 'mg', c: '#4CAF50' }); }
  else if (total.sodium <= 800) { score += 8; items.push({ n: '钠摄入', s: '偏高', v: total.sodium + 'mg', c: '#FF9800' }); }
  else { items.push({ n: '钠摄入', s: '过高', v: total.sodium + 'mg', c: '#F44336' }); }
  if (total.chol <= 300) { score += 10; items.push({ n: '胆固醇', s: '正常', v: total.chol + 'mg', c: '#4CAF50' }); }
  else { items.push({ n: '胆固醇', s: '偏高', v: total.chol + 'mg', c: '#FF9800' }); }
  const percent = Math.round(score / max * 100);
  const grade = percent >= 85 ? '优秀' : percent >= 70 ? '良好' : percent >= 55 ? '一般' : '需改善';
  const gradeColor = percent >= 85 ? '#4CAF50' : percent >= 70 ? '#8BC34A' : percent >= 55 ? '#FF9800' : '#F44336';
  return { percent, grade, gradeColor, items };
}

/* 营养建议 */
function generateAdvice(total, diseases) {
  const a = [];
  if (total.sodium > 600) a.push('⚠️ 钠含量偏高，建议少放盐/酱油。');
  if (diseases.includes('痛风') && total.purine > 100) a.push('⚠️ 嘌呤偏高，可能诱发痛风。');
  if (diseases.includes('糖尿病') && total.sugar > 10) a.push('⚠️ 糖分偏高，注意血糖。');
  if (total.fiber < 5) a.push('💡 膳食纤维偏少，建议加蔬菜/全谷物。');
  if (a.length === 0) a.push('✅ 本餐搭配合理，请放心食用。');
  return a.join('\n');
}

/* ============ 导出供调试 ============ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FOOD_DB, DRUG_FOOD_RULES, DISEASE_FOOD_RULES, DRUG_DRUG_RULES, matchFood, calculateNutrients, analyzeContraindications, evaluateBalance, generateAdvice };
}
