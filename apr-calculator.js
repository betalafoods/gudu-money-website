/*!
 * APR Calculator 1.0.0 - drop-in web component, no dependencies.
 *
 * Works out the Annual Percentage Rate the way RBI's Key Facts Statement rules
 * require (circular RBI/2024-25/18, 15 April 2024): the internal rate of return
 * of the net disbursed amount (loan amount minus upfront fees and charges)
 * against the repayment schedule, on a reducing balance, annualised without
 * compounding. It reproduces RBI's own Annex B illustration exactly
 * (Rs 20,000 at 15% for 24 EMIs with Rs 400 of fees gives an APR of 17.07%).
 *
 * EMBED
 *   <script src="apr-calculator.js" defer></script>
 *   <apr-calculator lender="Your Company Private Limited"></apr-calculator>
 *
 * ATTRIBUTES (all optional)
 *   products  Tabs to show, in order. Default "emi,short".
 *   lender    Lender name used in the footnote.
 *   lock      Show these as fixed values instead of inputs: any of
 *             "rate,fee,gst,other" (use with your real pricing in CONFIG).
 *   theme     "dark" for dark page backgrounds. Default is light.
 *
 * PRODUCTS AND PRICING
 *   Edit CONFIG below, or set window.APR_CALCULATOR_CONFIG before this script
 *   loads; it is merged over CONFIG, so you only list what changes.
 *
 * STYLING - CSS custom properties on the element, for example
 *   apr-calculator { --apr-accent: #0e4a59; --apr-font: "Manrope", sans-serif; }
 *   --apr-font  --apr-font-size  --apr-accent  --apr-on-accent  --apr-surface
 *   --apr-field  --apr-track  --apr-text  --apr-text-2  --apr-line  --apr-border
 *   --apr-radius  --apr-panel  --apr-panel-text  --apr-panel-text-2  --apr-hero
 *   --apr-color-received  --apr-color-interest  --apr-color-fees
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* CONFIG                                                             */
  /* Rate units: 'pa' = % a year, 'pm' = % a month, 'pd' = % a day.     */
  /* rate.value is in rate.unit. Slider entries are [min, max, step].   */
  /* ------------------------------------------------------------------ */
  var CONFIG = {
    gstRate: 18,
    products: {
      emi: {
        type: 'emi',                      // equal monthly instalments, reducing balance
        title: 'Personal loan',
        subtitle: 'Monthly EMIs',
        amount: { min: 50000, max: 200000, step: 1000, value: 100000 },
        tenure: { min: 12, max: 36, step: 1, value: 24 },           // months
        rate: { unit: 'pa', value: 35, slider: { pa: [12, 60, 0.5], pm: [1, 5, 0.05], pd: [0.03, 0.17, 0.005] } },
        fee: { mode: 'pct', value: 2.5, slider: [0, 6, 0.25] },      // % of loan amount
        gst: true,
        other: 0
      },
      short: {
        type: 'bullet',                   // one repayment of principal + interest at the end
        title: 'Short-term loan',
        subtitle: 'Repay once',
        amount: { min: 2000, max: 25000, step: 500, value: 5000 },
        tenure: { min: 7, max: 50, step: 1, value: 30 },            // days
        rate: { unit: 'pd', value: 0.1, slider: { pa: [0, 120, 1], pm: [0, 10, 0.1], pd: [0, 0.3, 0.01] } },
        fee: { mode: 'pct', value: 5, slider: [0, 15, 0.5] },
        gst: true,
        other: 0
      }
    },
    // Hard limits for typed values (sliders follow each product's range).
    limits: { amount: [100, 100000000], months: [1, 360], days: [1, 365], ratePa: [0, 1095], feePct: [0, 50] }
  };

  var FACTOR = { pa: 1, pm: 12, pd: 365 };
  var UNIT_WORD = { pa: 'a year', pm: 'a month', pd: 'a day' };
  var UNIT_DP = { pa: 2, pm: 3, pd: 3 };

  /* ------------------------------------------------------------------ */
  /* Maths (pure functions, also exported for testing)                  */
  /* ------------------------------------------------------------------ */
  function round2(x) {
    var y = x * 100;
    return Math.round(y + (y >= 0 ? 1e-7 : -1e-7)) / 100;
  }

  function roundTo(x, dp) {
    var f = Math.pow(10, dp);
    return Math.round(x * f + (x >= 0 ? 1e-7 : -1e-7)) / f;
  }

  function emiExact(P, r, n) {
    if (r === 0) return P / n;
    var f = Math.pow(1 + r, n);
    return (P * r * f) / (f - 1);
  }

  // Periodic rate r such that sum(flows[k] / (1 + r)^(k + 1)) = net.
  function irrPeriodic(net, flows) {
    function gap(r) {
      var pv = 0, d = 1;
      for (var k = 0; k < flows.length; k++) { d /= 1 + r; pv += flows[k] * d; }
      return pv - net;
    }
    var at0 = gap(0);
    if (Math.abs(at0) < 1e-9) return 0;
    var lo, hi;
    if (at0 > 0) { lo = 0; hi = 1; while (gap(hi) > 0 && hi < 1e6) hi *= 2; }
    else { lo = -0.99; hi = 0; }
    for (var i = 0; i < 200 && hi - lo > 1e-15; i++) {
      var mid = (lo + hi) / 2;
      if (gap(mid) > 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /*
   * o = { type: 'emi' | 'bullet', amount, tenure (months | days), ratePa (% a year),
   *       feeMode: 'pct' | 'flat', feeValue, gst: bool, gstRate, other }
   */
  function computeLoan(o) {
    var P = Number(o.amount), n = Number(o.tenure), ratePa = Number(o.ratePa);
    var pf = o.feeMode === 'flat' ? round2(Number(o.feeValue) || 0) : round2((P * (Number(o.feeValue) || 0)) / 100);
    var gstRate = o.gstRate == null ? 18 : Number(o.gstRate);
    var gst = o.gst ? round2((pf * gstRate) / 100) : 0;
    var other = round2(Number(o.other) || 0);
    var fees = round2(pf + gst + other);
    var net = round2(P - fees);
    var res = {
      ok: false, type: o.type === 'bullet' ? 'bullet' : 'emi', amount: P, tenure: n, ratePa: ratePa,
      processingFee: pf, gstOnFee: gst, otherCharges: other, fees: fees, net: net
    };
    if (!(P > 0) || !(n >= 1) || !(ratePa >= 0) || !(fees >= 0)) { res.error = 'input'; return res; }
    if (net <= 0) { res.error = 'fees'; return res; }

    var rows = [], totalInterest = 0, instalment, periodic, apr;
    if (res.type === 'bullet') {
      var interest = round2((P * ratePa * n) / 36500);
      instalment = round2(P + interest);
      rows.push({ no: 1, due: n, opening: P, principal: P, interest: interest, instalment: instalment });
      totalInterest = interest;
      periodic = instalment / net - 1;               // rate over the whole term
      apr = periodic * (365 / n) * 100;
    } else {
      var r = ratePa / 1200, flows = [], bal = P;
      instalment = round2(emiExact(P, r, n));
      for (var k = 1; k <= n; k++) {
        var intr = round2(bal * r);
        var prin = k === n ? bal : Math.min(bal, round2(instalment - intr));
        var inst = round2(prin + intr);
        rows.push({ no: k, due: k, opening: bal, principal: prin, interest: intr, instalment: inst });
        flows.push(inst);
        totalInterest = round2(totalInterest + intr);
        bal = round2(bal - prin);
      }
      periodic = irrPeriodic(net, flows);             // monthly rate
      apr = periodic * 12 * 100;
    }
    res.ok = true;
    res.instalment = instalment;
    res.count = res.type === 'bullet' ? 1 : n;
    res.totalInterest = totalInterest;
    res.totalRepay = round2(P + totalInterest);
    res.costOfCredit = round2(totalInterest + fees);
    res.periodicRate = periodic;
    res.apr = apr;
    res.rows = rows;
    return res;
  }

  var API = { CONFIG: CONFIG, computeLoan: computeLoan, irrPeriodic: irrPeriodic, emiExact: emiExact, round2: round2 };
  if (typeof module === 'object' && module.exports) module.exports = API;
  global.APRCalculator = API;

  if (typeof HTMLElement === 'undefined' || typeof customElements === 'undefined') return;

  /* ------------------------------------------------------------------ */
  /* Formatting                                                          */
  /* ------------------------------------------------------------------ */
  var inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  var fixed2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nfCache = {};
  function num(x, dp) {
    var f = nfCache[dp] || (nfCache[dp] = new Intl.NumberFormat('en-IN', { maximumFractionDigits: dp }));
    return f.format(roundTo(x, dp) || 0);
  }
  function rupees(x) { return '₹' + inr0.format(Math.round(x) || 0); }
  function pct2(x) { return fixed2.format(roundTo(x, 2) || 0); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function parseNum(s) {
    var t = String(s).replace(/[^0-9.\-]/g, '');
    if (t === '' || t === '-' || t === '.') return NaN;
    return Number(t);
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function rateWords(ratePa, unit) {
    var yr = num(ratePa, 2) + '% a year';
    if (unit === 'pa' || !FACTOR[unit]) return yr;
    return num(ratePa / FACTOR[unit], UNIT_DP[unit]) + '% ' + UNIT_WORD[unit] + ' (' + yr + ')';
  }
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function merge(into, from) {
    if (!isObj(from)) return into;
    Object.keys(from).forEach(function (k) {
      if (isObj(from[k]) && isObj(into[k])) merge(into[k], from[k]);
      else into[k] = isObj(from[k]) ? merge({}, from[k]) : from[k];
    });
    return into;
  }

  /* ------------------------------------------------------------------ */
  /* Styles                                                              */
  /* ------------------------------------------------------------------ */
  var CSS = [
    ':host{display:block;color-scheme:light;',
    '--_surface:var(--apr-surface,#ffffff);--_field:var(--apr-field,#eef4f2);--_track:var(--apr-track,#d3dfdb);',
    '--_text:var(--apr-text,#0a1a1f);--_text-2:var(--apr-text-2,#3d5a61);--_line:var(--apr-line,#d9e3df);',
    '--_accent:var(--apr-accent,#0e4a59);--_on-accent:var(--apr-on-accent,#ffffff);--_focus:var(--apr-focus,var(--_accent));',
    '--_danger:var(--apr-danger,#b42318);--_panel:var(--apr-panel,#103d48);--_panel-text:var(--apr-panel-text,#eef5f2);',
    '--_panel-text-2:var(--apr-panel-text-2,#c3d8dc);--_panel-line:var(--apr-panel-line,rgba(238,245,242,.16));',
    '--_hero:var(--apr-hero,#f4b860);--_c1:var(--apr-color-received,#19a7ad);--_c2:var(--apr-color-interest,#e4633f);',
    '--_c3:var(--apr-color-fees,#9085e9);--_radius:var(--apr-radius,24px)}',
    ':host([theme="dark"]){color-scheme:dark;--_surface:var(--apr-surface,#0a2c36);--_field:var(--apr-field,#06222b);',
    '--_track:var(--apr-track,#2c5560);--_text:var(--apr-text,#eef5f2);--_text-2:var(--apr-text-2,#b9cfd4);',
    '--_line:var(--apr-line,rgba(238,245,242,.14));--_accent:var(--apr-accent,#f4b860);--_on-accent:var(--apr-on-accent,#0a1a1f);',
    '--_danger:var(--apr-danger,#ffa08f)}',
    ':host([hidden]){display:none}',
    '*,*::before,*::after{box-sizing:border-box}',
    '[hidden]{display:none!important}',
    '.frame{container:apr/inline-size}',
    '.root{font-family:var(--apr-font,inherit);font-size:var(--apr-font-size,1rem);line-height:1.5;color:var(--_text);',
    'background:var(--_surface);border:var(--apr-border,1px solid var(--_line));border-radius:var(--_radius);padding:28px;',
    '-webkit-font-smoothing:antialiased;text-align:left}',
    'button,input,select{font:inherit;color:inherit}',
    ':focus-visible{outline:2px solid var(--_focus);outline-offset:2px}',

    /* tabs */
    '.tabs{display:flex;gap:6px;padding:6px;margin:0 0 24px;background:var(--_field);border-radius:16px}',
    '.tab{flex:1 1 0;min-width:0;display:grid;gap:1px;text-align:left;padding:10px 14px;border:0;border-radius:11px;',
    'background:transparent;color:var(--_text-2);cursor:pointer;transition:background-color .2s,color .2s,box-shadow .2s}',
    '.tab:hover{color:var(--_text)}',
    '.tab[aria-pressed="true"]{background:var(--_surface);color:var(--_text);box-shadow:0 1px 2px rgba(6,34,43,.08),0 6px 16px -8px rgba(6,34,43,.28)}',
    '.tab-title{font-weight:700;line-height:1.3}',
    '.tab-sub{font-size:.875em;line-height:1.3;color:var(--_text-2)}',

    /* layout */
    '.grid{display:grid;gap:24px}',
    '@container apr (min-width:720px){.grid{grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);gap:36px;align-items:start}}',

    /* fields */
    '.field{padding:16px 0;border-top:1px solid var(--_line)}',
    '.form>.field:first-child{padding-top:0;border-top:0}',
    '.field-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px}',
    '.label{font-weight:650}',
    '.controls{display:flex;align-items:center;gap:8px;margin-left:auto}',
    '.entry{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border:1px solid transparent;',
    'border-radius:12px;background:var(--_field);transition:border-color .15s,box-shadow .15s}',
    '.entry:focus-within{border-color:var(--_focus);box-shadow:0 0 0 3px color-mix(in srgb,var(--_focus) 18%,transparent)}',
    '.entry.invalid{border-color:var(--_danger)}',
    '.entry input{width:calc(var(--w,6) * 1ch + 4px);min-width:0;padding:0;border:0;outline:0;background:transparent;',
    'font-weight:700;font-size:1.0625em;text-align:right;font-variant-numeric:tabular-nums}',
    '.affix{color:var(--_text-2);font-weight:600;white-space:nowrap}',
    '.unit-wrap{position:relative;display:inline-flex}',
    '.unit-wrap::after{content:"";position:absolute;right:4px;top:50%;width:6px;height:6px;border-right:2px solid var(--_text-2);',
    'border-bottom:2px solid var(--_text-2);transform:translateY(-70%) rotate(45deg);pointer-events:none}',
    '.unit{-webkit-appearance:none;appearance:none;border:0;background:transparent;padding:6px 18px 6px 2px;',
    'font-weight:600;color:var(--_text-2);cursor:pointer;outline:0}',
    '.unit option{color:#0a1a1f;background:#fff}',
    '.mode{display:inline-flex;padding:3px;gap:2px;border-radius:11px;background:var(--_field)}',
    '.mode button{min-width:38px;min-height:38px;padding:0 10px;border:0;border-radius:8px;background:transparent;',
    'color:var(--_text-2);font-weight:700;cursor:pointer}',
    '.mode button[aria-pressed="true"]{background:var(--_accent);color:var(--_on-accent)}',
    '.slider{-webkit-appearance:none;appearance:none;display:block;width:100%;height:6px;margin:20px 0 10px;border-radius:3px;',
    'background:linear-gradient(90deg,var(--_accent) var(--fill,0%),var(--_track) var(--fill,0%));cursor:pointer}',
    '.slider::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:var(--_surface);',
    'border:4px solid var(--_accent);box-shadow:0 2px 8px rgba(6,34,43,.25)}',
    '.slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:var(--_surface);border:4px solid var(--_accent);',
    'box-shadow:0 2px 8px rgba(6,34,43,.25)}',
    '.slider:focus-visible{outline-offset:8px}',
    '.scale{display:flex;justify-content:space-between;gap:8px;font-size:.8125em;color:var(--_text-2);font-variant-numeric:tabular-nums}',
    '.hint{margin:8px 0 0;font-size:.875em;color:var(--_text-2)}',
    '.err{margin:8px 0 0;font-size:.875em;font-weight:600;color:var(--_danger)}',
    '.field.check{padding:12px 0 14px}',
    '.check-row{display:flex;align-items:center;gap:10px;min-height:32px;font-weight:600;cursor:pointer}',
    '.check-row input{flex:none;width:20px;height:20px;margin:0;accent-color:var(--_accent);cursor:pointer}',
    '.field.locked{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 16px}',
    '.fixed{font-weight:700;text-align:right}',

    /* results panel */
    '.panel{position:relative;padding:26px;border-radius:calc(var(--_radius) - 6px);background:var(--_panel);color:var(--_panel-text);',
    'border:1px solid var(--apr-panel-border,transparent)}',
    '.hero-label{margin:0;font-weight:600;color:var(--_panel-text-2)}',
    '.hero{margin:6px 0 12px;display:flex;align-items:baseline;gap:3px;font-size:3.4em;font-weight:800;line-height:1;',
    'letter-spacing:-.045em;color:var(--_hero)}',
    '.hero-pct{font-size:.55em;letter-spacing:0}',
    '.note{margin:0 0 22px;color:var(--_panel-text-2);font-size:.9375em;max-width:46ch}',
    '.key{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline;gap:4px 12px;padding:16px 0 14px;',
    'border-top:1px solid var(--_panel-line)}',
    '.key-label{font-weight:600}',
    '.key strong{font-size:1.5em;font-weight:800;letter-spacing:-.02em}',
    '.times{margin-left:6px;color:var(--_panel-text-2);font-weight:600}',
    '.bar-wrap{position:relative}',
    '.bar{display:flex;gap:2px;height:12px;margin:4px 0 16px;border-radius:4px;overflow:hidden}',
    '.seg{flex:1 1 0;min-width:4px}',
    '.s-received{background:var(--_c1)}.s-interest{background:var(--_c2)}.s-fees{background:var(--_c3)}',
    '.tip{position:absolute;z-index:3;bottom:100%;left:0;transform:translate(-50%,-6px);padding:6px 10px;border-radius:8px;',
    'background:var(--_panel-text);color:var(--_panel);font-size:.8125em;font-weight:700;white-space:nowrap;pointer-events:none;',
    'box-shadow:0 6px 20px rgba(0,0,0,.25)}',
    '.rows{margin:0;display:grid;gap:10px}',
    '.row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}',
    '.row dt{display:flex;align-items:center;gap:10px;color:var(--_panel-text-2);transition:color .15s}',
    '.row dd{margin:0;font-weight:700;font-variant-numeric:tabular-nums}',
    '.row.hot dt{color:var(--_panel-text)}',
    '.sw{flex:none;width:10px;height:10px;border-radius:3px}',
    '.total{margin-top:4px;padding-top:14px;border-top:1px solid var(--_panel-line)}',
    '.total dt{color:var(--_panel-text);font-weight:700}',
    '.total dd{font-size:1.125em}',
    '.msg{margin:0 0 14px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.08);font-weight:600}',
    '.is-error .hero,.is-error .note,.is-error .key,.is-error .bar-wrap,.is-error .rows{opacity:.3}',

    /* details */
    '.more{margin-top:20px;border-top:1px solid var(--_line)}',
    '.more+.more{margin-top:0}',
    '.more summary{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 0;font-weight:700;',
    'cursor:pointer;list-style:none}',
    '.more summary::-webkit-details-marker{display:none}',
    '.more summary::after{content:"";flex:none;width:9px;height:9px;margin-right:6px;border-right:2px solid var(--_text-2);',
    'border-bottom:2px solid var(--_text-2);transform:translateY(-3px) rotate(45deg);transition:transform .2s}',
    '.more[open] summary::after{transform:translateY(2px) rotate(-135deg)}',
    '.more-body{padding:0 0 18px}',
    '.table-wrap{max-height:380px;overflow:auto;border:1px solid var(--_line);border-radius:12px}',
    'table{width:100%;border-collapse:collapse;font-size:.875em;font-variant-numeric:tabular-nums}',
    'th,td{padding:8px 12px;text-align:right;white-space:nowrap}',
    'thead th{position:sticky;top:0;z-index:1;background:var(--_surface);color:var(--_text-2);font-weight:600;',
    'box-shadow:inset 0 -1px 0 var(--_line)}',
    'tbody tr+tr td{border-top:1px solid var(--_line)}',
    'tfoot th,tfoot td{position:sticky;bottom:0;background:var(--_field);font-weight:700;box-shadow:inset 0 1px 0 var(--_line)}',
    'th:first-child,td:first-child{text-align:left}',
    '.kfs td{white-space:normal;vertical-align:top}',
    '.kfs th:first-child,.kfs td:first-child{width:3.5em}',
    '.kfs td:nth-child(2){text-align:left}',
    '.kfs .sub td{color:var(--_text-2)}',
    '.kfs .sub td:nth-child(2){padding-left:28px}',
    '.kfs .apr td{font-weight:800}',
    '.method{margin:14px 0 0;font-size:.9375em;color:var(--_text-2);max-width:72ch}',
    '.formula{display:block;margin-top:6px;font-weight:700;color:var(--_text)}',
    '.foot{margin:18px 0 0;font-size:.8125em;color:var(--_text-2);max-width:80ch}',
    '.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',

    '@container apr (max-width:520px){.root{padding:18px;border-radius:calc(var(--_radius) - 6px)}.panel{padding:20px}',
    '.hero{font-size:3em}.tab{padding:8px 10px}th,td{padding:7px 8px}.kfs .sub td:nth-child(2){padding-left:18px}}',
    '@container apr (max-width:420px){.root{padding:16px}.tabs{padding:5px}.tab{padding:8px}',
    '.tab-title{font-size:.875em}.tab-sub{font-size:.8125em}}',
    '@media (prefers-reduced-motion:reduce){*{transition:none!important}}',
    '@media (forced-colors:active){.seg,.sw{forced-color-adjust:none}',
    '.tab[aria-pressed="true"],.mode button[aria-pressed="true"]{outline:2px solid CanvasText}}'
  ].join('');

  /* ------------------------------------------------------------------ */
  /* Component                                                           */
  /* ------------------------------------------------------------------ */
  function initialState(p) {
    return {
      amount: p.amount.value,
      tenure: p.tenure.value,
      rateUnit: p.rate.unit,
      ratePa: p.rate.value * (FACTOR[p.rate.unit] || 1),
      feeMode: p.fee.mode === 'flat' ? 'flat' : 'pct',
      feeValue: p.fee.value,
      gst: !!p.gst,
      other: p.other || 0
    };
  }

  function fill(sl) {
    var min = Number(sl.min), max = Number(sl.max), v = Number(sl.value);
    var p = max > min ? ((v - min) / (max - min)) * 100 : 0;
    sl.style.setProperty('--fill', clamp(p, 0, 100) + '%');
  }

  var SHELL =
    '<div class="frame"><div class="root">' +
    '<div class="tabs" data-ref="tabs" role="group" aria-label="Loan type"></div>' +
    '<div class="grid">' +
    '<div class="form" data-ref="form" role="group" aria-label="Loan details"></div>' +
    '<section class="panel" data-ref="panel" aria-label="Your results">' +
    '<p class="msg" data-o="msg" role="alert" hidden></p>' +
    '<p class="hero-label" id="apr-label">Annual percentage rate (APR)</p>' +
    '<p class="hero"><span data-o="apr"></span><span class="hero-pct" data-o="aprPct">%</span></p>' +
    '<p class="note" data-o="note"></p>' +
    '<div class="key"><span class="key-label" data-o="instLabel"></span>' +
    '<span><strong data-o="inst"></strong><span class="times" data-o="times"></span></span></div>' +
    '<div class="bar-wrap"><div class="bar" data-ref="bar" role="img">' +
    '<span class="seg s-received" data-seg="received"></span><span class="seg s-interest" data-seg="interest"></span>' +
    '<span class="seg s-fees" data-seg="fees"></span></div><div class="tip" data-ref="tip" hidden></div></div>' +
    '<dl class="rows">' +
    '<div class="row" data-row="received"><dt><i class="sw s-received"></i>Amount you receive</dt><dd data-o="net"></dd></div>' +
    '<div class="row" data-row="interest"><dt><i class="sw s-interest"></i>Interest</dt><dd data-o="interest"></dd></div>' +
    '<div class="row" data-row="fees"><dt><i class="sw s-fees"></i>Fees and charges</dt><dd data-o="fees"></dd></div>' +
    '<div class="row total" data-o="totalRow"><dt>Total you repay</dt><dd data-o="total"></dd></div>' +
    '</dl></section></div>' +
    '<details class="more" data-ref="schedule"><summary data-o="schedSummary">Repayment schedule</summary>' +
    '<div class="more-body" data-ref="schedBody"></div></details>' +
    '<details class="more" data-ref="kfs"><summary>How this APR is worked out</summary>' +
    '<div class="more-body" data-ref="kfsBody"></div></details>' +
    '<p class="foot" data-o="foot"></p>' +
    '<p class="sr-only" aria-live="polite" data-o="live"></p>' +
    '</div></div>';

  var SEG_LABEL = { received: 'Amount you receive', interest: 'Interest', fees: 'Fees and charges' };

  class AprCalculator extends HTMLElement {
    static get observedAttributes() { return ['products', 'lock', 'lender', 'theme']; }

    constructor() {
      super();
      this._shadow = this.attachShadow({ mode: 'open' });
      this._cfg = merge(merge({}, CONFIG), global.APR_CALCULATOR_CONFIG || {});
      this._state = {};
      var self = this;
      Object.keys(this._cfg.products).forEach(function (k) { self._state[k] = initialState(self._cfg.products[k]); });
      this._built = false;
    }

    connectedCallback() { if (!this._built) this._build(); }

    attributeChangedCallback() { if (this._built) this._build(); }

    _build() {
      var self = this, cfg = this._cfg;
      var wanted = (this.getAttribute('products') || '').split(',').map(function (s) { return s.trim(); })
        .filter(function (k) { return k && cfg.products[k]; });
      this._keys = wanted.length ? wanted : Object.keys(cfg.products);
      if (this._keys.indexOf(this._active) < 0) this._active = this._keys[0];
      var locks = {};
      (this.getAttribute('lock') || '').split(',').forEach(function (s) { if (s.trim()) locks[s.trim()] = true; });
      this._locks = locks;

      this._shadow.innerHTML = '<style>' + CSS + '</style>' + SHELL;
      this._ref = {}; this._o = {};
      this._shadow.querySelectorAll('[data-ref]').forEach(function (el) { self._ref[el.getAttribute('data-ref')] = el; });
      this._shadow.querySelectorAll('[data-o]').forEach(function (el) { self._o[el.getAttribute('data-o')] = el; });

      var lender = (this.getAttribute('lender') || '').trim();
      this._o.foot.textContent = 'Indicative figures, not a loan offer. Your actual APR, fees and charges are in the Key Facts ' +
        'Statement ' + (lender ? lender + ' gives you' : 'you receive') + ' before you sign. Penal and late-payment charges ' +
        'are not part of APR.';

      this._ref.schedule.addEventListener('toggle', function () { if (self._ref.schedule.open) self._renderSchedule(); });
      this._ref.kfs.addEventListener('toggle', function () { if (self._ref.kfs.open) self._renderKfs(); });
      this._bindBar();
      this._renderTabs();
      this._renderForm();
      this._built = true;
      this.update();
    }

    _product() { return this._cfg.products[this._active]; }
    _s() { return this._state[this._active]; }

    /* ---------- tabs ---------- */
    _renderTabs() {
      var self = this, tabs = this._ref.tabs;
      if (this._keys.length < 2) { tabs.hidden = true; return; }
      tabs.hidden = false;
      tabs.innerHTML = this._keys.map(function (k) {
        var p = self._cfg.products[k];
        return '<button type="button" class="tab" data-tab="' + esc(k) + '" aria-pressed="' + (k === self._active) + '">' +
          '<span class="tab-title">' + esc(p.title || k) + '</span>' +
          (p.subtitle ? '<span class="tab-sub">' + esc(p.subtitle) + '</span>' : '') + '</button>';
      }).join('');
      tabs.querySelectorAll('.tab').forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-tab');
          if (k === self._active) return;
          self._active = k;
          tabs.querySelectorAll('.tab').forEach(function (t) { t.setAttribute('aria-pressed', String(t === b)); });
          self._renderForm();
          self.update();
        });
      });
    }

    /* ---------- fields ---------- */
    _defs() {
      var p = this._product(), s = this._s(), L = this._cfg.limits, lk = this._locks;
      var bullet = p.type === 'bullet', defs = [];
      defs.push({
        key: 'amount', label: 'Loan amount', pre: '₹', dp: 0, group: true, width: 9, mode: 'numeric',
        slider: [p.amount.min, p.amount.max, p.amount.step], scale: [rupees(p.amount.min), rupees(p.amount.max)],
        hard: L.amount, err: 'Enter an amount from ' + rupees(L.amount[0]) + ' to ' + rupees(L.amount[1]) + '.'
      });
      var tl = bullet ? L.days : L.months, tu = bullet ? 'days' : 'months';
      defs.push({
        key: 'tenure', label: 'Repay over', post: tu, dp: 0, width: 3, mode: 'numeric',
        slider: [p.tenure.min, p.tenure.max, p.tenure.step], scale: [p.tenure.min + ' ' + tu, p.tenure.max + ' ' + tu],
        hard: tl, err: 'Enter ' + tl[0] + ' to ' + tl[1] + ' ' + tu + '.'
      });
      var f = FACTOR[s.rateUnit], rs = (p.rate.slider && p.rate.slider[s.rateUnit]) || [0, 100 / f, 0.01];
      var dp = UNIT_DP[s.rateUnit];
      defs.push({
        key: 'rate', label: 'Interest rate', post: '%', unitSelect: true, dp: dp, width: 5, mode: 'decimal',
        slider: rs, scale: [num(rs[0], 3) + '%', num(rs[1], 3) + '%'],
        hard: [L.ratePa[0] / f, L.ratePa[1] / f], locked: lk.rate, fixed: rateWords(s.ratePa, s.rateUnit),
        err: 'Enter a rate from ' + num(L.ratePa[0] / f, dp) + '% to ' + num(L.ratePa[1] / f, dp) + '% ' + UNIT_WORD[s.rateUnit] + '.'
      });
      if (s.feeMode === 'flat') {
        var fr = this._flatFeeRange();
        defs.push({
          key: 'fee', label: 'Processing fee', pre: '₹', feeToggle: true, dp: 0, group: true, width: 7, mode: 'numeric',
          slider: fr, scale: ['₹0', rupees(fr[1])], hard: [0, L.amount[1]], locked: lk.fee, fixed: rupees(s.feeValue),
          err: 'Enter a fee of ₹0 or more.'
        });
      } else {
        var ps = p.fee.slider || [0, 10, 0.25];
        defs.push({
          key: 'fee', label: 'Processing fee', post: '%', feeToggle: true, dp: 2, width: 5, mode: 'decimal',
          slider: ps, scale: [num(ps[0], 2) + '%', num(ps[1], 2) + '%'], hard: L.feePct, locked: lk.fee,
          fixed: num(s.feeValue, 2) + '% of the loan amount',
          err: 'Enter a fee from ' + L.feePct[0] + '% to ' + L.feePct[1] + '% of the loan amount.'
        });
      }
      defs.push({
        key: 'gst', check: true, label: 'Add ' + this._cfg.gstRate + '% GST on the processing fee', locked: lk.gst,
        fixed: s.gst ? this._cfg.gstRate + '% GST on the fee, included' : 'No GST added'
      });
      defs.push({
        key: 'other', label: 'Other upfront charges', pre: '₹', dp: 0, group: true, width: 7, mode: 'numeric',
        hint: 'Insurance, stamp duty or documentation charges taken before you receive the money.',
        hard: [0, L.amount[1]], locked: lk.other, fixed: rupees(s.other), err: 'Enter ₹0 or more.'
      });
      return defs;
    }

    _flatFeeRange() {
      var p = this._product(), s = this._s();
      var maxPct = (p.fee.slider || [0, 10])[1];
      var step = s.amount >= 50000 ? 100 : 10;
      var max = Math.max(step * 10, Math.ceil((s.amount * maxPct) / 100 / step) * step);
      return [0, max, step];
    }

    _fmt(v, d) {
      if (d.group) return inr0.format(Math.round(v) || 0);
      return String(roundTo(v, d.dp));
    }

    _get(key) {
      var s = this._s();
      if (key === 'rate') return roundTo(s.ratePa / FACTOR[s.rateUnit], UNIT_DP[s.rateUnit]);
      if (key === 'fee') return s.feeValue;
      return s[key];
    }

    _set(key, v) {
      var s = this._s();
      if (key === 'rate') s.ratePa = v * FACTOR[s.rateUnit];
      else if (key === 'fee') s.feeValue = v;
      else s[key] = v;
    }

    _fieldHTML(d) {
      if (d.locked) {
        return '<div class="field locked" data-key="' + d.key + '"><span class="label">' +
          esc(d.check ? 'GST on processing fee' : d.label) + '</span><span class="fixed">' + esc(d.fixed) + '</span></div>';
      }
      if (d.check) {
        return '<div class="field check" data-key="gst"><label class="check-row"><input type="checkbox" data-in="gst"' +
          (this._s().gst ? ' checked' : '') + '><span>' + esc(d.label) + '</span></label></div>';
      }
      var id = 'in-' + d.key, s = this._s();
      var h = '<div class="field" data-key="' + d.key + '"><div class="field-row">' +
        '<label class="label" for="' + id + '">' + esc(d.label) + '</label><div class="controls">';
      if (d.feeToggle) {
        h += '<div class="mode" role="group" aria-label="Processing fee as">' +
          '<button type="button" data-mode="pct" aria-pressed="' + (s.feeMode === 'pct') + '" aria-label="Percent of loan amount">%</button>' +
          '<button type="button" data-mode="flat" aria-pressed="' + (s.feeMode === 'flat') + '" aria-label="Rupee amount">₹</button></div>';
      }
      h += '<div class="entry">' + (d.pre ? '<span class="affix" aria-hidden="true">' + d.pre + '</span>' : '') +
        '<input id="' + id + '" data-in="' + d.key + '" type="text" inputmode="' + d.mode + '" autocomplete="off" ' +
        'spellcheck="false" enterkeyhint="done" style="--w:' + d.width + '" value="' + esc(this._fmt(this._get(d.key), d)) + '"' +
        (d.hint ? ' aria-describedby="hint-' + d.key + '"' : '') + '>' +
        (d.post ? '<span class="affix">' + esc(d.post) + '</span>' : '');
      if (d.unitSelect) {
        h += '<span class="unit-wrap"><select class="unit" data-unit aria-label="Interest rate period">' +
          ['pa', 'pm', 'pd'].map(function (u) {
            return '<option value="' + u + '"' + (u === s.rateUnit ? ' selected' : '') + '>' + UNIT_WORD[u] + '</option>';
          }).join('') + '</select></span>';
      }
      h += '</div></div></div>';
      if (d.slider) {
        h += '<input class="slider" type="range" data-sl="' + d.key + '" min="' + d.slider[0] + '" max="' + d.slider[1] +
          '" step="' + d.slider[2] + '" value="' + this._get(d.key) + '" aria-label="' + esc(d.label) + '">' +
          '<div class="scale" aria-hidden="true"><span>' + esc(d.scale[0]) + '</span><span>' + esc(d.scale[1]) + '</span></div>';
      }
      if (d.hint) h += '<p class="hint" id="hint-' + d.key + '">' + esc(d.hint) + '</p>';
      h += '<p class="err" id="err-' + d.key + '" hidden>' + esc(d.err) + '</p></div>';
      return h;
    }

    _renderForm() {
      var self = this, form = this._ref.form, defs = this._defs();
      this._d = {};
      defs.forEach(function (d) { self._d[d.key] = d; });
      form.innerHTML = defs.map(function (d) { return self._fieldHTML(d); }).join('');

      form.querySelectorAll('input[data-sl]').forEach(function (sl) {
        fill(sl);
        self._valueText(sl);
        sl.addEventListener('input', function () { self._onSlide(sl.getAttribute('data-sl'), sl); });
      });
      form.querySelectorAll('input[data-in]').forEach(function (inp) {
        var key = inp.getAttribute('data-in');
        if (key === 'gst') {
          inp.addEventListener('change', function () { self._s().gst = inp.checked; self.update(); });
          return;
        }
        inp.addEventListener('input', function () { self._onType(key, inp); });
        inp.addEventListener('change', function () { self._onCommit(key, inp); });
        inp.addEventListener('blur', function () { self._onCommit(key, inp); });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') self._onCommit(key, inp); });
      });
      var unit = form.querySelector('select[data-unit]');
      if (unit) {
        unit.addEventListener('change', function () {
          self._s().rateUnit = unit.value;
          self._renderForm();
          var u = self._ref.form.querySelector('select[data-unit]');
          if (u) u.focus();
          self.update();
        });
      }
      form.querySelectorAll('button[data-mode]').forEach(function (b) {
        b.addEventListener('click', function () { self._setFeeMode(b.getAttribute('data-mode')); });
      });
    }

    _slider(key) { return this._ref.form.querySelector('input[data-sl="' + key + '"]'); }
    _input(key) { return this._ref.form.querySelector('input[data-in="' + key + '"]'); }

    _valueText(sl) {
      var d = this._d[sl.getAttribute('data-sl')];
      if (!d) return;
      var v = Number(sl.value);
      sl.setAttribute('aria-valuetext', (d.pre || '') + this._fmt(v, d) + (d.post ? ' ' + d.post : '') +
        (d.unitSelect ? ' ' + UNIT_WORD[this._s().rateUnit] : ''));
    }

    _invalid(key, bad) {
      var inp = this._input(key), err = this._ref.form.querySelector('#err-' + key);
      if (!inp) return;
      var d = this._d[key], ids = (bad ? ['err-' + key] : []).concat(d && d.hint ? ['hint-' + key] : []);
      inp.closest('.entry').classList.toggle('invalid', bad);
      if (bad) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
      if (ids.length) inp.setAttribute('aria-describedby', ids.join(' ')); else inp.removeAttribute('aria-describedby');
      if (err) err.hidden = !bad;
    }

    _syncSlider(key, v) {
      var sl = this._slider(key);
      if (!sl) return;
      sl.value = v;
      fill(sl);
      this._valueText(sl);
    }

    _onType(key, inp) {
      if (inp !== this._input(key)) return;
      var d = this._d[key], v = parseNum(inp.value);
      var ok = isFinite(v) && v >= d.hard[0] && v <= d.hard[1];
      this._invalid(key, !ok);
      if (!ok) return;
      if (d.dp === 0) v = Math.round(v);
      if (v === this._get(key)) return;
      this._set(key, v);
      this._syncSlider(key, v);
      this.update();
    }

    _onCommit(key, inp) {
      var d = this._d[key];
      if (!d || inp !== this._input(key)) return;
      var v = parseNum(inp.value);
      if (!isFinite(v)) v = this._get(key);
      v = clamp(v, d.hard[0], d.hard[1]);
      v = d.dp === 0 ? Math.round(v) : roundTo(v, d.dp);
      if (v !== this._get(key)) this._set(key, v);
      inp.value = this._fmt(this._get(key), d);
      this._invalid(key, false);
      this._syncSlider(key, this._get(key));
      this.update();
    }

    _onSlide(key, sl) {
      var d = this._d[key], v = Number(sl.value);
      this._set(key, v);
      var inp = this._input(key);
      if (inp) inp.value = this._fmt(v, d);
      this._invalid(key, false);
      fill(sl);
      this._valueText(sl);
      this.update();
    }

    _setFeeMode(mode) {
      var s = this._s();
      if (s.feeMode === mode) return;
      if (mode === 'flat') s.feeValue = Math.round((s.amount * s.feeValue) / 100);
      else s.feeValue = roundTo((s.feeValue / s.amount) * 100, 2);
      s.feeMode = mode;
      this._renderForm();
      var b = this._ref.form.querySelector('button[data-mode="' + mode + '"]');
      if (b) b.focus();
      this.update();
    }

    _syncFlatFee() {
      var sl = this._slider('fee');
      if (!sl || this._s().feeMode !== 'flat') return;
      var r = this._flatFeeRange();
      if (Number(sl.max) === r[1]) return;
      sl.max = r[1];
      sl.step = r[2];
      sl.value = this._s().feeValue;
      fill(sl);
      var scale = sl.nextElementSibling;
      if (scale && scale.lastElementChild) scale.lastElementChild.textContent = rupees(r[1]);
      this._d.fee.slider = r;
    }

    /* ---------- results ---------- */
    update() {
      if (!this._built) return;
      var p = this._product(), s = this._s(), o = this._o, self = this;
      var res = computeLoan({
        type: p.type, amount: s.amount, tenure: s.tenure, ratePa: s.ratePa, feeMode: s.feeMode,
        feeValue: s.feeValue, gst: s.gst, gstRate: this._cfg.gstRate, other: s.other
      });
      res.rateUnit = s.rateUnit;
      this._res = res;
      this._syncFlatFee();
      var bullet = p.type === 'bullet';

      o.schedSummary.textContent = bullet ? 'Repayment schedule' : 'Repayment schedule (' + s.tenure + ' EMIs)';
      if (!res.ok) {
        this._ref.panel.classList.add('is-error');
        o.msg.hidden = false;
        o.msg.textContent = res.error === 'fees'
          ? 'Fees and charges of ' + rupees(res.fees) + ' would use up the whole loan. Lower the processing fee or other charges.'
          : 'Check the highlighted values.';
        o.apr.textContent = '–';
        o.aprPct.hidden = true;
        if (this._ref.schedule.open) this._renderSchedule();
        if (this._ref.kfs.open) this._renderKfs();
        return;
      }
      this._ref.panel.classList.remove('is-error');
      o.msg.hidden = true;
      o.aprPct.hidden = false;
      o.apr.textContent = pct2(res.apr);
      o.note.textContent = this._note(res);
      o.instLabel.textContent = bullet ? 'Repay on day ' + res.tenure : 'Monthly EMI';
      o.inst.textContent = rupees(res.instalment);
      o.times.textContent = bullet ? '' : '× ' + res.tenure;
      o.net.textContent = rupees(res.net);
      o.interest.textContent = rupees(res.totalInterest);
      o.fees.textContent = rupees(res.fees);
      o.total.textContent = rupees(res.totalRepay);
      o.totalRow.hidden = bullet;

      var parts = { received: res.net, interest: res.totalInterest, fees: res.fees }, T = res.totalRepay;
      this._ref.bar.querySelectorAll('.seg').forEach(function (seg) {
        var k = seg.getAttribute('data-seg'), v = parts[k];
        seg.hidden = !(v > 0);
        seg.style.flexGrow = String(v > 0 ? v : 0);
        seg.setAttribute('data-tip', SEG_LABEL[k] + ': ' + rupees(v) + ' (' + Math.round((v / T) * 100) + '% of what you repay)');
      });
      this._ref.bar.setAttribute('aria-label', 'Of the ' + rupees(T) + ' you repay, ' + rupees(res.net) +
        ' is money you receive, ' + rupees(res.totalInterest) + ' is interest and ' + rupees(res.fees) + ' is fees and charges.');

      if (this._ref.schedule.open) this._renderSchedule();
      if (this._ref.kfs.open) this._renderKfs();

      clearTimeout(this._liveTimer);
      this._liveTimer = setTimeout(function () {
        o.live.textContent = 'APR ' + pct2(res.apr) + ' percent. ' + (bullet ? 'Repay ' + rupees(res.instalment) + ' on day ' +
          res.tenure : 'Monthly EMI ' + rupees(res.instalment)) + '. Amount you receive ' + rupees(res.net) + '.';
        self.dispatchEvent(new CustomEvent('apr-change', { detail: res, bubbles: true, composed: true }));
      }, 700);
    }

    _note(res) {
      var rate = rateWords(res.ratePa, res.rateUnit);
      if (res.fees > 0) {
        return res.ratePa > 0
          ? 'Interest of ' + rate + ', plus ' + rupees(res.fees) + ' in fees taken before you receive the money.'
          : 'No interest, but ' + rupees(res.fees) + ' in fees is taken before you receive the money.';
      }
      return res.ratePa > 0
        ? 'No upfront fees, so the APR matches the interest rate of ' + num(res.ratePa, 2) + '% a year.'
        : 'No interest and no fees.';
    }

    _bindBar() {
      var self = this, bar = this._ref.bar, tip = this._ref.tip;
      function hide() {
        tip.hidden = true;
        self._ref.panel.querySelectorAll('.row.hot').forEach(function (r) { r.classList.remove('hot'); });
      }
      bar.addEventListener('pointermove', function (e) {
        var seg = e.target.closest && e.target.closest('.seg');
        if (!seg) { hide(); return; }
        var wrap = bar.parentNode.getBoundingClientRect();
        tip.textContent = seg.getAttribute('data-tip');
        tip.hidden = false;
        var half = tip.offsetWidth / 2;
        var x = clamp(e.clientX - wrap.left, Math.min(half, wrap.width / 2), Math.max(wrap.width - half, wrap.width / 2));
        tip.style.left = x + 'px';
        var k = seg.getAttribute('data-seg');
        self._ref.panel.querySelectorAll('.row[data-row]').forEach(function (r) {
          r.classList.toggle('hot', r.getAttribute('data-row') === k);
        });
      });
      bar.addEventListener('pointerleave', hide);
    }

    _renderSchedule() {
      var r = this._res, body = this._ref.schedBody;
      if (!r || !r.ok) { body.innerHTML = '<p class="method">Fix the highlighted values to see the schedule.</p>'; return; }
      var bullet = r.type === 'bullet';
      var h = '<div class="table-wrap" tabindex="0" role="region" aria-label="Repayment schedule table"><table>' +
        '<thead><tr><th scope="col">' + (bullet ? 'Due' : 'EMI no.') + '</th><th scope="col">Outstanding principal</th>' +
        '<th scope="col">Principal</th><th scope="col">Interest</th><th scope="col">Instalment</th></tr></thead><tbody>';
      r.rows.forEach(function (row) {
        h += '<tr><td>' + (bullet ? 'Day ' + row.due : row.no) + '</td><td>' + rupees(row.opening) + '</td><td>' +
          rupees(row.principal) + '</td><td>' + rupees(row.interest) + '</td><td>' + rupees(row.instalment) + '</td></tr>';
      });
      h += '</tbody><tfoot><tr><th scope="row">Total</th><td></td><td>' + rupees(r.amount) + '</td><td>' +
        rupees(r.totalInterest) + '</td><td>' + rupees(r.totalRepay) + '</td></tr></tfoot></table></div>';
      if (!bullet) {
        h += '<p class="method">Interest each month is charged on the principal still outstanding. Figures are rounded to the ' +
          'nearest rupee; the last EMI absorbs any rounding difference.</p>';
      }
      body.innerHTML = h;
    }

    _renderKfs() {
      var r = this._res, body = this._ref.kfsBody;
      if (!r || !r.ok) { body.innerHTML = '<p class="method">Fix the highlighted values to see the breakdown.</p>'; return; }
      var bullet = r.type === 'bullet', gstRate = this._cfg.gstRate;
      var rows = [
        ['1', 'Loan amount', rupees(r.amount)],
        ['2', 'Loan term', r.tenure + (bullet ? ' days' : ' months')],
        ['', 'Repayments', bullet ? '1 repayment of ' + rupees(r.instalment) : r.tenure + ' monthly EMIs of ' + rupees(r.instalment)],
        ['', 'First repayment', bullet ? r.tenure + ' days after disbursal' : '1 month after disbursal'],
        ['3', 'Interest rate type', 'Fixed'],
        ['4', 'Rate of interest', rateWords(r.ratePa, r.rateUnit)],
        ['5', 'Total interest', rupees(r.totalInterest)],
        ['6', 'Fees and charges', rupees(r.fees)],
        ['', 'Processing fee', rupees(r.processingFee)]
      ];
      if (r.gstOnFee > 0) rows.push(['', 'GST on processing fee (' + gstRate + '%)', rupees(r.gstOnFee)]);
      rows.push(['', 'Other upfront charges', rupees(r.otherCharges)]);
      rows.push(['7', 'Net disbursed amount (1 − 6)', rupees(r.net)]);
      rows.push(['8', 'Total amount to be paid (1 + 5)', rupees(r.totalRepay)]);
      rows.push(['9', 'Annual percentage rate (APR)', pct2(r.apr) + '%']);

      var h = '<div class="table-wrap" style="max-height:none"><table class="kfs"><caption class="sr-only">APR illustration in the ' +
        'Key Facts Statement format</caption><thead><tr><th scope="col">No.</th><th scope="col" style="text-align:left">Item</th>' +
        '<th scope="col">Amount</th></tr></thead><tbody>';
      rows.forEach(function (row) {
        var cls = row[0] === '' ? ' class="sub"' : row[0] === '9' ? ' class="apr"' : '';
        h += '<tr' + cls + '><td>' + row[0] + '</td><td>' + esc(row[1]) + '</td><td>' + esc(row[2]) + '</td></tr>';
      });
      h += '</tbody></table></div>';

      var excluded = ' Penal charges, late-payment charges and other contingent charges are not part of APR.';
      if (bullet) {
        h += '<p class="method">With a single repayment, APR is the return over the loan term on the amount you actually receive ' +
          '(row 7), scaled to a year without compounding. This is the IRR method in RBI’s Key Facts Statement rules.' + excluded +
          '<span class="formula">(' + rupees(r.totalRepay) + ' ÷ ' + rupees(r.net) + ' − 1) × 365 ÷ ' + r.tenure +
          ' = ' + pct2(r.apr) + '%</span></p>';
      } else {
        h += '<p class="method">APR is the internal rate of return (IRR) of the amount you actually receive (row 7) against the ' +
          'EMI schedule, on a reducing balance. The monthly rate is multiplied by 12, without compounding. This is the method ' +
          'in RBI’s Key Facts Statement rules.' + excluded +
          '<span class="formula">Monthly IRR ' + num(r.periodicRate * 100, 4) + '% × 12 = ' + pct2(r.apr) + '%</span></p>';
      }
      body.innerHTML = h;
    }
  }

  if (!customElements.get('apr-calculator')) customElements.define('apr-calculator', AprCalculator);
})(typeof window !== 'undefined' ? window : globalThis);
