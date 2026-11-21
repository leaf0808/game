/* ==========================================================================
   map.js — 关卡地图：数据驱动渲染节点、章节详情抽屉、进度统计
   想增删章节，只改下面的 LEVELS 数组即可（x/y 为舞台内百分比坐标）
   ========================================================================== */

/** 章节状态：done 已通关 | now 当前 | lock 未解锁 */
const LEVELS = [
  {
    no: 1, title: '月下启程', en: 'THE MOONLIT DESCENT',
    thumb: 'assets/thumb-moon.jpg', x: 8.13, y: 77.78,
    state: 'done', stars: 3, time: '12 分钟',
    desc: '河岸的风把故事吹进树洞。一只揣着怀表的白兔匆匆跑过，爱丽丝想也没想就追了下去。',
    goals: ['追随白兔坠入深深的树洞', '在黑暗的回廊里找到三把金钥匙', '推开通往仙境的那扇小门']
  },
  {
    no: 2, title: '仙境初醒', en: 'AWAKENING IN WONDERLAND',
    thumb: 'assets/thumb-alice.jpg', x: 18.75, y: 55.56,
    state: 'done', stars: 2, time: '15 分钟',
    desc: '长长的大厅里门环相扣。喝下小瓶的水，身子比老鼠还小；咬一口蛋糕，头又顶到了天花板。',
    goals: ['学会「变大」与「变小」的时机', '从眼泪汇成的池子里游上岸', '和动物们跑完一场没有终点的竞赛']
  },
  {
    no: 3, title: '蘑菇小径', en: 'THE MUSHROOM PATH',
    thumb: 'assets/thumb-mushroom.jpg', x: 29.38, y: 73.33,
    state: 'done', stars: 3, time: '18 分钟',
    desc: '蓝色毛毛虫盘在蘑菇上，问了一个谁也答不利索的问题——你是谁？',
    goals: ['回答毛毛虫的三次提问', '摘下能伸缩身高的左右两半蘑菇', '找到通往公爵夫人家的小路']
  },
  {
    no: 4, title: '纸牌卫兵', en: 'THE CARD SOLDIERS',
    thumb: 'assets/thumb-cards.jpg', x: 40.63, y: 46.67,
    state: 'now', stars: 0, time: '20 分钟',
    desc: '花园里，扑克牌士兵正忙着把白玫瑰涂成红色。国王的脚步声越来越近，谁也不敢出声。',
    goals: ['在白玫瑰涂完之前混进花园', '记住王后「不许生气」的三条规则', '偷回被士兵夺走的草莓挞']
  },
  {
    no: 5, title: '疯帽茶会', en: 'A MAD TEA-PARTY',
    thumb: 'assets/thumb-teapot.jpg', x: 51.25, y: 67.78,
    state: 'lock', stars: 0, time: '24 分钟',
    desc: '时间在这里被钉死在下午六点。睡鼠讲着三个姐妹的故事，空茶杯转了又转，没人肯让座。',
    goals: ['猜出疯帽匠的那道谜语', '让睡鼠在糖罐里安静下来', '替「时间」原谅这场无休止的下午茶']
  },
  {
    no: 6, title: '柴郡猫森林', en: 'THE CHESHIRE WOOD',
    thumb: 'assets/thumb-cat.jpg', x: 61.25, y: 42.22,
    state: 'lock', stars: 0, time: '22 分钟',
    desc: '树上的猫先留下笑容，然后才慢慢显出身形。它说：这儿的人都有点疯，包括你。',
    goals: ['问清该往哪一条路走', '顺着悬空的笑容找到猫', '从消失的猫身上取一片月光']
  },
  {
    no: 7, title: '红心城堡', en: "THE QUEEN'S CROQUET COURT",
    thumb: 'assets/thumb-house.jpg', x: 71.25, y: 63.33,
    state: 'lock', stars: 0, time: '30 分钟',
    desc: '法庭开庭了。王后拍着桌子喊：先判决，再审判！爱丽丝终于不再害怕，梦也就到了尽头。',
    goals: ['用火烈鸟和刺猬打完一场槌球', '为园丁的白玫瑰出庭作证', '在牌雨落下前说出自己的名字']
  }
];

const TOTAL_STARS = LEVELS.length * 3;
const STATE_TEXT = { done: '已通关', now: '进行中', lock: '未解锁' };

/* --------------------------------------------------------------------------
   DOM
   -------------------------------------------------------------------------- */
const nodesBox = document.getElementById('nodes');
const panel = document.getElementById('panel');
const toastEl = document.getElementById('toast');

let currentId = null;
let toastTimer = null;

function pad(n) { return String(n).padStart(2, '0'); }

function starLine(n) {
  if (!n) return '<span class="off">✦✦✦</span>';
  return '✦'.repeat(n) + '<span class="off">' + '✦'.repeat(3 - n) + '</span>';
}

function renderNodes() {
  const frag = document.createDocumentFragment();

  LEVELS.forEach((lv, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'node is-' + lv.state;
    btn.style.setProperty('--x', lv.x + '%');
    btn.style.setProperty('--y', lv.y + '%');
    btn.style.setProperty('--d', (0.9 + i * 0.16) + 's');
    btn.dataset.id = lv.no;
    btn.setAttribute('aria-label', `第 ${lv.no} 章 ${lv.title}，${STATE_TEXT[lv.state]}`);

    btn.innerHTML = `
      <span class="node__stars">${lv.state === 'lock' ? '' : starLine(lv.stars)}</span>
      <span class="node__ring"></span>
      <span class="node__pic">
        <img src="${lv.thumb}" alt="${lv.title}" loading="lazy">
        ${lv.state === 'lock' ? '<span class="node__lock">🔒</span>' : ''}
        <span class="node__no">${pad(lv.no)}</span>
      </span>
      <span class="node__label">${lv.title}<i>${STATE_TEXT[lv.state]}</i></span>
    `;

    btn.addEventListener('click', () => selectLevel(lv.no));
    frag.appendChild(btn);
  });

  nodesBox.appendChild(frag);
}

/* --------------------------------------------------------------------------
   顶部统计
   -------------------------------------------------------------------------- */
function renderStats() {
  const done = LEVELS.filter(l => l.state === 'done').length;
  const stars = LEVELS.reduce((s, l) => s + l.stars, 0);
  const percent = Math.round((done / LEVELS.length) * 100);

  document.getElementById('statDone').textContent = `${done}/${LEVELS.length}`;
  document.getElementById('statStars').textContent = `${stars}/${TOTAL_STARS}`;
  document.getElementById('statPercent').textContent = `进度 ${percent}%`;

  requestAnimationFrame(() => {
    document.getElementById('barFill').style.width = percent + '%';
  });
}

/* --------------------------------------------------------------------------
   详情抽屉
   -------------------------------------------------------------------------- */
function selectLevel(id) {
  const lv = LEVELS.find(l => l.no === id);
  if (!lv) return;

  currentId = id;

  document.querySelectorAll('.node').forEach(n => {
    n.classList.toggle('is-active', Number(n.dataset.id) === id);
  });

  document.getElementById('panelImg').src = lv.thumb;
  document.getElementById('panelImg').alt = lv.title;
  document.getElementById('panelNo').textContent = 'CHAPTER ' + pad(lv.no);
  document.getElementById('panelTitle').textContent = lv.title;
  document.getElementById('panelEn').textContent = lv.en;
  document.getElementById('panelDesc').textContent = lv.desc;
  document.getElementById('panelGoals').innerHTML =
    lv.goals.map(g => `<li>${g}</li>`).join('');
  document.getElementById('panelTime').textContent = lv.time;
  document.getElementById('panelStars').textContent =
    lv.state === 'lock' ? '—' : `${lv.stars} / 3`;

  const cta = document.getElementById('panelEnter');
  cta.classList.toggle('is-locked', lv.state === 'lock');
  cta.textContent = lv.state === 'lock' ? '尚未解锁' : '进入这一章';

  panel.classList.add('is-open');

  if (lv.state === 'lock') {
    const prev = LEVELS.find(l => l.state === 'now');
    showToast(`第 ${lv.no} 段梦境还在沉睡 · 先完成「${prev ? prev.title : '前面的旅程'}」吧`);
  }
}

function closePanel() {
  panel.classList.remove('is-open');
  currentId = null;
  document.querySelectorAll('.node.is-active').forEach(n => n.classList.remove('is-active'));
}

/* --------------------------------------------------------------------------
   提示
   -------------------------------------------------------------------------- */
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2600);
}

/* --------------------------------------------------------------------------
   事件
   -------------------------------------------------------------------------- */
document.getElementById('panelClose').addEventListener('click', closePanel);

document.getElementById('panelEnter').addEventListener('click', () => {
  const lv = LEVELS.find(l => l.no === currentId);
  if (!lv || lv.state === 'lock') return;
  showToast(`「${lv.title}」正在绘制中，敬请期待 ✦`);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closePanel(); return; }
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;

  e.preventDefault();
  const dir = e.key === 'ArrowRight' ? 1 : -1;
  const max = LEVELS.length;
  const next = currentId ? ((currentId - 1 + dir + max) % max) + 1 : (dir > 0 ? 1 : max);
  selectLevel(next);
});

/* --------------------------------------------------------------------------
   启动
   -------------------------------------------------------------------------- */
renderNodes();
renderStats();

/* 默认聚焦到当前章节 */
const firstNow = LEVELS.find(l => l.state === 'now');
if (firstNow) setTimeout(() => selectLevel(firstNow.no), 2400);
