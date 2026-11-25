import * as THREE from 'three';
import { wait } from './lib.js';
import { LAYOUT } from './world.js';

// 诗歌填空：正确项取自原诗，错误项是爱丽丝记错的版本。
export const POEM = [
  {
    line: '“You are old, Father William,” the young man said,',
    options: ['“And your hair has become very white;”', '“And your hat has become very tight;”', '“And your shoes have become very light;”'],
  },
  {
    line: 'And yet you incessantly stand on your head—',
    options: ['“Do you think, at your age, it is right?”', '“Do you think you should stand on your head?”', '“Do you think, at your age, it is polite?”'],
  },
  {
    line: '“In my youth,” said his father, “I took to the law,',
    options: ['“And argued each case with my wife;”', '“And argued each case with my cat;”', '“And argued each case with a knife;”'],
  },
  {
    line: 'And the muscular strength which it gave to my jaw,',
    options: ['“Has lasted the rest of my life.”', '“Has lasted the rest of my wife\'s life.”', '“Has lasted the rest of the day.”'],
  },
];

export const REPLAY_TITLES = {
  intro: '入场对话',
  poem: '背诗',
  metamorph: '化蝶',
  trial: '试炼开场',
  ending: '收尾旁白',
};

const until = async (cond) => {
  while (!cond()) await wait(80);
};

export async function runStory(g) {
  const ui = g.ui, w = g.world, pl = g.player, F = g.flags;
  const say = (speaker, zh, en = '') => ui.say({ speaker, zh, en });
  const rec = (id, speaker, zh, en = '') => {
    (g.replays[id] ??= []).push({ speaker, zh, en });
    return say(speaker, zh, en);
  };
  const smoke = (n = 3) => {
    g.audio.play('smoke');
    for (let i = 0; i < n; i += 1) setTimeout(() => g.effects.smoke(w.caterpillarHead, { size: 0.6 + i * 0.2 }), i * 240);
  };

  // FN02：点击蘑菇晃动并冒出提示文字
  let clicks = 0;
  g.clickMushroom = (m) => {
    g.effects.wobble(m.obj, 0.8);
    g.effects.burst(new THREE.Vector3(m.x, 0.98 * m.scale, m.z), 0xe8c8ff, { count: 10, speed: 0.9, size: 0.1, gravity: 0.8 });
    clicks += 1;
    if (clicks === 1) ui.hint('蘑菇晃了晃，落下几粒孢子。走近一点，就能咬上一口。');
    else ui.callout(['蘑菇晃了晃。', '孢子簌簌地落下来。', '伞盖弹了一下。'][clicks % 3], new THREE.Vector3(m.x, 1.05 * m.scale, m.z), 1500);
  };

  // ================= 幕一：森林入口与“你是谁？” =================
  await until(() => pl.pos.z < 18.4);
  g.lockInput();
  pl.heading = Math.PI;
  g.cam.setOverride(new THREE.Vector3(4.2, 2.9, 17.0), new THREE.Vector3(0.1, 2.1, 13.5));
  await pl.walkTo(0.7, 15.6, 0.75);
  pl.heading = Math.atan2(w.caterpillarHome.x - pl.pos.x, w.caterpillarHome.z - pl.pos.z);
  await wait(900);
  smoke();
  await rec('intro', '毛毛虫', '你是谁？', 'Who are you?');

  const answers = [
    '先生，眼下我几乎不知道。今早起床时我还知道自己是谁，可我想从那以后我已经变了好几回了。',
    '我是爱丽丝，可我不确定我还是不是昨天那个爱丽丝。',
    '我不知道……因为我已经不是我了，您瞧。',
  ];
  const reactions = [
    ['你自己说清楚。', 'Explain yourself.'],
    ['哪个爱丽丝？说清楚。', 'Which Alice?'],
    ['我已听过最没意思的说法。', "That's not a very interesting answer."],
  ];
  const choice = await ui.choose(answers);
  ui.closeDialogue();
  await rec('intro', '爱丽丝', answers[choice]);
  smoke(2);
  await rec('intro', '毛毛虫', ...reactions[choice]);
  await rec('intro', '爱丽丝', '恐怕我没法解释，先生……因为我已经不是我了，您瞧。', "I can't explain myself, I'm afraid, Sir… because I'm not myself, you see.");
  await rec('intro', '毛毛虫', '我不明白。', "I don't understand.");
  await rec('intro', '爱丽丝', '我自己也说不清楚。今天早上起床时我还知道自己是谁，可从那以后，我已经变了好几回了。');
  ui.closeDialogue();
  F.caterpillar_met = true;
  g.saveAt(0);

  // ================= 幕二：诗歌背诵解谜 =================
  g.lockInput();
  await wait(700);
  await rec('poem', '毛毛虫', '告诉我，你是不是真的变了？', 'Are you really changed?');
  await rec('poem', '爱丽丝', '是的，先生。我好像什么都记不住了，连韵文也背不出来。');
  await say('毛毛虫', '背一首《威廉老爹，你老了》。', "Recite 'You are old, Father William'.");
  ui.closeDialogue();
  POEM.forEach((q) => (g.replays.poem ??= []).push({ speaker: '诗句', zh: `${q.line} ${q.options[0]}`, en: '' }));
  await wait(250);
  await ui.poem(POEM, g.audio);
  await say('毛毛虫', '嗯……不算全错。', "Hmm. Not quite right, but not all wrong.");
  ui.closeDialogue();
  F.verse_passed = true;

  // ================= 幕三：核心机制教学 =================
  g.lockInput();
  smoke(2);
  await rec('metamorph', '毛毛虫', '你想变成多大？', 'What size do you want to be?');
  await rec('metamorph', '爱丽丝', '我想变大一点，先生。三英寸实在太矮了。');
  await rec('metamorph', '毛毛虫', '三英寸是很合适的身高！', 'Three inches is a very nice height.');
  await rec('metamorph', '爱丽丝', '我不是嫌它不好，只是……我还不习惯。');
  await rec('metamorph', '毛毛虫', '控制好你的脾气。', 'Keep your temper.');
  await rec('metamorph', '爱丽丝', '您这样挑刺，谁也控制不住。');

  // 毛毛虫爬到伞盖前沿，抛出全关最关键的一句话。
  const cat = w.caterpillar;
  const rim = new THREE.Vector3(0.55, 0, 14.72);
  rim.y = w.topAt(w.giant, rim.x, rim.z) + 0.02;
  const home = cat.position.clone();
  const faceRim = Math.atan2(-(rim.z - home.z), rim.x - home.x);
  for (let k = 0; k <= 1; k += 0.014) {
    cat.position.x = home.x + (rim.x - home.x) * k + Math.sin(k * 40) * 0.004;
    cat.position.z = home.z + (rim.z - home.z) * k;
    cat.position.y = Math.max(home.y + (rim.y - home.y) * k, w.topAt(w.giant, cat.position.x, cat.position.z) + 0.02);
    cat.rotation.y = -Math.PI / 2 + (faceRim + Math.PI / 2) * Math.min(1, k * 4);
    await wait(16);
  }
  cat.rotation.y = faceRim + Math.PI;
  w.caterpillarHead.set(cat.position.x, cat.position.y + 0.62, cat.position.z + 0.3);
  g.cam.setOverride(new THREE.Vector3(3.7, 2.5, 16.9), new THREE.Vector3(0.2, 1.7, 14.9));
  pl.heading = Math.atan2(rim.x - pl.pos.x, rim.z - pl.pos.z);
  await wait(500);
  smoke(2);
  await rec('metamorph', '毛毛虫', '蘑菇的一边会让你长高，另一边会让你变矮。', 'One side will make you grow taller, and the other side will make you grow shorter.');
  await rec('metamorph', '毛毛虫', '我要蜕变了。化蛹，再变成蝴蝶。', 'I have to metamorphose.');
  ui.closeDialogue();

  // 就地蜷起结茧 → 蓝纹蝴蝶飞走
  for (let k = 0; k <= 1; k += 0.02) {
    cat.scale.multiplyScalar(1 - 0.016);
    cat.rotation.y += 0.05;
    await wait(16);
  }
  cat.visible = false;
  g.audio.play('ding');
  w.cocoon.position.copy(cat.position).y += 0.16;
  w.cocoon.visible = true;
  await wait(1300);
  const bf = w.butterfly;
  bf.visible = true;
  bf.position.copy(w.cocoon.position);
  const bfFrom = bf.position.clone();
  for (let k = 0; k <= 1; k += 0.006) {
    bf.position.set(bfFrom.x + Math.sin(k * 9) * 0.7 + k * 2.4, bfFrom.y + k * 6.5, bfFrom.z + Math.cos(k * 7) * 0.5 + k * 1.5);
    bf.userData.wl.rotation.y = Math.sin(k * 90) * 0.9;
    bf.userData.wr.rotation.y = -Math.sin(k * 90) * 0.9;
    bf.rotation.y = Math.sin(k * 4) * 0.4;
    await wait(16);
  }
  bf.visible = false;
  w.cocoon.visible = false;
  g.audio.play('wing');
  await rec('metamorph', '旁白', '它说到做到的那天，你也就不算完全迷失了。');
  ui.closeDialogue();
  g.cam.clearOverride();
  g.unlockInput();
  F.caterpillar_gone = true;
  ui.hint('靠近蘑菇，分别咬一口两边试试看。记住：左边一种味道，右边一种味道。');

  // 强制教学：各咬一次并调回 Normal（MU07）
  const bitten = { left: false, right: false };
  g.tutorialBite = (side, prev, next) => {
    const first = !bitten[side];
    bitten[side] = true;
    if (next === 0 || next === 4) ui.hint('哎呀，过头了！再吃另一边一口。');
    else if (first && side === 'left') ui.hint('左边让你长高——当心树梢上的鸽子！');
    else if (first && side === 'right') ui.hint('右边让你变矮——试试看能去哪？');
    if (bitten.left && bitten.right && pl.sizeIndex === 2 && !F.mushroom_control) {
      F.mushroom_control = true;
      F.mushroom_side_known = true;
      g.audio.play('ding');
      ui.toast('你现在能自己控制大小了', 3200);
      g.saveAt(1);
      ui.hint('左边长高，右边变矮。前方的藤蔓闸门已经打开，去试炼道试试身手。');
    }
  };

  // ================= 幕四：试炼开场 =================
  await until(() => pl.pos.z < LAYOUT.hedgeZ - 0.6);
  g.lockInput();
  g.cam.setOverride(new THREE.Vector3(0.5, 11.5, 5.5), new THREE.Vector3(0, 0.4, -5));
  (g.replays.trial ??= []).push({ speaker: '旁白', zh: '森林小径被三道障碍挡住了。身高，就是打开它们的钥匙。', en: '' });
  ui.toast('试炼道：矮门洞 → 高处藤蔓门 → 树梢上的鸽子', 3600);
  await wait(2300);
  g.cam.setOverride(new THREE.Vector3(0.5, 12, -7), new THREE.Vector3(0, 0.4, -18));
  (g.replays.trial ??= []).push({ speaker: '旁白', zh: '第一道：倒木下的缝隙太矮。第二道：压力开关太重。第三道：鸽子最恨长脖子。', en: '' });
  await wait(2300);
  g.cam.clearOverride();
  g.unlockInput();

  // ================= 幕四进行中：提示与幕五触发 =================
  const once = new Set();
  const hintOnce = (key, text) => { if (!once.has(key)) { once.add(key); ui.hint(text); } };
  let gateOpened = false;
  g.storyTick = () => {
    if (w.onPlate && pl.sizeIndex === 2) hintOnce('plate', '这个开关太重，普通力量无法启动。');
    if (w.gateOpen && !gateOpened) {
      gateOpened = true;
      hintOnce('gate', '机关门开了！离开开关 5 秒后它会复位——抓紧时间。');
    }
    if (!w.gateOpen) gateOpened = false;
    if (pl.pos.z < -11.2 && !w.inCover()) hintOnce('pigeon', '小心！树梢上的鸽子正盯着你。变小，或者躲进发光的伞盖下。');
    if (F.trial_cleared && pl.nineInch && pl.pos.z < LAYOUT.doorZ && !g.ending) finish();
    else if (F.trial_cleared && !pl.nineInch && pl.pos.z < LAYOUT.doorZ + 1.4) hintOnce('door', '门口很矮……先去路牌那儿把身高调好。');
  };

  await until(() => pl.pos.z < -24.8);
  F.trial_cleared = true;
  g.lockInput();
  g.cam.setOverride(new THREE.Vector3(0, 3.4, -26.6), new THREE.Vector3(0, 1.3, -30.5));
  g.audio.play('ding');
  await wait(900);
  await rec('ending', '旁白', '控制好自己，你就能找到你是谁。');
  ui.closeDialogue();
  g.cam.clearOverride();
  g.unlockInput();
  g.saveAt(2);
  ui.hint('出口亮起来了。路牌上写着「公爵夫人宅邸」——门口很矮，先去路牌那儿调整身高。');

  async function finish() {
    g.ending = true;
    g.lockInput();
    window.WonderlandProgress?.completeScene('caterpillar_tree');
    g.audio.play('ding');
    ui.fade(true);
    await wait(1100);
    ui.ending(`共咬蘑菇 ${F.bites} 口 · 孢子 ${F.spores.length}/${LAYOUT.spores.length}${F.easter_egg ? ' · 触发隐藏彩蛋' : ''}`);
    ui.fade(false);
  }
}
