
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
  // 可选：直接用固定颜色作背景（不用 CSS 变量），用于播放按钮这类需要微调灰调的场景
  this._bgColor = opts.bgColor || null;
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
  // 'both'：普通径向光晕 + 鸿蒙边框光效；'border'：只保留鸿蒙边框光效
  this._glowStyle = opts.glowStyle || 'both';
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
    // 普通径向光晕 + 鸿蒙边框光效
    var self3 = this;
    if (this._glowStyle !== 'border') {
      this._el.classList.add('liquid-glass-glow');
      this._applyGlowColor();
      this._applyGlowRadius();
      this._glowPending = false;
      this._glowHandler = function (e) {
        self3._glowX = e.clientX;
        self3._glowY = e.clientY;
        if (self3._glowPending) return;
        self3._glowPending = true;
        var el = self3._el;
        requestAnimationFrame(function () {
          var rect = el.getBoundingClientRect();
          el.style.setProperty('--glow-x', (self3._glowX - rect.left) + 'px');
          el.style.setProperty('--glow-y', (self3._glowY - rect.top) + 'px');
          self3._glowPending = false;
        });
      };
      this._el.addEventListener('mousemove', this._glowHandler);
    }
    this._el.classList.add('liquid-glass-border-glow');
    if (this._glowStyle === 'border') {
      // 只保留鸿蒙边框光效：--glow-color/--glow-radius 由光效跟随统一管理
      this._applyGlowColor();
      this._applyGlowRadius();
    }
    // 常显描边用内联样式强制保留（压过主应用 button:focus 的 box-shadow:none）
    this._applyGlowBorderInline();
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
    this._el.style.removeProperty('box-shadow');
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
    this._applyGlowBorderInline();
  }
    if ('glowEnabled' in opts) {
    this._glowEnabled = opts.glowEnabled;
    if (this._el) {
      // 鸿蒙光效开关同时控制光晕与边框光效（描边），border 模式只保留边框光效
      this._el.classList.toggle('liquid-glass-glow', this._glowEnabled && this._glowStyle !== 'border');
      this._el.classList.toggle('liquid-glass-border-glow', this._glowEnabled);
      if (this._glowEnabled) {
        if (this._glowStyle !== 'border') {
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
        } else {
          if (this._glowHandler) {
            this._el.removeEventListener('mousemove', this._glowHandler);
            this._glowHandler = null;
          }
        }
        this._applyGlowColor();
      } else {
        if (this._glowHandler) {
          this._el.removeEventListener('mousemove', this._glowHandler);
          this._glowHandler = null;
        }
      }
    }
    this._applyGlowBorderInline();
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
  var bg;
  if (this._bgColor) {
    bg = 'color-mix(in srgb, ' + this._bgColor + ' ' + this._bgOpacity + '%, transparent)';
  } else {
    bg = 'color-mix(in srgb, var(' + this._bgVar + ') ' + this._bgOpacity + '%, transparent)';
  }
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

// 鸿蒙描边改用内联样式强制设置：
// 主应用在 @layer 内用 button:focus { box-shadow: none !important } 清描边，
// layer 内 !important 优先级高于未分层 !important，纯 CSS 压不过它；
// 内联样式 !important 优先级最高，且不受 Vue 重写 className 影响，点击聚焦后描边不消失
LiquidGlassManager.prototype._applyGlowBorderInline = function () {
  if (!this._el) return;
  if (!this._glowEnabled) {
    this._el.style.removeProperty('box-shadow');
    return;
  }
  // 播放按钮/回顶等鸿蒙描边：1.5px 白边；同时开启 ios27 描边时叠加左右黑/上下白高光
  var border = this._borderEnabled;
  if (border) {
    this._el.style.setProperty(
      'box-shadow',
      'inset 0.5px 0 0 0 rgba(0,0,0,0.2), ' +
      'inset -0.5px 0 0 0 rgba(0,0,0,0.2), ' +
      'inset 0 0.5px 0 0 rgba(255,255,255,0.2), ' +
      'inset 0 -0.5px 0 0 rgba(255,255,255,0.2), ' +
      'inset 0 0 0 1.5px rgba(255, 255, 255, 0.4)',
      'important'
    );
  } else {
    this._el.style.setProperty(
      'box-shadow',
      'inset 0 0 0 1.5px rgba(255, 255, 255, 0.4)',
      'important'
    );
  }
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

  // ── 底部播放按钮复用液态玻璃：独立滤镜 + 光效参数 ──
  var playerToggleSeq = 0;
  var playerToggleActive = false;
  var playerToggleManagers = [];
  var playerToggleSeen = new Set();
  var playerToggleLightCleanup = null;

  // 按钮光效半径要比设置的更小（小按钮用更小的光晕）
  function buttonGlowRadius() {
    return Math.max(30, Math.round(liquidGlassParams.glowRadius * 0.4));
  }

  function initPlayerToggleGlass() {
    Array.prototype.forEach.call(
      document.querySelectorAll('.player-bar .player-toggle'),
      function (btn) {
        // 已包装过的按钮跳过；但如果元素曾被 App 移除又重新挂载（如 v-if 重建），
        // 元素已不在 wrap 子树内，需要重新包装
        if (playerToggleSeen.has(btn) && btn.parentElement && btn.parentElement.classList.contains('liquid-glass-btn-wrap')) return;
        // 刚插入/未布局时尺寸可能为 0，跳过并安排稍后重试
        if (btn.offsetWidth < 4 || btn.offsetHeight < 4) {
          clearTimeout(playerToggleRetryTimer);
          playerToggleRetryTimer = setTimeout(ensurePlayerToggleMounted, 100);
          return;
        }
        playerToggleSeen.add(btn);
        // 打一层 wrapper：hover/点击放缩放在 wrap 上，避免与按钮自身 backdrop-filter 冲突导致折射消失
        var wrap = document.createElement('div');
        wrap.className = 'liquid-glass-btn-wrap';
        wrap.style.cssText = 'width:' + btn.offsetWidth + 'px;height:' + btn.offsetHeight + 'px;';
        // 记录按钮原始父节点，关闭开关时把按钮移回原处、删除 wrap，恢复原始布局
        wrap.__lgBtn = btn;
        wrap.__lgParent = btn.parentNode;
        btn.parentNode.insertBefore(wrap, btn);
        wrap.appendChild(btn);
        var seq = playerToggleSeq++;
        // 播放按钮：只保留鸿蒙边框光效（无普通径向光晕）
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
          glowStyle: 'border',
          svgId: 'liquid-glass-playertoggle-svg-' + seq,
          filterId: 'liquid-glass-playertoggle-filter-' + seq,
          bgVar: '--color-bg-main',
        });
        playerToggleManagers.push(mgr);
      }
    );
  }

  // 把播放按钮从 wrap 中移回原父节点并删除 wrap，恢复原始 DOM 布局
  function unwrapPlayerToggles() {
    Array.prototype.forEach.call(document.querySelectorAll('.player-bar .liquid-glass-btn-wrap'), function (wrap) {
      var btn = wrap.__lgBtn;
      var parent = wrap.__lgParent || wrap.parentNode;
      if (btn && parent) {
        parent.insertBefore(btn, wrap);
        wrap.remove();
      }
    });
  }

  function applyPlayerToggleGlass(enabled) {
    if (enabled === playerToggleActive) return;
    playerToggleActive = enabled;
    if (enabled) {
      initPlayerToggleGlass();
      bindPlayerToggleGlow();
      playerToggleManagers.forEach(function (m) { m.mount(); });
    } else {
      if (playerToggleLightCleanup) { playerToggleLightCleanup(); }
      clearTimeout(playerToggleObsTimer);
      clearTimeout(playerToggleRetryTimer);
      playerToggleManagers.forEach(function (m) { m.unmount(); });
      playerToggleManagers = [];
      playerToggleSeen = new Set();
      playerToggleSeq = 0;
      unwrapPlayerToggles();
    }
    // 播放按钮的所有 CSS 修改（尺寸/圆角/光效）只在开启折射时生效
    document.documentElement.classList.toggle('lg-playertoggle-on', enabled);
    // 光效开启状态同步到根类：常显描边不依赖按钮挂载类（点击重渲染后也不会闪失）
    document.documentElement.classList.toggle(
      'lg-playertoggle-glow-on',
      enabled && !!liquidGlassParams.glowEnabled
    );
  }

  function updatePlayerToggleGlassParams(p) {
    p = p || {};
    var g = {};
    for (var k in p) {
      if (Object.prototype.hasOwnProperty.call(p, k)) g[k] = p[k];
    }
    if ('glowRadius' in g) { g.glowRadius = buttonGlowRadius(); }
    // 光效开启状态同步到根类（常显描边不依赖按钮挂载类）
    document.documentElement.classList.toggle(
      'lg-playertoggle-glow-on',
      playerToggleActive && !!g.glowEnabled
    );
    playerToggleManagers.forEach(function (m) { m.updateParams(g); });
  }

  // 点击/切换窗口状态后应用可能重建播放按钮 DOM，重建后重新包装并挂载，
  // 避免折射与描边在新按钮上消失；开关关闭时不包装
  var playerToggleObserver = null;
  var playerToggleObsTimer = null;
  var playerToggleRetryTimer = null;
  function ensurePlayerToggleMounted() {
    if (!playerToggleActive) return;
    // 按钮被移除时清理对应 manager，避免残留
    playerToggleManagers = playerToggleManagers.filter(function (m) {
      if (!m._el || !m._el.isConnected) {
        m.unmount();
        return false;
      }
      return true;
    });
    // 按钮被应用重建/移出 wrap 后，残留的空 wrap 会占位并挡住布局，统一清理
    Array.prototype.forEach.call(document.querySelectorAll('.player-bar .liquid-glass-btn-wrap'), function (w) {
      var b = w.__lgBtn;
      if (!b || !b.isConnected || !w.contains(b)) {
        w.remove();
      }
    });
    initPlayerToggleGlass();
    bindPlayerToggleGlow();
    playerToggleManagers.forEach(function (m) {
      if (!m._el || !m._el.isConnected) return;
      // Vue 重渲染会用 className 全量重写，清掉我们加的 liquid-glass-* 类，
      // 检测到丢失时先卸载再重挂（重新加类/折射/光效）
      if (!m._el.classList.contains('liquid-glass-refraction')) {
        m.unmount();
        m.mount();
      } else if (!m._active) {
        m.mount();
      }
    });
  }
  function startPlayerToggleObserver() {
    if (playerToggleObserver) return;
    // 播放按钮是动态挂载的，观察 body：除 DOM 增删外还要监听 class 属性，
    // Vue 重渲染会重写按钮 className，清掉插件挂载的液态玻璃类，需要检测后重挂
    var holder = document.body;
    if (!holder) return;
    playerToggleObserver = new MutationObserver(function () {
      clearTimeout(playerToggleObsTimer);
      playerToggleObsTimer = setTimeout(ensurePlayerToggleMounted, 16);
    });
    playerToggleObserver.observe(holder, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  // 光效跟随光标：光标划过底部播放按钮时点亮，并让按钮朝光标方向轻微位移。
  // 绑定在 document 上，播放按钮动态挂载后同样生效
  function bindPlayerToggleGlow() {
    if (playerToggleLightCleanup || !playerToggleManagers.length) return;
    var barEl = document;
    function light(e) {
      playerToggleManagers.forEach(function (m) {
        var el = m._el;
        if (!el) return;
        var wrap = el.parentElement;
        var rect = el.getBoundingClientRect();
        var pad = 10;
        var dx = e.clientX - rect.left;
        var dy = e.clientY - rect.top;
        if (dx < -pad || dx > rect.width + pad || dy < -pad || dy > rect.height + pad) {
          el.classList.remove('lg-lit');
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
      playerToggleManagers.forEach(function (m) {
        if (!m._el) return;
        var el = m._el;
        el.classList.remove('lg-lit');
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
    playerToggleLightCleanup = function () {
      barEl.removeEventListener('mousemove', light);
      barEl.removeEventListener('mouseleave', unlight);
      unlight();
      playerToggleLightCleanup = null;
    };
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
      // 底部播放按钮：复用同一批液态玻璃参数
      startPlayerToggleObserver();
      applyPlayerToggleGlass(enabled);
      updatePlayerToggleGlassParams(p);
    });
    ctx.dispose(function () {
      if (liquidGlass) { liquidGlass.unmount(); liquidGlass = null; }
      if (playerToggleLightCleanup) { playerToggleLightCleanup(); }
      if (playerToggleObserver) { playerToggleObserver.disconnect(); playerToggleObserver = null; }
      clearTimeout(playerToggleObsTimer);
      playerToggleManagers.forEach(function (m) { m.unmount(); });
      playerToggleManagers = [];
      playerToggleSeen = new Set();
      playerToggleActive = false;
      unwrapPlayerToggles();
      document.documentElement.classList.remove('lg-playertoggle-on');
      document.documentElement.classList.remove('lg-playertoggle-glow-on');
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

  // ── 悬浮底栏沉浸（独立实现）──
  // 仅在宿主已通过「Miuix 主题」启用沉浸时才让位，否则自己实现，保证本插件单独使用也生效。
  // 注意：miuix-bg-active 只要装了 miuix 插件就会被加上，不能用来判断；
  // 用仅在 miuix 主题启用后才出现的 miuix-theme-active 判断。
  var LIQUID_LAYOUT_CSS =
    '.player-bar { padding-left:16px !important; padding-right:16px !important; border-radius:9999px !important;' +
    ' background-color: color-mix(in srgb, var(--surface-player-base) 80%, transparent) !important;' +
    ' -webkit-backdrop-filter: blur(20px) !important; backdrop-filter: blur(20px) !important;' +
    ' border-color: var(--border-subtle) !important;' +
    ' box-shadow: 0 10px 28px rgba(0,0,0,0.10), inset 0 1px 0 0 rgba(255,255,255,0.8), inset 0 -1px 0 0 rgba(255,255,255,0.8) !important; }' +
    'html.dark .player-bar {' +
    ' box-shadow: 0 10px 28px rgba(0,0,0,0.36), inset 0 1px 0 0 rgba(255,255,255,0.15), inset 0 -1px 0 0 rgba(255,255,255,0.15) !important; }' +
    '.player-bar-container { position:absolute !important; bottom:8px !important; left:0 !important; right:0 !important; padding-bottom:0 !important; }' +
    '/* β8: .main-player-panel 新增 overflow:hidden，容器 absolute 后面板高度塌成 0，会裁剪掉浮动底栏；放开裁剪 */' +
    '.main-player-panel { overflow: visible !important; }' +
    '/* 沉浸底栏：去掉 workspace 底部 gap 与内边距，让主内容延伸到窗口底部 */' +
    '.main-workspace { gap:0 !important; padding-bottom:0 !important; }' +
    '.player-bar .rounded-\\[10px\\] { border-radius:9999px !important; }' +
    '/* 新版 BackToTop 定位在包裹层（.absolute），按钮自身 bottom 无效，用 :has 抬到悬浮底栏之上 */' +
    '.absolute:has(> .back-to-top-btn) { bottom:100px !important; }' +
    '.settings-back-to-top { bottom:100px !important; }';

  function miuixThemeActive() {
    return document.documentElement.classList.contains('miuix-theme-active');
  }

  // 页面底部留白（选 .scrollbar-view / .listen-session 加 spacer）
  function addSpacers() {
    document.querySelectorAll('.scrollbar-view:not(.lg-padded)').forEach(function (v) {
      v.classList.add('lg-padded');
      var s = document.createElement('div');
      s.className = 'lg-spacer';
      s.style.cssText = 'height:100px;flex-shrink:0;pointer-events:none;';
      v.appendChild(s);
    });
    document.querySelectorAll('.listen-session:not(.lg-padded)').forEach(function (sess) {
      sess.classList.add('lg-padded');
      var s = document.createElement('div');
      s.className = 'lg-spacer';
      s.style.cssText = 'height:100px;flex-shrink:0;pointer-events:none;';
      sess.appendChild(s);
    });
  }
  function removeSpacers() {
    document.querySelectorAll('.lg-spacer').forEach(function (s) { s.remove(); });
    document.querySelectorAll('.lg-padded').forEach(function (v) { v.classList.remove('lg-padded'); });
  }

  var spObs = null;
  var liquidImmersiveOn = null;
  function applyLiquidImmersive(enabled) {
    if (enabled === liquidImmersiveOn) return;
    liquidImmersiveOn = enabled;
    ctx.css.inject(enabled ? LIQUID_LAYOUT_CSS : '', { id: 'layout' });
    if (enabled) {
      addSpacers();
      if (!spObs) {
        spObs = new MutationObserver(addSpacers);
        spObs.observe(document.body, { childList: true, subtree: true });
      }
    } else {
      if (spObs) { spObs.disconnect(); spObs = null; }
      removeSpacers();
    }
  }

  // 初始：Miuix 主题未启用时自己实现沉浸
  applyLiquidImmersive(!miuixThemeActive());
  // Miuix 主题启用/关闭时动态让位/接管
  var lgThemeObs = new MutationObserver(function () {
    applyLiquidImmersive(!miuixThemeActive());
  });
  lgThemeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  ctx.dispose(function () {
    lgThemeObs.disconnect();
    if (spObs) { spObs.disconnect(); spObs = null; }
  });

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
        // 底部播放按钮同步（内部会按开关决定包装/unwrap、挂载类）
        applyPlayerToggleGlass(draft.enabled);
        updatePlayerToggleGlassParams({
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