export function eduRank(val) {
  switch (val) {
    case "10TH": return 1
    case "XII": return 2
    case "SCI_MATH_XII": return 3
    case "GRAD": return 4
    case "ENGG": return 5
    case "PG": return 6
    case "MPHIL": return 7
    case "PHD": return 8
    case "LLB": return 6
    case "LLM": return 7
    case "OTHER": return 4
    default: return 0
  }
}
export const atLeastEdu = (current, requiredKey) => eduRank(current) >= eduRank(requiredKey)

export const upperAgeWithCategory = (baseMax, catUpperExt) => (cat) => {
  const key = (cat || "GEN").toUpperCase()
  const add = catUpperExt[key] ?? 0
  return baseMax + add
}
export const STD_CAT_RELAX = { GEN: 0, EWS: 0, OBC: 3, SC: 5, ST: 5, PWD: 0 }

export const SCHEMA = {
  CDS: {
    services: ["IMA", "INA", "AFA", "OTA"],
    ages: { IMA: { min: 19, max: 24 }, INA: { min: 19, max: 22 }, AFA: { min: 20, max: 24, cplMax: 26 }, OTA: { min: 19, max: 25 } },
    education: {
      IMA: ["GRAD", "ENGG", "PG", "OTHER"],
      INA: ["ENGG"],
      AFA: ["GRAD", "ENGG", "PG", "OTHER", "SCI_MATH_XII"],
      OTA: ["GRAD", "ENGG", "PG", "OTHER"],
    },
    marital: { IMA: { allowed: ["Unmarried"] }, INA: { allowed: ["Unmarried"] }, AFA: { allowed: ["Unmarried"] }, OTA: { allowed: ["Unmarried", "Married"] } },
    cycles: [
      { name: "CDS I", writtenMonth: 2, commenceMonth: 1, commenceDay: 1 },
      { name: "CDS II", writtenMonth: 9, commenceMonth: 7, commenceDay: 1 },
    ],
  },
  AFCAT: {
    services: ["Flying", "Ground Duty (Tech/Non-Tech)"],
    education: {
      "Flying": ["SCI_MATH_XII", "GRAD", "ENGG", "PG", "OTHER"],
      "Ground Duty (Tech/Non-Tech)": ["GRAD", "ENGG", "PG", "OTHER"],
    },
    ages: { "Flying": { min: 20, max: 24, cplMax: 26 }, "Ground Duty (Tech/Non-Tech)": { min: 20, max: 26 } },
  },
  POLICE: {
    services: ["Delhi Police Constable", "Delhi Police SI", "State Police Constable", "State Police SI"],
    ages: {
      "Delhi Police Constable": { min: 18, max: 25 },
      "Delhi Police SI": { min: 20, max: 25 },
      "State Police Constable": { min: 18, max: 25 },
      "State Police SI": { min: 20, max: 28 },
    },
  },
}

export const EXAM_META = {
  UPSC_CSE: {
    minAge: 21, maxAge: (cat) => upperAgeWithCategory(32, STD_CAT_RELAX)(cat),
    eduCheck: (edu) => atLeastEdu(edu, "GRAD"), cadence: "annual",
    lines: (c) => [`Age band: 21–${c.maxAge} (category relaxation applied)`, `Education: ${c.eduOK ? "Meets Bachelor's+ requirement" : "Requires Bachelor's or above"}`, `Marital: Allowed`],
  },
  UPSC_ESE: {
    minAge: 21, maxAge: 30, eduCheck: (edu) => atLeastEdu(edu, "ENGG"), cadence: "annual",
    lines: (c) => [`Age band: 21–30 (no category relaxation specified)`, `Education: ${c.eduOK ? "Engineering OK" : "Requires Engineering degree"}`, `Marital: Allowed`],
  },
  NDA: {
    minAge: 16.5, maxAge: 19.5, eduCheck: (edu) => atLeastEdu(edu, "XII"),
    maritalCheck: (married) => !married, cadence: "semiannual", limitedAttempts: true,
    lines: (c) => [`Age band: strictly 16.5–19.5 (no relaxations)`, `Education: ${c.eduOK ? "≥ 10+2 OK" : "Requires 10+2"}`, `Marital: ${c.maritalOK ? "Unmarried confirmed" : "Must be Unmarried"}`],
  },
  AFCAT: {
    minAge: 20,
    maxAge: (cat, ctx) => { if (ctx.branch === "Flying") return ctx.cpl ? 26 : 24; return 26 },
    eduCheck: (edu, ctx) => ctx.branch === "Flying" ? ["SCI_MATH_XII", "GRAD", "ENGG", "PG", "OTHER"].includes(edu) : ["GRAD", "ENGG", "PG", "OTHER"].includes(edu),
    cadence: "semiannual", limitedAttempts: true,
    lines: (c) => [`Branch: ${c.ctx.branch}`, `Age band: 20–${c.maxAge}${(c.ctx.branch === "Flying" && c.ctx.cpl) ? " (CPL relaxation)" : ""}`, `Education: ${c.eduOK ? "Meets branch threshold" : "Does not meet branch threshold"}`],
  },
  CAPF: {
    minAge: 20, maxAge: (cat) => upperAgeWithCategory(25, STD_CAT_RELAX)(cat),
    eduCheck: (edu) => atLeastEdu(edu, "GRAD"), cadence: "annual",
    lines: (c) => [`Age band: 20–${c.maxAge} (category applied)`, `Education: ${c.eduOK ? "Bachelor's+ OK" : "Requires Bachelor's"}`, `Marital: Allowed`],
  },
  TA: {
    minAge: 18, maxAge: 42, eduCheck: (edu) => atLeastEdu(edu, "GRAD"),
    gateCheck: (ctx) => !!ctx.employed, cadence: "annual",
    lines: (c) => [`Age band: 18–42`, `Education: ${c.eduOK ? "Bachelor's+ OK" : "Requires Bachelor's"}`, `Employment: ${c.ctx.employed ? "Gainfully employed" : "Employment required (Territorial Army is mandatory for employed citizens)"}`],
  },
  UGC_NET: {
    minAge: 21, maxAge: (cat, ctx) => ctx.subtype === "JRF" ? 30 : Infinity,
    eduCheck: (edu) => atLeastEdu(edu, "PG") || edu === "LLM" || atLeastEdu(edu, "ENGG"),
    cadence: "semiannual", limitedAttempts: true,
    lines: (c) => [`Track: ${c.ctx.subtype}`, `Age band: 21–${c.maxAge === Infinity ? "No upper cap" : c.maxAge}`, `Education: ${c.eduOK ? "PG/Equivalent OK" : "Requires PG or equivalent"}`],
  },
  JEE: {
    minAge: 17, maxAge: 25, eduCheck: (edu) => atLeastEdu(edu, "XII") || edu === "SCI_MATH_XII",
    cadence: "semiannual", limitedAttempts: true,
    lines: (c) => [`Age band: 17–25 (planning window)`, `Education: ${c.eduOK ? "≥ 10+2 OK" : "Requires 10+2"}`, `Marital: Allowed`],
  },
  SSC_CGL: {
    minAge: 18, maxAge: (cat) => upperAgeWithCategory(32, STD_CAT_RELAX)(cat),
    eduCheck: (edu) => atLeastEdu(edu, "GRAD"), cadence: "annual",
    lines: (c) => [`Age band: 18–${c.maxAge} (category applied)`, `Education: ${c.eduOK ? "Bachelor's+ OK" : "Requires Bachelor's"}`, `Marital: Allowed`],
  },
  SSC_CHSL: {
    minAge: 18, maxAge: (cat) => upperAgeWithCategory(27, STD_CAT_RELAX)(cat),
    eduCheck: (edu) => atLeastEdu(edu, "XII") || edu === "SCI_MATH_XII", cadence: "annual",
    lines: (c) => [`Age band: 18–${c.maxAge} (category applied)`, `Education: ${c.eduOK ? "≥ 10+2 OK" : "Requires 10+2"}`, `Marital: Allowed`],
  },
  SSC_GD: {
    minAge: 18, maxAge: (cat) => upperAgeWithCategory(23, STD_CAT_RELAX)(cat),
    eduCheck: (edu) => eduRank(edu) >= eduRank("10TH") || atLeastEdu(edu, "XII"), cadence: "annual",
    lines: (c) => [`Age band: 18–${c.maxAge} (category applied)`, `Education: ${c.eduOK ? "≥ 10th OK" : "Requires 10th"}`, `Marital: Allowed`],
  },
  POLICE: {
    minAge: (cat, ctx) => (SCHEMA.POLICE.ages[ctx.role] || { min: 18 }).min,
    maxAge: (cat, ctx) => (SCHEMA.POLICE.ages[ctx.role] || { max: 28 }).max,
    eduCheck: (edu) => atLeastEdu(edu, "XII"), cadence: "annual",
    lines: (c) => [`Role: ${c.ctx.role}`, `Age band: ${c.minAge}–${c.maxAge}`, `Education: ${c.eduOK ? "Meets typical role threshold" : "Education may be insufficient for selected role"}`],
  },
  STATE_PSC: {
    minAge: 21, maxAge: 40, eduCheck: (edu) => atLeastEdu(edu, "GRAD"),
    gateCheck: (ctx) => !!ctx.state, cadence: "annual",
    lines: (c) => [`State: ${c.ctx.state || "Not selected"}`, `Age band: 21–40`, `Education: ${c.eduOK ? "Bachelor's+ OK" : "Requires Bachelor's"}`],
  },
  IBPS_PO: {
    minAge: 20, maxAge: (cat) => upperAgeWithCategory(30, STD_CAT_RELAX)(cat),
    eduCheck: (edu) => atLeastEdu(edu, "GRAD"), cadence: "annual",
    lines: (c) => [`Age band: 20–${c.maxAge} (with category relaxation)`, `Education: ${c.eduOK ? "Bachelor's+ OK" : "Requires Bachelor's+"}`, `Marital: Allowed`],
  },
  LIC_AAO: {
    minAge: 21, maxAge: (cat) => upperAgeWithCategory(30, STD_CAT_RELAX)(cat),
    eduCheck: (edu) => atLeastEdu(edu, "GRAD"), cadence: "annual",
    lines: (c) => [`Age band: 21–${c.maxAge} (with category relaxation)`, `Education: ${c.eduOK ? "Bachelor's+ OK" : "Requires Bachelor's+"}`, `Marital: Allowed`],
  },
  RRB_NTPC: {
    minAge: 18, maxAge: (cat) => upperAgeWithCategory(36, STD_CAT_RELAX)(cat),
    eduCheck: (edu) => atLeastEdu(edu, "XII") || atLeastEdu(edu, "GRAD"), cadence: "annual",
    lines: (c) => [`Age band: 18–${c.maxAge} (with category relaxation)`, `Education: ${atLeastEdu(c.edu, "GRAD") ? "Eligible for Graduate posts" : atLeastEdu(c.edu, "XII") ? "Eligible for 12th-level posts" : "Requires at least 10+2"}`, `Marital: Allowed`],
  },
  RBI_GRADE_B: {
    minAge: 21,
    maxAge: (cat, ctx) => {
      const catCap = upperAgeWithCategory(30, STD_CAT_RELAX)(cat)
      const eduCap = ctx.edu === "PHD" ? 34 : ctx.edu === "MPHIL" ? 32 : 30
      return Math.max(catCap, eduCap)
    },
    eduCheck: (edu) => atLeastEdu(edu, "GRAD"), cadence: "annual",
    lines: (c) => [`Age band: 21–${c.maxAge} (category/degree cap applied)`, `Education: ${c.eduOK ? "Bachelor's+ (PG preferred for some posts)" : "Requires Bachelor's minimum"}`, `Special cap: ${c.ctx.edu === "PHD" ? "Ph.D. → 34 max" : c.ctx.edu === "MPHIL" ? "M.Phil → 32 max" : "—"}`, `Marital: Allowed`],
  },
  COAST_GUARD_NAVIK: {
    minAge: 18, maxAge: (cat) => upperAgeWithCategory(22, STD_CAT_RELAX)(cat),
    eduCheck: (edu) => eduRank(edu) >= eduRank("10TH") || atLeastEdu(edu, "XII"),
    cadence: "semiannual", limitedAttempts: true,
    lines: (c) => [`Age band: 18–${c.maxAge} (with category relaxation)`, `Education: ${c.eduOK ? "10th+/12th+ OK (PCM needed for GD stream)" : "Requires 10th+ (DB) or 12th PCM (GD)"}`, `Marital: Allowed`],
  },
  LAW_ENTRANCE: {
    noAgeLimit: true, eduCheck: (edu) => atLeastEdu(edu, "XII"), cadence: "annual",
    lines: (c) => [`Age: No minimum or maximum limit`, `Education: ${c.eduOK ? "≥ 10+2 OK" : "Requires 10+2"}`, `Marital: Allowed`],
  },
  OTHER: {
    minAge: 18, maxAge: 40, eduCheck: () => true, cadence: "annual",
    lines: () => [`Age band: 18–40 (generic placeholder band)`, `Education: Flexible`, `Marital: Allowed`],
  },
}

export const SERVICE_FIELD = {
  CDS: { label: "Service / Wing", options: SCHEMA.CDS.services },
  AFCAT: { label: "Branch", options: SCHEMA.AFCAT.services },
  POLICE: { label: "Role", options: SCHEMA.POLICE.services },
}

export const EXAM_OPTIONS = [
  { value: "", label: "Select exam" },
  { value: "CDS", label: "CDS (IMA/INA/AFA/OTA)" },
  { value: "UPSC_CSE", label: "UPSC Civil Services" },
  { value: "UPSC_ESE", label: "UPSC ESE (Engineering Services)" },
  { value: "NDA", label: "NDA & NA" },
  { value: "AFCAT", label: "AFCAT" },
  { value: "CAPF", label: "CAPF (Assistant Commandant)" },
  { value: "TA", label: "Territorial Army Officer" },
  { value: "UGC_NET", label: "UGC NET / JRF" },
  { value: "JEE", label: "JEE Main / Advanced" },
  { value: "SSC_CGL", label: "SSC CGL" },
  { value: "SSC_CHSL", label: "SSC CHSL" },
  { value: "SSC_GD", label: "SSC GD Constable" },
  { value: "LAW_ENTRANCE", label: "AILET / LSAT India / CLAT UG/PG" },
  { value: "POLICE", label: "Delhi Police / State Police" },
  { value: "STATE_PSC", label: "State PSCs (UPPSC / MPPSC / BPSC)" },
  { value: "IBPS_PO", label: "IBPS PO" },
  { value: "LIC_AAO", label: "LIC AAO" },
  { value: "RRB_NTPC", label: "RRB NTPC" },
  { value: "RBI_GRADE_B", label: "RBI Grade B" },
  { value: "COAST_GUARD_NAVIK", label: "Indian Coast Guard Navik" },
  { value: "OTHER", label: "Other (generic)" },
]