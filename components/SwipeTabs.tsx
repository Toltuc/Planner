'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';

interface SwipeTabsProps {
  tabs: { id: string; label: string }[];
  activeId: string;
  onTabChange: (id: string) => void;
  disableSwipe?: boolean;
  directSwipe?: boolean;
  children: React.ReactNode[];
  onTabMenu?: (id: string, rect: DOMRect) => void;
  dragMode?: boolean;
  wobble?: boolean;
  onCatDragStart?: (id: string) => void;
  onCatDragOver?: (e: React.DragEvent, id: string) => void;
  onCatDragEnd?: () => void;
  onCatTouchStart?: (id: string, e: React.TouchEvent) => void;
  onCatTouchMove?: (e: React.TouchEvent) => void;
  onCatTouchEnd?: () => void;
}

export default function SwipeTabs({ tabs, activeId, onTabChange, children, onTabMenu, dragMode, wobble, disableSwipe, directSwipe, onCatDragStart, onCatDragOver, onCatDragEnd, onCatTouchStart, onCatTouchMove, onCatTouchEnd }: SwipeTabsProps) {
  const activeIndex = tabs.findIndex(t => t.id === activeId);
  const safeIndex = activeIndex < 0 ? Math.max(0, tabs.length - 1) : activeIndex;

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const menuBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Touch tracking
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);
  const dragDeltaX = useRef(0);
  const [liveOffset, setLiveOffset] = useState(0);
  const isAnimating = useRef(false);

  // Arrow confirmation states
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const arrowTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Drag visual states
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const prevIndexRef = useRef(-1);

  // Move indicator to given tab index; animated = true except on very first mount
  const updateIndicator = useCallback((index: number, animated: boolean) => {
    const btn = tabRefs.current[index];
    const indicator = indicatorRef.current;
    const bar = tabBarRef.current;
    if (!btn || !indicator || !bar) return;
    indicator.style.transition = animated
      ? 'left 0.28s cubic-bezier(0.4,0,0.2,1), width 0.28s cubic-bezier(0.4,0,0.2,1)'
      : 'none';
    const btnRect = btn.getBoundingClientRect();
    const barRect = bar.getBoundingClientRect();
    // Account for tab bar horizontal scroll so indicator stays aligned with content
    indicator.style.left = `${btnRect.left - barRect.left + bar.scrollLeft}px`;
    indicator.style.width = `${btnRect.width}px`;
  }, []);

  // Single effect: fires after every render where safeIndex or tabs change.
  // rAF ensures the browser has completed layout before we read offsetLeft.
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      const isFirst = prevIndexRef.current === -1;
      prevIndexRef.current = safeIndex;
      updateIndicator(safeIndex, !isFirst);
      // Scroll active tab into view within the tab bar
      const btn = tabRefs.current[safeIndex];
      if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [safeIndex, tabs, updateIndicator]);

  // Edge-swipe detection: check if scrollable child is at edge
  const canSwipeLeft = useCallback(() => {
    // Find the active child container
    const activeChild = containerRef.current?.querySelector(`[data-swipetab-index="${safeIndex}"]`);
    if (!activeChild) return false; // Disable swipe if element not found
    const scrollable = activeChild.querySelector('.overflow-x-auto') || activeChild;
    if (!scrollable) return false;
    const el = scrollable as HTMLElement;
    // Check if at right edge (can swipe left to next tab)
    // Use 20px threshold for reliable detection on mobile
    const maxScroll = el.scrollWidth - el.clientWidth;
    const atRightEdge = maxScroll <= 0 || el.scrollLeft >= maxScroll - 20;
    return atRightEdge;
  }, [safeIndex]);

  const canSwipeRight = useCallback(() => {
    // Find the active child container
    const activeChild = containerRef.current?.querySelector(`[data-swipetab-index="${safeIndex}"]`);
    if (!activeChild) return false; // Disable swipe if element not found
    const scrollable = activeChild.querySelector('.overflow-x-auto') || activeChild;
    if (!scrollable) return false;
    const el = scrollable as HTMLElement;
    // Check if at left edge (can swipe right to prev tab)
    // Use 20px threshold for reliable detection on mobile
    const atLeftEdge = el.scrollLeft <= 20;
    return atLeftEdge;
  }, [safeIndex]);

  // Swipe handlers - disabled during dragMode or disableSwipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimating.current || dragMode || disableSwipe) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
    dragDeltaX.current = 0;
  }, [dragMode]);

  const clearArrows = useCallback(() => {
    if (arrowTimeoutRef.current) {
      clearTimeout(arrowTimeoutRef.current);
    }
    setShowLeftArrow(false);
    setShowRightArrow(false);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragMode || disableSwipe) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (!isDragging.current) {
      if (Math.abs(dx) < Math.abs(dy) * 0.8) return;
      isDragging.current = true;
    }

    if (directSwipe) {
      dragDeltaX.current = dx;
      return;
    }

    const canSwipeL = canSwipeLeft();
    const canSwipeR = canSwipeRight();
    if (dx < -30 && canSwipeL && safeIndex < tabs.length - 1) {
      setShowRightArrow(true);
      if (arrowTimeoutRef.current) clearTimeout(arrowTimeoutRef.current);
      arrowTimeoutRef.current = setTimeout(() => setShowRightArrow(false), 2000);
    } else if (dx > 30 && canSwipeR && safeIndex > 0) {
      setShowLeftArrow(true);
      if (arrowTimeoutRef.current) clearTimeout(arrowTimeoutRef.current);
      arrowTimeoutRef.current = setTimeout(() => setShowLeftArrow(false), 2000);
    }
  }, [dragMode, directSwipe, canSwipeLeft, canSwipeRight, safeIndex, tabs.length]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current || dragMode || disableSwipe) return;
    isDragging.current = false;

    if (directSwipe) {
      const delta = dragDeltaX.current;
      dragDeltaX.current = 0;
      setLiveOffset(0);
      if (delta < -50 && safeIndex < tabs.length - 1) {
        onTabChange(tabs[safeIndex + 1].id);
      } else if (delta > 50 && safeIndex > 0) {
        onTabChange(tabs[safeIndex - 1].id);
      }
      return;
    }

    setLiveOffset(0);
  }, [dragMode, directSwipe, safeIndex, tabs, onTabChange]);

  // Arrow click handlers for confirmed swipe
  const handleLeftArrowClick = useCallback(() => {
    if (safeIndex > 0) {
      onTabChange(tabs[safeIndex - 1].id);
      const nextBtn = tabRefs.current[safeIndex - 1];
      if (nextBtn) nextBtn.scrollIntoView({ behavior: 'auto', inline: 'nearest', block: 'nearest' });
    }
    clearArrows();
  }, [safeIndex, tabs, onTabChange, clearArrows]);

  const handleRightArrowClick = useCallback(() => {
    if (safeIndex < tabs.length - 1) {
      onTabChange(tabs[safeIndex + 1].id);
      const nextBtn = tabRefs.current[safeIndex + 1];
      if (nextBtn) nextBtn.scrollIntoView({ behavior: 'auto', inline: 'nearest', block: 'nearest' });
    }
    clearArrows();
  }, [safeIndex, tabs, onTabChange, clearArrows]);

  const trackStyle: React.CSSProperties = {
    display: 'flex',
    width: `${tabs.length * 100}%`,
    transform: `translateX(calc(${-safeIndex * 100 / tabs.length}% + ${liveOffset}px))`,
    transition: 'none',
    willChange: 'transform',
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab bar */}
      <div ref={tabBarRef} className={`relative shrink-0 flex items-center px-2 pt-1 pb-0 gap-1 scrollbar-hide ${dragMode ? 'overflow-x-hidden' : 'overflow-x-auto scroll-smooth'}`} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
        {/* Wobble animation keyframes */}
        <style>{`
          @keyframes wobble {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(-2deg); }
            75% { transform: rotate(2deg); }
          }
          .drag-wobble {
            animation: wobble 0.3s ease-in-out infinite;
          }
          .drag-wobble:nth-child(odd) {
            animation-delay: 0.1s;
          }
          .drag-wobble:nth-child(even) {
            animation-delay: 0.2s;
          }
        `}</style>
        {tabs.map((tab, i) => (
          <div
            key={tab.id}
            data-tabid={tab.id}
            className={`relative flex items-center flex-shrink-0 transition-all ${
              wobble && dragMode && !draggingId ? 'drag-wobble' : ''
            } ${
              dragMode ? 'ring-1 ring-neon-purple/30 bg-neon-purple/5 rounded-lg' : ''
            } ${
              draggingId === tab.id ? 'ring-2 ring-neon-purple shadow-lg shadow-neon-purple/30 scale-105 z-50 opacity-90 animate-none' : ''
            } ${
              dragOverId === tab.id && draggingId !== tab.id ? 'ring-2 ring-emerald-400 bg-emerald-500/20 animate-none' : ''
            }`}
            draggable={dragMode}
            onDragStart={(e) => {
              if (!dragMode) return;
              setDraggingId(tab.id);
              onCatDragStart?.(tab.id);
              // Constrain drag to horizontal only
              if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
              }
            }}
            onDrag={(e) => {
              if (!dragMode || !draggingId) return;
              // Force Y position to stay at 0 (prevent vertical drag)
              if (e.clientY !== 0) {
                e.preventDefault();
              }
            }}
            onDragOver={(e) => {
              if (!dragMode) return;
              e.preventDefault();
              setDragOverId(tab.id);
              onCatDragOver?.(e, tab.id);
            }}
            onDragLeave={() => {
              if (dragOverId === tab.id) setDragOverId(null);
            }}
            onDragEnd={() => {
              setDraggingId(null);
              setDragOverId(null);
              onCatDragEnd?.();
            }}
            onTouchStart={(e) => {
              if (!dragMode) return;
              onCatTouchStart?.(tab.id, e);
            }}
            onTouchMove={(e) => {
              if (!dragMode) return;
              onCatTouchMove?.(e);
            }}
            onTouchEnd={() => {
              if (!dragMode) return;
              onCatTouchEnd?.();
            }}
          >
            <button
              ref={el => { tabRefs.current[i] = el; }}
              onClick={() => !dragMode && onTabChange(tab.id)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors relative whitespace-nowrap ${
                dragMode ? 'cursor-move' : ''
              } ${
                tab.id === activeId ? 'text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              {tab.label}
            </button>
            {onTabMenu && tab.id === activeId && (
              <button
                data-menu
                ref={el => { menuBtnRefs.current[i] = el; }}
                onClick={(e) => {
                  e.stopPropagation();
                  onTabMenu(tab.id, (e.currentTarget as HTMLElement).getBoundingClientRect());
                }}
                className="p-0.5 opacity-60 active:opacity-100 transition-opacity -ml-1 mr-1"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        {/* Sliding indicator */}
        <div
          ref={indicatorRef}
          className="absolute bottom-0 h-[2px] rounded-full bg-neon-purple"
          style={{ left: 0, width: 0 }}
        />
      </div>
      <div className="w-full h-px bg-white/10 shrink-0" />

      {/* Swipeable content */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div ref={trackRef} style={trackStyle} className="h-full">
          {React.Children.map(children, (child, i) => (
            <div
              key={tabs[i]?.id ?? i}
              data-swipetab-index={i}
              className="h-full overflow-y-auto overflow-x-hidden"
              style={{ width: `${100 / tabs.length}%` }}
            >
              {child}
            </div>
          ))}
        </div>

        {/* Left Arrow - Swipe confirmation */}
        {showLeftArrow && safeIndex > 0 && (
          <button
            onClick={handleLeftArrowClick}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-50 w-12 h-12 rounded-full bg-neon-purple/90 hover:bg-neon-purple text-white shadow-lg flex items-center justify-center transition-all animate-pulse"
            style={{ animationDuration: '1s' }}
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
        )}

        {/* Right Arrow - Swipe confirmation */}
        {showRightArrow && safeIndex < tabs.length - 1 && (
          <button
            onClick={handleRightArrowClick}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-50 w-12 h-12 rounded-full bg-neon-purple/90 hover:bg-neon-purple text-white shadow-lg flex items-center justify-center transition-all animate-pulse"
            style={{ animationDuration: '1s' }}
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        )}
      </div>
    </div>
  );
}
