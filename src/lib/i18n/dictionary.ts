// SGTX i18n dictionary — minimal translation table for ~20 key UI strings.
// Used by `useLocale()` + `t()` in ./index.ts. Locales: en, ar, fr, zh.
// (FIX-12 — i18n + Arabic RTL support)
//
// Notes:
//   • English is the source of truth.
//   • Arabic translations are written for an RTL layout (dir="rtl").
//   • French and Chinese cover the same key set.
//   • Missing keys gracefully fall back to English.

export type Locale = "en" | "ar" | "fr" | "zh";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
  zh: "中文",
};

export const LOCALE_ORDER: Locale[] = ["en", "ar", "fr", "zh"];

// ~20 key UI strings — used in landing page, auth, and portal headers.
export type DictKey =
  | "getStarted"
  | "login"
  | "join"
  | "signInToSgtx"
  | "commandCenter"
  | "regulatoryOversight"
  | "newTradeRequest"
  | "tradeReadiness"
  | "smartInbox"
  | "contractSigning"
  | "shipments"
  | "documents"
  | "compliance"
  | "auditTrail"
  | "search"
  | "help"
  | "language"
  | "exportRegulatoryReport"
  | "trackShipment"
  | "verifyGtid"
  | "sovereignTradeOs";

type Dict = Record<Locale, Partial<Record<DictKey, string>>>;

export const dict: Dict = {
  en: {
    getStarted: "Get Started",
    login: "Login",
    join: "Join",
    signInToSgtx: "Sign in to SGTX",
    commandCenter: "Command Center",
    regulatoryOversight: "Regulatory Oversight",
    newTradeRequest: "New Trade Request",
    tradeReadiness: "Trade Readiness",
    smartInbox: "Smart Inbox",
    contractSigning: "Contract Signing",
    shipments: "Shipments",
    documents: "Documents",
    compliance: "Compliance",
    auditTrail: "Audit Trail",
    search: "Search",
    help: "Help",
    language: "Language",
    exportRegulatoryReport: "Export Regulatory Report",
    trackShipment: "Track a Shipment",
    verifyGtid: "Verify GTID",
    sovereignTradeOs: "Sovereign Trade OS",
  },
  ar: {
    getStarted: "ابدأ الآن",
    login: "تسجيل الدخول",
    join: "انضمام",
    signInToSgtx: "تسجيل الدخول إلى SGTX",
    commandCenter: "مركز القيادة",
    regulatoryOversight: "الإشراف التنظيمي",
    newTradeRequest: "طلب تجارة جديد",
    tradeReadiness: "جاهزية التجارة",
    smartInbox: "صندوق الوارد الذكي",
    contractSigning: "توقيع العقد",
    shipments: "الشحنات",
    documents: "المستندات",
    compliance: "الامتثال",
    auditTrail: "سجل التدقيق",
    search: "بحث",
    help: "مساعدة",
    language: "اللغة",
    exportRegulatoryReport: "تصدير التقرير التنظيمي",
    trackShipment: "تتبع شحنة",
    verifyGtid: "التحقق من GTID",
    sovereignTradeOs: "نظام التجارة السيادية",
  },
  fr: {
    getStarted: "Commencer",
    login: "Connexion",
    join: "Rejoindre",
    signInToSgtx: "Se connecter à SGTX",
    commandCenter: "Centre de commandement",
    regulatoryOversight: "Surveillance réglementaire",
    newTradeRequest: "Nouvelle demande de commerce",
    tradeReadiness: "Préparation commerciale",
    smartInbox: "Boîte de réception intelligente",
    contractSigning: "Signature du contrat",
    shipments: "Expéditions",
    documents: "Documents",
    compliance: "Conformité",
    auditTrail: "Piste d'audit",
    search: "Rechercher",
    help: "Aide",
    language: "Langue",
    exportRegulatoryReport: "Exporter le rapport réglementaire",
    trackShipment: "Suivre une expédition",
    verifyGtid: "Vérifier le GTID",
    sovereignTradeOs: "Système d'exploitation commercial souverain",
  },
  zh: {
    getStarted: "开始使用",
    login: "登录",
    join: "加入",
    signInToSgtx: "登录 SGTX",
    commandCenter: "指挥中心",
    regulatoryOversight: "监管监督",
    newTradeRequest: "新建贸易请求",
    tradeReadiness: "贸易就绪",
    smartInbox: "智能收件箱",
    contractSigning: "合同签署",
    shipments: "货运",
    documents: "文档",
    compliance: "合规",
    auditTrail: "审计跟踪",
    search: "搜索",
    help: "帮助",
    language: "语言",
    exportRegulatoryReport: "导出监管报告",
    trackShipment: "追踪货运",
    verifyGtid: "验证 GTID",
    sovereignTradeOs: "主权贸易操作系统",
  },
};
