/*
 * ImgTools — shared client-side image downscaling.
 *
 * Every upload path in this project (progress photos today, product photos
 * next) runs through here, so an untouched 6 MB phone photo never reaches the
 * server or the disk it is stored on. The server enforces the same ceiling
 * again in server.js — this side just makes the upload small and fast.
 *
 * No dependencies and no build step, same as the rest of the project.
 */
window.ImgTools = (function () {
  'use strict';

  var MAX_PX = 1280;              /* longest side after resizing */
  var MAX_BYTES = 600 * 1024;     /* target size of the encoded JPEG */
  var START_QUALITY = 0.85;
  var MIN_QUALITY = 0.5;

  /* File/Blob -> canvas, scaled so the longest side is at most maxPx */
  function loadToCanvas(file, maxPx) {
    var limit = maxPx || MAX_PX;
    return new Promise(function (resolve, reject) {
      function make(src, w, h) {
        if (!w || !h) { reject(new Error('bad_image')); return; }
        var scale = Math.min(1, limit / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * scale));
        c.height = Math.max(1, Math.round(h * scale));
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
        resolve(c);
      }
      function fallback() {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () { make(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad_image')); };
        img.src = url;
      }
      /* createImageBitmap honours EXIF rotation, so phone photos stay upright */
      if (window.createImageBitmap) {
        createImageBitmap(file, { imageOrientation: 'from-image' })
          .then(function (bmp) { make(bmp, bmp.width, bmp.height); })
          .catch(fallback);
      } else fallback();
    });
  }

  /* rough byte size of a base64 data URL, without decoding it */
  function bytesOf(dataUrl) {
    var i = dataUrl.indexOf(',');
    var b64 = i < 0 ? dataUrl : dataUrl.slice(i + 1);
    var pad = b64.slice(-2) === '==' ? 2 : (b64.slice(-1) === '=' ? 1 : 0);
    return Math.floor(b64.length * 3 / 4) - pad;
  }

  /* canvas -> JPEG data URL, stepping quality down until it fits the budget */
  function toDataUrl(canvas, maxBytes) {
    var budget = maxBytes || MAX_BYTES;
    var q = START_QUALITY;
    var url = canvas.toDataURL('image/jpeg', q);
    while (bytesOf(url) > budget && q > MIN_QUALITY) {
      q = Math.round((q - 0.1) * 100) / 100;
      url = canvas.toDataURL('image/jpeg', q);
    }
    return url;
  }

  /* one call: File -> small JPEG data URL ready to POST */
  function prepare(file, opts) {
    opts = opts || {};
    return loadToCanvas(file, opts.maxPx).then(function (c) {
      return { dataUrl: toDataUrl(c, opts.maxBytes), width: c.width, height: c.height };
    });
  }

  return {
    loadToCanvas: loadToCanvas,
    toDataUrl: toDataUrl,
    bytesOf: bytesOf,
    prepare: prepare,
    MAX_PX: MAX_PX,
    MAX_BYTES: MAX_BYTES
  };
})();
