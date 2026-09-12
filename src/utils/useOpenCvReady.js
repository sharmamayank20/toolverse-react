import { useState, useEffect, useRef } from 'react'

// OpenCV.js and jscanify are loaded via <script> tags in index.html
// (see the shared-file note), not npm-bundled — they're large WASM/CDN
// libraries not meant for bundling. This hook polls for their global
// readiness the same way the legacy vanilla version did.
export function useOpenCvReady() {
  const [cvReady, setCvReady] = useState(false)
  const [statusMsg, setStatusMsg] = useState('Loading the scanner engine...')
  const scannerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    let pollTimer = null

    function tryInit() {
      if (cancelled) return
      if (window.cv && window.cv.Mat) {
        try {
          scannerRef.current = new window.jscanify()
          setCvReady(true)
          setStatusMsg('Scanner ready — auto edge detection is on.')
        } catch (e) {
          console.error('jscanify init failed', e)
          setStatusMsg('Auto-detection unavailable — you can still crop pages manually.')
        }
        return
      }
      if (window.cv) {
        window.cv['onRuntimeInitialized'] = tryInit
      } else {
        pollTimer = setTimeout(tryInit, 60)
      }
    }
    tryInit()

    const timeoutId = setTimeout(() => {
      if (!cancelled && !scannerRef.current) {
        setStatusMsg('Auto-detection unavailable — you can still crop pages manually.')
      }
    }, 8000)

    return () => { cancelled = true; clearTimeout(pollTimer); clearTimeout(timeoutId) }
  }, [])

  return { cvReady, cv: cvReady ? window.cv : null, scanner: scannerRef.current, statusMsg }
}