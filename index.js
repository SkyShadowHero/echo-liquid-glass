
// ── Liquid Glass Refraction Engine ──
// EchoMusic 插件：为 .player-bar 提供纯折射液态玻璃效果
// 基于 SVG feDisplacementMap + 动态 Canvas 位移贴图

/**
 * 计算折射剖面（Snell 定律物理模型）
 */
function calculateRefractionProfile(glassThickness, bezelWidth, heightFn, ior, samples) {
  samples = samples || 128;
  var eta = 1 / ior;
  function refract(nx, ny) {
    var dot = ny;
    var k = 1 - eta * eta * (1 - dot * dot);
    if (k < 0) return null;
    var sq = Math.sqrt(k);
    return [-(eta * dot + sq) * nx, eta - (eta * dot + sq) * ny];
  }
  var profile = new Float64Array(samples);
  for (var i = 0; i < samples; i++) {
    var x = i / samples;
    var y = heightFn(x);
    var dx = x < 1 ? 0.0001 : -0.0001;
    var y2 = heightFn(x + dx);
    var deriv = (y2 - y) / dx;
    var mag = Math.sqrt(deriv * deriv + 1);
    var ref = refract(-deriv / mag, -1 / mag);
    if (!ref) { profile[i] = 0; continue; }
    profile[i] = ref[0] * ((y * bezelWidth + glassThickness) / ref[1]);
  }
  return profile;
}

/**
 * 生成位移贴图（Canvas → DataURL）
 * 针对圆角矩形（player-bar）优化
 */
function generateDisplacementMap(w, h, radius, bezelWidth, profile, maxDisp, horizontalOnly) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var ctx = c.getContext('2d');
  var img = ctx.createImageData(w, h);
  var d = img.data;
  for (var i = 0; i < d.length; i += 4) {
    d[i] = 128; d[i + 1] = 128; d[i + 2] = 0; d[i + 3] = 255;
  }
  var r = Math.min(radius, Math.min(w, h) / 2 - 1);
  if (r <= 0) return c.toDataURL();
  var clampedBezel = Math.min(bezelWidth, r - 1);
  if (clampedBezel <= 1) return c.toDataURL();
  var rSq = r * r;
  var r1Sq = (r + 1) * (r + 1);
  var rBSq = Math.max(r - clampedBezel, 0) * Math.max(r - clampedBezel, 0);
  var wB = w - r * 2;
  var hB = h - r * 2;
  var S = profile.length;
  if (wB < 0 || hB < 0) return c.toDataURL();

  for (var y1 = 0; y1 < h; y1++) {
    for (var x1 = 0; x1 < w; x1++) {
      var dx, dy;
      if (x1 < r) { dx = x1 - r; }
      else if (x1 >= w - r) { dx = x1 - r - wB; }
      else { dx = 0; }
      if (y1 < r) { dy = y1 - r; }
      else if (y1 >= h - r) { dy = y1 - r - hB; }
      else { dy = 0; }
      var dSq = dx * dx + dy * dy;
      if (dSq > r1Sq || dSq < rBSq) continue;
      var dist = Math.sqrt(dSq);
      var fromSide = r - dist;
      var op = dSq < rSq ? 1 : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
      if (op <= 0 || dist === 0) continue;
      var cos = dx / dist;
      var sin = dy / dist;
      var bi = Math.min(Math.floor((fromSide / clampedBezel) * S), S - 1);
      var disp = profile[bi] || 0;
      var dX = (-cos * disp) / maxDisp;
      var dY = (-sin * disp) / maxDisp;
      var idx = (y1 * w + x1) * 4;
      d[idx] = Math.min(255, Math.max(0, (128 + dX * 127 * op + 0.5) | 0));
      d[idx + 1] = Math.min(255, Math.max(0, (128 + dY * 127 * op + 0.5) | 0));
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

/**
 * 生成高光贴图
 */
function generateSpecularMap(w, h, radius, bezelWidth, angle) {
  angle = angle != null ? angle : Math.PI / 3;
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var ctx = c.getContext('2d');
  var img = ctx.createImageData(w, h);
  var d = img.data;
  for (var i = 0; i < d.length; i += 4) {
    d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
  }
  var r = Math.min(radius, Math.min(w, h) / 2 - 1);
  if (r <= 0) return c.toDataURL();
  var clampedBezel = Math.min(bezelWidth, r - 1);
  if (clampedBezel <= 1) return c.toDataURL();
  var rSq = r * r;
  var r1Sq = (r + 1) * (r + 1);
  var rBSq = Math.max(r - clampedBezel, 0) * Math.max(r - clampedBezel, 0);
  var wB = w - r * 2;
  var hB = h - r * 2;
  var lightVec = [Math.cos(angle), Math.sin(angle)];

  for (var y1 = 0; y1 < h; y1++) {
    for (var x1 = 0; x1 < w; x1++) {
      var dx, dy;
      if (x1 < r) { dx = x1 - r; }
      else if (x1 >= w - r) { dx = x1 - r - wB; }
      else { dx = 0; }
      if (y1 < r) { dy = y1 - r; }
      else if (y1 >= h - r) { dy = y1 - r - hB; }
      else { dy = 0; }
      var dSq = dx * dx + dy * dy;
      if (dSq > r1Sq || dSq < rBSq) continue;
      var dist = Math.sqrt(dSq);
      var fromSide = r - dist;
      var op = dSq < rSq ? 1 : 1 - (dist - Math.sqrt(rSq)) / (Math.sqrt(r1Sq) - Math.sqrt(rSq));
      if (op <= 0 || dist === 0) continue;
      var cos = dx / dist;
      var sin = -dy / dist;
      var dot = Math.abs(cos * lightVec[0] + sin * lightVec[1]);
      var edge = Math.sqrt(Math.max(0, 1 - Math.pow(1 - fromSide, 2)));
      var coeff = dot * edge;
      var col = (255 * coeff) | 0;
      var alpha = Math.min(255, Math.max(0, (col * coeff * op * 0.85) | 0));
      var idx = (y1 * w + x1) * 4;
      d[idx] = col; d[idx + 1] = col; d[idx + 2] = col; d[idx + 3] = alpha;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

function squircleSurface(t) {
  return Math.pow(1 - Math.pow(1 - t, 4), 0.25);
}

function buildSVGFilter(filterId, dispUrl, specUrl, scale, w, h, specOpacity) {
  specOpacity = specOpacity != null ? specOpacity : 0.3;
  var fc = '';
  fc += '<feImage href="' + dispUrl + '" x="0" y="0" width="' + w + '" height="' + h + '" result="disp_map" />';
  fc += '<feDisplacementMap in="SourceGraphic" in2="disp_map" scale="' + scale + '" xChannelSelector="R" yChannelSelector="G" result="displaced" />';
  if (specUrl) {
    fc += '<feImage href="' + specUrl + '" x="0" y="0" width="' + w + '" height="' + h + '" result="spec_layer" />';
    fc += '<feComposite in="displaced" in2="spec_layer" operator="in" result="spec_masked" />';
    fc += '<feComponentTransfer in="spec_layer" result="spec_faded"><feFuncA type="linear" slope="' + specOpacity + '" /></feComponentTransfer>';
    fc += '<feBlend in="spec_masked" in2="displaced" mode="screen" result="with_spec" />';
    fc += '<feBlend in="spec_faded" in2="with_spec" mode="screen" />';
  }
  return fc;
}

/**
 * PlayerBar 液态玻璃折射管理器
 */
function LiquidGlassManager(opts) {
  opts = opts || {};
  if (typeof opts.element === 'string') {
    this._el = document.querySelector(opts.element);
  } else {
    this._el = opts.element;
  }
  this._filterId = opts.filterId || 'liquid-glass-refraction-filter';
  this._svgId = opts.svgId || 'liquid-glass-refraction-svg';
  this._bgVar = opts.bgVar || '--miuix-background';
  this._thickness = opts.thickness != null ? opts.thickness : 100;
  this._bezelWidth = opts.bezelWidth != null ? opts.bezelWidth : 40;
  this._ior = opts.ior != null ? opts.ior : 2.5;
  this._specularOpacity = opts.specularOpacity != null ? opts.specularOpacity : 0.5;
  this._bgOpacity = opts.bgOpacity != null ? opts.bgOpacity : 50;
  this._blurAmount = opts.blurAmount != null ? opts.blurAmount : 2;
  this._borderEnabled = opts.borderEnabled != null ? opts.borderEnabled : true;
  this._glowEnabled = opts.glowEnabled != null ? opts.glowEnabled : false;
  this._glowWhite = opts.glowWhite != null ? opts.glowWhite : false;
  this._glowRadius = opts.glowRadius != null ? opts.glowRadius : 200;
  this._glowColor = opts.glowColor || null;
  this._horizontalOnly = opts.horizontalOnly ? true : false;
  this._active = false;
  this._rebuildTimer = null;
  this._resizeObserver = null;
  this._svgEl = null;
  this._glowHandler = null;
}

LiquidGlassManager.prototype.mount = function () {
  if (!this._el) return;
  this._el.classList.add('liquid-glass-refraction');
  this._ensureSVG();
  this._rebuildFilter();
  this._applyBackdropFilter();
  this._applyCSS();
  var self = this;
  this._resizeObserver = new ResizeObserver(function () {
    self._scheduleRebuild();
  });
  this._resizeObserver.observe(this._el);
  if (this._borderEnabled) {
    this._el.classList.add('liquid-glass-border');
  }
  if (this._glowEnabled) {
    this._el.classList.add('liquid-glass-glow');
    this._applyGlowColor();
    this._applyGlowRadius();
    var self = this;
    this._glowPending = false;
    this._glowHandler = function (e) {
      self._glowX = e.clientX;
      self._glowY = e.clientY;
      if (self._glowPending) return;
      self._glowPending = true;
      var el = self._el;
      requestAnimationFrame(function () {
        var rect = el.getBoundingClientRect();
        el.style.setProperty('--glow-x', (self._glowX - rect.left) + 'px');
        el.style.setProperty('--glow-y', (self._glowY - rect.top) + 'px');
        self._glowPending = false;
      });
    };
    this._el.addEventListener('mousemove', this._glowHandler);
    this._el.classList.add('liquid-glass-border-glow');
  }
  this._active = true;
};

LiquidGlassManager.prototype.unmount = function () {
  this._active = false;
  if (this._resizeObserver) {
    this._resizeObserver.disconnect();
    this._resizeObserver = null;
  }
  clearTimeout(this._rebuildTimer);
  this._rebuildTimer = null;
  if (this._el) {
    this._el.style.removeProperty('backdrop-filter');
    this._el.style.removeProperty('-webkit-backdrop-filter');
    this._el.style.removeProperty('background');
    this._el.classList.remove('liquid-glass-refraction');
    this._el.classList.remove('liquid-glass-border');
    if (this._glowHandler) {
      this._el.removeEventListener('mousemove', this._glowHandler);
      this._glowHandler = null;
    }
    this._el.classList.remove('liquid-glass-glow');
    this._el.classList.remove('liquid-glass-border-glow');
  }
  this._removeSVG();
};

LiquidGlassManager.prototype.updateParams = function (opts) {
  opts = opts || {};
  var needRebuild = false;
  var needCSS = false;
  if ('thickness' in opts) { this._thickness = opts.thickness; needRebuild = true; }
  if ('bezelWidth' in opts) { this._bezelWidth = opts.bezelWidth; needRebuild = true; }
  if ('ior' in opts) { this._ior = opts.ior; needRebuild = true; }
  if ('specularOpacity' in opts) { this._specularOpacity = opts.specularOpacity; needRebuild = true; }
  if ('bgOpacity' in opts) { this._bgOpacity = opts.bgOpacity; needCSS = true; }
  if ('blurAmount' in opts) { this._blurAmount = opts.blurAmount; needCSS = true; }
  if ('borderEnabled' in opts) {
    this._borderEnabled = opts.borderEnabled;
    if (this._el) {
      this._el.classList.toggle('liquid-glass-border', this._borderEnabled);
    }
  }
    if ('glowEnabled' in opts) {
    this._glowEnabled = opts.glowEnabled;
    if (this._el) {
      // 鸿蒙光效开关同时控制光晕与边框光效（描边）
      this._el.classList.toggle('liquid-glass-glow', this._glowEnabled);
      this._el.classList.toggle('liquid-glass-border-glow', this._glowEnabled);
      if (this._glowEnabled) {
        if (!this._glowHandler) {
          var self = this;
          this._glowPending = false;
          this._glowHandler = function (e) {
            self._glowX = e.clientX;
            self._glowY = e.clientY;
            if (self._glowPending) return;
            self._glowPending = true;
            var el = self._el;
            requestAnimationFrame(function () {
              var rect = el.getBoundingClientRect();
              el.style.setProperty('--glow-x', (self._glowX - rect.left) + 'px');
              el.style.setProperty('--glow-y', (self._glowY - rect.top) + 'px');
              self._glowPending = false;
            });
          };
          this._el.addEventListener('mousemove', this._glowHandler);
        }
        this._applyGlowColor();
      } else {
        if (this._glowHandler) {
          this._el.removeEventListener('mousemove', this._glowHandler);
          this._glowHandler = null;
        }
      }
    }
  }
  if ('glowWhite' in opts) {
    this._glowWhite = opts.glowWhite;
    if (this._el && this._glowEnabled) {
      this._applyGlowColor();
    }
  }
  if ('glowRadius' in opts) {
    this._glowRadius = opts.glowRadius;
    if (this._el && this._glowEnabled) {
      this._applyGlowRadius();
    }
  }
  if (this._active) {
    if (needRebuild) this._scheduleRebuild();
    if (needCSS) this._applyCSS();
  }
};

LiquidGlassManager.prototype.getParams = function () {
  return {
    thickness: this._thickness,
    bezelWidth: this._bezelWidth,
    ior: this._ior,
    specularOpacity: this._specularOpacity,
    bgOpacity: this._bgOpacity,
    blurAmount: this._blurAmount,
    borderEnabled: this._borderEnabled,
    glowEnabled: this._glowEnabled,
    glowWhite: this._glowWhite,
    glowRadius: this._glowRadius,
  };
};

LiquidGlassManager.prototype._ensureSVG = function () {
  this._removeSVG();
  this._svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  this._svgEl.setAttribute('id', this._svgId);
  this._svgEl.setAttribute('width', '0');
  this._svgEl.setAttribute('height', '0');
  this._svgEl.setAttribute('style', 'position:absolute;overflow:hidden;pointer-events:none;');
  this._svgEl.setAttribute('color-interpolation-filters', 'sRGB');
  var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  this._svgEl.appendChild(defs);
  document.body.appendChild(this._svgEl);
};

LiquidGlassManager.prototype._removeSVG = function () {
  if (this._svgEl && this._svgEl.parentNode) {
    this._svgEl.parentNode.removeChild(this._svgEl);
  }
  this._svgEl = null;
};

LiquidGlassManager.prototype._rebuildFilter = function () {
  if (!this._el || !this._svgEl) return;
  var w = this._el.offsetWidth;
  var h = this._el.offsetHeight;
  if (w < 4 || h < 4) return;
  var style = getComputedStyle(this._el);
  var cssRadius = parseFloat(style.borderRadius) || 9999;
  var radius = Math.min(cssRadius, w / 2, h / 2);
  var safeBezel = Math.min(this._bezelWidth, radius - 1, Math.min(w, h) / 2 - 1);
  if (safeBezel <= 1) { this._writeFilter(''); return; }
  var profile = calculateRefractionProfile(this._thickness, safeBezel, squircleSurface, this._ior, 128);
  var maxDisp = Math.max.apply(Math, Array.from(profile).map(Math.abs)) || 1;
  var scale = maxDisp * 0.8;
  var dispUrl = generateDisplacementMap(w, h, radius, safeBezel, profile, maxDisp, this._horizontalOnly);
  var specUrl = '';
  if (this._specularOpacity > 0.001) {
    specUrl = generateSpecularMap(w, h, radius, safeBezel * 2.5);
  }
  var filterHTML = buildSVGFilter(this._filterId, dispUrl, specUrl, scale, w, h, this._specularOpacity);
  this._writeFilter(filterHTML);
};

LiquidGlassManager.prototype._writeFilter = function (filterHTML) {
  if (!this._svgEl) return;
  var defs = this._svgEl.querySelector('defs');
  if (!defs) return;
  var old = defs.querySelector('#' + this._filterId);
  if (old) old.remove();
  if (!filterHTML) return;
  var filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.setAttribute('id', this._filterId);
  filter.setAttribute('x', '0%');
  filter.setAttribute('y', '0%');
  filter.setAttribute('width', '100%');
  filter.setAttribute('height', '100%');
  filter.innerHTML = filterHTML;
  defs.appendChild(filter);
};

LiquidGlassManager.prototype._applyBackdropFilter = function () {
  if (!this._el) return;
  var filters = 'url(#' + this._filterId + ')';
  if (this._blurAmount > 0.5) {
    filters += ' blur(' + this._blurAmount.toFixed(1) + 'px)';
  }
  this._el.style.setProperty('backdrop-filter', filters, 'important');
  this._el.style.setProperty('-webkit-backdrop-filter', filters, 'important');
};

LiquidGlassManager.prototype._applyCSS = function () {
  if (!this._el) return;
  // 背景不透明度
  var bg = 'color-mix(in srgb, var(' + this._bgVar + ') ' + this._bgOpacity + '%, transparent)';
  this._el.style.setProperty('background', bg, 'important');
  // 刷新 backdrop-filter（模糊度可能变化）
  this._applyBackdropFilter();
};

LiquidGlassManager.prototype._applyGlowColor = function () {
  if (!this._el) return;
  var gc = this._glowColor || (this._glowWhite ? 'color-mix(in srgb, white 90%, var(--color-primary) 10%)' : 'var(--color-primary)');
  this._el.style.setProperty('--glow-color', gc);
  // 白色光效时压暗背景，浅色模式下才能看到白色光效的对比
  this._el.style.filter = this._glowWhite ? 'brightness(0.96)' : '';
};

LiquidGlassManager.prototype._applyGlowRadius = function () {
  if (!this._el) return;
  this._el.style.setProperty('--glow-radius', this._glowRadius + 'px');
  this._el.style.setProperty('--border-glow-radius', this._glowRadius + 'px');
};

LiquidGlassManager.prototype._scheduleRebuild = function () {
  clearTimeout(this._rebuildTimer);
  var self = this;
  this._rebuildTimer = setTimeout(function () {
    if (self._active) {
      self._rebuildFilter();
      self._applyBackdropFilter();
    }
  }, 50);
};


// ── 插件入口 ──
export function activate(ctx) {
  var liquidGlass = null;
  var liquidGlassParams = {
    thickness: 100,
    bezelWidth: 40,
    ior: 2.5,
    specularOpacity: 0.5,
    bgOpacity: 50,
    blurAmount: 2,
    borderEnabled: false,
    glowEnabled: false,
    glowWhite: false,
    glowRadius: 200,
  };

  // ── 标题栏按钮复用液态玻璃：每按钮独立滤镜 + 同一批光效参数 ──
  var titleBtnSeq = 0;
  var titleBtnActive = false;
  var titleBtnManagers = [];
  var titleBtnSeen = new Set();
  var titleBarLightCleanup = null;
  var closeBtnManager = null;

  // 按钮光效半径要比设置的更小（小按钮用更小的光晕）
  function buttonGlowRadius() {
    return Math.max(30, Math.round(liquidGlassParams.glowRadius * 0.4));
  }

  function initTitleBarGlass() {
    Array.prototype.forEach.call(
      document.querySelectorAll('.titlebar-nav .nav-btn, .window-controls .control-btn'),
      function (btn) {
        if (titleBtnSeen.has(btn)) return;
        if (btn.offsetWidth < 4 || btn.offsetHeight < 4) return;
        titleBtnSeen.add(btn);
        // 识别关闭按钮（window-controls 里最后一个 control-btn）
        var winControls = btn.closest('.window-controls');
        var ctrls = winControls ? winControls.querySelectorAll('.control-btn') : [];
        var isClose = !!winControls && ctrls.length > 0 && ctrls[ctrls.length - 1] === btn;
        // 打一层 wrapper：hover/点击放缩放在 wrap 上，避免与按钮自身 backdrop-filter 冲突导致折射消失
        var wrap = document.createElement('div');
        wrap.className = 'liquid-glass-btn-wrap';
        wrap.style.cssText = 'width:' + btn.offsetWidth + 'px;height:' + btn.offsetHeight + 'px;';
        // 记录按钮原始父节点，关闭开关时把按钮移回原处、删除 wrap，恢复顶部原始布局
        wrap.__lgBtn = btn;
        wrap.__lgParent = btn.parentNode;
        btn.parentNode.insertBefore(wrap, btn);
        wrap.appendChild(btn);
        var seq = titleBtnSeq++;
        if (isClose) btn.classList.add('lg-close-btn');
        var mgr = new LiquidGlassManager({
          element: btn,
          thickness: liquidGlassParams.thickness,
          bezelWidth: liquidGlassParams.bezelWidth,
          ior: liquidGlassParams.ior,
          specularOpacity: liquidGlassParams.specularOpacity,
          // 顶部按钮背景不透明度固定为 0（透明玻璃片更好看），不跟随设置项
          bgOpacity: 0,
          blurAmount: liquidGlassParams.blurAmount,
          borderEnabled: liquidGlassParams.borderEnabled,
          glowEnabled: liquidGlassParams.glowEnabled,
          glowWhite: liquidGlassParams.glowWhite,
          glowRadius: buttonGlowRadius(),
          svgId: 'liquid-glass-title-svg-' + seq,
          filterId: 'liquid-glass-title-filter-' + seq,
          bgVar: '--color-bg-main',
        });
        titleBtnManagers.push(mgr);
        if (isClose) closeBtnManager = mgr;
      }
    );
  }

  // 把标题栏按钮从 wrap 中移回原父节点并删除 wrap，恢复原始 DOM 布局
  function unwrapTitleButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.liquid-glass-btn-wrap'), function (wrap) {
      var btn = wrap.__lgBtn;
      var parent = wrap.__lgParent || wrap.parentNode;
      if (btn && parent) {
        parent.insertBefore(btn, wrap);
        wrap.remove();
      }
    });
  }

  function applyTitleBarGlass(enabled) {
    if (enabled === titleBtnActive) return;
    titleBtnActive = enabled;
    if (enabled) {
      initTitleBarGlass();
      bindTitleBarSharedGlow();
      titleBtnManagers.forEach(function (m) { m.mount(); });
    } else {
      if (titleBarLightCleanup) { titleBarLightCleanup(); }
      titleBtnManagers.forEach(function (m) { m.unmount(); });
      titleBtnManagers = [];
      titleBtnSeen = new Set();
      titleBtnSeq = 0;
      closeBtnManager = null;
      unwrapTitleButtons();
    }
    // 顶部按钮的所有 CSS 修改（尺寸/间距/圆角/光效）只在开启折射时生效
    document.documentElement.classList.toggle('lg-titlebar-on', enabled);
  }

  function updateTitleBarGlassParams(p) {
    p = p || {};
    var g = {};
    for (var k in p) {
      if (Object.prototype.hasOwnProperty.call(p, k)) g[k] = p[k];
    }
    if ('glowRadius' in g) { g.glowRadius = buttonGlowRadius(); }
    // 顶部按钮背景不透明度固定为 0，忽略设置项
    g.bgOpacity = 0;
    titleBtnManagers.forEach(function (m) { m.updateParams(g); });
  }

  // 点击/切换窗口状态后应用可能重建标题栏按钮 DOM，重建后重新包装并挂载，
  // 避免折射与描边在新按钮上消失；开关关闭时不包装
  var titleBarObserver = null;
  var titleBarObsTimer = null;
  function ensureTitleBarButtonsMounted() {
    if (!titleBtnActive) return;
    initTitleBarGlass();
    titleBtnManagers.forEach(function (m) {
      if (!m._active) m.mount();
    });
  }
  function startTitleBarObserver() {
    if (titleBarObserver) return;
    var holder = document.querySelector('.title-bar');
    if (!holder) return;
    titleBarObserver = new MutationObserver(function () {
      clearTimeout(titleBarObsTimer);
      titleBarObsTimer = setTimeout(ensureTitleBarButtonsMounted, 100);
    });
    titleBarObserver.observe(holder, { childList: true, subtree: true });
  }

  // 光效可在不同按钮同时出现：光标划过标题栏时，贴近光标的所有按钮一起点亮
  function bindTitleBarSharedGlow() {
    if (titleBarLightCleanup || !titleBtnManagers.length) return;
    var barEl = document.querySelector('.title-bar');
    if (!barEl) return;
    function light(e) {
      titleBtnManagers.forEach(function (m) {
        var el = m._el;
        if (!el) return;
        var wrap = el.parentElement;
        var rect = el.getBoundingClientRect();
        var pad = 10;
        var dx = e.clientX - rect.left;
        var dy = e.clientY - rect.top;
        if (dx < -pad || dx > rect.width + pad || dy < -pad || dy > rect.height + pad) {
          el.classList.remove('lg-lit');
          if (el.classList.contains('lg-close-btn')) {
            el.style.removeProperty('--glow-color');
          }
          if (wrap) {
            wrap.classList.remove('lg-lit');
            wrap.style.removeProperty('--lg-tx');
            wrap.style.removeProperty('--lg-ty');
          }
          return;
        }
        el.style.setProperty('--glow-x', Math.round(dx) + 'px');
        el.style.setProperty('--glow-y', Math.round(dy) + 'px');
        el.classList.add('lg-lit');
        // 关闭按钮 hover 时光效临时改为红色
        if (el.classList.contains('lg-close-btn')) {
          el.style.setProperty('--glow-color', '#ff3b30');
        }
        // 按钮朝光标方向轻微位移：偏移比 = 距中心距离/半宽，夹在 ±3px
        if (wrap) {
          var maxS = 3;
          var hw = Math.max(rect.width / 2, 1);
          var hh = Math.max(rect.height / 2, 1);
          var tx = Math.max(-maxS, Math.min(maxS, ((dx - hw) / hw) * maxS));
          var ty = Math.max(-maxS, Math.min(maxS, ((dy - hh) / hh) * maxS));
          wrap.style.setProperty('--lg-tx', tx.toFixed(2) + 'px');
          wrap.style.setProperty('--lg-ty', ty.toFixed(2) + 'px');
          wrap.classList.add('lg-lit');
        }
      });
    }
    function unlight() {
      titleBtnManagers.forEach(function (m) {
        if (!m._el) return;
        var el = m._el;
        el.classList.remove('lg-lit');
        if (el.classList.contains('lg-close-btn')) {
          el.style.removeProperty('--glow-color');
        }
        var wrap = el.parentElement;
        if (wrap) {
          wrap.classList.remove('lg-lit');
          wrap.style.removeProperty('--lg-tx');
          wrap.style.removeProperty('--lg-ty');
        }
      });
    }
    barEl.addEventListener('mousemove', light);
    barEl.addEventListener('mouseleave', unlight);
    titleBarLightCleanup = function () {
      barEl.removeEventListener('mousemove', light);
      barEl.removeEventListener('mouseleave', unlight);
      unlight();
      titleBarLightCleanup = null;
    };
  }

  // ── 回顶按钮：同样的背景折射 + hover 跟随位移 ──
  // 回顶按钮是 v-if + Transition 动态出现/消失。不能把按钮移进 wrap（会破坏 Vue
  // 虚拟 DOM 与真实 DOM 的一致性，导致第二次滚动后按钮不再出现）。因此：
  // 1) 折射直接挂到按钮自身（mgr.mount 只加类/内联样式，不动 DOM 结构）
  // 2) hover 位移用 margin 变量实现（不创建合成层，折射稳定，也不改变 DOM 父子关系）
  var backTopSeq = 0;
  var backTopManagers = [];
  var backTopHovered = new WeakSet();
  var backTopActive = false;
  var backTopObserver = null;
  var backTopObsTimer = null;

  // 按钮朝光标方向轻微位移：直接改 right/bottom 定位（不产生 transform，
  // backdrop-filter 采样不受影响；相比 margin 变量，定位属性跟随无延迟）
  function bindBackToTopHover(btn) {
    if (backTopHovered.has(btn)) return;
    backTopHovered.add(btn);
    var cs = getComputedStyle(btn);
    var baseR = parseFloat(cs.right) || 24;
    var baseB = parseFloat(cs.bottom) || 100;
    btn.addEventListener('mousemove', function (e) {
      var rect = btn.getBoundingClientRect();
      var pad = 10;
      var dx = e.clientX - rect.left;
      var dy = e.clientY - rect.top;
      btn.style.setProperty('--lg-tx', '0px');
      btn.style.setProperty('--lg-ty', '0px');
      if (dx < -pad || dx > rect.width + pad || dy < -pad || dy > rect.height + pad) {
        btn.style.right = baseR + 'px';
        btn.style.bottom = baseB + 'px';
        return;
      }
      var maxS = 3;
      var hw = Math.max(rect.width / 2, 1);
      var hh = Math.max(rect.height / 2, 1);
      // 位移量：按钮整体 ±3px，图标在 CSS 里再放大 1.6 倍
      var tx = Math.max(-maxS, Math.min(maxS, ((dx - hw) / hw) * maxS));
      var ty = Math.max(-maxS, Math.min(maxS, ((dy - hh) / hh) * maxS));
      btn.style.right = (baseR - tx).toFixed(2) + 'px';
      btn.style.bottom = (baseB - ty).toFixed(2) + 'px';
      btn.style.setProperty('--lg-tx', tx.toFixed(2) + 'px');
      btn.style.setProperty('--lg-ty', ty.toFixed(2) + 'px');
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.right = baseR + 'px';
      btn.style.bottom = baseB + 'px';
      btn.style.setProperty('--lg-tx', '0px');
      btn.style.setProperty('--lg-ty', '0px');
    });
  }

  function initBackToTopGlass() {
    Array.prototype.forEach.call(
      document.querySelectorAll('.back-to-top-btn'),
      function (btn) {
        if (btn.offsetWidth < 4 || btn.offsetHeight < 4) return;
        // 已处理过（该按钮已有 manager）则跳过
        var exists = false;
        for (var i = 0; i < backTopManagers.length; i++) {
          if (backTopManagers[i]._el === btn) { exists = true; break; }
        }
        if (exists) return;
        bindBackToTopHover(btn);
        var seq = backTopSeq++;
        var mgr = new LiquidGlassManager({
          element: btn,
          thickness: liquidGlassParams.thickness,
          bezelWidth: liquidGlassParams.bezelWidth,
          ior: liquidGlassParams.ior,
          specularOpacity: liquidGlassParams.specularOpacity,
          bgOpacity: liquidGlassParams.bgOpacity,
          blurAmount: liquidGlassParams.blurAmount,
          borderEnabled: liquidGlassParams.borderEnabled,
          glowEnabled: liquidGlassParams.glowEnabled,
          glowWhite: liquidGlassParams.glowWhite,
          glowRadius: buttonGlowRadius(),
          svgId: 'liquid-glass-backtop-svg-' + seq,
          filterId: 'liquid-glass-backtop-filter-' + seq,
          bgVar: '--color-bg-elevated',
        });
        backTopManagers.push(mgr);
      }
    );
  }

  // 回顶按钮 v-if 移除后清理失效 manager
  function pruneBackToTop() {
    for (var i = backTopManagers.length - 1; i >= 0; i--) {
      var mgr = backTopManagers[i];
      if (!mgr._el || !mgr._el.isConnected) {
        mgr.unmount();
        backTopManagers.splice(i, 1);
      }
    }
  }

  function syncBackToTop() {
    pruneBackToTop();
    initBackToTopGlass();
    backTopManagers.forEach(function (m) {
      if (backTopActive && !m._active) m.mount();
      else if (!backTopActive && m._active) m.unmount();
    });
  }

  function applyBackToTopGlass(enabled) {
    backTopActive = enabled;
    backTopManagers.forEach(function (m) {
      if (enabled) m.mount(); else m.unmount();
    });
  }

  function updateBackToTopGlassParams(p) {
    p = p || {};
    var g = {};
    for (var k in p) {
      if (Object.prototype.hasOwnProperty.call(p, k)) g[k] = p[k];
    }
    if ('glowRadius' in g) { g.glowRadius = buttonGlowRadius(); }
    backTopManagers.forEach(function (m) { m.updateParams(g); });
  }

  function startBackTopObserver() {
    if (backTopObserver) return;
    backTopObserver = new MutationObserver(function () {
      if (typeof requestAnimationFrame === 'function') {
        // 回顶按钮 v-if 重建后下一帧同步，保证进入动画一开始就有折射与描边
        if (backTopObsTimer) cancelAnimationFrame(backTopObsTimer);
        backTopObsTimer = requestAnimationFrame(syncBackToTop);
      } else {
        clearTimeout(backTopObsTimer);
        backTopObsTimer = setTimeout(syncBackToTop, 0);
      }
    });
    backTopObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ── Toast（右上角通知）同样的背景折射 ──
  // toast 卡片是 v-for + TransitionGroup 动态出现/消失，和回顶按钮一样：
  // 折射直接挂到卡片自身（mgr.mount 只加类/内联样式，不动 DOM 结构）
  var toastSeq = 0;
  var toastManagers = [];
  var toastActive = false;
  var toastObserver = null;
  var toastObsTimer = null;

  function initToastGlass() {
    Array.prototype.forEach.call(
      document.querySelectorAll('.toast-card'),
      function (card) {
        if (card.offsetWidth < 4 || card.offsetHeight < 4) return;
        var exists = false;
        for (var i = 0; i < toastManagers.length; i++) {
          if (toastManagers[i]._el === card) { exists = true; break; }
        }
        if (exists) return;
        var seq = toastSeq++;
        var mgr = new LiquidGlassManager({
          element: card,
          thickness: liquidGlassParams.thickness,
          bezelWidth: liquidGlassParams.bezelWidth,
          ior: liquidGlassParams.ior,
          specularOpacity: liquidGlassParams.specularOpacity,
          bgOpacity: liquidGlassParams.bgOpacity,
          blurAmount: liquidGlassParams.blurAmount,
          borderEnabled: liquidGlassParams.borderEnabled,
          glowEnabled: liquidGlassParams.glowEnabled,
          glowWhite: liquidGlassParams.glowWhite,
          glowRadius: buttonGlowRadius(),
          svgId: 'liquid-glass-toast-svg-' + seq,
          filterId: 'liquid-glass-toast-filter-' + seq,
          bgVar: '--color-bg-elevated',
        });
        toastManagers.push(mgr);
      }
    );
  }

  // toast 消失（TransitionGroup leave 后移除）清理失效 manager
  function pruneToast() {
    for (var i = toastManagers.length - 1; i >= 0; i--) {
      var mgr = toastManagers[i];
      if (!mgr._el || !mgr._el.isConnected) {
        mgr.unmount();
        toastManagers.splice(i, 1);
      }
    }
  }

  function syncToast() {
    pruneToast();
    initToastGlass();
    toastManagers.forEach(function (m) {
      if (toastActive && !m._active) m.mount();
      else if (!toastActive && m._active) m.unmount();
    });
  }

  function applyToastGlass(enabled) {
    toastActive = enabled;
    toastManagers.forEach(function (m) {
      if (enabled) m.mount(); else m.unmount();
    });
  }

  function updateToastGlassParams(p) {
    p = p || {};
    var g = {};
    for (var k in p) {
      if (Object.prototype.hasOwnProperty.call(p, k)) g[k] = p[k];
    }
    if ('glowRadius' in g) { g.glowRadius = buttonGlowRadius(); }
    toastManagers.forEach(function (m) { m.updateParams(g); });
  }

  function startToastObserver() {
    if (toastObserver) return;
    toastObserver = new MutationObserver(function () {
      if (typeof requestAnimationFrame === 'function') {
        if (toastObsTimer) cancelAnimationFrame(toastObsTimer);
        toastObsTimer = requestAnimationFrame(syncToast);
      } else {
        clearTimeout(toastObsTimer);
        toastObsTimer = setTimeout(syncToast, 0);
      }
    });
    toastObserver.observe(document.body, { childList: true, subtree: true });
  }

  // 等待 player-bar 出现后初始化液态玻璃
  function tryInitLiquidGlass() {
    var bar = document.querySelector('.player-bar');
    if (!bar || liquidGlass) return;
    liquidGlass = new LiquidGlassManager({
      element: bar,
      thickness: liquidGlassParams.thickness,
      bezelWidth: liquidGlassParams.bezelWidth,
      ior: liquidGlassParams.ior,
      specularOpacity: liquidGlassParams.specularOpacity,
      bgOpacity: liquidGlassParams.bgOpacity,
      blurAmount: liquidGlassParams.blurAmount,
      borderEnabled: liquidGlassParams.borderEnabled,
      glowEnabled: liquidGlassParams.glowEnabled,
      glowWhite: liquidGlassParams.glowWhite,
      glowRadius: liquidGlassParams.glowRadius,
    });
    ctx.storage.get('liquid-glass-settings').then(function (saved) {
      var enabled = saved && typeof saved.enabled === 'boolean' ? saved.enabled : false;
      if (enabled) liquidGlass.mount();
      if (saved) {
        var p = {};
        if (typeof saved.thickness === 'number') { p.thickness = saved.thickness; liquidGlassParams.thickness = saved.thickness; }
        if (typeof saved.bezelWidth === 'number') { p.bezelWidth = saved.bezelWidth; liquidGlassParams.bezelWidth = saved.bezelWidth; }
        if (typeof saved.ior === 'number') { p.ior = saved.ior; liquidGlassParams.ior = saved.ior; }
        if (typeof saved.specularOpacity === 'number') { p.specularOpacity = saved.specularOpacity; liquidGlassParams.specularOpacity = saved.specularOpacity; }
        if (typeof saved.bgOpacity === 'number') { p.bgOpacity = saved.bgOpacity; liquidGlassParams.bgOpacity = saved.bgOpacity; }
        if (typeof saved.blurAmount === 'number') { p.blurAmount = saved.blurAmount; liquidGlassParams.blurAmount = saved.blurAmount; }
        if (typeof saved.borderEnabled === 'boolean') { p.borderEnabled = saved.borderEnabled; liquidGlassParams.borderEnabled = saved.borderEnabled; }
        if (typeof saved.glowEnabled === 'boolean') { p.glowEnabled = saved.glowEnabled; liquidGlassParams.glowEnabled = saved.glowEnabled; }
        if (typeof saved.glowWhite === 'boolean') { p.glowWhite = saved.glowWhite; liquidGlassParams.glowWhite = saved.glowWhite; }
        if (typeof saved.glowRadius === 'number') { p.glowRadius = saved.glowRadius; liquidGlassParams.glowRadius = saved.glowRadius; }
        liquidGlass.updateParams(p);
      }
      // 标题栏按钮：复用同一批液态玻璃参数
      startTitleBarObserver();
      applyTitleBarGlass(enabled);
      updateTitleBarGlassParams(p);
      // 回顶按钮：同样的折射 + hover 位移
      initBackToTopGlass();
      applyBackToTopGlass(enabled);
      updateBackToTopGlassParams(p);
      startBackTopObserver();
      // Toast（通知）：同样的折射
      initToastGlass();
      applyToastGlass(enabled);
      updateToastGlassParams(p);
      startToastObserver();
    });
    ctx.dispose(function () {
      if (liquidGlass) { liquidGlass.unmount(); liquidGlass = null; }
      if (titleBarLightCleanup) { titleBarLightCleanup(); }
      if (titleBarObserver) { titleBarObserver.disconnect(); titleBarObserver = null; }
      clearTimeout(titleBarObsTimer);
      titleBtnManagers.forEach(function (m) { m.unmount(); });
      titleBtnManagers = [];
      titleBtnSeen = new Set();
      titleBtnActive = false;
      closeBtnManager = null;
      unwrapTitleButtons();
      document.documentElement.classList.remove('lg-titlebar-on');
      backTopManagers.forEach(function (m) { m.unmount(); });
      backTopManagers = [];
      backTopHovered = new WeakSet();
      backTopActive = false;
      if (backTopObserver) { backTopObserver.disconnect(); backTopObserver = null; }
      if (typeof cancelAnimationFrame === 'function' && backTopObsTimer) cancelAnimationFrame(backTopObsTimer);
      else clearTimeout(backTopObsTimer);
      backTopObsTimer = null;
      toastManagers.forEach(function (m) { m.unmount(); });
      toastManagers = [];
      toastActive = false;
      if (toastObserver) { toastObserver.disconnect(); toastObserver = null; }
      if (typeof cancelAnimationFrame === 'function' && toastObsTimer) cancelAnimationFrame(toastObsTimer);
      else clearTimeout(toastObsTimer);
      toastObsTimer = null;
    });
  }

  var barObserver = new MutationObserver(function () {
    if (document.querySelector('.player-bar') && !liquidGlass) {
      tryInitLiquidGlass();
    }
  });
  barObserver.observe(document.body, { childList: true, subtree: true });
  tryInitLiquidGlass();
  ctx.dispose(function () { barObserver.disconnect(); });

  // ── 悬浮底栏 + 沉浸式标题栏（miuix 已启用则跳过）──
  if (!document.documentElement.classList.contains('miuix-bg-active')) {
    ctx.css.inject(
      '.player-bar { padding-left:16px !important; padding-right:16px !important; border-radius:9999px !important; }' +
      '.player-bar-container { position:absolute !important; bottom:8px !important; left:0 !important; right:0 !important; padding-bottom:0 !important; }' +
      '.player-bar .rounded-\\[10px\\] { border-radius:9999px !important; }' +
      '.back-to-top-btn { bottom:100px !important; }' +
// 沉浸式标题栏：标题栏悬浮覆盖内容，内容可滑入其下方（sliver 详情页保持原布局）
      // 顶部 20px padding + 全宽顶部渐变遮罩（一直可见）
      '.main-content { position:relative !important; }' +
      '.main-content:not(:has(.sliver-header-root)) { padding-top:20px !important; }' +
      '.main-content:not(:has(.sliver-header-root))::before { content:""; position:absolute; top:0 !important; left:0 !important; right:0 !important; height:64px; background:linear-gradient(to bottom, var(--color-bg-main) 0%, var(--color-bg-main) 35%, transparent); pointer-events:none; z-index:199; }' +
      '.main-content:not(:has(.sliver-header-root)) > .title-bar { position:absolute !important; top:0 !important; left:0 !important; right:0 !important; z-index:200 !important; }'
    );
    // 页面底部留白 + 顶部留白（和 miuix 一致：选 .scrollbar-view 加 spacer）
    function addSpacers() {
      var views = document.querySelectorAll('.scrollbar-view:not(.lg-padded)');
      views.forEach(function(v) {
        v.classList.add('lg-padded');
        // 底部留白：悬浮底栏不遮挡内容
        var s = document.createElement('div');
        s.style.cssText = 'height:100px;flex-shrink:0;pointer-events:none;';
        v.appendChild(s);

      });
    }
    addSpacers();
    var spObs = new MutationObserver(addSpacers);
    spObs.observe(document.body, { childList: true, subtree: true });
    ctx.dispose(function() { spObs.disconnect(); });
  }

  // ── 设置面板 ──
  var vue = ctx.vue;
  var defineComponent = vue.defineComponent;
  var defineAsyncComponent = vue.defineAsyncComponent;
  var h = vue.h;
  var reactive = vue.reactive;
  var Switch = defineAsyncComponent(ctx.ui.components.Switch);
  var Slider = defineAsyncComponent(ctx.ui.components.Slider);
  var Button = defineAsyncComponent(ctx.ui.components.Button);

  var SettingsPanel = defineComponent({
    setup: function () {
      var _isMiuix4 = document.documentElement.classList.contains('miuix-bg-active');
      var _mc4 = _isMiuix4 ? 'settings-card' : '';
      var _mi4 = _isMiuix4 ? 'settings-item' : '';
      var _onBg4 = _isMiuix4 ? 'var(--miuix-on-background)' : 'var(--color-text-main)';
      var draft = reactive({
        enabled: false,
        thickness: liquidGlassParams.thickness,
        bezelWidth: liquidGlassParams.bezelWidth,
        ior: liquidGlassParams.ior,
        specularOpacity: liquidGlassParams.specularOpacity,
        bgOpacity: liquidGlassParams.bgOpacity,
        blurAmount: liquidGlassParams.blurAmount,
        borderEnabled: liquidGlassParams.borderEnabled,
        glowEnabled: liquidGlassParams.glowEnabled,
        glowWhite: liquidGlassParams.glowWhite,
        glowRadius: liquidGlassParams.glowRadius,
      });

      ctx.storage.get('liquid-glass-settings').then(function (saved) {
        if (saved && typeof saved === 'object') {
          draft.enabled = typeof saved.enabled === 'boolean' ? saved.enabled : false;
          if (typeof saved.thickness === 'number') draft.thickness = saved.thickness;
          if (typeof saved.bezelWidth === 'number') draft.bezelWidth = saved.bezelWidth;
          if (typeof saved.ior === 'number') draft.ior = saved.ior;
          if (typeof saved.specularOpacity === 'number') draft.specularOpacity = saved.specularOpacity;
          if (typeof saved.bgOpacity === 'number') draft.bgOpacity = saved.bgOpacity;
          if (typeof saved.blurAmount === 'number') draft.blurAmount = saved.blurAmount;
          if (typeof saved.borderEnabled === 'boolean') draft.borderEnabled = saved.borderEnabled;
          if (typeof saved.glowEnabled === 'boolean') draft.glowEnabled = saved.glowEnabled;
          if (typeof saved.glowWhite === 'boolean') draft.glowWhite = saved.glowWhite;
          if (typeof saved.glowRadius === 'number') draft.glowRadius = saved.glowRadius;
        }
      });

      function saveNow() {
        ctx.storage.set('liquid-glass-settings', {
          enabled: draft.enabled,
          thickness: draft.thickness,
          bezelWidth: draft.bezelWidth,
          ior: draft.ior,
          specularOpacity: draft.specularOpacity,
          bgOpacity: draft.bgOpacity,
          blurAmount: draft.blurAmount,
          borderEnabled: draft.borderEnabled,
          glowEnabled: draft.glowEnabled,
          glowWhite: draft.glowWhite,
          glowRadius: draft.glowRadius,
        });
        if (liquidGlass) {
          if (draft.enabled) {
            liquidGlass.updateParams({
              thickness: draft.thickness,
              bezelWidth: draft.bezelWidth,
              ior: draft.ior,
              specularOpacity: draft.specularOpacity,
              bgOpacity: draft.bgOpacity,
              blurAmount: draft.blurAmount,
              borderEnabled: draft.borderEnabled,
              glowEnabled: draft.glowEnabled,
              glowWhite: draft.glowWhite,
              glowRadius: draft.glowRadius,
            });
            liquidGlass.mount();
          } else {
            liquidGlass.unmount();
          }
          liquidGlassParams.thickness = draft.thickness;
          liquidGlassParams.bezelWidth = draft.bezelWidth;
          liquidGlassParams.ior = draft.ior;
          liquidGlassParams.specularOpacity = draft.specularOpacity;
          liquidGlassParams.bgOpacity = draft.bgOpacity;
          liquidGlassParams.blurAmount = draft.blurAmount;
          liquidGlassParams.borderEnabled = draft.borderEnabled;
          liquidGlassParams.glowEnabled = draft.glowEnabled;
          liquidGlassParams.glowWhite = draft.glowWhite;
          liquidGlassParams.glowRadius = draft.glowRadius;
        }
        // 标题栏按钮同步（内部会按开关决定包装/unwrap、挂载类）
        applyTitleBarGlass(draft.enabled);
        updateTitleBarGlassParams({
          thickness: draft.thickness,
          bezelWidth: draft.bezelWidth,
          ior: draft.ior,
          specularOpacity: draft.specularOpacity,
          bgOpacity: draft.bgOpacity,
          blurAmount: draft.blurAmount,
          borderEnabled: draft.borderEnabled,
          glowEnabled: draft.glowEnabled,
          glowWhite: draft.glowWhite,
          glowRadius: draft.glowRadius,
        });
        // 回顶按钮同步
        initBackToTopGlass();
        if (draft.enabled) {
          backTopActive = true;
          backTopManagers.forEach(function (m) { if (!m._active) m.mount(); });
        } else {
          backTopActive = false;
          backTopManagers.forEach(function (m) { m.unmount(); });
        }
        updateBackToTopGlassParams({
          thickness: draft.thickness,
          bezelWidth: draft.bezelWidth,
          ior: draft.ior,
          specularOpacity: draft.specularOpacity,
          bgOpacity: draft.bgOpacity,
          blurAmount: draft.blurAmount,
          borderEnabled: draft.borderEnabled,
          glowEnabled: draft.glowEnabled,
          glowWhite: draft.glowWhite,
          glowRadius: draft.glowRadius,
        });
        // Toast 同步
        initToastGlass();
        if (draft.enabled) {
          toastActive = true;
          toastManagers.forEach(function (m) { if (!m._active) m.mount(); });
        } else {
          toastActive = false;
          toastManagers.forEach(function (m) { m.unmount(); });
        }
        updateToastGlassParams({
          thickness: draft.thickness,
          bezelWidth: draft.bezelWidth,
          ior: draft.ior,
          specularOpacity: draft.specularOpacity,
          bgOpacity: draft.bgOpacity,
          blurAmount: draft.blurAmount,
          borderEnabled: draft.borderEnabled,
          glowEnabled: draft.glowEnabled,
          glowWhite: draft.glowWhite,
          glowRadius: draft.glowRadius,
        });
      }

      return function () {
        return h('div', { style: 'display: flex; flex-direction: column; align-items: center; gap: 8px;' }, [
          h('div', { class: _mc4, style: _isMiuix4 ? 'border-radius: 16px; overflow: hidden; width: 100%;' : 'width:100%' }, [
            // 折射开关
            h('div', { class: _mi4, style: 'display: flex; justify-content: space-between; align-items: center; gap: 12px;' }, [
              h('div', { style: 'flex: 1; min-width: 0;' }, [
                h('div', { style: 'font-weight: 600; font-size: 14px; color: ' + _onBg4 + '; line-height: 1.4;' }, '液态玻璃折射'),
                h('div', { style: 'font-size: 12px; color: ' + _onBg4 + '; opacity: 0.6; margin-top: 2px; line-height: 1.5;' }, '底部音乐控件的 iOS 风格液态玻璃折射效果'),
              ]),
              h(Switch, {
                modelValue: draft.enabled,
                'onUpdate:modelValue': function (v) { draft.enabled = Boolean(v); saveNow(); },
              }),
            ]),
            // 参数调节
            draft.enabled ? h('div', { class: _mc4, style: _isMiuix4 ? 'border-radius: 0; overflow: visible; width: 100%; padding: 4px 0;' : 'width:100%' }, [
              // 玻璃厚度
              h('div', { class: _mi4, style: 'display: flex; flex-direction: column; gap: 4px; padding-top: 8px; padding-bottom: 8px;' }, [
                h('div', { style: 'font-weight: 500; font-size: 13px; color: ' + _onBg4 + ';' }, '玻璃厚度'),
                h(Slider, {
                  modelValue: draft.thickness, min: 10, max: 200, step: 5,
                  showValue: true, valueSuffix: 'px',
                  'onUpdate:modelValue': function (v) { draft.thickness = Number(v); saveNow(); },
                }),
              ]),
              // 折射区域
              h('div', { class: _mi4, style: 'display: flex; flex-direction: column; gap: 4px; padding-top: 8px; padding-bottom: 8px;' }, [
                h('div', { style: 'font-weight: 500; font-size: 13px; color: ' + _onBg4 + ';' }, '折射区域'),
                h(Slider, {
                  modelValue: draft.bezelWidth, min: 2, max: 60, step: 2,
                  showValue: true, valueSuffix: 'px',
                  'onUpdate:modelValue': function (v) { draft.bezelWidth = Number(v); saveNow(); },
                }),
              ]),
              // 折射率
              h('div', { class: _mi4, style: 'display: flex; flex-direction: column; gap: 4px; padding-top: 8px; padding-bottom: 8px;' }, [
                h('div', { style: 'font-weight: 500; font-size: 13px; color: ' + _onBg4 + ';' }, '折射率 (IOR)'),
                h(Slider, {
                  modelValue: draft.ior, min: 1.0, max: 3.0, step: 0.05,
                  showValue: true, valueSuffix: '',
                  'onUpdate:modelValue': function (v) { draft.ior = Number(v); saveNow(); },
                }),
              ]),
              // 高光强度
              h('div', { class: _mi4, style: 'display: flex; flex-direction: column; gap: 4px; padding-top: 8px; padding-bottom: 8px;' }, [
                h('div', { style: 'font-weight: 500; font-size: 13px; color: ' + _onBg4 + ';' }, '高光强度'),
                h(Slider, {
                  modelValue: Math.round(draft.specularOpacity * 100), min: 0, max: 100, step: 5,
                  showValue: true, valueSuffix: '%',
                  'onUpdate:modelValue': function (v) { draft.specularOpacity = Number(v) / 100; saveNow(); },
                }),
              ]),
              // 背景不透明度
              h('div', { class: _mi4, style: 'display: flex; flex-direction: column; gap: 4px; padding-top: 8px; padding-bottom: 8px;' }, [
                h('div', { style: 'font-weight: 500; font-size: 13px; color: ' + _onBg4 + ';' }, '背景不透明度'),
                h(Slider, {
                  modelValue: draft.bgOpacity, min: 0, max: 100, step: 5,
                  showValue: true, valueSuffix: '%',
                  'onUpdate:modelValue': function (v) { draft.bgOpacity = Number(v); saveNow(); },
                }),
              ]),
              // 模糊度
              h('div', { class: _mi4, style: 'display: flex; flex-direction: column; gap: 4px; padding-top: 8px; padding-bottom: 8px;' }, [
                h('div', { style: 'font-weight: 500; font-size: 13px; color: ' + _onBg4 + ';' }, '模糊度'),
                h(Slider, {
                  modelValue: draft.blurAmount, min: 0, max: 20, step: 1,
                  showValue: true, valueSuffix: 'px',
                  'onUpdate:modelValue': function (v) { draft.blurAmount = Number(v); saveNow(); },
                }),
              ]),
            ]) : null,
            // 描边
            h('div', { class: _mi4, style: 'display: flex; justify-content: space-between; align-items: center; gap: 12px;' }, [
              h('div', { style: 'flex: 1; min-width: 0;' }, [
                h('div', { style: 'font-weight: 600; font-size: 14px; color: ' + _onBg4 + '; line-height: 1.4;' }, 'ios27样式描边'),
                h('div', { style: 'font-size: 12px; color: ' + _onBg4 + '; opacity: 0.6; margin-top: 2px; line-height: 1.5;' }, '音乐控件添加ios27的左右黑色与上下白色高光'),
              ]),
              h(Switch, {
                modelValue: draft.borderEnabled,
                'onUpdate:modelValue': function (v) { draft.borderEnabled = Boolean(v); saveNow(); },
              }),
            ]),
            // 光效
            h('div', { class: _mi4, style: 'display: flex; justify-content: space-between; align-items: center; gap: 12px;' }, [
              h('div', { style: 'flex: 1; min-width: 0;' }, [
                h('div', { style: 'font-weight: 600; font-size: 14px; color: ' + _onBg4 + '; line-height: 1.4;' }, '鸿蒙样式光效'),
                h('div', { style: 'font-size: 12px; color: ' + _onBg4 + '; opacity: 0.6; margin-top: 2px; line-height: 1.5;' }, '音乐控件添加鼠标悬停时跟随鼠标的鸿蒙样式光效与边框描边'),
              ]),
              h(Switch, {
                modelValue: draft.glowEnabled,
                'onUpdate:modelValue': function (v) { draft.glowEnabled = Boolean(v); saveNow(); },
              }),
            ]),
            // 光效颜色
            draft.glowEnabled ? h('div', { class: _mi4, style: 'display: flex; justify-content: space-between; align-items: center; gap: 12px;' }, [
              h('div', { style: 'flex: 1; min-width: 0;' }, [
                h('div', { style: 'font-weight: 600; font-size: 14px; color: ' + _onBg4 + '; line-height: 1.4;' }, '白色光效'),
                h('div', { style: 'font-size: 12px; color: ' + _onBg4 + '; opacity: 0.6; margin-top: 2px; line-height: 1.5;' }, '开启使用白色光效，浅色模式下可能不明显'),
              ]),
              h(Switch, {
                modelValue: draft.glowWhite,
                'onUpdate:modelValue': function (v) { draft.glowWhite = Boolean(v); saveNow(); },
              }),
            ]) : null,
            // 光效半径
            draft.glowEnabled ? h('div', { class: _mi4, style: 'display: flex; flex-direction: column; gap: 4px; padding-top: 8px; padding-bottom: 8px;' }, [
              h('div', { style: 'font-weight: 500; font-size: 13px; color: ' + _onBg4 + ';' }, '光效半径'),
              h(Slider, {
                modelValue: draft.glowRadius, min: 60, max: 400, step: 10,
                showValue: true, valueSuffix: 'px',
                'onUpdate:modelValue': function (v) { draft.glowRadius = Number(v); saveNow(); },
              }),
            ]) : null,
            // GitHub
            h('div', { class: _mi4, style: 'display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;' }, [
              h('div', { style: 'flex: 1; min-width: 0;' }, [
                h('div', { style: 'font-weight: 600; font-size: 14px; color: ' + _onBg4 + '; line-height: 1.4;' }, 'GitHub'),
                h('div', { style: 'font-size: 12px; color: ' + _onBg4 + '; opacity: 0.6; margin-top: 2px; line-height: 1.5;' }, '点击跳转 GitHub 地址，欢迎 Star'),
              ]),
              h(Button, {
                size: 'xs',
                onClick: function () { window.open('https://github.com/SkyShadowHero/echo-liquid-glass', '_blank'); },
              }, 'Github'),
            ]),
          ]),
        ]);
      };
    },
  });

  ctx.ui.settings.define({
    title: '液态玻璃折射 设置',
    component: SettingsPanel,
  });
}

// ── 插件停用 ──
export function deactivate(ctx) {
  // dispose 回调自动处理清理
}