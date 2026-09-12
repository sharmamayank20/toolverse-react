// Shared pdf.js worker registration for Vite.
// Any tool using pdfjs-dist should import this file once (side-effect
// import) before calling pdfjsLib.getDocument(...), instead of setting
// GlobalWorkerOptions.workerSrc itself — keeps worker registration to
// one place so multiple PDF tools don't stomp on each other's setting.
import { GlobalWorkerOptions } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerSrc