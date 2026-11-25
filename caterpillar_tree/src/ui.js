const $ = (id) => document.getElementById(id);
const SPEAKER_CLASS = { 毛毛虫: 'is-caterpillar', 爱丽丝: 'is-alice', 鸽子: 'is-pigeon' };

export class UI {
  constructor() {
    this.hintTimer = null;
    this.calloutAnchor = null;
    this.calloutTimer = null;
    this.pending = null;
    this.typing = null;
    this.shown = new Set();
    this.audio = null;
  }

  get blocking() {
    return ['dialogue', 'poem', 'fail', 'pause', 'replay', 'gallery', 'ending', 'boot'].some((id) => this.shown.has(id));
  }

  show(id) { $(id).hidden = false; this.shown.add(id); }
  hide(id) { $(id).hidden = true; this.shown.delete(id); }

  // 提示气泡：35 秒自动消失，可手动关闭
  hint(text, { once = null } = {}) {
    if (once && this.shownHintOnce?.has(once)) return;
    if (once) (this.shownHintOnce ??= new Set()).add(once);
    $('hint-text').textContent = text;
    this.show('hint');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hide('hint'), 35000);
  }

  toast(text, ms = 2600) {
    const el = $('toast');
    el.textContent = text;
    this.show('toast');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.hide('toast'), ms);
  }

  // 跟随场景中某个位置的台词气泡（爱丽丝体型台词、鸽子“蛇！”）
  callout(text, anchor, ms = 2600) {
    $('callout').textContent = text;
    this.calloutAnchor = anchor;
    this.show('callout');
    clearTimeout(this.calloutTimer);
    this.calloutTimer = setTimeout(() => this.hide('callout'), ms);
  }

  updateCallout(project) {
    if (!this.shown.has('callout') || !this.calloutAnchor) return;
    const p = project(this.calloutAnchor);
    $('callout').style.left = `${p.x}px`;
    $('callout').style.top = `${p.y - 14}px`;
  }

  size(player) {
    document.querySelectorAll('.size-icon').forEach((el) => {
      const idx = player.sizeIndex >= 3 ? 'big' : player.sizeIndex <= 1 ? 'small' : 'normal';
      el.classList.toggle('is-active', el.dataset.size === idx);
    });
    const extra = $('hud-size-extra');
    extra.textContent = player.nineInch ? '九英寸' : player.def.label === '长脖子' || player.def.label === '小小一团' ? player.def.label : '';
    extra.classList.toggle('is-warm', player.sizeIndex === 4);
  }

  items(items) {
    document.querySelectorAll('.slot').forEach((el) => el.classList.toggle('is-ready', !!items[el.dataset.item]));
  }

  spores(n, total) {
    document.querySelectorAll('#hud-spores i').forEach((el, i) => el.classList.toggle('is-on', i < n));
    $('hud-spores').firstChild.textContent = `孢子 ${n}/${total} `;
  }

  galleryUnlocked(on) { $('btn-gallery').disabled = !on; }

  prompt(text) {
    $('prompt-text').textContent = text || '';
    if (text) this.show('prompt'); else this.hide('prompt');
  }

  // 对白：打字机效果，点击 / E / 空格 继续
  say({ speaker, zh, en = '' }) {
    $('dlg-name').textContent = speaker;
    $('dlg-name').className = `dlg-name ${SPEAKER_CLASS[speaker] || ''}`;
    $('dlg-zh').textContent = '';
    $('dlg-en').textContent = en;
    $('dlg-choices').replaceChildren();
    $('dlg-next').hidden = true;
    this.show('dialogue');
    return new Promise((resolve) => {
      let i = 0, done = false;
      const finish = () => {
        done = true;
        $('dlg-zh').textContent = zh;
        $('dlg-next').hidden = false;
        this.pending = () => { this.pending = null; resolve(); };
      };
      const type = () => {
        if (done) return;
        const step = zh.charCodeAt(i) > 255 ? 1 : 2;
        $('dlg-zh').textContent = zh.slice(0, i + step);
        i += step;
        if (i % 6 === 0) this.audio?.play('blip');
        if (i >= zh.length) finish();
        else this.typing = setTimeout(type, 34);
      };
      this.pending = () => { clearTimeout(this.typing); finish(); };
      type();
    });
  }

  choose(options) {
    $('dlg-next').hidden = true;
    const box = $('dlg-choices');
    box.replaceChildren();
    return new Promise((resolve) => {
      options.forEach((text, index) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.addEventListener('click', (event) => {
          event.stopPropagation();
          box.replaceChildren();
          resolve(index);
        });
        box.appendChild(b);
      });
      this.show('dialogue');
      this.pending = null;
    });
  }

  closeDialogue() { this.hide('dialogue'); }

  // 诗歌填空：每题答错后重排选项再答，连错 3 次高亮正确项 0.5 秒；教学关不因背诗失败。
  async poem(questions, audio) {
    this.audio = audio;
    const dots = $('poem-progress');
    dots.replaceChildren(...questions.map(() => document.createElement('i')));
    this.show('poem');
    for (let q = 0; q < questions.length; q += 1) {
      let attempts = 0, ok = false;
      while (!ok) {
        attempts += 1;
        ok = await this.poemQuestion(questions[q], q, attempts, audio);
      }
      dots.children[q].className = attempts === 1 ? 'is-right' : 'is-retry';
    }
    $('poem-reply').textContent = '毛毛虫微微点头，烟圈的颜色由灰转成了淡蓝。';
    audio.play('right');
    await new Promise((r) => setTimeout(r, 1500));
    this.hide('poem');
  }

  poemQuestion(q, index, attempt, audio) {
    $('poem-reply').textContent = '';
    markCurrent(index);
    $('poem-line').textContent = q.line;
    const box = $('poem-options');
    box.replaceChildren();
    const order = shuffle([0, 1, 2]);
    return new Promise((resolve) => {
      let locked = false;
      const buttons = order.map((opt) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = q.options[opt];
        b.addEventListener('click', () => {
          if (locked) return;
          locked = true;
          if (opt === 0) {
            b.classList.add('is-right');
            $('poem-reply').textContent = '“没错。”';
            audio.play('right');
            setTimeout(() => resolve(true), 900);
            return;
          }
          b.classList.add('is-wrong');
          audio.play('wrong');
          $('poem-reply').textContent = attempt >= 3 ? '“你连最简单的东西都记不住。”' : '“错了，从头到尾都错了。”';
          if (attempt >= 3) {
            setTimeout(() => {
              const right = buttons.find((c) => c !== b && c.textContent === q.options[0]);
              right?.classList.add('is-hint');
              setTimeout(() => right?.classList.remove('is-hint'), 500);
            }, 700);
          }
          setTimeout(() => resolve(false), attempt >= 3 ? 1500 : 1200);
        });
        box.appendChild(b);
        return b;
      });
    });
  }

  fail(text) {
    $('fail-text').textContent = text;
    this.show('fail');
    return new Promise((resolve) => {
      $('fail-checkpoint').onclick = () => { this.hide('fail'); resolve('checkpoint'); };
      $('fail-restart').onclick = () => window.location.reload();
    });
  }

  ending(stats) {
    $('ending-stats').textContent = stats;
    this.show('ending');
  }

  fade(on) { $('fade').classList.toggle('is-on', on); }
}

function markCurrent(index) {
  const dots = $('poem-progress');
  for (let i = 0; i < dots.children.length; i += 1) {
    dots.children[i].classList.toggle('is-now', i === index);
  }
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
