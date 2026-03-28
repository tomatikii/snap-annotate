const WEBHOOK_URL = 'https://n8n.srv1125818.hstgr.cloud/webhook/snap-annotate';
const STATUS_URL = 'https://n8n.srv1125818.hstgr.cloud/webhook/snap-annotate/status';

const $ = id => document.getElementById(id);
const btn = $('generateBtn');
const progress = $('progress');
const errorMsg = $('errorMsg');
const results = $('results');
const gallery = $('gallery');
const lightbox = $('lightbox');
const lightboxImg = $('lightboxImg');
const slideDetail = $('slideDetail');
const slideDetailTitle = $('slideDetailTitle');
const slideDetailDesc = $('slideDetailDesc');
const carouselDots = $('carouselDots');
const arrowLeft = $('arrowLeft');
const arrowRight = $('arrowRight');

let slideUrls = [];
let slidesData = [];
let activeSlideIdx = 0;
let startTime = 0;

// Format toggle
document.querySelectorAll('.format-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.format-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('active');
    btn.setAttribute('aria-pressed', 'true');
  });
});

function getFormat() {
  const active = document.querySelector('.format-btn.active');
  return active ? active.dataset.value : '4:5';
}

// Progress
const STEPS = ['capture', 'analyze', 'render', 'done'];
const STEP_LABELS = {
  capture: 'Capturing screenshot',
  analyze: 'Analyzing elements',
  render: 'Rendering slides',
  done: 'Finishing up'
};
function setProgress(stepName) {
  progress.classList.add('show');
  STEPS.forEach(s => {
    const el = progress.querySelector(`[data-step="${s}"]`);
    const idx = STEPS.indexOf(s);
    const activeIdx = STEPS.indexOf(stepName);
    el.classList.remove('active', 'done');
    if (idx < activeIdx) el.classList.add('done');
    else if (idx === activeIdx) el.classList.add('active');
  });
  // Update button text with current step
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const label = STEP_LABELS[stepName] || 'Working';
  btn.innerHTML = `<span class="spinner"></span> ${label}... ${elapsed}s`;
}
// Keep elapsed time ticking on the button
let timerInterval = null;
function startTimer() {
  stopTimer();
  timerInterval = setInterval(() => {
    if (!btn.classList.contains('loading')) { stopTimer(); return; }
    const activeStep = STEPS.find(s => progress.querySelector(`[data-step="${s}"]`)?.classList.contains('active')) || 'capture';
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const label = STEP_LABELS[activeStep] || 'Working';
    btn.innerHTML = `<span class="spinner"></span> ${label}... ${elapsed}s`;
  }, 1000);
}
function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function resetUI() {
  stopTimer();
  progress.classList.remove('show');
  errorMsg.classList.remove('show');
  results.classList.remove('show');
  slideDetail.classList.remove('show');
  const runStats = document.getElementById('runStats');
  if (runStats) runStats.classList.remove('show');
  gallery.innerHTML = '';
  carouselDots.innerHTML = '';
  slideUrls = [];
  slidesData = [];
  activeSlideIdx = 0;
  btn.disabled = false;
  btn.classList.remove('loading');
  btn.innerHTML = 'GENERATE CAROUSEL';
}

function showError(msg) {
  stopTimer();
  errorMsg.textContent = msg;
  errorMsg.classList.add('show');
  progress.classList.remove('show');
  btn.disabled = false;
  btn.classList.remove('loading');
  btn.innerHTML = 'GENERATE CAROUSEL';
}

function setActiveSlide(idx) {
  activeSlideIdx = idx;
  // Update card states
  document.querySelectorAll('.slide-card').forEach((c, i) => {
    c.classList.toggle('active', i === idx);
  });
  // Update dots
  document.querySelectorAll('.carousel-dot').forEach((d, i) => {
    d.classList.toggle('active', i === idx);
  });
  // Update detail
  if (slidesData[idx]) {
    slideDetailTitle.textContent = slidesData[idx].headline || '';
    slideDetailDesc.textContent = slidesData[idx].description || '';
    if (slidesData[idx].headline || slidesData[idx].description) {
      slideDetail.classList.add('show');
    }
  }
  // Scroll card into view
  const cards = gallery.querySelectorAll('.slide-card');
  if (cards[idx]) {
    cards[idx].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
}

// Arrow navigation
arrowLeft.addEventListener('click', () => {
  if (activeSlideIdx > 0) setActiveSlide(activeSlideIdx - 1);
});
arrowRight.addEventListener('click', () => {
  if (activeSlideIdx < slidesData.length - 1) setActiveSlide(activeSlideIdx + 1);
});

// Keyboard arrows
document.addEventListener('keydown', (e) => {
  if (!results.classList.contains('show')) return;
  if (e.key === 'ArrowLeft' && activeSlideIdx > 0) setActiveSlide(activeSlideIdx - 1);
  if (e.key === 'ArrowRight' && activeSlideIdx < slidesData.length - 1) setActiveSlide(activeSlideIdx + 1);
  if (e.key === 'Escape') lightbox.classList.remove('show');
});

// Generate
btn.addEventListener('click', async () => {
  const url = $('urlInput').value.trim();
  if (!url) { $('urlInput').focus(); return; }
  if (!url.startsWith('http')) { showError('Enter a valid URL starting with https://'); return; }

  resetUI();
  btn.disabled = true;
  btn.classList.add('loading');
  startTime = Date.now();
  setProgress('capture');
  startTimer();

  try {
    const startResp = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format: getFormat() })
    });
    if (!startResp.ok) throw new Error(`Server error ${startResp.status}`);
    const startData = await startResp.json();
    if (!startData.executionId) throw new Error('No execution ID returned');

    const execId = startData.executionId;
    setProgress('analyze');
    let pollCount = 0;

    while (pollCount < 60) {
      await new Promise(r => setTimeout(r, 5000));
      pollCount++;
      if ((Date.now() - startTime) / 1000 > 15) setProgress('render');

      try {
        const statusResp = await fetch(`${STATUS_URL}?id=${execId}`);
        if (!statusResp.ok) continue;
        const statusData = await statusResp.json();

        if (statusData.status === 'processing') continue;
        if (statusData.status === 'error') throw new Error(statusData.message || 'Workflow failed');

        if (statusData.status === 'done') {
          if (!statusData.success || !statusData.slides?.length) {
            throw new Error('No slides generated. Try a different URL.');
          }

          setProgress('done');
          const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(0);
          slidesData = statusData.slides;
          slideUrls = slidesData.map(s => s.url);
          $('resultsMeta').textContent = `${statusData.totalSlides} slides \u00B7 ${totalElapsed}s`;

          // Build gallery
          gallery.innerHTML = '';
          carouselDots.innerHTML = '';
          slidesData.forEach((slide, i) => {
            const label = slide.headline || (i === 0 ? 'Title' : i === slidesData.length - 1 ? 'Summary' : `Step ${i}`);

            // Card
            const card = document.createElement('div');
            card.className = 'slide-card';
            card.setAttribute('role', 'listitem');
            card.innerHTML = `
              <div class="slide-img"><img src="${slide.url}" alt="Slide ${i+1}: ${label}" width="260" height="325" loading="lazy" decoding="async"></div>
              <div class="slide-info">
                <div class="slide-label">${label}</div>
                <div class="slide-meta">
                  <span class="slide-num">${i+1}/${statusData.totalSlides}</span>
                  <button class="slide-dl-btn" data-url="${slide.url}" data-name="slide-${i+1}.png">Save</button>
                </div>
              </div>
            `;
            card.addEventListener('click', () => setActiveSlide(i));
            card.querySelector('.slide-img').addEventListener('dblclick', (e) => {
              e.stopPropagation();
              lightboxImg.src = slide.url;
              lightbox.classList.add('show');
              requestAnimationFrame(() => lightbox.classList.add('fade-in'));
            });
            card.querySelector('.slide-dl-btn').addEventListener('click', (e) => {
              e.stopPropagation();
              downloadImage(e.target.dataset.url, e.target.dataset.name);
            });
            gallery.appendChild(card);

            // Dot
            const dot = document.createElement('button');
            dot.className = 'carousel-dot';
            dot.addEventListener('click', () => setActiveSlide(i));
            carouselDots.appendChild(dot);
          });

          // Staggered card reveal
          document.querySelectorAll('.slide-card').forEach((card, i) => {
            card.style.animationDelay = `${i * 100}ms`;
            card.classList.add('reveal');
          });

          // Run stats
          const costPerSlide = 0.003;
          const estCost = (slidesData.length * costPerSlide + 0.005).toFixed(3);
          const statSlides = document.getElementById('statSlides');
          const statTime = document.getElementById('statTime');
          const statCost = document.getElementById('statCost');
          const runStats = document.getElementById('runStats');
          if (statSlides) statSlides.textContent = statusData.totalSlides;
          if (statTime) statTime.textContent = totalElapsed;
          if (statCost) statCost.textContent = estCost;
          if (runStats) runStats.classList.add('show');

          // Activate first slide
          setActiveSlide(0);

          results.classList.add('show');
          results.scrollIntoView({ behavior: 'smooth', block: 'start' });

          setTimeout(() => {
            stopTimer();
            progress.classList.remove('show');
            btn.disabled = false;
            btn.classList.remove('loading');
            btn.innerHTML = 'GENERATE CAROUSEL';
          }, 1500);
          return;
        }
      } catch (pollErr) {
        if (pollErr.message && !pollErr.message.includes('fetch')) throw pollErr;
      }
    }
    throw new Error('Timed out after 5 minutes. Try again later.');
  } catch (err) {
    showError(err.message || 'Something went wrong.');
  }
});

// Lightbox
function closeLightbox() {
  lightbox.classList.remove('fade-in');
  setTimeout(() => lightbox.classList.remove('show'), 300);
  const cards = gallery.querySelectorAll('.slide-card');
  if (cards[activeSlideIdx]) cards[activeSlideIdx].focus();
}
lightbox.addEventListener('click', closeLightbox);
document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);

async function downloadImage(url, filename) {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) { window.open(url, '_blank'); }
}

// ZIP
$('downloadAllBtn').addEventListener('click', async () => {
  if (!slideUrls.length) return;
  const dlBtn = $('downloadAllBtn');
  dlBtn.textContent = 'Preparing...';
  dlBtn.disabled = true;
  try {
    if (!window.JSZip) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      document.head.appendChild(s);
      await new Promise((r, j) => { s.onload = r; s.onerror = j; });
    }
    const zip = new JSZip();
    const folder = zip.folder('snapannotate');
    for (let i = 0; i < slideUrls.length; i++) {
      try { const r = await fetch(slideUrls[i]); folder.file(`slide-${i+1}.png`, await r.blob()); } catch(e) {}
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'snapannotate.zip';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) { alert('ZIP failed.'); }
  dlBtn.textContent = 'Download All (ZIP)';
  dlBtn.disabled = false;
});

// Copy URLs
$('copyUrlsBtn').addEventListener('click', () => {
  if (!slideUrls.length) return;
  navigator.clipboard.writeText(slideUrls.join('\n')).then(() => {
    const b = $('copyUrlsBtn');
    b.textContent = 'Copied!';
    setTimeout(() => { b.textContent = 'Copy URLs'; }, 2000);
  });
});

// Enter key
$('urlInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
