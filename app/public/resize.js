// TQueries v0.2.1 — shrink screenshots before the vision model (fewer image tokens = faster read).
(function (root) {
  const MAX_SIDE = 1280;
  // Target size keeping aspect ratio; never upscales.
  // fitSize: Target size within the max side.
  function fitSize(w, h, max = MAX_SIDE) { const k = Math.min(1, max / Math.max(w, h)); return { w: Math.round(w * k), h: Math.round(h * k), scaled: k < 1 }; }
  // Browser only: data URL -> downscaled data URL (PNG kept sharp for text; big ones re-encoded).
  // downscale: Downscales an image before upload to the local server (less memory, faster OCR).
  // Why these APIs: canvas.getContext: gets a 2D/WebGL drawing context for frames and overlays;
  //   CanvasRenderingContext2D.drawImage: copies/scales the current video frame into a canvas (GPU-accelerated in
  //   browsers); canvas.toDataURL/toBlob: exports the canvas as an image; document.createElement: builds UI
  //   elements at runtime.
  function downscale(dataUrl, max = MAX_SIDE) {
    return new Promise(ok => { const img = new Image(); img.onload = () => { const s = fitSize(img.naturalWidth, img.naturalHeight, max);
      if (!s.scaled) return ok(dataUrl); const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, s.w, s.h); ok(c.toDataURL('image/png')); };
      // img.onerror: Falls back to the original on error.
      img.onerror = () => ok(dataUrl); img.src = dataUrl; });
  }
  const api = { MAX_SIDE, fitSize, downscale };
  if (typeof module !== 'undefined') module.exports = api; else root.TQResize = api;
})(this);
