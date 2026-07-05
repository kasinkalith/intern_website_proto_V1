"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, FileText, ChevronDown } from "lucide-react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// 194 frames total
const TOTAL_FRAMES = 194;

// Preload in batches: first batch loads fast so animation is immediately visible
const PRIORITY_FRAMES = 30; // First N frames load with high priority

export default function HeroScroll() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const currentFrameRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const isDrawingRef = useRef(false);
  const stageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [images, setImages] = useState<HTMLImageElement[]>([]);
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStage, setCurrentStage] = useState(0);

  // Create offscreen canvas for smooth blitting
  useEffect(() => {
    const offscreen = document.createElement("canvas");
    offscreen.width = window.innerWidth;
    offscreen.height = window.innerHeight;
    offscreenRef.current = offscreen;
  }, []);

  // Optimised frame draw — uses rAF coalescing to avoid jitter
  const drawFrame = useCallback(
    (index: number) => {
      const canvas = canvasRef.current;
      const offscreen = offscreenRef.current;
      if (!canvas || !offscreen || images.length === 0) return;

      const img = images[index];
      if (!img || !img.complete || img.naturalWidth === 0) return;

      const ctx = canvas.getContext("2d", { alpha: false });
      const offCtx = offscreen.getContext("2d", { alpha: false });
      if (!ctx || !offCtx) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Resize both canvases if viewport changed
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
        offscreen.width = vw;
        offscreen.height = vh;
      }

      // Cover-fit calculation
      const imgRatio = img.naturalWidth / img.naturalHeight;
      const canvasRatio = vw / vh;

      let dw = vw;
      let dh = vh;
      let dx = 0;
      let dy = 0;

      if (imgRatio > canvasRatio) {
        dw = vh * imgRatio;
        dx = (vw - dw) / 2;
      } else {
        dh = vw / imgRatio;
        dy = (vh - dh) / 2;
      }

      // Draw to offscreen first, then blit — eliminates flicker
      offCtx.drawImage(img, dx, dy, dw, dh);
      ctx.drawImage(offscreen, 0, 0);
    },
    [images]
  );

  // Schedule a frame draw via rAF, coalescing rapid updates
  const scheduleFrame = useCallback(
    (index: number) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        drawFrame(index);
        rafRef.current = null;
      });
    },
    [drawFrame]
  );

  // Preload images: priority batch first, then remaining
  useEffect(() => {
    const loadedImages: HTMLImageElement[] = new Array(TOTAL_FRAMES);
    let loadCounter = 0;

    const onLoad = () => {
      loadCounter++;
      setImagesLoaded(loadCounter);
      if (loadCounter === TOTAL_FRAMES) {
        setIsLoading(false);
      }
    };

    const onError = () => {
      loadCounter++;
      setImagesLoaded(loadCounter);
      if (loadCounter === TOTAL_FRAMES) {
        setIsLoading(false);
      }
    };

    const loadFrame = (i: number) => {
      const img = new Image();
      const frameNum = String(i).padStart(3, "0");
      img.decoding = "async";
      img.src = `/scrollimg/ezgif-frame-${frameNum}.jpg`;
      img.onload = onLoad;
      img.onerror = onError;
      loadedImages[i - 1] = img;
    };

    // Priority: load first PRIORITY_FRAMES immediately
    for (let i = 1; i <= PRIORITY_FRAMES; i++) {
      loadFrame(i);
    }
    // Defer remaining frames slightly so priority batch gets bandwidth first
    const timer = setTimeout(() => {
      for (let i = PRIORITY_FRAMES + 1; i <= TOTAL_FRAMES; i++) {
        loadFrame(i);
      }
    }, 100);

    setImages(loadedImages);

    return () => clearTimeout(timer);
  }, []);

  // Once first frame is ready, draw it
  useEffect(() => {
    if (images[0]) {
      drawFrame(0);
    }
  }, [images, drawFrame]);

  // Set up GSAP ScrollTrigger
  useEffect(() => {
    if (isLoading || images.length === 0 || !containerRef.current || !canvasRef.current) return;

    drawFrame(0);

    const obj = { frame: 0 };
    const FRAME_SPEED = 20; // Scroll pixels per frame
    const END_HOLD = 800; // Scroll pixels to hold the last frame at the end
    const totalFrameDuration = (TOTAL_FRAMES - 1) * FRAME_SPEED; // 193 * 20 = 3860px
    const totalTimelineDuration = totalFrameDuration + END_HOLD; // 4660px
    const stageSegment = totalFrameDuration / 4; // 965px per text stage

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: containerRef.current,
        start: "top top",
        end: () => `+=${totalTimelineDuration}`,
        pin: true,
        pinSpacing: true, // Explicitly enable pin spacing to push down block elements below
        scrub: 1, // Smooth scrubbing
        anticipatePin: 1,
        onUpdate: (self) => {
          const progress = self.progress;
          const currentPosition = progress * totalTimelineDuration;

          // Stage transitions based on progress over calculated segments
          if (currentPosition < stageSegment) {
            setCurrentStage(0);
          } else if (currentPosition < stageSegment * 2) {
            setCurrentStage(1);
          } else if (currentPosition < stageSegment * 3) {
            setCurrentStage(2);
          } else {
            setCurrentStage(3);
          }
        },
      },
    });

    // Animate frames over the frame duration
    tl.to(obj, {
      frame: TOTAL_FRAMES - 1,
      snap: "frame",
      ease: "none",
      duration: totalFrameDuration,
      onUpdate: () => {
        const idx = Math.round(obj.frame);
        if (idx !== currentFrameRef.current) {
          currentFrameRef.current = idx;
          scheduleFrame(idx);
        }
      },
    }, 0);

    // Text sequence: each stage takes 965 units of time (200 in, 565 hold, 200 out)
    stages.forEach((_, i) => {
      const el = stageRefs.current[i];
      if (!el) return;

      const stageStart = i * stageSegment;
      const stageEnd = (i + 1) * stageSegment;

      if (i === 0) {
        // Stage 0 is already visible initially. We only animate it out.
        tl.to(el, 
          { autoAlpha: 0, y: -40, scale: 0.95, duration: 200, ease: "power2.in" }, 
          stageEnd - 200
        );
      } else {
        // Animate In
        tl.fromTo(el, 
          { autoAlpha: 0, y: 40, scale: 0.95 }, 
          { autoAlpha: 1, y: 0, scale: 1, duration: 200, ease: "power2.out" }, 
          stageStart
        );
        // Animate Out
        tl.to(el, 
          { autoAlpha: 0, y: -40, scale: 0.95, duration: 200, ease: "power2.in" }, 
          stageEnd - 200
        );
      }
    });

    // End pause: hold the last frame so it doesn't unpin immediately
    tl.to({}, { duration: END_HOLD });

    const handleResize = () => {
      if (offscreenRef.current) {
        offscreenRef.current.width = window.innerWidth;
        offscreenRef.current.height = window.innerHeight;
      }
      scheduleFrame(currentFrameRef.current);
      ScrollTrigger.refresh();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, [isLoading, images, scheduleFrame]);

  // Stage content definitions
  const stages = [
    {
      accent: "bg-cyan-bright",
      accentText: "text-cyan-bright",
      label: "IoT & Automotive Solutions",
      heading: (
        <>
          Products That Power <br />
          <span className="text-gradient">Real-World Operations</span>
        </>
      ),
      body: "APM delivers certified speed governors, GPS tracking, and safety systems built for fleets, schools, and transport operators across India.",
      cta: (
        <Link
          href="/products"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-cyan-bright text-navy-dark hover:bg-cyan-bright/90 hover:-translate-y-0.5 transition-all duration-300 shadow-lg shadow-cyan-500/20 pointer-events-auto"
        >
          View Products <ArrowRight className="w-4 h-4" />
        </Link>
      ),
      side: "left" as const,
    },
    {
      accent: "bg-emerald-400",
      accentText: "text-emerald-400",
      label: "Fleet & Safety Systems",
      heading: (
        <>
          The Infrastructure Behind <br />
          <span className="text-gradient-cyan-blue">Seamless Service</span>
        </>
      ),
      body: "Government-approved AIS 140 Vehicle Location Tracking Devices with dual eSIM profiles, SOS panic buttons, and real-time telemetry streaming to RTO command centers.",
      cta: (
        <Link
          href="/solutions/b2b"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-gradient-to-r from-cyan-bright to-blue-600 text-white hover:opacity-90 hover:-translate-y-0.5 transition-all duration-300 pointer-events-auto"
        >
          B2B Solutions <ArrowRight className="w-4 h-4" />
        </Link>
      ),
      side: "right" as const,
    },
    {
      accent: "bg-amber-400",
      accentText: "text-amber-400",
      label: "Certified Automotive",
      heading: (
        <>
          Certified Automotive Solutions <br />
          <span className="text-gradient">That Keep You Ahead</span>
        </>
      ),
      body: "Ensure passenger safety with continuous loop-recording 4G cameras, live streaming, and AI-enabled driver monitoring systems tailored for school buses and transit fleets.",
      cta: (
        <Link
          href="/solutions/b2g"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-white text-navy-dark hover:bg-white/90 hover:-translate-y-0.5 transition-all duration-300 pointer-events-auto"
        >
          B2G Solutions <FileText className="w-4 h-4" />
        </Link>
      ),
      side: "left" as const,
    },
    {
      accent: "bg-purple-400",
      accentText: "text-purple-400",
      label: "Road Infrastructure",
      heading: (
        <>
          Automated Testing Lanes <br />
          <span className="text-gradient-cyan-blue">& Compliance Accessories</span>
        </>
      ),
      body: "From computerized driving test tracks and highway signage to EN-standard reflective tapes, we engineer complete road safety and compliance infrastructure.",
      cta: (
        <Link
          href="/solutions/software"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-cyan-bright text-navy-dark hover:bg-cyan-bright/90 hover:-translate-y-0.5 transition-all duration-300 pointer-events-auto"
        >
          Software & Cloud <ArrowRight className="w-4 h-4" />
        </Link>
      ),
      side: "right" as const,
    },
  ];

  const percentLoaded = Math.floor((imagesLoaded / TOTAL_FRAMES) * 100);

  return (
    <div ref={containerRef} className="relative w-full h-screen overflow-hidden bg-black">
      {/* ── Loading Overlay ───────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="absolute inset-0 z-[60] bg-[#050d1a] flex flex-col items-center justify-center gap-6">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border-4 border-white/5" />
            <div className="absolute inset-0 rounded-full border-4 border-t-cyan-bright animate-spin" />
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-white font-display text-xl font-bold tracking-wider uppercase">
              APM Cinematic Experience
            </h2>
            <p className="text-white/50 text-sm">Loading visual timeline…</p>
            <div className="w-64 h-1 bg-white/5 rounded-full overflow-hidden mt-4">
              <div
                className="h-full bg-gradient-to-r from-cyan-bright to-blue-500 rounded-full transition-all duration-200"
                style={{ width: `${percentLoaded}%` }}
              />
            </div>
            <span className="text-cyan-bright font-bold text-sm mt-1">{percentLoaded}%</span>
          </div>
        </div>
      )}

      {/* ── Frame Canvas — z-0, full screen ──────────────────────────────────── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: "block" }}
      />

      {/* ── Vignette gradient — purely decorative, very light ────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(5,13,26,0.35) 100%)",
          zIndex: 5,
        }}
      />

      {/* ── Left-edge reading gradient — improves text legibility on left side ── */}
      <div
        className="absolute inset-y-0 left-0 w-[50%] pointer-events-none"
        style={{
          background:
            "linear-gradient(to right, rgba(5,13,26,0.42) 0%, rgba(5,13,26,0.12) 65%, transparent 100%)",
          zIndex: 6,
        }}
      />

      {/* ── Hero Content ──────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 z-20 flex items-start pointer-events-none"
      >
        <div className="w-full max-w-7xl mx-auto h-full relative">
          {stages.map((stage, i) => {
            return (
              <div
                key={i}
                ref={(el) => {
                  stageRefs.current[i] = el;
                }}
                className={`
                  absolute
                  left-4 right-4
                  md:left-auto md:right-auto
                  md:w-full md:max-w-[460px]
                  ${i === 0 ? "opacity-100 visible" : "opacity-0 invisible"}
                  ${stage.side === "right" ? "md:right-10" : "md:left-10"}
                `}
                style={{ top: "clamp(6rem, 18vh, 12rem)" }}
              >
                {/* Minimal glass layer — near-invisible, pure readability aid */}
                <div
                  className="rounded-2xl p-6 md:p-8 flex flex-col gap-5"
                  style={{
                    background: "rgba(5, 13, 26, 0.10)",
                    backdropFilter: "blur(4px)",
                    WebkitBackdropFilter: "blur(4px)",
                  }}
                >
                  {/* Accent pill */}
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 w-fit">
                    <span className={`w-2 h-2 rounded-full ${stage.accent} animate-pulse`} />
                    <span
                      className={`text-[10px] uppercase font-bold tracking-widest ${stage.accentText}`}
                    >
                      {stage.label}
                    </span>
                  </div>

                  {/* Heading — typography does the heavy lifting */}
                  <div className="text-3xl md:text-[2.6rem] font-display font-extrabold text-white leading-[1.15] tracking-tight drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)]">
                    {i === 0 ? (
                      <h1>{stage.heading}</h1>
                    ) : (
                      <h2>{stage.heading}</h2>
                    )}
                  </div>

                  {/* Body copy */}
                  <p
                    className="text-white/75 text-sm md:text-[0.95rem] leading-relaxed max-w-sm drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]"
                  >
                    {stage.body}
                  </p>

                  {/* CTA */}
                  <div className="flex flex-wrap items-center gap-3 mt-1">
                    {stage.cta}
                    {i === 0 && (
                      <Link
                        href="/contact"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold border border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 hover:-translate-y-0.5 transition-all duration-300 pointer-events-auto"
                      >
                        Enquire Now
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Scroll indicator — bottom center ─────────────────────────────────── */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-white/40 text-[11px] tracking-widest uppercase animate-bounce pointer-events-none"
        style={{ zIndex: 30 }}
      >
        <span>Scroll to explore</span>
        <ChevronDown className="w-4 h-4" />
      </div>

      {/* ── Stage progress dots — right edge ─────────────────────────────────── */}
      <div
        className="absolute right-5 top-1/2 -translate-y-1/2 flex flex-col gap-3"
        style={{ zIndex: 30 }}
      >
        {stages.map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-300 ${currentStage === i
                ? "w-2.5 h-2.5 bg-cyan-bright shadow-[0_0_8px_2px_rgba(0,220,255,0.4)]"
                : "w-2 h-2 bg-white/20"
              }`}
          />
        ))}
      </div>
    </div>
  );
}
