
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
function generateDisplacementMap(w, h, radius, bezelWidth, profile, maxDisp) {
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
  this._filterId = 'liquid-glass-refraction-filter';
  this._svgId = 'liquid-glass-refraction-svg';
  this._thickness = opts.thickness != null ? opts.thickness : 60;
  this._bezelWidth = opts.bezelWidth != null ? opts.bezelWidth : 40;
  this._ior = opts.ior != null ? opts.ior : 2.5;
  this._specularOpacity = opts.specularOpacity != null ? opts.specularOpacity : 0.2;
  this._bgOpacity = opts.bgOpacity != null ? opts.bgOpacity : 20;
  this._blurAmount = opts.blurAmount != null ? opts.blurAmount : 0;
  this._borderEnabled = opts.borderEnabled != null ? opts.borderEnabled : true;
  this._active = false;
  this._rebuildTimer = null;
  this._resizeObserver = null;
  this._svgEl = null;
}

LiquidGlassManager.prototype.mount = function () {
  if (!this._el) return;
  this._ensureSVG();
  this._rebuildFilter();
  this._applyBackdropFilter();
  this._applyCSS();
  var self = this;
  this._resizeObserver = new ResizeObserver(function () {
    self._scheduleRebuild();
  });
  this._resizeObserver.observe(this._el);
  this._el.classList.add('liquid-glass-refraction');
  if (this._borderEnabled) {
    this._el.classList.add('liquid-glass-border');
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
  var dispUrl = generateDisplacementMap(w, h, radius, safeBezel, profile, maxDisp);
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
  var bg = 'color-mix(in srgb, var(--miuix-background) ' + this._bgOpacity + '%, transparent)';
  this._el.style.setProperty('background', bg, 'important');
  // 刷新 backdrop-filter（模糊度可能变化）
  this._applyBackdropFilter();
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
    thickness: 60,
    bezelWidth: 40,
    ior: 2.5,
    specularOpacity: 0.2,
    bgOpacity: 20,
    blurAmount: 0,
    borderEnabled: true,
  };

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
    });
    ctx.storage.get('liquid-glass-settings').then(function (saved) {
      var enabled = saved && typeof saved.enabled === 'boolean' ? saved.enabled : true;
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
        liquidGlass.updateParams(p);
      }
    });
    ctx.dispose(function () {
      if (liquidGlass) { liquidGlass.unmount(); liquidGlass = null; }
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
      var draft = reactive({
        enabled: true,
        thickness: liquidGlassParams.thickness,
        bezelWidth: liquidGlassParams.bezelWidth,
        ior: liquidGlassParams.ior,
        specularOpacity: liquidGlassParams.specularOpacity,
        bgOpacity: liquidGlassParams.bgOpacity,
        blurAmount: liquidGlassParams.blurAmount,
        borderEnabled: liquidGlassParams.borderEnabled,
      });

      ctx.storage.get('liquid-glass-settings').then(function (saved) {
        if (saved && typeof saved === 'object') {
          draft.enabled = typeof saved.enabled === 'boolean' ? saved.enabled : true;
          if (typeof saved.thickness === 'number') draft.thickness = saved.thickness;
          if (typeof saved.bezelWidth === 'number') draft.bezelWidth = saved.bezelWidth;
          if (typeof saved.ior === 'number') draft.ior = saved.ior;
          if (typeof saved.specularOpacity === 'number') draft.specularOpacity = saved.specularOpacity;
          if (typeof saved.bgOpacity === 'number') draft.bgOpacity = saved.bgOpacity;
          if (typeof saved.blurAmount === 'number') draft.blurAmount = saved.blurAmount;
          if (typeof saved.borderEnabled === 'boolean') draft.borderEnabled = saved.borderEnabled;
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
        }
      }

      return function () {
        return h('div', { style: 'display: flex; flex-direction: column; align-items: center; gap: 8px;' }, [
          h('div', { class: 'settings-card', style: 'border-radius: 16px; overflow: hidden; width: 100%;' }, [
            // 折射开关
            h('div', { class: 'settings-item', style: 'display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;' }, [
              h('div', { style: 'flex: 1; min-width: 0;' }, [
                h('div', { style: 'font-weight: 600; font-size: 14px; color: var(--miuix-on-background); line-height: 1.4;' }, '液态玻璃折射'),
                h('div', { style: 'font-size: 12px; color: var(--miuix-on-background); opacity: 0.6; margin-top: 2px; line-height: 1.5;' }, '底部音乐控件的 iOS 风格液态玻璃折射效果'),
              ]),
              h(Switch, {
                modelValue: draft.enabled,
                'onUpdate:modelValue': function (v) { draft.enabled = Boolean(v); saveNow(); },
              }),
            ]),
            // 参数调节
            draft.enabled ? h('div', { class: 'settings-card', style: 'border-radius: 0; overflow: visible; width: 100%; padding: 4px 0;' }, [
              // 玻璃厚度
              h('div', { class: 'settings-item', style: 'display: flex; flex-direction: column; gap: 4px; padding-top: 8px; padding-bottom: 8px;' }, [
                h('div', { style: 'font-weight: 500; font-size: 13px; color: var(--miuix-on-background);' }, '玻璃厚度'),
                h(Slider, {
                  modelValue: draft.thickness, min: 10, max: 200, step: 5,
                  showValue: true, valueSuffix: 'px',
                  'onUpdate:modelValue': function (v) { draft.thickness = Number(v); saveNow(); },
                }),
              ]),
              // 折射区域
              h('div', { class: 'settings-item', style: 'display: flex; flex-direction: column; gap: 4px; padding-top: 8px; padding-bottom: 8px;' }, [
                h('div', { style: 'font-weight: 500; font-size: 13px; color: var(--miuix-on-background);' }, '折射区域'),
                h(Slider, {
                  modelValue: draft.bezelWidth, min: 2, max: 60, step: 2,
                  showValue: true, valueSuffix: 'px',
                  'onUpdate:modelValue': function (v) { draft.bezelWidth = Number(v); saveNow(); },
                }),
              ]),
              // 折射率
              h('div', { class: 'settings-item', style: 'display: flex; flex-direction: column; gap: 4px; padding-top: 8px; padding-bottom: 8px;' }, [
                h('div', { style: 'font-weight: 500; font-size: 13px; color: var(--miuix-on-background);' }, '折射率 (IOR)'),
                h(Slider, {
                  modelValue: draft.ior, min: 1.0, max: 3.0, step: 0.05,
                  showValue: true, valueSuffix: '',
                  'onUpdate:modelValue': function (v) { draft.ior = Number(v); saveNow(); },
                }),
              ]),
              // 高光强度
              h('div', { class: 'settings-item', style: 'display: flex; flex-direction: column; gap: 4px; padding-top: 8px; padding-bottom: 8px;' }, [
                h('div', { style: 'font-weight: 500; font-size: 13px; color: var(--miuix-on-background);' }, '高光强度'),
                h(Slider, {
                  modelValue: Math.round(draft.specularOpacity * 100), min: 0, max: 100, step: 5,
                  showValue: true, valueSuffix: '%',
                  'onUpdate:modelValue': function (v) { draft.specularOpacity = Number(v) / 100; saveNow(); },
                }),
              ]),
              // 背景不透明度
              h('div', { class: 'settings-item', style: 'display: flex; flex-direction: column; gap: 4px; padding-top: 8px; padding-bottom: 8px;' }, [
                h('div', { style: 'font-weight: 500; font-size: 13px; color: var(--miuix-on-background);' }, '背景不透明度'),
                h(Slider, {
                  modelValue: draft.bgOpacity, min: 0, max: 100, step: 5,
                  showValue: true, valueSuffix: '%',
                  'onUpdate:modelValue': function (v) { draft.bgOpacity = Number(v); saveNow(); },
                }),
              ]),
              // 模糊度
              h('div', { class: 'settings-item', style: 'display: flex; flex-direction: column; gap: 4px; padding-top: 8px; padding-bottom: 8px;' }, [
                h('div', { style: 'font-weight: 500; font-size: 13px; color: var(--miuix-on-background);' }, '模糊度'),
                h(Slider, {
                  modelValue: draft.blurAmount, min: 0, max: 20, step: 1,
                  showValue: true, valueSuffix: 'px',
                  'onUpdate:modelValue': function (v) { draft.blurAmount = Number(v); saveNow(); },
                }),
              ]),
            ]) : null,
            // 左右描边
            h('div', { class: 'settings-item', style: 'display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;' }, [
              h('div', { style: 'flex: 1; min-width: 0;' }, [
                h('div', { style: 'font-weight: 600; font-size: 14px; color: var(--miuix-on-background); line-height: 1.4;' }, '左右黑色描边'),
                h('div', { style: 'font-size: 12px; color: var(--miuix-on-background); opacity: 0.6; margin-top: 2px; line-height: 1.5;' }, '音乐控件左右两侧 0.5px 黑色描边'),
              ]),
              h(Switch, {
                modelValue: draft.borderEnabled,
                'onUpdate:modelValue': function (v) { draft.borderEnabled = Boolean(v); saveNow(); },
              }),
            ]),
            // GitHub
            h('div', { class: 'settings-item', style: 'display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;' }, [
              h('div', { style: 'flex: 1; min-width: 0;' }, [
                h('div', { style: 'font-weight: 600; font-size: 14px; color: var(--miuix-on-background); line-height: 1.4;' }, 'GitHub'),
                h('div', { style: 'font-size: 12px; color: var(--miuix-on-background); opacity: 0.6; margin-top: 2px; line-height: 1.5;' }, '点击跳转 GitHub 地址，欢迎 Star'),
              ]),
              h(Button, {
                class: 'settings-button github-star',
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
