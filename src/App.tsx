import { useState, useEffect, useRef, useCallback } from 'react';
import Lenis from 'lenis';

interface KreaImage {
  id: string;
  image_url: string;
  prompt?: string;
  width?: number;
  height?: number;
}

// Convert full-res PNG URL to optimized WebP/AVIF thumbnail via Vercel Native Image Optimizer
// Falls back to original URL in local Vite dev environment.
const getThumbnailUrl = (originalUrl: string): string => {
  if (import.meta.env.DEV) {
    return originalUrl;
  }
  return `/_vercel/image?url=${encodeURIComponent(originalUrl)}&w=640&q=75`;
};

function App() {
  const [images, setImages] = useState<KreaImage[]>([]);
  const [offset, setOffset] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [selected, setSelected] = useState<KreaImage | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Custom states for UI feedback
  const [downloading, setDownloading] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [showBackToTop, setShowBackToTop] = useState<boolean>(false);

  // Set to filter duplicates
  const seenIds = useRef<Set<string>>(new Set());

  const limit = 40;

  const [numColumns, setNumColumns] = useState<number>(4);

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

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  // Back-to-Top visibility logic
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 800) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Low-level: fetch a single batch (returns raw data, no state mutations)
  const fetchBatch = async (batchOffset: number): Promise<KreaImage[]> => {
    const res = await fetch(
      `/api/k2-feed?itemOffset=${Math.floor(batchOffset)}&limit=${limit}&sort=random&bangers=true&staffPicksFirstPage=true`
    );
    if (!res.ok) throw new Error(`HTTP Error Status: ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  };

  // High-level: fetch N batches in parallel (like Krea.ai does)
  const fetchMultipleBatches = async (startOffset: number, batchCount: number) => {
    if (loading) return;
    setLoading(true);

    try {
      // Fire N API calls simultaneously
      const promises = Array.from({ length: batchCount }, (_, i) =>
        fetchBatch(startOffset + i * limit)
      );
      const results = await Promise.all(promises);
      const allNew = results.flat();

      // Filter out duplicates
      const uniqueNew = allNew.filter(img => {
        if (seenIds.current.has(img.id)) return false;
        seenIds.current.add(img.id);
        return true;
      });

      // Preload image files into browser cache immediately (before React renders)
      // Uses thumbnail URL in production, original URL locally
      uniqueNew.forEach(img => {
        const preloader = new Image();
        preloader.src = getThumbnailUrl(img.image_url);
      });

      setImages(prev => [...prev, ...uniqueNew]);
      setOffset(startOffset + batchCount * limit);

      // Stop loading if the last batch returned less than half of the requested limit
      const lastBatch = results[results.length - 1];
      setHasMore(lastBatch.length >= limit / 2);
    } catch (err) {
      console.error("Lỗi khi tải danh sách ảnh Krea:", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch: 4 parallel API calls (160 images buffer, matches Krea.ai behavior)
  useEffect(() => {
    fetchMultipleBatches(0, 4);
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
      // Scroll trigger: 4 parallel API calls (160 images per scroll trigger) to ensure a massive runway
      fetchMultipleBatches(offsetRef.current, 4);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersect, {
      root: null, // viewport
      rootMargin: '0px 0px 8000px 0px', // trigger a massive 8000px BEFORE sentinel enters viewport
      threshold: 0,
    });

    const sentinel = sentinelRef.current;
    if (sentinel) observer.observe(sentinel);

    return () => {
      if (sentinel) observer.unobserve(sentinel);
      observer.disconnect();
    };
  }, [handleIntersect]);

  // Filter images locally based on prompt search term
  const filteredImages = images.filter(img =>
    img.prompt ? img.prompt.toLowerCase().includes(searchTerm.toLowerCase()) : false
  );

  // Partition images into columns for smooth rendering without layout jumping
  const columns = Array.from({ length: numColumns }, () => [] as KreaImage[]);
  filteredImages.forEach((img, idx) => {
    columns[idx % numColumns].push(img);
  });


  // Copy prompt text to clipboard
  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2000);
    });
  };

  // Safe direct download of image bypass CORS
  const handleDownload = async (url: string, id: string) => {
    if (downloading) return;
    setDownloading(true);

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `krea-${id}.png`;
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
  };

  // Smooth scroll to top helper
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-layout">
      {/* Sticky Header with Search and Stats */}
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
            <div className="search-input-wrapper">
              <input
                type="text"
                className="search-input"
                placeholder="Tìm kiếm prompt ảnh..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <span className="search-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </span>
            </div>

            <div className="stats-badge">
              {filteredImages.length} / {images.length} Ảnh
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <main className="main-content">
        <div className="flex-masonry">
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="masonry-column">
              {col.map((img) => (
                <a
                  href={img.image_url}
                  key={img.id}
                  className="image-card-link"
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    // Allow middle clicks (button 1) or modified clicks (Ctrl, Cmd, Shift) to open natively in new tab.
                    // Otherwise, catch left click to display in-app popup modal.
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button !== 1) {
                      e.preventDefault();
                      setSelected(img);
                    }
                  }}
                >
                  <div
                    className="image-card"
                    style={{ aspectRatio: img.width && img.height ? `${img.width} / ${img.height}` : 'auto' }}
                  >
                    <img
                      src={getThumbnailUrl(img.image_url)}
                      alt={img.prompt?.slice(0, 50) || 'Krea Image'}
                      decoding="async"
                      style={{ width: '100%', height: 'auto', display: 'block' }}
                    />
                    {img.prompt && (
                      <div className="prompt-overlay">
                        <p className="prompt-text-overlay">{img.prompt}</p>
                      </div>
                    )}
                  </div>
                </a>
              ))}
            </div>
          ))}
        </div>

        {/* Sentinel element: IntersectionObserver triggers fetch 1500px before this enters viewport */}
        <div ref={sentinelRef} style={{ height: '1px', width: '100%' }} />

        {!hasMore && (
          <div className="end-msg">
            {searchTerm === '' ? '— Đã hiển thị toàn bộ kho ảnh —' : '— Đang hiển thị kết quả tìm kiếm cục bộ —'}
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

            <div className="modal-body">
              {/* Left Column: Image Preview */}
              <div className="modal-image-section">
                <img src={selected.image_url} alt={selected.prompt || 'Detail preview'} />
              </div>

              {/* Right Column: Prompt & Metadata Actions */}
              <div className="modal-details-section">
                <div className="modal-header-info">
                  <h4>Original Generation</h4>
                  <span className="image-id">ID: {selected.id}</span>
                </div>

                {selected.prompt ? (
                  <>
                    <h4 style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>Prompt câu lệnh</h4>
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
                    {downloading ? 'Đang tải...' : 'Tải xuống PNG'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
