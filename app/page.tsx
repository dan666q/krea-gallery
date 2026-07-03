"use client";

import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import Lenis from 'lenis';
import Image from 'next/image';

interface KreaImage {
  id: string;
  image_url: string;
  prompt?: string;
  width?: number;
  height?: number;
  color?: string;
}

// The CSS .image-card class handles the dark shimmer loading state, so we don't need a Next.js blur placeholder.
const ImageCard = memo(({ img, index, onSelect }: { img: KreaImage; index: number; onSelect: (img: KreaImage) => void }) => {
  return (
    <a
      href={img.image_url}
      className="image-card-link"
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        e.preventDefault();
        onSelect(img);
      }}
      title={img.prompt || 'Krea Image'}
    >
      <div className="image-card-wrapper" style={{ position: 'relative', backgroundColor: img.color || '#1a1a1a' }}>
        <Image
          src={img.image_url}
          alt={img.prompt || 'Krea Image'}
          width={640}
          height={img.width && img.height ? Math.round(640 * (img.height / img.width)) : 640}
          className="image-card"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          quality={75}
          priority={index < 12}
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
        {img.prompt && (
          <div className="prompt-overlay">
            <p className="prompt-text-overlay">{img.prompt}</p>
          </div>
        )}
      </div>
    </a>
  );
});

ImageCard.displayName = 'ImageCard';

export default function GalleryPage() {
  const [images, setImages] = useState<KreaImage[]>([]);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [selected, setSelected] = useState<KreaImage | null>(null);

  // Custom states for UI feedback
  const [downloading, setDownloading] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [showBackToTop, setShowBackToTop] = useState<boolean>(false);
  
  // Similar images states
  const [similarImages, setSimilarImages] = useState<KreaImage[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState<boolean>(false);

  // Set to filter duplicates
  const seenIds = useRef<Set<string>>(new Set());

  const limit = 40;
  const [numColumns, setNumColumns] = useState<number>(4);

  // Lenis ref to stop/start when modal opens/closes
  const lenisRef = useRef<Lenis | null>(null);

  const columns = useMemo(() => {
    const cols = Array.from({ length: numColumns }, (): KreaImage[] => []);
    images.forEach((img, i) => cols[i % numColumns].push(img));
    return cols;
  }, [images, numColumns]);

  const similarColumns = useMemo(() => {
    const cols = Array.from({ length: numColumns }, (): KreaImage[] => []);
    similarImages.forEach((img, i) => cols[i % numColumns].push(img));
    return cols;
  }, [similarImages, numColumns]);

  // Responsive columns listener
  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setNumColumns(2);
      } else if (width < 1024) {
        setNumColumns(3);
      } else {
        setNumColumns(4); // Capped at 4 columns on desktop for larger image sizes
      }
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  // Initialize Lenis Smooth Scroll
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1.05,
      touchMultiplier: 2,
      infinite: false,
    });

    lenisRef.current = lenis;

    lenis.on('scroll', ({ scroll }: { scroll: number }) => {
      setShowBackToTop(scroll > 800);
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Stop Lenis when modal is open to prevent background page scroll
  useEffect(() => {
    if (selected) {
      lenisRef.current?.stop();
    } else {
      lenisRef.current?.start();
    }
  }, [selected]);

  // Fetch similar images when a detail view opens
  useEffect(() => {
    if (!selected) {
      setSimilarImages([]);
      return;
    }
    
    setLoadingSimilar(true);
    setSimilarImages([]);
    
    fetch(`/api/k2-similar?id=${selected.id}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSimilarImages(data);
        }
      })
      .catch(err => console.error("Lỗi tải ảnh tương tự:", err))
      .finally(() => setLoadingSimilar(false));
  }, [selected]);

  // Low-level: fetch a single batch (returns raw data, no state mutations)
  const fetchBatch = useCallback(async (batchOffset: number): Promise<KreaImage[]> => {
    const res = await fetch(
      `/api/k2-feed?itemOffset=${Math.floor(batchOffset)}&limit=${limit}&sort=random&bangers=true&staffPicksFirstPage=true`
    );
    if (!res.ok) throw new Error(`HTTP Error Status: ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }, []);

  const prefetchNext = useCallback((nextOffset: number) => {
    fetchBatch(nextOffset)
      .then((newImages) => {
        const uniqueNew = newImages.filter(img => {
          if (seenIds.current.has(img.id)) return false;
          seenIds.current.add(img.id);
          return true;
        });
        if (uniqueNew.length > 0) setImages(prev => [...prev, ...uniqueNew]);
      })
      .catch(() => {});
  }, [fetchBatch]);

  // High-level: fetch N batches in parallel (like Krea.ai does)
  const fetchMultipleBatches = async (startOffset: number, batchCount: number) => {
    if (loading) return;
    setLoading(true);

    const currentCount = batchCount;

    try {
      let lastBatchCount = limit;

      // Stream updates: fire N API calls and update state the moment EACH one finishes
      const promises = Array.from({ length: currentCount }, (_, i) =>
        fetchBatch(startOffset + i * limit).then((newImages) => {

          const uniqueNew = newImages.filter(img => {
            if (seenIds.current.has(img.id)) return false;
            seenIds.current.add(img.id);
            return true;
          });

          setImages(prev => [...prev, ...uniqueNew]);

          if (newImages.length < limit / 2) {
            lastBatchCount = newImages.length;
          }
        }).catch(err => console.error("Lỗi ở 1 luồng tải:", err))
      );

      // Wait for all streams to finish just to release the loading lock
      await Promise.all(promises);

      const nextOffset = startOffset + currentCount * limit;
      setOffset(nextOffset);
      setHasMore(lastBatchCount > limit / 2);

      // Prefetch silent — không block UI, không setLoading
      if (lastBatchCount > limit / 2) {
        prefetchNext(nextOffset);
      }
    } catch (err) {
      console.error("Lỗi khi tải danh sách ảnh Krea:", err);
    } finally {
      setLoading(false);
    }
  };

  // Track how many batches to fetch simultaneously, scaling up as user scrolls deeper
  const batchMultiplierRef = useRef(1);

  // Initial fetch: 1 batch (40 images) to get first paint as fast as possible
  useEffect(() => {
    fetchMultipleBatches(0, batchMultiplierRef.current);
    // Prepare for next scroll
    batchMultiplierRef.current = 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IntersectionObserver-based infinite scroll (off-thread, pixel-precise)
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(loading);
  const hasMoreRef = useRef(hasMore);
  const offsetRef = useRef(offset);

  // Keep refs in sync with state
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  const handleIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
    if (entries[0].isIntersecting && hasMoreRef.current && !loadingRef.current) {
      // Scroll trigger: dynamically increasing parallel API calls (40, 80, 120...)
      const currentMultiplier = batchMultiplierRef.current;
      fetchMultipleBatches(offsetRef.current, currentMultiplier);

      // Tăng ở đây, KHÔNG tăng trong fetchMultipleBatches
      if (batchMultiplierRef.current < 4) {
        batchMultiplierRef.current += 1;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersect, {
      root: null, // viewport
      rootMargin: '0px 0px 2500px 0px', // trigger 2500px BEFORE sentinel enters viewport
      threshold: 0,
    });

    const sentinel = sentinelRef.current;
    if (sentinel) observer.observe(sentinel);

    return () => {
      if (sentinel) observer.unobserve(sentinel);
      observer.disconnect();
    };
  }, [handleIntersect]);


  // Copy prompt text to clipboard
  const handleCopyPrompt = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    });
  }, []);

  // Full-resolution download via server proxy (bypass CORS, no optimizer)
  const handleDownload = useCallback(async (url: string, id: string) => {
    if (downloading) return;
    setDownloading(true);

    try {
      const proxyUrl = `/api/image-download?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `krea-${id}-fullres.png`;
      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Lỗi tải xuống ảnh:", error);
      // Fallback: Open in new tab
      window.open(url, '_blank');
    } finally {
      setDownloading(false);
    }
  }, [downloading]);

  // Smooth scroll to top helper
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-layout">
      {/* Sticky Header */}
      <header className="header-wrapper">
        <div className="header-container">
          <div className="brand-section">
            <div className="brand-logo">K</div>
            <div>
              <h1 className="brand-title">Infinity Gallery</h1>
              <p className="brand-subtitle">Powered by Krea.ai & Vercel Serverless</p>
            </div>
          </div>

          <div className="controls-section">
            <div className="stats-badge">
              {images.length} Ảnh
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <main className="main-content">
        <div className="flex-masonry">
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="masonry-column">
              {col.map((img, rowIdx) => (
                <ImageCard
                  key={img.id}
                  img={img}
                  index={rowIdx * 4 + colIdx}
                  onSelect={setSelected}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Sentinel element: IntersectionObserver triggers fetch 1500px before this enters viewport */}
        <div ref={sentinelRef} style={{ height: '1px', width: '100%' }} />

        {!hasMore && (
          <div className="end-msg">
            — Đã hiển thị toàn bộ kho ảnh —
          </div>
        )}
      </main>

      {/* Floating Back-to-Top Button */}
      <button
        className={`back-to-top ${showBackToTop ? 'visible' : ''}`}
        onClick={scrollToTop}
        title="Cuộn lên đầu trang"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
      </button>

      {/* Success Toast Notification */}
      <div className={`toast ${showToast ? 'show' : ''}`}>
        Đã sao chép prompt vào Clipboard!
      </div>

      {/* Side-by-Side Popup Modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-content-container" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelected(null)}>
              &times;
            </button>

            <div className="modal-scroll-area" data-lenis-prevent>
              <div className="modal-body">
                {/* Left Column: Image Preview */}
                <div className="modal-image-section">
                  <img src={selected.image_url} alt={selected.prompt || 'Detail preview'} />
                </div>
  
                {/* Right Column: Prompt & Actions */}
                <div className="modal-details-section">
                  {selected.prompt ? (
                    <>
                      <h4 style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>Prompt</h4>
                      <div className="prompt-box select-all">
                        {selected.prompt}
                      </div>
                    </>
                  ) : (
                    <p className="prompt-box text-zinc-500 italic" style={{ fontSize: '0.85rem' }}>
                      Không tìm thấy dữ liệu prompt cho ảnh này.
                    </p>
                  )}
  
                  <div className="action-buttons">
                    {selected.prompt && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleCopyPrompt(selected.prompt || '')}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        Copy Prompt
                      </button>
                    )}
  
                    <button
                      className="btn btn-primary"
                      onClick={() => handleDownload(selected.image_url, selected.id)}
                      disabled={downloading}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                      {downloading ? 'Đang tải...' : 'Tải Full Resolution'}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Similar Images Section */}
              <div className="similar-section">
                <h3 className="similar-title">Ảnh tương tự</h3>
                {loadingSimilar ? (
                  <div className="similar-loading">
                    <svg className="similar-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25"></circle>
                      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"></path>
                    </svg>
                    <span>Đang tìm ảnh cùng phong cách...</span>
                  </div>
                ) : similarImages.length > 0 ? (
                  <div className="flex-masonry">
                    {similarColumns.map((col, colIdx) => (
                      <div key={colIdx} className="masonry-column">
                        {col.map((img, rowIdx) => (
                          <ImageCard
                            key={img.id}
                            img={img}
                            index={rowIdx * numColumns + colIdx}
                            onSelect={setSelected}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="similar-empty">Không tìm thấy ảnh tương tự.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
