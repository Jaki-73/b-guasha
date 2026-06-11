/*
 * EyeCensor — automatic eye detection for privacy bars on progress photos.
 * Uses Google MediaPipe Face Detector (loaded from CDN at runtime, runs fully
 * on the device — the photo never leaves the phone for detection).
 * If the CDN or detection fails, the app falls back to manual bar placement.
 */
window.EyeCensor = (function () {
  'use strict';

  var CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  var MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
  var detectorPromise = null;

  function getDetector() {
    if (!detectorPromise) {
      detectorPromise = import(CDN + '/vision_bundle.mjs').then(function (vision) {
        return vision.FilesetResolver.forVisionTasks(CDN + '/wasm').then(function (fileset) {
          return vision.FaceDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL },
            runningMode: 'IMAGE',
            minDetectionConfidence: 0.4
          });
        });
      });
      // if loading fails, allow a retry next time
      detectorPromise.catch(function () { detectorPromise = null; });
    }
    return detectorPromise;
  }

  /**
   * Detect eye positions on an image/canvas.
   * Returns Promise<Array<{rx,ry,lx,ly}>> in pixel coordinates (one entry per face),
   * or null when detection is unavailable/failed.
   */
  function detect(source) {
    var w = source.width || source.naturalWidth;
    var h = source.height || source.naturalHeight;
    return getDetector()
      .then(function (detector) {
        var res = detector.detect(source);
        var faces = (res && res.detections) || [];
        return faces
          .map(function (d) {
            var k = d.keypoints || [];
            if (k.length < 2) return null;
            // keypoints[0] = right eye, keypoints[1] = left eye (normalized 0..1)
            return { rx: k[0].x * w, ry: k[0].y * h, lx: k[1].x * w, ly: k[1].y * h };
          })
          .filter(Boolean);
      })
      .catch(function (e) {
        console.warn('EyeCensor: detection unavailable —', e && e.message);
        return null;
      });
  }

  /** Convert detected eyes into a censor bar {cx, cy, w, h, angle}. */
  function eyesToBar(eyes, imgW) {
    var dx = eyes.lx - eyes.rx, dy = eyes.ly - eyes.ry;
    var dist = Math.sqrt(dx * dx + dy * dy) || imgW * 0.15;
    return {
      cx: (eyes.rx + eyes.lx) / 2,
      cy: (eyes.ry + eyes.ly) / 2,
      w: Math.max(dist * 2.4, imgW * 0.18),
      h: Math.max(dist * 0.75, 26),
      angle: Math.atan2(dy, dx)
    };
  }

  return { detect: detect, eyesToBar: eyesToBar };
})();
