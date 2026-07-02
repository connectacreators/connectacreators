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
    // Split into words and the whitespace between them. Each word's letters
    // live inside a single .word box (display:inline-block; white-space:nowrap
    // in CSS) so the per-letter inline-block split can never break a word
    // across lines — line breaks only happen at the real spaces between words.
    return node.split(/(\s+)/).map((part, pi) => {
      if (part === "") return null;
      if (/^\s+$/.test(part)) {
        return <Fragment key={`${keyBase}-s${pi}`}> </Fragment>;
      }
      return (
        <span className="word" key={`${keyBase}-w${pi}`}>
          {Array.from(part).map((ch, i) => (
            <span className="char" key={`${keyBase}-w${pi}-${i}`}>
              {/* Inner .prox-letter so proximity tracker animates the title
                  character; GSAP animates the outer .char's transform. */}
              <span className="prox-letter">{ch}</span>
            </span>
          ))}
        </span>
      );
    });
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

/** Plain-text content of a node tree — a stable effect key, unlike the
 *  children reference itself, which changes on every parent re-render. */
function nodeText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) {
    return nodeText((node as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return "";
}

export default function ScrollFloat({
  children,
  scrollContainerRef,
  containerClassName = "",
  textClassName = "",
  animationDuration = 0.8,
  ease = "back.out(1.7)",
  scrollStart = "top 85%",
  scrollEnd = "bottom bottom-=40%",
  stagger = 0.03,
}: ScrollFloatProps) {
  const containerRef = useRef<HTMLHeadingElement | null>(null);
  const isMobile = useIsMobile();
  const childrenKey = nodeText(children);

  useEffect(() => {
    if (isMobile) return;
    const el = containerRef.current;
    if (!el) return;

    const scroller =
      scrollContainerRef && scrollContainerRef.current ? scrollContainerRef.current : window;

    const charElements = el.querySelectorAll<HTMLElement>(".char");

    // One-shot character rise on enter. No scrub and no scaleX/scaleY
    // distortion — those tied the letters to scroll position and left them
    // half-stretched mid-scroll, which read as glitching. Letters simply
    // fade + rise into place once, then keep their natural styling.
    const tween = gsap.fromTo(
      charElements,
      { willChange: "opacity, transform", opacity: 0, yPercent: 100 },
      {
        duration: animationDuration,
        ease,
        opacity: 1,
        yPercent: 0,
        stagger,
        clearProps: "willChange,transform,opacity",
        scrollTrigger: {
          trigger: el,
          scroller,
          start: scrollStart,
          toggleActions: "play none none none",
          once: true,
        },
      }
    );

    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- childrenKey stands in for children
  }, [scrollContainerRef, animationDuration, ease, scrollStart, scrollEnd, stagger, childrenKey, isMobile]);

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
