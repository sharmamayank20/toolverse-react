import WordCounter from '../tools/WordCounter'
import LoanCalculator from '../tools/LoanCalculator'
import HealthCalculator from '../tools/HealthCalculator'
import EligibilityCalculator from '../tools/EligibilityCalculator'
import KeyForge from '../tools/KeyForge'
import WorldTime from '../tools/WorldTime'
import VelocityTracker from '../tools/VelocityTracker'
import QRNode from '../tools/QRNode'
import UnitConverter from '../tools/UnitConverter'
import OcrExtractor from '../tools/OcrExtractor'
import ExifPurger from '../tools/ExifPurger'
import KeyboardTester from '../tools/KeyboardTester'
import TypingTutor from '../tools/TypingTutor'
import CompressPdf from '../tools/CompressPdf'
import MergePdf from '../tools/MergePdf'
import SplitPdf from '../tools/SplitPdf'
import SpeedTest from '../tools/SpeedTest'
import Ludo from '../tools/Ludo'
import ChatAssistant from '../tools/ChatAssistant'
import SignPdf from '../tools/SignPdf'
import BackgroundRemover from '../tools/BackgroundRemover'
import SecurePdf from '../tools/SecurePdf'
import CropPdf from '../tools/CropPdf'
import OrganizePdf from '../tools/OrganizePdf'
import WatermarkPdf from '../tools/WatermarkPdf'
import Chess from '../tools/Chess'
import Memory from '../tools/Memory'
import ScanToPdf from '../tools/ScanToPdf'
import JpgToPdf from '../tools/JpgToPdf'
import PdfToJpg from '../tools/PdfToJpg'
import WordToPdf from '../tools/WordToPdf'
import PptToPdf from '../tools/PptToPdf'
import FileShare from '../tools/FileShare'
import VoiceCall from '../tools/VoiceCall'
import VideoCall from '../tools/VideoCall'
import ChatRoom from '../tools/ChatRoom'
import ExcelToPdf from '../tools/ExcelToPdf'


export const TOOLS = [
  {
    id: "word-counter",
    name: "Word Counter",
    description: "Count words, characters, and reading time instantly.",
    category: "Text Tools",
    path: "/tools/word-counter",
    component: WordCounter,
  },
  {
    id: "loan-calculator",
    name: "Loan & EMI",
    description: "Plan EMIs, visualize interest vs principal, simulate prepayment.",
    category: "Calculators",
    path: "/tools/loan-calculator",
    component: LoanCalculator,
  },
  {
    id: "health-calculator",
    name: "Health",
    description: "Calculate BMI, BMR, body fat, and goal-based calorie guidance.",
    category: "Calculators",
    path: "/tools/health-calculator",
    component: HealthCalculator,
  },
  {
    id: "eligibility-calculator",
    name: "Eligibility",
    description: "Check age, attempt, and education eligibility across 20+ competitive exams.",
    category: "Calculators",
    path: "/tools/eligibility-calculator",
    component: EligibilityCalculator,
  },
  {
    id: "key-forge",
    name: "Key Forge",
    description: "Generate and evaluate strong passwords with live criteria.",
    category: "Dev Tools",
    path: "/tools/key-forge",
    component: KeyForge,
  },
  {
    id: "world-time",
    name: "World Time",
    description: "Calculate precise duration between two dates and times.",
    category: "Dev Tools",
    path: "/tools/world-time",
    component: WorldTime,
  },
  {
    id: "velocity-tracker",
    name: "Velocity Tracker",
    description: "Real-time GPS speed tracking with live route map.",
    category: "Dev Tools",
    path: "/tools/velocity-tracker",
    component: VelocityTracker,
  },
  {
    id: "qr-node",
    name: "QRNode",
    description: "Generate customizable QR codes with logos, colors, and multiple export formats.",
    category: "Dev Tools",
    path: "/tools/qr-node",
    component: QRNode,
  },
  {
    id: "unit-converter",
    name: "Converter",
    description: "Convert units across 13+ categories with favorites and history.",
    category: "Dev Tools",
    path: "/tools/unit-converter",
    component: UnitConverter,
  },
  {
    id: "ocr-extractor",
    name: "OCR Extractor",
    description: "Extract editable text from images entirely in your browser.",
    category: "Media Tools",
    path: "/tools/ocr-extractor",
    component: OcrExtractor,
  },
  {
    id: "exif-purger",
    name: "EXIF Purger",
    description: "See what your photo reveals, then wipe it clean.",
    category: "Media Tools",
    path: "/tools/exif-purger",
    component: ExifPurger,
  },
  {
    id: "keyboard-tester",
    name: "Keyboard Tester",
    description: "Test every key on your keyboard with live visual and rollover detection.",
    category: "Dev Tools",
    path: "/tools/keyboard-tester",
    component: KeyboardTester,
  },
  {
    id: "typing-tutor",
    name: "Typing Tutor",
    description: "Type fast, type clean, see exactly where you slow down.",
    category: "Dev Tools",
    path: "/tools/typing-tutor",
    component: TypingTutor,
  },
  {
    id: "compress-pdf",
    name: "Compress PDF",
    description: "Reduce PDF file size while maintaining quality for easier sharing and storage.",
    category: "PDF Tools",
    path: "/tools/compress-pdf",
    component: CompressPdf,
  },
  {
    id: "merge-pdf",
    name: "Merge PDF",
    description: "Combine multiple PDFs in order, or drag individual pages across files for full control.",
    category: "PDF Tools",
    path: "/tools/merge-pdf",
    component: MergePdf,
  },
  {
    id: "split-pdf",
    name: "Split PDF",
    description: "Extract specific pages or ranges from your PDF into a new document.",
    category: "PDF Tools",
    path: "/tools/split-pdf",
    component: SplitPdf,
  },
  {
    id: "speed-test",
    name: "Speed Test",
    description: "Measure download, upload speed, and ping latency against Cloudflare's edge.",
    category: "Dev Tools",
    path: "/tools/speed-test",
    component: SpeedTest,
  },
  {
    id: "ludo",
    name: "Ludo",
    description: "Roll, race, and capture — same device or a private online room.",
    category: "Arcade",
    path: "/tools/ludo",
    component: Ludo,
  },
  {
    id: "ai-assistant",
    name: "AI Assistant",
    description: "Conversational AI powered by Gemini 2.5 Flash — text, code, and file understanding.",
    category: "Dev Tools",
    path: "/tools/ai-assistant",
    component: ChatAssistant,
  },
  {
    id: "sign-pdf",
    name: "Sign PDF",
    description: "See the page, drop your signature exactly where it belongs.",
    category: "PDF Tools",
    path: "/tools/sign-pdf",
    component: SignPdf,
  },
  {
    id: "background-remover",
    name: "Background Remover",
    description: "AI-powered background removal — clean transparent PNGs in seconds, entirely in your browser.",
    category: "Media Tools",
    path: "/tools/background-remover",
    component: BackgroundRemover,
  },
  {
    id: "secure-pdf",
    name: "Secure PDF",
    description: "Add password protection to your PDF documents with strong encryption.",
    category: "PDF Tools",
    path: "/tools/secure-pdf",
    component: SecurePdf,
  },
  {
    id: "crop-pdf",
    name: "Crop PDF",
    description: "Visually crop PDF pages by dragging edges or entering precise values.",
    category: "PDF Tools",
    path: "/tools/crop-pdf",
    component: CropPdf,
  },
  {
    id: "organize-pdf",
    name: "Organize PDF",
    description: "Reorder, rotate, and delete pages with an intuitive drag-and-drop interface.",
    category: "PDF Tools",
    path: "/tools/organize-pdf",
    component: OrganizePdf,
  },
  {
    id: "watermark-pdf",
    name: "Watermark PDF",
    description: "Add custom text or image watermarks to your PDF documents.",
    category: "PDF Tools",
    path: "/tools/watermark-pdf",
    component: WatermarkPdf,
  },
  {
    id: "chess",
    name: "Chess",
    description: "Full rules, same device or a private online room.",
    category: "Arcade",
    path: "/tools/chess",
    component: Chess,
  },
  {
    id: "memory-match",
    name: "Memory Match",
    description: "Test your memory with this classic card-matching game.",
    category: "Arcade",
    path: "/tools/memory",
    component: Memory,
  },
  {
    id: "scan-to-pdf",
    name: "Scan to PDF",
    description: "Point your camera at any page. We'll find the edges, straighten it, and build your PDF.",
    category: "PDF Tools",
    path: "/tools/scan-to-pdf",
    component: ScanToPdf,
  },
  {
    id: "jpg-to-pdf",
    name: "JPG to PDF",
    description: "Combine images into a neat PDF with page size, margins, and ordering controls.",
    category: "PDF Tools",
    path: "/tools/jpg-to-pdf",
    component: JpgToPdf,
  },
  {
    id: "pdf-to-jpg",
    name: "PDF to JPG",
    description: "Convert PDF pages into high-quality JPG images, delivered as a ZIP file.",
    category: "PDF Tools",
    path: "/tools/pdf-to-jpg",
    component: PdfToJpg,
  },
  {
    id: "word-to-pdf",
    name: "Word to PDF",
    description: "Export DOCX to clean, consistent PDFs with privacy-first processing and smart defaults.",
    category: "PDF Tools",
    path: "/tools/word-to-pdf",
    component: WordToPdf,
  },
  {
    id: "ppt-to-pdf",
    name: "PPT to PDF",
    description: "Convert PowerPoint presentations to PDF, preserving slide layout, fonts, and images.",
    category: "PDF Tools",
    path: "/tools/ppt-to-pdf",
    component: PptToPdf,
  },
  {
    id: "file-share",
    name: "File Share",
    description: "Send files directly, browser to browser — encrypted, peer-to-peer, zero storage.",
    category: "Dev Tools",
    path: "/tools/file-share",
    component: FileShare,
  },
  {
    id: "voice-call",
    name: "Voice Call",
    description: "Clear peer-to-peer voice calls, tuned for weak or restricted connections.",
    category: "Dev Tools",
    path: "/tools/voice-call",
    component: VoiceCall,
  },
  {
    id: "video-call",
    name: "Video Call",
    description: "Face-to-face peer-to-peer video calls, camera off by default.",
    category: "Dev Tools",
    path: "/tools/video-call",
    component: VideoCall,
  },
  {
    id: "chat-room",
    name: "Chat Room",
    description: "Anonymous group chat with file sharing, up to 4 people, nothing ever stored.",
    category: "Dev Tools",
    path: "/tools/chat-room",
    component: ChatRoom,
  },
  {
    id: "excel-to-pdf",
    name: "Excel to PDF",
    description: "Convert spreadsheets to crisp PDFs, with formatting and formulas preserved.",
    category: "PDF Tools",
    path: "/tools/excel-to-pdf",
    component: ExcelToPdf,
  },


]

export const CATEGORIES = ["Text Tools", "Media Tools", "Dev Tools", "Arcade", "Calculators", "PDF Tools"]