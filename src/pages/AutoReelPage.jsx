import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── AUTO REEL PAGE ───────────────────────────────────────────────────────────
function AutoReelPage({ addToast }) {
  const { studyMaterial } = useApp();
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const canvasRef = useRef();
  const animFrameRef = useRef();
  const particlesRef = useRef([]);
  const slideStartTimeRef = useRef(0);
  const transitionRef = useRef({ active: false, progress: 0, type: "fade" });
  const currentRef = useRef(0);
  const slidesRef = useRef([]);
  const playingRef = useRef(false);

  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { slidesRef.current = slides; }, [slides]);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Each slide gets its own unique AI-chosen visual personality
  const SLIDE_THEMES = [
    // 0: Deep space purple — curiosity / mystery
    { bg1:"#060010", bg2:"#1a0040", mid:"#2d0060", accent:"#bf80ff", accent2:"#e040fb", glow:"#9c27b0", text:"#fff", particle:"#ce93d8", scanlines:false, geo:"circles" },
    // 1: Electric cyan — clarity / breakthrough
    { bg1:"#000d1a", bg2:"#001f3f", mid:"#003366", accent:"#00e5ff", accent2:"#80d8ff", glow:"#0288d1", text:"#fff", particle:"#b3e5fc", scanlines:false, geo:"hexagons" },
    // 2: Volcanic orange — energy / impact
    { bg1:"#1a0500", bg2:"#3d0e00", mid:"#6b1a00", accent:"#ff6d00", accent2:"#ffab40", glow:"#e65100", text:"#fff", particle:"#ffcc80", scanlines:false, geo:"triangles" },
    // 3: Matrix green — knowledge / power
    { bg1:"#000a00", bg2:"#001a00", mid:"#002d00", accent:"#00e676", accent2:"#69f0ae", glow:"#00c853", text:"#fff", particle:"#a5d6a7", scanlines:true, geo:"lines" },
    // 4: Rose gold — warmth / motivation
    { bg1:"#1a0010", bg2:"#3d0025", mid:"#5c003a", accent:"#f48fb1", accent2:"#f8bbd0", glow:"#e91e63", text:"#fff", particle:"#fce4ec", scanlines:false, geo:"circles" },
    // 5: Golden sunrise — achievement / reward
    { bg1:"#1a1000", bg2:"#332200", mid:"#4d3300", accent:"#ffd740", accent2:"#ffe57f", glow:"#ffa000", text:"#fff", particle:"#fff9c4", scanlines:false, geo:"stars" },
    // 6: Ice blue — calm / focus
    { bg1:"#000d1a", bg2:"#001233", mid:"#00174d", accent:"#40c4ff", accent2:"#80d8ff", glow:"#0091ea", text:"#fff", particle:"#b3e5fc", scanlines:false, geo:"hexagons" },
    // 7: Victory red — challenge / triumph
    { bg1:"#1a0000", bg2:"#330000", mid:"#4d0000", accent:"#ff1744", accent2:"#ff616f", glow:"#d50000", text:"#fff", particle:"#ffcdd2", scanlines:false, geo:"triangles" },
  ];

  const getTheme = (idx) => SLIDE_THEMES[idx % SLIDE_THEMES.length];

  // ── PARTICLES ─────────────────────────────────────────────────────────────────
  const initParticles = (pal) => {
    particlesRef.current = Array.from({ length: 60 }, (_, i) => ({
      x: Math.random() * 390, y: Math.random() * 700 + 100,
      vx: (Math.random() - 0.5) * 0.8, vy: -(Math.random() * 0.9 + 0.2),
      r: Math.random() * 3.5 + 0.5,
      alpha: Math.random() * 0.55 + 0.1,
      color: i % 3 === 0 ? pal.accent : i % 3 === 1 ? pal.accent2 : pal.particle,
      pulse: Math.random() * Math.PI * 2,
      shape: ["circle","circle","star","diamond","circle"][Math.floor(Math.random()*5)],
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.06,
      twinkle: Math.random() > 0.6,
    }));
  };

  const drawParticle = (ctx, p) => {
    p.x += p.vx; p.y += p.vy; p.pulse += 0.04; p.angle += p.spin;
    if (p.y < -20) { p.y = 720; p.x = Math.random() * 390; }
    if (p.x < -10) p.x = 400; if (p.x > 400) p.x = -10;
    const twinkleA = p.twinkle ? (0.5 + Math.sin(p.pulse * 2.5) * 0.5) : 1;
    const a = p.alpha * twinkleA;
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = p.color;
    ctx.translate(p.x, p.y); ctx.rotate(p.angle);
    if (p.shape === "star") {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a1 = (i * 4 * Math.PI / 5) - Math.PI / 2;
        const a2 = ((i * 4 + 2) * Math.PI / 5) - Math.PI / 2;
        i === 0 ? ctx.moveTo(p.r * Math.cos(a1), p.r * Math.sin(a1)) : ctx.lineTo(p.r * Math.cos(a1), p.r * Math.sin(a1));
        ctx.lineTo(p.r * 0.38 * Math.cos(a2), p.r * 0.38 * Math.sin(a2));
      }
      ctx.closePath(); ctx.fill();
    } else if (p.shape === "diamond") {
      ctx.beginPath(); ctx.moveTo(0, -p.r*1.5); ctx.lineTo(p.r, 0); ctx.lineTo(0, p.r*1.5); ctx.lineTo(-p.r, 0); ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  };

  const wrapText = (ctx, text, maxW, font) => {
    ctx.font = font;
    const words = (text || "").split(" ");
    const lines = []; let line = "";
    words.forEach((w, i) => {
      const test = line + w + " ";
      if (ctx.measureText(test).width > maxW && i > 0) { lines.push(line.trim()); line = w + " "; }
      else line = test;
    });
    if (line.trim()) lines.push(line.trim());
    return lines;
  };

  // ── DRAW GEOMETRIC BG SHAPES ──────────────────────────────────────────────────
  const drawGeo = (ctx, W, H, pal, t) => {
    ctx.save(); ctx.globalAlpha = 0.06;
    if (pal.geo === "hexagons") {
      ctx.strokeStyle = pal.accent; ctx.lineWidth = 1;
      for (let row = -1; row < 8; row++) for (let col = -1; col < 5; col++) {
        const hx = col * 70 + (row % 2) * 35 + Math.sin(t * 0.3 + row) * 3;
        const hy = row * 60 + Math.cos(t * 0.25 + col) * 3;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) ctx.lineTo(hx + 28 * Math.cos(i * Math.PI / 3), hy + 28 * Math.sin(i * Math.PI / 3));
        ctx.closePath(); ctx.stroke();
      }
    } else if (pal.geo === "triangles") {
      ctx.strokeStyle = pal.accent; ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const tx = (i % 4) * 100 + Math.sin(t * 0.4 + i) * 8;
        const ty = Math.floor(i / 4) * 130 + Math.cos(t * 0.3 + i) * 8;
        ctx.beginPath(); ctx.moveTo(tx + 35, ty); ctx.lineTo(tx + 70, ty + 60); ctx.lineTo(tx, ty + 60); ctx.closePath(); ctx.stroke();
      }
    } else if (pal.geo === "lines") {
      ctx.strokeStyle = pal.accent; ctx.lineWidth = 1;
      for (let i = 0; i < 20; i++) {
        const lx = (i * 22) + Math.sin(t * 0.5 + i * 0.4) * 5;
        ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx - 30, H); ctx.stroke();
      }
    } else if (pal.geo === "stars") {
      ctx.fillStyle = pal.accent;
      for (let i = 0; i < 15; i++) {
        const sx = (i * 67 + 20) % W, sy = (i * 93 + 40) % H;
        const sr = 8 + Math.sin(t + i) * 3;
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          const a1 = (j * 4 * Math.PI / 5) - Math.PI / 2;
          const a2 = ((j * 4 + 2) * Math.PI / 5) - Math.PI / 2;
          j === 0 ? ctx.moveTo(sx + sr * Math.cos(a1), sy + sr * Math.sin(a1)) : ctx.lineTo(sx + sr * Math.cos(a1), sy + sr * Math.sin(a1));
          ctx.lineTo(sx + sr * 0.4 * Math.cos(a2), sy + sr * 0.4 * Math.sin(a2));
        }
        ctx.closePath(); ctx.fill();
      }
    } else {
      // circles
      ctx.strokeStyle = pal.accent; ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const cr = 40 + i * 30 + Math.sin(t * 0.4 + i) * 8;
        ctx.beginPath(); ctx.arc(W * 0.82, H * 0.18, cr, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(W * 0.15, H * 0.8, cr * 0.7, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  };

  // ── SCANLINES ─────────────────────────────────────────────────────────────────
  const drawScanlines = (ctx, W, H) => {
    ctx.save(); ctx.globalAlpha = 0.04; ctx.fillStyle = "#000";
    for (let y = 0; y < H; y += 3) { ctx.fillRect(0, y, W, 1); }
    ctx.restore();
  };

  // ── MAIN DRAW ─────────────────────────────────────────────────────────────────
  const drawFrame = (timestamp) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const sl = slidesRef.current;
    const ci = currentRef.current;
    if (!sl.length) return;

    const slide = sl[ci];
    const pal = getTheme(ci);
    const t = (timestamp - slideStartTimeRef.current) / 1000;
    const tr = transitionRef.current;

    // ── BACKGROUND ──────────────────────────────────────────────────────────
    // Diagonal multi-stop gradient
    const grad = ctx.createLinearGradient(0, 0, W * 0.6, H);
    grad.addColorStop(0, pal.bg1);
    grad.addColorStop(0.5, pal.mid);
    grad.addColorStop(1, pal.bg2);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

    // ── GLOWING ORBS ────────────────────────────────────────────────────────
    const orbConfigs = [
      { x: W * 0.85, y: H * 0.12, r: 160, phase: 0 },
      { x: W * 0.1, y: H * 0.72, r: 130, phase: 1.6 },
      { x: W * 0.55, y: H * 0.5, r: 90, phase: 3.0 },
    ];
    orbConfigs.forEach(o => {
      const pulse = 0.14 + Math.sin(t * 0.5 + o.phase) * 0.08;
      const rg = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      rg.addColorStop(0, pal.glow + "55"); rg.addColorStop(0.6, pal.glow + "22"); rg.addColorStop(1, pal.glow + "00");
      ctx.fillStyle = rg; ctx.globalAlpha = pulse;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    });

    // ── GEOMETRIC BG ────────────────────────────────────────────────────────
    drawGeo(ctx, W, H, pal, t);

    // ── PARTICLES ───────────────────────────────────────────────────────────
    particlesRef.current.forEach(p => drawParticle(ctx, p));

    // ── SCANLINES ───────────────────────────────────────────────────────────
    if (pal.scanlines) drawScanlines(ctx, W, H);

    // ── TOP ACCENT LINE ──────────────────────────────────────────────────────
    const topLineW = Math.min(1, t * 3) * W;
    const tlg = ctx.createLinearGradient(0, 0, topLineW, 0);
    tlg.addColorStop(0, pal.accent); tlg.addColorStop(1, pal.accent2);
    ctx.fillStyle = tlg; ctx.fillRect(0, 0, topLineW, 3);

    // ── SLIDE TYPE BADGE ─────────────────────────────────────────────────────
    const typeLabel = (slide.type || "SLIDE").toUpperCase();
    ctx.save();
    ctx.font = "bold 9px 'DM Mono',monospace";
    const badgeW = ctx.measureText(typeLabel).width + 20;
    // Pulsing badge glow
    const badgeGlow = 0.5 + Math.sin(t * 2) * 0.3;
    ctx.fillStyle = pal.accent + "33";
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 10 * badgeGlow;
    ctx.beginPath(); ctx.roundRect(18, 56, badgeW, 22, 11); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = pal.accent; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(typeLabel, 28, 67); ctx.restore();

    // ── SLIDE COUNTER ────────────────────────────────────────────────────────
    ctx.save(); ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.roundRect(W - 54, 56, 38, 22, 11); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)"; ctx.font = "bold 9px 'DM Mono',monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(`${ci+1} / ${sl.length}`, W - 35, 67); ctx.restore();

    // ── BIG ANIMATED EMOJI ───────────────────────────────────────────────────
    const emojiPop = Math.min(1, t * 4); // pop in fast
    const emojiFloat = Math.sin(t * 1.1) * 7;
    const emojiSize = Math.round(68 * emojiPop);
    ctx.save();
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 28 + Math.sin(t) * 10;
    ctx.font = `${emojiSize}px serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.globalAlpha = emojiPop;
    ctx.fillText(slide.emoji || "✨", W / 2, 168 + emojiFloat);
    ctx.restore();

    // ── EMOJI RING ───────────────────────────────────────────────────────────
    if (t > 0.3) {
      const ringAlpha = Math.max(0, 1 - (t - 0.3) * 2.5);
      const ringR = 44 + (t - 0.3) * 120;
      ctx.save(); ctx.globalAlpha = ringAlpha * 0.35;
      ctx.strokeStyle = pal.accent; ctx.lineWidth = 2;
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.arc(W / 2, 168, ringR, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // ── HEADLINE ────────────────────────────────────────────────────────────
    const hlY = 248;
    const hlFont = "bold 21px system-ui,sans-serif";
    const hlLines = wrapText(ctx, slide.headline || "", W - 44, hlFont);
    ctx.save(); ctx.font = hlFont; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.shadowColor = pal.glow; ctx.shadowBlur = 18;
    hlLines.forEach((line, i) => {
      const reveal = Math.min(1, Math.max(0, (t - 0.25 - i * 0.18) / 0.35));
      const slideIn = (1 - reveal) * 18;
      ctx.globalAlpha = reveal;
      ctx.fillStyle = "#fff";
      ctx.fillText(line, W / 2, hlY + i * 30 + slideIn);
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.restore();

    // ── ACCENT DIVIDER ───────────────────────────────────────────────────────
    const divY = hlY + hlLines.length * 30 + 12;
    const divReveal = Math.min(1, Math.max(0, (t - 0.55) / 0.4));
    if (divReveal > 0) {
      const dg = ctx.createLinearGradient((W/2) - 80*divReveal, 0, (W/2) + 80*divReveal, 0);
      dg.addColorStop(0, "transparent"); dg.addColorStop(0.5, pal.accent); dg.addColorStop(1, "transparent");
      ctx.save(); ctx.strokeStyle = dg; ctx.lineWidth = 1.5;
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(W/2 - 80*divReveal, divY); ctx.lineTo(W/2 + 80*divReveal, divY); ctx.stroke();
      // Diamond center
      ctx.fillStyle = pal.accent; ctx.globalAlpha = divReveal;
      ctx.beginPath(); ctx.moveTo(W/2, divY-4); ctx.lineTo(W/2+4, divY); ctx.lineTo(W/2, divY+4); ctx.lineTo(W/2-4, divY); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // ── BODY TEXT ─────────────────────────────────────────────────────────────
    const bodyY = divY + 18;
    const bodyFont = "14.5px system-ui,sans-serif";
    const bodyLines = wrapText(ctx, slide.text || "", W - 52, bodyFont);
    ctx.save(); ctx.font = bodyFont; ctx.textAlign = "center"; ctx.textBaseline = "top";
    bodyLines.forEach((line, i) => {
      const reveal = Math.min(1, Math.max(0, (t - 0.7 - i * 0.1) / 0.35));
      ctx.globalAlpha = reveal * 0.88;
      ctx.fillStyle = "#fff";
      ctx.fillText(line, W / 2, bodyY + i * 22);
    });
    ctx.globalAlpha = 1; ctx.restore();

    const contentBottom = bodyY + bodyLines.length * 22;

    // ── STAT CALLOUT ──────────────────────────────────────────────────────────
    if (slide.stat) {
      const statY = contentBottom + 16;
      const statReveal = Math.min(1, Math.max(0, (t - 1.0) / 0.5));
      ctx.save(); ctx.globalAlpha = statReveal;
      // Glowing pill
      const sg = ctx.createLinearGradient(28, statY, W-28, statY+44);
      sg.addColorStop(0, pal.accent + "44"); sg.addColorStop(1, pal.accent2 + "22");
      ctx.fillStyle = sg;
      ctx.strokeStyle = pal.accent + "66"; ctx.lineWidth = 1.2;
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.roundRect(28, statY, W-56, 44, 14); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = pal.accent; ctx.font = "bold 20px system-ui";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = pal.glow; ctx.shadowBlur = 14;
      ctx.fillText(slide.stat, W/2, statY + 22);
      ctx.restore();
    }

    // ── TIP CARD ─────────────────────────────────────────────────────────────
    if (slide.tip) {
      const tipY = contentBottom + (slide.stat ? 76 : 16);
      const tipReveal = Math.min(1, Math.max(0, (t - 1.15) / 0.45));
      ctx.save(); ctx.globalAlpha = tipReveal;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.strokeStyle = pal.accent + "55"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(20, tipY, W-40, 46, 14); ctx.fill(); ctx.stroke();
      // Left bar
      ctx.fillStyle = pal.accent; ctx.shadowColor = pal.glow; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.roundRect(20, tipY, 3, 46, [14,0,0,14]); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.font = "bold 9px 'DM Mono',monospace"; ctx.fillStyle = pal.accent;
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText("💡 PRO TIP", 32, tipY + 8);
      ctx.font = "12px system-ui"; ctx.fillStyle = "rgba(255,255,255,0.82)";
      const tipLines = wrapText(ctx, slide.tip, W - 68, "12px system-ui");
      tipLines.forEach((l, i) => ctx.fillText(l, 32, tipY + 23 + i * 16));
      ctx.restore();
    }

    // ── XP PROGRESS BAR ──────────────────────────────────────────────────────
    const barY = H - 58;
    const xpFrac = (ci + 1) / sl.length;
    ctx.save();
    // Track
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath(); ctx.roundRect(20, barY, W-40, 5, 3); ctx.fill();
    // Fill
    const bGrad = ctx.createLinearGradient(20, 0, 20+(W-40)*xpFrac, 0);
    bGrad.addColorStop(0, pal.accent); bGrad.addColorStop(1, pal.accent2);
    ctx.fillStyle = bGrad; ctx.shadowColor = pal.glow; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.roundRect(20, barY, (W-40)*xpFrac, 5, 3); ctx.fill();
    // Glow head
    const bx = 20 + (W-40)*xpFrac;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(bx, barY+2.5, 5.5, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = pal.accent; ctx.font = "bold 9px 'DM Mono',monospace";
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.fillText(`⚡ ${Math.round(xpFrac*100)}%`, W-20, barY-7);
    ctx.restore();

    // ── PROGRESS DOTS ────────────────────────────────────────────────────────
    const totalW = sl.length * 14;
    let dx = (W - totalW) / 2;
    ctx.save();
    sl.forEach((_, i) => {
      const isActive = i === ci;
      ctx.shadowColor = isActive ? pal.glow : "transparent";
      ctx.shadowBlur = isActive ? 10 : 0;
      ctx.fillStyle = isActive ? pal.accent : "rgba(255,255,255,0.18)";
      ctx.beginPath();
      if (isActive) ctx.roundRect(dx, H-34, 18, 5, 3);
      else ctx.arc(dx+2.5, H-31.5, 2.5, 0, Math.PI*2);
      ctx.fill(); dx += 14;
    });
    ctx.restore();

    // ── MOTIVATIONAL BURST (first 1.2s of each slide) ──────────────────────
    const BURSTS = ["You've got this! 🚀","Brain loading... 🧠","Level UP! ⚡","Genius mode! ✨","Keep going! 🔥","Almost there! 💪","Amazing! 🎯","Legend! 🏆"];
    if (t < 1.2) {
      const qa = t < 0.25 ? t/0.25 : t > 0.85 ? 1-(t-0.85)/0.35 : 1;
      ctx.save(); ctx.globalAlpha = qa;
      const q = BURSTS[ci % BURSTS.length];
      ctx.font = "bold 11px system-ui"; ctx.textAlign = "center";
      const qw = ctx.measureText(q).width + 24;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath(); ctx.roundRect((W-qw)/2, 22, qw, 24, 12); ctx.fill();
      ctx.fillStyle = pal.accent2; ctx.shadowColor = pal.glow; ctx.shadowBlur = 14;
      ctx.textBaseline = "middle"; ctx.fillText(q, W/2, 34);
      ctx.restore();
    }

    // ── TRANSITION ───────────────────────────────────────────────────────────
    if (tr.active) {
      tr.progress = Math.min(1, tr.progress + 0.07);
      if (tr.type === "glitch" && tr.progress < 0.45) {
        ctx.save(); ctx.globalAlpha = 0.4;
        for (let y = 0; y < H; y += 6) {
          if (Math.random() > 0.75) {
            const shift = (Math.random()-0.5)*12;
            ctx.drawImage(canvas, shift, y, W, 3, 0, y, W, 3);
          }
        }
        ctx.restore();
      }
      const alpha = tr.progress < 0.5 ? tr.progress*2 : (1-tr.progress)*2;
      ctx.fillStyle = "#000"; ctx.globalAlpha = Math.min(alpha, 1);
      ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
      if (tr.progress >= 1) tr.active = false;
    }

    animFrameRef.current = requestAnimationFrame(drawFrame);
  };

  // ── TTS ──────────────────────────────────────────────────────────────────────
  const speakSlide = (idx) => {
    window.speechSynthesis.cancel();
    if (idx >= slidesRef.current.length) { setPlaying(false); playingRef.current = false; return; }
    const s = slidesRef.current[idx];
    const utt = new SpeechSynthesisUtterance(`${s.headline}. ${s.text}${s.tip ? ". Pro tip: " + s.tip : ""}`);
    utt.rate = 1.06; utt.pitch = 1.1;
    const voices = window.speechSynthesis.getVoices();
    const nice = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Neural") || v.name.includes("Premium") || v.name.includes("Samantha")));
    if (nice) utt.voice = nice;
    utt.onend = () => {
      if (!playingRef.current) return;
      const next = idx + 1;
      if (next < slidesRef.current.length) {
        const types = ["glitch","fade","slide","glitch","fade","slide","glitch","fade"];
        transitionRef.current = { active:true, progress:0, type: types[next % types.length] };
        setTimeout(() => {
          setCurrent(next); currentRef.current = next;
          slideStartTimeRef.current = performance.now();
          initParticles(getTheme(next));
          speakSlide(next);
        }, 500);
      } else { setPlaying(false); playingRef.current = false; setCurrent(0); currentRef.current = 0; }
    };
    window.speechSynthesis.speak(utt);
  };

  const startReel = () => {
    setPlaying(true); playingRef.current = true;
    setCurrent(0); currentRef.current = 0;
    slideStartTimeRef.current = performance.now();
    initParticles(getTheme(0));
    if (!animFrameRef.current) animFrameRef.current = requestAnimationFrame(drawFrame);
    speakSlide(0);
  };

  const stopReel = () => { window.speechSynthesis.cancel(); setPlaying(false); playingRef.current = false; };

  const goTo = (idx) => {
    stopReel(); setCurrent(idx); currentRef.current = idx;
    slideStartTimeRef.current = performance.now();
    initParticles(getTheme(idx));
    transitionRef.current = { active:true, progress:0, type:"glitch" };
  };

  useEffect(() => {
    if (slides.length > 0) {
      slideStartTimeRef.current = performance.now();
      initParticles(getTheme(0));
      animFrameRef.current = requestAnimationFrame(drawFrame);
    }
    return () => { if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; } };
  }, [slides]);

  useEffect(() => () => { window.speechSynthesis.cancel(); if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); }, []);

  const generate = async () => {
    if (!studyMaterial) { addToast("Load study material on Home first!"); return; }
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    window.speechSynthesis.cancel();
    setLoading(true); setSlides([]); setCurrent(0); setPlaying(false); playingRef.current = false;
    try {
      const r = await callClaude(
        `Create a viral 60-second educational reel that kids and students will LOVE — exciting, fun, clear, and memorable.

Generate exactly 8 slides. Return ONLY a JSON array:
[
  {"slideNum":1,"type":"HOOK 🎯","headline":"Short punchy hook","text":"One irresistible opening line","emoji":"🤯","tip":"","stat":""},
  {"slideNum":2,"type":"WOW FACT ⚡","headline":"Shocking fact","text":"Mind-blowing detail in 1-2 punchy sentences","emoji":"💡","tip":"Quick memory trick","stat":"Key number or formula"},
  {"slideNum":3,"type":"WHY IT MATTERS 🌍","headline":"Why you need to know this","text":"Real-world impact — relatable to students","emoji":"🎓","tip":"","stat":""},
  {"slideNum":4,"type":"CORE CONCEPT 🧠","headline":"The main idea simplified","text":"Distilled to its simplest form — no jargon","emoji":"🔑","tip":"","stat":""},
  {"slideNum":5,"type":"MEMORY TRICK 🪄","headline":"Never forget this","text":"A fun mnemonic or visual trick to lock it in","emoji":"✨","tip":"Use this in your exam!","stat":""},
  {"slideNum":6,"type":"DEEP DIG 🔍","headline":"The part most miss","text":"One surprising detail that most students don't know","emoji":"🕵️","tip":"","stat":""},
  {"slideNum":7,"type":"REAL LIFE 🚀","headline":"See it in the real world","text":"A fun, relatable example or analogy","emoji":"🌟","tip":"","stat":""},
  {"slideNum":8,"type":"CHALLENGE 🏆","headline":"Test yourself!","text":"One fun challenge or question to cement the learning","emoji":"🎯","tip":"Share this reel — teaching others = 90% retention!","stat":""}
]

Rules:
- Headlines: max 6 words, punchy and exciting
- Body text: max 20 words, conversational and fun
- stat: a memorable number, percentage, formula, or "" if not relevant
- tip: a genuine memory aid, shortcut, or "" if not needed  
- emoji: a vivid, on-topic emoji — not generic
- Write for curious kids and students aged 10-22
- Every slide should feel like a dopamine hit

Material: ${studyMaterial.text.slice(0, 10000)}`,
        "You are a viral Gen-Z educational content creator. Your reels are exciting, clear, and make students actually want to learn. Return ONLY valid JSON array, no markdown, no extra text.", 2000
      );
      const s = r.indexOf("["), e = r.lastIndexOf("]");
      if (s === -1) throw new Error("Could not generate reel. Try again.");
      const data = JSON.parse(r.slice(s, e+1));
      setSlides(data.slice(0, 8)); slidesRef.current = data.slice(0, 8);
      addToast("🎬 Reel ready! Hit Play for narrated playback!");
    } catch(err) { addToast("Error: " + err.message); }
    setLoading(false);
  };

  const sl = slides[current];
  const pal = getTheme(current);

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ margin:"0 0 3px", fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827" }}>🎬 Study Reel</h2>
          <p style={{ margin:0, fontSize:13, color:"#6b7280" }}>AI-generated cinematic reels — unique visual theme per slide, narration included</p>
        </div>
        <button onClick={generate} disabled={loading || !studyMaterial} style={{ padding:"10px 22px", background:loading?"#e9d5ff":"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:11, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace", boxShadow:"0 4px 18px rgba(124,58,237,0.4)", display:"flex", alignItems:"center", gap:8 }}>
          {loading
            ? <><div style={{ width:13,height:13,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",animation:"spin 0.8s linear infinite" }}/>Generating...</>
            : "🎬 Generate Reel"}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign:"center", padding:"56px 0", background:"linear-gradient(135deg,#060010,#1a0040)", borderRadius:24 }}>
          <div style={{ width:52,height:52,borderRadius:"50%",border:"4px solid rgba(191,128,255,0.2)",borderTopColor:"#bf80ff",animation:"spin 0.85s linear infinite",margin:"0 auto 18px" }}/>
          <p style={{ color:"#bf80ff", fontFamily:"'DM Mono',monospace", fontSize:15, fontWeight:700, margin:"0 0 6px" }}>Creating your cinematic reel...</p>
          <p style={{ color:"rgba(255,255,255,0.3)", fontSize:12, margin:0 }}>Writing slides · building animations · preparing narration</p>
        </div>
      )}

      {!studyMaterial && !loading && (
        <div style={{ textAlign:"center", padding:"64px 0", background:"linear-gradient(135deg,#060010,#1a0040)", borderRadius:24 }}>
          <div style={{ fontSize:60, marginBottom:16 }}>🎬</div>
          <p style={{ fontFamily:"'DM Mono',monospace", fontSize:15, margin:"0 0 8px", color:"#bf80ff", fontWeight:700 }}>No study material loaded</p>
          <p style={{ fontSize:13, color:"rgba(255,255,255,0.4)" }}>Go to Home → upload or paste your notes → come back here</p>
        </div>
      )}

      {slides.length > 0 && !loading && (
        <div style={{ display:"grid", gridTemplateColumns:"auto 1fr", gap:28, alignItems:"start" }}>

          {/* Phone + controls */}
          <div style={{ position:"sticky", top:20 }}>
            {/* Phone shell */}
            <div style={{ background:"linear-gradient(160deg,#2c2c30,#18181b)", borderRadius:46, padding:"14px 11px 18px", boxShadow:"0 30px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.07)", width:312, position:"relative" }}>
              {/* Buttons */}
              <div style={{ position:"absolute",right:-3,top:88,width:3,height:38,background:"#2a2a2a",borderRadius:"0 2px 2px 0" }}/>
              <div style={{ position:"absolute",left:-3,top:80,width:3,height:24,background:"#2a2a2a",borderRadius:"2px 0 0 2px" }}/>
              <div style={{ position:"absolute",left:-3,top:112,width:3,height:24,background:"#2a2a2a",borderRadius:"2px 0 0 2px" }}/>
              {/* Notch */}
              <div style={{ position:"absolute",top:18,left:"50%",transform:"translateX(-50%)",width:92,height:24,background:"#111",borderRadius:12,zIndex:10,display:"flex",alignItems:"center",justifyContent:"center",gap:7 }}>
                <div style={{ width:9,height:9,borderRadius:"50%",background:"#1c1c1e" }}/>
                <div style={{ width:5,height:5,borderRadius:"50%",background:"#252528" }}/>
              </div>
              {/* Screen */}
              <div style={{ borderRadius:33,overflow:"hidden",border:"1px solid rgba(255,255,255,0.04)" }}>
                <canvas ref={canvasRef} width={390} height={700} style={{ display:"block", width:"100%", height:"auto" }}/>
              </div>
              {/* Home bar */}
              <div style={{ textAlign:"center",marginTop:12 }}>
                <div style={{ width:100,height:4,background:"rgba(255,255,255,0.12)",borderRadius:99,display:"inline-block" }}/>
              </div>
            </div>

            {/* Controls */}
            <div style={{ marginTop:16, width:312 }}>
              <div style={{ display:"flex",justifyContent:"center",alignItems:"center",gap:14,marginBottom:12 }}>
                <button onClick={() => goTo(Math.max(0,current-1))} disabled={current===0} style={{ width:42,height:42,borderRadius:"50%",background:"rgba(124,58,237,0.1)",border:"1.5px solid rgba(124,58,237,0.25)",color:"#7c3aed",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>‹</button>
                <button onClick={playing ? stopReel : startReel} style={{ width:62,height:62,borderRadius:"50%",background:playing?"linear-gradient(135deg,#dc2626,#991b1b)":"linear-gradient(135deg,#7c3aed,#ec4899)",border:"none",color:"#fff",fontSize:26,cursor:"pointer",boxShadow:playing?"0 6px 24px rgba(220,38,38,0.5)":"0 6px 24px rgba(124,58,237,0.5)",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.25s" }}>
                  {playing ? "⏸" : "▶"}
                </button>
                <button onClick={() => goTo(Math.min(slides.length-1,current+1))} disabled={current===slides.length-1} style={{ width:42,height:42,borderRadius:"50%",background:"rgba(124,58,237,0.1)",border:"1.5px solid rgba(124,58,237,0.25)",color:"#7c3aed",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}>›</button>
              </div>
              <div style={{ height:5,background:"rgba(124,58,237,0.12)",borderRadius:99,overflow:"hidden",marginBottom:6 }}>
                <div style={{ height:"100%",background:"linear-gradient(90deg,#7c3aed,#ec4899)",borderRadius:99,width:`${((current+1)/slides.length)*100}%`,transition:"width 0.4s ease" }}/>
              </div>
              <div style={{ display:"flex",justifyContent:"space-between" }}>
                <span style={{ fontSize:11,color:"#9ca3af",fontFamily:"'DM Mono',monospace" }}>Slide {current+1} of {slides.length}</span>
                {playing && <span style={{ fontSize:11,color:"#ec4899",fontFamily:"'DM Mono',monospace",display:"flex",alignItems:"center",gap:5 }}><span style={{ width:6,height:6,borderRadius:"50%",background:"#ec4899",display:"inline-block",animation:"pulse 1s infinite" }}/>LIVE</span>}
              </div>
            </div>
          </div>

          {/* Slide list + info */}
          <div>
            {sl && (
              <div style={{ padding:"16px 18px",background:`linear-gradient(135deg,${pal.bg1}f0,${pal.mid}cc)`,borderRadius:16,marginBottom:14,border:`1px solid ${pal.accent}33` }}>
                <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:8 }}>
                  <span style={{ fontSize:30 }}>{sl.emoji}</span>
                  <div>
                    <div style={{ fontSize:10,fontWeight:700,color:pal.accent,fontFamily:"'DM Mono',monospace",letterSpacing:1,marginBottom:2 }}>{sl.type}</div>
                    <div style={{ fontSize:15,fontWeight:700,color:"#fff",lineHeight:1.3 }}>{sl.headline}</div>
                  </div>
                </div>
                <p style={{ margin:"0 0 6px",fontSize:13,color:"rgba(255,255,255,0.75)",lineHeight:1.55 }}>{sl.text}</p>
                {sl.tip && <div style={{ fontSize:12,color:pal.accent,fontFamily:"'DM Mono',monospace" }}>💡 {sl.tip}</div>}
                {sl.stat && <div style={{ marginTop:8,padding:"5px 12px",background:pal.accent+"22",borderRadius:8,fontSize:14,fontWeight:700,color:pal.accent,display:"inline-block",border:`1px solid ${pal.accent}44` }}>{sl.stat}</div>}
              </div>
            )}

            <div style={{ display:"flex",flexDirection:"column",gap:7 }}>
              {slides.map((s, i) => {
                const p = getTheme(i);
                const isActive = i === current;
                return (
                  <button key={i} onClick={() => goTo(i)} style={{ padding:"10px 14px",background:isActive?`linear-gradient(135deg,${p.bg1}ee,${p.mid}cc)`:"#f9fafb",border:`1.5px solid ${isActive ? p.accent+"55" : "#e5e7eb"}`,borderRadius:12,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12,transition:"all 0.18s" }}>
                    <span style={{ fontSize:20,flexShrink:0 }}>{s.emoji}</span>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontSize:9,fontWeight:700,color:isActive?p.accent:"#9ca3af",fontFamily:"'DM Mono',monospace",letterSpacing:1,marginBottom:2 }}>{s.type}</div>
                      <div style={{ fontSize:13,fontWeight:600,color:isActive?"#fff":"#111827",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis" }}>{s.headline}</div>
                    </div>
                    <div style={{ width:7,height:7,borderRadius:"50%",background:isActive?p.accent:"#d1d5db",flexShrink:0,boxShadow:isActive?`0 0 8px ${p.glow}`:"none" }}/>
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize:11,color:"#9ca3af",marginTop:14,fontFamily:"'DM Mono',monospace" }}>
              🎙 Press Play for auto-narrated reel · Click any slide to jump to it
            </p>
          </div>
        </div>
      )}
    </div>
  );
}



export default AutoReelPage;
