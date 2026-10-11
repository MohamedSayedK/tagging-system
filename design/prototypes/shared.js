/* Shared prototype data + helpers. Synthetic demo content (clearly a prototype), real outlet names. */
window.PROTO = (() => {
  const topic = {
    name: "Economy & budget",
    query: '(budget OR الميزانية) NEAR/8 (deficit OR عجز OR spending)',
    exclude: "sports",
  };

  // 14 days, newest last. Weekend dips (Fri/Sat in the Gulf) are real behaviour worth showing.
  const days = [
    ["2026-09-27", 18], ["2026-09-28", 22], ["2026-09-29", 19], ["2026-09-30", 31], ["2026-10-01", 27],
    ["2026-10-02", 12], ["2026-10-03", 9], ["2026-10-04", 24], ["2026-10-05", 38], ["2026-10-06", 41],
    ["2026-10-07", 29], ["2026-10-08", 26], ["2026-10-09", 14], ["2026-10-10", 33],
  ].map(([d, n]) => ({ date: d, count: n }));

  const articles = [
    { day: "2026-10-10", time: "09:42", fresh: true, ar: false, title: "Budget deficit narrows as non-oil revenues climb for third straight quarter", excerpt: "Officials said the <mark>deficit</mark> fell well below the forecast in the quarter, helped by growth in services and a steady rise in <mark>spending</mark> discipline across ministries.", source: "Arab News", domain: "arabnews.com", country: "Saudi Arabia", lang: "English", type: "Online newspaper" },
    { day: "2026-10-10", time: "09:15", fresh: true, ar: true, title: "الميزانية العامة: عجز أقل من المتوقع وإنفاق رأسمالي أعلى في الربع الثالث", excerpt: "أعلنت وزارة المالية أن <mark>عجز</mark> <mark>الميزانية</mark> جاء دون التقديرات الأولية بفضل نمو الإيرادات غير النفطية وارتفاع كفاءة الإنفاق.", source: "Al Eqtisadiah", domain: "aleqt.com", country: "Saudi Arabia", lang: "Arabic", type: "Online newspaper" },
    { day: "2026-10-10", time: "08:30", fresh: false, ar: false, title: "Gulf finance ministers meet to align medium-term fiscal frameworks", excerpt: "The talks focused on how members can keep <mark>spending</mark> predictable while oil prices remain volatile, with a joint statement expected next week.", source: "Gulf News", domain: "gulfnews.com", country: "United Arab Emirates", lang: "English", type: "Online newspaper" },
    { day: "2026-10-10", time: "07:55", fresh: false, ar: true, title: "خبراء: تحسّن مؤشرات الدين العام يعزز الثقة في الموازنة الجديدة", excerpt: "قال محللون إن تراجع <mark>العجز</mark> وارتفاع الاحتياطيات يمنحان الحكومة هامشاً أوسع لمواصلة مشاريع <mark>الإنفاق</mark> التنموي.", source: "Okaz", domain: "okaz.com.sa", country: "Saudi Arabia", lang: "Arabic", type: "Online newspaper" },
    { day: "2026-10-09", time: "21:10", fresh: false, ar: false, title: "Analysis: why the region's budgets are leaning on non-oil income", excerpt: "A shift in how governments plan <mark>spending</mark> is visible across the Gulf, with a falling <mark>deficit</mark> and growing tax receipts reshaping priorities.", source: "The National", domain: "thenationalnews.com", country: "United Arab Emirates", lang: "English", type: "Online newspaper" },
    { day: "2026-10-09", time: "18:42", fresh: false, ar: true, title: "الميزانية الجديدة: أولويات الإنفاق بين التعليم والبنية التحتية", excerpt: "تناول التقرير توزيع <mark>الإنفاق</mark> في <mark>الميزانية</mark> الجديدة وأثره على الإيرادات والدين والنمو خلال السنوات المقبلة.", source: "Asharq Al-Awsat", domain: "aawsat.com", country: "United Kingdom", lang: "Arabic", type: "Online newspaper" },
    { day: "2026-10-09", time: "14:05", fresh: false, ar: false, title: "IMF: fiscal buffers remain strong despite wider regional deficit", excerpt: "The fund's staff said buffers built over recent years leave room to absorb shocks, even as the regional <mark>deficit</mark> widens slightly.", source: "Khaleej Times", domain: "khaleejtimes.com", country: "United Arab Emirates", lang: "English", type: "Online newspaper" },
    { day: "2026-10-09", time: "11:20", fresh: false, ar: true, title: "هل تكفي الإيرادات غير النفطية لسدّ فجوة العجز؟ قراءة في الأرقام", excerpt: "يرى اقتصاديون أن <mark>عجز</mark> <mark>الميزانية</mark> يمكن احتواؤه إذا استمر نمو القطاع الخاص وتحسنت كفاءة التحصيل.", source: "Sabq", domain: "sabq.org", country: "Saudi Arabia", lang: "Arabic", type: "Online newspaper" },
    { day: "2026-10-08", time: "16:48", fresh: false, ar: false, title: "Kuwait outlines austerity steps as spending outpaces revenue", excerpt: "Lawmakers were told that <mark>spending</mark> had outpaced revenue for the second year, with a plan to trim subsidies and delay some capital projects.", source: "Al Madina", domain: "al-madina.com", country: "Saudi Arabia", lang: "English", type: "Online newspaper" },
    { day: "2026-10-08", time: "10:12", fresh: false, ar: true, title: "تقرير: الدين العام ينخفض مع تحسن إدارة الميزانية", excerpt: "أشار التقرير إلى أن الحكومة خفضت <mark>العجز</mark> عبر ضبط <mark>الإنفاق</mark> الجاري وتنويع مصادر الإيراد.", source: "BBC Arabic", domain: "bbc.com", country: "United Kingdom", lang: "Arabic", type: "Online newspaper" },
  ];

  const facets = {
    "Source type": [["Online newspaper", 412], ["Online magazine", 38], ["Other online news", 37]],
    "Country": [["Saudi Arabia", 176], ["United Arab Emirates", 142], ["United Kingdom", 61], ["Egypt", 58], ["United States", 31]],
    "Language": [["Arabic", 268], ["English", 219]],
    "Domain": [["arabnews.com", 64], ["aleqt.com", 58], ["gulfnews.com", 47], ["okaz.com.sa", 41], ["thenationalnews.com", 36]],
  };

  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parse = (iso) => new Date(iso + "T00:00:00Z");
  const dow = (iso) => DOW[parse(iso).getUTCDay()];
  const short = (iso) => `${parse(iso).getUTCDate()} ${MON[parse(iso).getUTCMonth()]}`;
  const long = (iso) => `${dow(iso)} ${short(iso)}`;
  const isWeekend = (iso) => [5, 6].includes(parse(iso).getUTCDay()); // Fri/Sat
  const sum = days.reduce((s, d) => s + d.count, 0);
  const avg = sum / days.length;
  const peak = days.reduce((a, b) => (b.count > a.count ? b : a));
  const countOn = (iso) => articles.filter((a) => a.day === iso).length;

  /**
   * Draws the "results per day" chart into `el`. Every world styles it through CSS classes:
   * .gridline .axis-label .bar .bar.weekend .bar.peak .bar.selected .avg-line .avg-label .peak-label .x-label
   * Useful on purpose: labelled y-axis, weekday letters, weekend shading, an average line to read against,
   * the peak called out, and a tooltip that says how far a day is from normal.
   */
  function renderChart(el, { onSelect } = {}) {
    const W = 760, H = 240, P = { t: 26, r: 12, b: 38, l: 36 };
    const max = Math.ceil(Math.max(...days.map((d) => d.count)) / 10) * 10;
    const pw = W - P.l - P.r, ph = H - P.t - P.b, slot = pw / days.length, bw = slot * 0.64;
    const y = (v) => P.t + ph - (v / max) * ph;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Articles per day, last 14 days. Peak ${peak.count} on ${long(peak.date)}. Average ${avg.toFixed(0)} per day.">`;
    for (let v = 0; v <= max; v += 10) {
      s += `<line class="gridline" x1="${P.l}" x2="${W - P.r}" y1="${y(v)}" y2="${y(v)}"/>`;
      s += `<text class="axis-label" x="${P.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    days.forEach((d, i) => {
      const x = P.l + i * slot + (slot - bw) / 2;
      const cls = ["bar", isWeekend(d.date) ? "weekend" : "", d === peak ? "peak" : ""].join(" ").trim();
      s += `<g class="day" data-date="${d.date}" tabindex="0" role="button" aria-label="${long(d.date)}: ${d.count} articles">`;
      s += `<rect class="hit" x="${P.l + i * slot}" y="${P.t}" width="${slot}" height="${ph}" fill="transparent"/>`;
      s += `<rect class="${cls}" x="${x}" y="${y(d.count)}" width="${bw}" height="${P.t + ph - y(d.count)}" rx="2"/>`;
      s += `<text class="x-label" x="${x + bw / 2}" y="${H - 20}" text-anchor="middle">${dow(d.date)[0]}</text>`;
      s += `<text class="x-label date" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${parse(d.date).getUTCDate()}</text>`;
      s += `</g>`;
    });
    s += `<line class="avg-line" x1="${P.l}" x2="${W - P.r}" y1="${y(avg)}" y2="${y(avg)}"/>`;
    s += `<text class="avg-label" x="${W - P.r}" y="${y(avg) - 6}" text-anchor="end">average ${avg.toFixed(0)}/day</text>`;
    const pi = days.indexOf(peak);
    s += `<text class="peak-label" x="${P.l + pi * slot + slot / 2}" y="${y(peak.count) - 8}" text-anchor="middle">${peak.count}</text>`;
    s += `</svg><div class="tip" role="status" aria-live="polite"></div>`;
    el.innerHTML = s;

    const tip = el.querySelector(".tip");
    el.querySelectorAll(".day").forEach((g) => {
      const d = days.find((x) => x.date === g.dataset.date);
      const show = () => {
        const diff = d.count - avg;
        const rel = Math.abs(diff) < 3 ? "about normal" : diff > 0 ? `${Math.round((diff / avg) * 100)}% above average` : `${Math.round((-diff / avg) * 100)}% below average`;
        tip.innerHTML = `<b>${long(d.date)}</b> · ${d.count} articles · ${rel}`;
        tip.classList.add("on");
      };
      g.addEventListener("mouseenter", show);
      g.addEventListener("focus", show);
      g.addEventListener("mouseleave", () => tip.classList.remove("on"));
      g.addEventListener("click", () => {
        el.querySelectorAll(".bar").forEach((b) => b.classList.remove("selected"));
        g.querySelector(".bar").classList.add("selected");
        onSelect && onSelect(d);
      });
      g.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), g.click()));
    });
  }

  /** Renders the facet groups into `el` as collapsible <details>, first one open. */
  function renderFacets(el) {
    el.innerHTML = Object.entries(facets)
      .map(([name, opts], i) => `
        <details ${i === 0 ? "open" : ""}>
          <summary>${name}</summary>
          ${opts.map(([label, n]) => `<label><input type="checkbox"><span>${label}</span><i>${n}</i></label>`).join("")}
        </details>`)
      .join("");
  }

  function wireDensity(root, buttons) {
    buttons.forEach((b) =>
      b.addEventListener("click", () => {
        root.dataset.density = b.dataset.density;
        buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      }),
    );
  }

  return { topic, days, articles, facets, avg, peak, long, short, dow, countOn, renderChart, renderFacets, wireDensity, total: 487 };
})();
