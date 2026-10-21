const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8081;
const PUBLIC_DIR = __dirname;

/* ============ 视觉大模型配置（OpenAI 兼容，可切换厂商） ============ */
// 通用配置优先，其次兼容旧名 DASHSCOPE_*；换厂商只需改 .env 里三行（KEY/BASE_URL/MODEL）
let VISION_API_KEY = process.env.VISION_API_KEY || '';
let VISION_BASE_URL = process.env.VISION_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
let VISION_MODEL = process.env.VISION_MODEL || 'qwen2.5-vl-72b-instruct';
let VISION_FALLBACK_MODEL = process.env.VISION_FALLBACK_MODEL || 'glm-4v-flash';
if (!VISION_API_KEY) {
  // 依次尝试：同级 .env（云主机约定）、backend/.env（本地开发）
  const candidates = [path.join(__dirname, '.env'), path.join(__dirname, '..', 'backend', '.env')];
  for (const envPath of candidates) {
    try {
      const txt = fs.readFileSync(envPath, 'utf8');
      const pick = (k) => { const mm = txt.match(new RegExp(k + '\\s*=\\s*(.+)')); return mm ? mm[1].trim().replace(/^["']|["']$/g, '') : ''; };
      VISION_API_KEY = pick('VISION_API_KEY') || pick('DASHSCOPE_API_KEY') || VISION_API_KEY;
      if (pick('VISION_BASE_URL')) VISION_BASE_URL = pick('VISION_BASE_URL'); else if (pick('DASHSCOPE_BASE_URL')) VISION_BASE_URL = pick('DASHSCOPE_BASE_URL');
      if (pick('VISION_MODEL')) VISION_MODEL = pick('VISION_MODEL'); else if (pick('DASHSCOPE_VL_MODEL')) VISION_MODEL = pick('DASHSCOPE_VL_MODEL');
      if (pick('VISION_FALLBACK_MODEL')) VISION_FALLBACK_MODEL = pick('VISION_FALLBACK_MODEL');
      if (VISION_API_KEY) break;
    } catch (e) { /* 忽略，试下一个 */ }
  }
}
const VISION_ENDPOINT = VISION_BASE_URL.replace(/\/+$/, '') + '/chat/completions';
const VISION_ENABLED = !!(VISION_API_KEY && VISION_API_KEY.length > 10 && !VISION_API_KEY.includes('你的') && !VISION_API_KEY.includes('在这里') && !VISION_API_KEY.includes('your-'));
if (VISION_ENABLED) console.log('✅ 视觉大模型已启用：' + VISION_MODEL + '  @  ' + VISION_BASE_URL);
else console.log('⚠️  未配置有效视觉大模型 Key，识别仅用本地 CLIP 兜底');

/* ============ 食物识别（调用云端多模态大模型，主模型+备模型自动切换） ============ */
const RECOGNIZE_PROMPT = `你是食物识别专家。仔细观察图片，准确识别其中的食物。
规则：
1. 只识别图中确实可见的食物，不确定就不列；没有食物就返回空数组。
2. 名称务必准确：注意区分相似食物（如 梨 vs 苹果、豆浆 vs 牛奶、不同坚果/豆类）。
3. 有包装的优先读包装上的中文品名（例如 "蒜香豌豆"、"纯牛奶"），按包装名返回。
4. 重量按可见份量估算（克）。
5. nutrition 填该食物【每100g】的营养：calories热量(kcal，包装标千焦须换算，1kcal≈4.18kJ)、protein蛋白质(g)、fat脂肪(g)、carbs碳水(g)、sodium钠(mg)、sugar糖(g)、fiber膳食纤维(g)；确实未知的项填 null。
只返回如下JSON，不要任何额外文字：
{"foods":[{"name":"食物中文名","weight":克重,"nutrition":{"calories":0,"protein":0,"fat":0,"carbs":0,"sodium":0,"sugar":0,"fiber":0}}],"mealType":"早餐|午餐|晚餐|加餐"}`;

async function recognizeFood(imageDataUrl) {
  // 未配置有效密钥：诚实返回空结果，由前端引导手动选择（不编造食物）
  if (!VISION_ENABLED) {
    return { success: true, mock: false, enabled: false, data: { foods: [], message: '未配置有效的视觉识别密钥' } };
  }

  // 主模型 + 备模型（主模型额度不足/不可用时自动切换，避免演示中断）
  const models = [VISION_MODEL, VISION_FALLBACK_MODEL].filter((v, i, a) => v && a.indexOf(v) === i);
  let lastErr = null;
  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const res = await fetch(VISION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + VISION_API_KEY },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: [{ type: 'text', text: RECOGNIZE_PROMPT }, { type: 'image_url', image_url: { url: imageDataUrl } }] }],
          temperature: 0.1,
          max_tokens: 1024
        }),
        signal: controller.signal
      });
      if (!res.ok) throw new Error('视觉模型 ' + model + ' HTTP ' + res.status + (res.status === 429 ? '（限流）' : ''));
      const json = await res.json();
      const content = (json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('模型未返回标准JSON');
      return { success: true, model, data: JSON.parse(m[0]) };
    } catch (e) {
      lastErr = e;
      console.warn('[视觉模型 ' + model + ' 失败，尝试下一个]', e.message);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error('视觉识别失败');
}

/* ============ 本地 GPU 识别服务（Python ml-service，优先调用） ============ */
async function callLocalService(image) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const res = await fetch('http://127.0.0.1:5005/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
      signal: controller.signal
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (j && j.success && Array.isArray(j.foods) && j.foods.length) return j.foods;
    return null;
  } catch (e) {
    console.warn('[本地识别服务不可用，将尝试云端/浏览器端]', e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ============ 静态文件服务 ============ */
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

/* ============ 账号 / 关联 / 云端家庭饮食（自建轻量后端，data.json 存储） ============ */
function todayDate() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const DATA_FILE = path.join(__dirname, 'data.json');
let DB = { users: [], sessions: {}, links: [], meals: {} };
(function loadDB() { try { const raw = fs.readFileSync(DATA_FILE, 'utf8'); if (raw) DB = Object.assign(DB, JSON.parse(raw)); } catch (e) {} })();
function saveDB() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(DB)); } catch (e) {} }
function seedDB() {
  if (!DB.users.length) {
    DB.users = [
      { id: 'u1', phone: '13800138000', pwd: 'demo123', name: '我' },
      { id: 'u2', phone: '13800138001', pwd: 'demo123', name: '妈妈' }
    ];
    DB.meals['13800138001'] = [{ date: todayDate(), time: '12:00', foods: [{ name: '米饭', weight: 150, cal: 174 }, { name: '咸菜', weight: 50, cal: 30 }], totalCal: 204, warnings: 1 }];
    saveDB();
  }
}
seedDB();
function userByPhone(p) { return DB.users.find(u => u.phone === p); }
function phoneByToken(t) { return t ? DB.sessions[t] : null; }
function readJson(req) { return new Promise((resolve) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { resolve({}); } }); }); }
function sendJson(res, obj, code) { res.writeHead(code || 200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0]; // 去掉查询串（如 ?serveo-skip-browser-warning=true）
  // ---- 识别接口（同源，密钥不暴露给前端） ----
  if (req.method === 'POST' && pathname === '/api/recognize') {
    let body = '';
    let tooBig = false;
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 12 * 1024 * 1024) { tooBig = true; req.destroy(); }
    });
    req.on('end', async () => {
      if (tooBig) { res.writeHead(413, { 'Content-Type': 'application/json' }); return res.end('{"success":false,"error":"图片过大"}'); }
      try {
        const payload = JSON.parse(body || '{}');
        if (!payload.image) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end('{"success":false,"error":"缺少 image 字段"}'); }

        const numOr = v => (v == null || v === '' || isNaN(v)) ? null : Number(v);
        const mapNut = n => {
          if (!n || typeof n !== 'object') return null;
          const o = {
            cal: numOr(n.calories != null ? n.calories : n.cal),
            protein: numOr(n.protein), fat: numOr(n.fat),
            carb: numOr(n.carbs != null ? n.carbs : n.carb),
            sodium: numOr(n.sodium), sugar: numOr(n.sugar),
            fiber: numOr(n.fiber != null ? n.fiber : n.dietary_fiber)
          };
          return Object.values(o).some(v => v != null) ? o : null;
        };
        const normalize = arr => (Array.isArray(arr) ? arr : [])
          .map(f => ({ name: String(f.name || '').trim(), weight: Number(f.weight) || 150, nutrition: mapNut(f.nutrition) }))
          .filter(f => f.name);

        // 1) 云端多模态大模型（视觉版）：识别最准，能读包装文字，优先调用
        if (VISION_ENABLED) {
          try {
            const result = await recognizeFood(payload.image);
            const foods = normalize(result.data && result.data.foods);
            if (foods.length) {
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              return res.end(JSON.stringify({ success: true, mock: false, engine: 'cloud', foods, mealType: (result.data && result.data.mealType) || null }));
            }
          } catch (e) {
            console.warn('[云端识别失败，回退本地 CLIP]', e.message);
          }
        }

        // 2) 本地 CLIP 零样本（离线兜底，无需联网）
        const localFoods = await callLocalService(payload.image);
        if (localFoods) {
          const foods = normalize(localFoods);
          if (foods.length) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify({ success: true, mock: false, engine: 'local', foods }));
          }
        }

        // 3) 都不可用 -> 前端浏览器端兜底识别
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: true, mock: false, enabled: false, foods: [], message: '本地与云端识别均不可用，已切换浏览器端识别' }));
      } catch (e) {
        console.error('❌ 识别失败：', e.message);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, mock: false, enabled: false, foods: [], message: '识别服务不可用，请手动选择食物' }));
      }
    });
    return;
  }

  // ---- 当前公网地址（供页面展示/复制） ----
  if (pathname === '/api/public-url') {
    let url = '';
    try { url = fs.readFileSync(path.join(__dirname, '..', 'current-url.txt'), 'utf8').trim(); } catch (e) {}
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ url }));
    return;
  }

  // ---- 云端账号 / 关联 / 家庭饮食 ----
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    return readJson(req).then(({ phone, pwd }) => {
      phone = String(phone || '').trim(); pwd = String(pwd || '');
      if (!/^1\d{10}$/.test(phone)) return sendJson(res, { ok: false, error: '手机号格式不正确' }, 400);
      if (pwd.length < 6) return sendJson(res, { ok: false, error: '密码至少6位' }, 400);
      if (userByPhone(phone)) return sendJson(res, { ok: false, error: '该手机号已注册' }, 409);
      DB.users.push({ id: 'u' + Date.now(), phone, pwd, name: '用户' + phone.slice(-4) });
      const token = 'tk' + Date.now() + Math.floor(Math.random() * 1e6);
      DB.sessions[token] = phone; saveDB();
      return sendJson(res, { ok: true, token, phone, name: userByPhone(phone).name });
    });
  }
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    return readJson(req).then(({ phone, pwd }) => {
      phone = String(phone || '').trim(); const u = userByPhone(phone);
      if (!u || u.pwd !== String(pwd || '')) return sendJson(res, { ok: false, error: '手机号未注册或密码错误' }, 401);
      const token = 'tk' + Date.now() + Math.floor(Math.random() * 1e6);
      DB.sessions[token] = phone; saveDB();
      return sendJson(res, { ok: true, token, phone, name: u.name });
    });
  }
  if (pathname === '/api/auth/codelogin' && req.method === 'POST') {
    return readJson(req).then(({ phone }) => {
      phone = String(phone || '').trim();
      if (!/^1\d{10}$/.test(phone)) return sendJson(res, { ok: false, error: '手机号格式不正确' }, 400);
      let u = userByPhone(phone);
      if (!u) { u = { id: 'u' + Date.now(), phone, pwd: '', name: '用户' + phone.slice(-4) }; DB.users.push(u); }
      const token = 'tk' + Date.now() + Math.floor(Math.random() * 1e6);
      DB.sessions[token] = phone; saveDB();
      return sendJson(res, { ok: true, token, phone, name: u.name });
    });
  }
  if (pathname === '/api/auth/exists' && req.method === 'POST') {
    return readJson(req).then(({ phone }) => sendJson(res, { ok: true, exists: !!userByPhone(String(phone || '').trim()) }));
  }
  if (pathname === '/api/meal' && req.method === 'POST') {
    return readJson(req).then((body) => {
      const phone = phoneByToken(req.headers['x-token']);
      if (!phone) return sendJson(res, { ok: false, error: '未登录' }, 401);
      (DB.meals[phone] = DB.meals[phone] || []).unshift({ date: todayDate(), time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }), foods: body.foods || [], totalCal: body.totalCal || 0, warnings: body.warnings || 0 });
      if (DB.meals[phone].length > 200) DB.meals[phone].length = 200;
      saveDB();
      return sendJson(res, { ok: true });
    });
  }
  if (pathname === '/api/link' && req.method === 'POST') {
    return readJson(req).then(({ toPhone, toPwd }) => {
      const me = phoneByToken(req.headers['x-token']);
      if (!me) return sendJson(res, { ok: false, error: '未登录' }, 401);
      const target = userByPhone(String(toPhone || '').trim());
      if (!target || target.pwd !== String(toPwd || '')) return sendJson(res, { ok: false, error: '家人账号或密码错误' }, 401);
      if (target.phone === me) return sendJson(res, { ok: false, error: '不能关联自己' }, 400);
      if (!DB.links.some(l => l.from === me && l.to === target.phone)) { DB.links.push({ from: me, to: target.phone }); saveDB(); }
      return sendJson(res, { ok: true });
    });
  }
  if (pathname === '/api/family' && req.method === 'GET') {
    const me = phoneByToken(req.headers['x-token']);
    if (!me) return sendJson(res, { ok: false, error: '未登录' }, 401);
    const today = todayDate();
    const family = DB.links.filter(l => l.from === me).map(l => {
      const u = userByPhone(l.to) || {};
      const meals = (DB.meals[l.to] || []).filter(m => m.date === today);
      return { phone: l.to, name: u.name || l.to, meals, totalCal: meals.reduce((s, m) => s + (m.totalCal || 0), 0), warnings: meals.reduce((s, m) => s + (m.warnings || 0), 0) };
    });
    return sendJson(res, { ok: true, family });
  }

  // ---- 静态文件 ----
  console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.url}`);
  if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(pathname); } catch (e) { rel = pathname; }
  rel = path.normalize(rel).replace(/\\/g, '/');
  if (rel === '/' || rel === '/index.html') rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('Forbidden'); }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 - 文件未找到</h1><p>路径：' + filePath + '</p>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('服务器错误: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Pragma': 'no-cache', 'Expires': '0' });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('  食安警戒 Web 版已启动！');
  console.log('='.repeat(60));
  console.log('  浏览器访问：');
  console.log('  http://localhost:' + PORT);
  console.log('  识别接口：POST /api/recognize');
  console.log('='.repeat(60));
});
