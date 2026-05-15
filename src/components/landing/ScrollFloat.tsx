import React, {
  Fragment,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useIsMobile } from "@/hooks/use-mobile";
import "./ScrollFloat.css";

gsap.registerPlugin(ScrollTrigger);

interface ScrollFloatProps {
  children: React.ReactNode;
  scrollContainerRef?: MutableRefObject<HTMLElement | null>;
  containerClassName?: string;
  textClassName?: string;
  animationDuration?: number;
  ease?: string;
  scrollStart?: string;
  scrollEnd?: string;
  stagger?: number;
}

/**
 * Recursively walks any React.ReactNode and replaces every character in
 * every string descendant with a <span className="char">. Inline elements
 * (em, span, br, etc.) are preserved — only the text inside them gets
 * split. This lets ScrollFloat keep italic/colored emphasis intact while
 * still animating each letter on scroll.
 */
function splitToChars(node: React.ReactNode, keyBase = "0"): React.ReactNode {
  if (node == null || typeof node === "boolean") return null;
  if (typeof node === "string") {
    return Array.from(node).map((ch, i) => (
      <span className="char" key={`${keyBase}-${i}`}>
        {/* Inner .prox-letter so proximity tracker animates the title
            character; GSAP animates the outer .char's transform. */}
        <span className="prox-letter">{ch === " " ? " " : ch}</span>
      </span>
    ));
  }
  if (typeof node === "number") {
    return splitToChars(String(node), keyBase);
  }
  if (Array.isArray(node)) {
    return node.map((c, i) => (
      <Fragment key={`${keyBase}-${i}`}>{splitToChars(c, `${keyBase}-${i}`)}</Fragment>
    ));
  }
  if (isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>;
    const { children } = element.props;
    return cloneElement(element, {}, splitToChars(children, keyBase));
  }
  return node;
}

export default function ScrollFloat({
  children,
  scrollContainerRef,
  containerClassName = "",
  textClassName = "",
  animationDuration = 1,
  ease = "back.inOut(2)",
  scrollStart = "center bottom+=50%",
  scrollEnd = "bottom bottom-=40%",
  stagger = 0.03,
}: ScrollFloatProps) {
  const containerRef = useRef<HTMLHeadingElement | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) return;
    const el = containerRef.current;
    if (!el) return;

    const scroller =
      scrollContainerRef && scrollContainerRef.current ? scrollContainerRef.current : window;

    const charElements = el.querySelectorAll<HTMLElement>(".char");

    const tween = gsap.fromTo(
      charElements,
      {
        willChange: "opacity, transform",
        opacity: 0,
        yPercent: 120,
        scaleY: 2.3,
        scaleX: 0.7,
        transformOrigin: "50% 0%",
      },
      {
        duration: animationDuration,
        ease,
        opacity: 1,
        yPercent: 0,
        scaleY: 1,
        scaleX: 1,
        stagger,
        scrollTrigger: {
          trigger: el,
          scroller,
          start: scrollStart,
          end: scrollEnd,
          scrub: true,
        },
      }
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [scrollContainerRef, animationDuration, ease, scrollStart, scrollEnd, stagger, children, isMobile]);

  if (isMobile) {
    return (
      <h2 className={`scroll-float ${containerClassName}`}>
        <span className={`scroll-float-text ${textClassName}`}>{children}</span>
      </h2>
    );
  }

  return (
    <h2 ref={containerRef} className={`scroll-float ${containerClassName}`}>
      <span className={`scroll-float-text ${textClassName}`}>{splitToChars(children)}</span>
    </h2>
  );
}
