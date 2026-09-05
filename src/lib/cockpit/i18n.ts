// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 6: Arabic-first i18n dictionary for the cockpit routes.
// ═════════════════════════════════════════════════════════════════════════════════
//
// The legacy `src/lib/i18n/dictionary.ts` has ~20 keys for the landing page +
// portal headers. The cockpit rebuild adds ~80 more keys for the 7 nav
// items, the home questions, the wizard steps, and the role-gated sections.
//
// This module is a SEPARATE dictionary so we don't change the legacy type
// signature (which would ripple through the legacy components). The cockpit
// routes use `useCockpitLocale()` which merges the two dictionaries.
//
// Arabic translations are written for RTL layout. GTID/USTN codes stay LTR
// (wrapped in <span dir="ltr"> in the components).
//
// Law #6: WCAG 2.2 AA — every string goes through i18n keys, no hardcoded
// English text in the cockpit routes.

export type CockpitLocale = "en" | "ar" | "fr" | "zh";

export const COCKPIT_LOCALE_LABELS: Record<CockpitLocale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
  zh: "中文",
};

export const COCKPIT_LOCALE_ORDER: CockpitLocale[] = ["en", "ar", "fr", "zh"];

export const RTL_COCKPIT_LOCALES: CockpitLocale[] = ["ar"];

// All cockpit keys. Adding a new key requires adding it to this union AND
// to every locale below (the `t()` function falls back to English if a
// key is missing from a non-English locale).
export type CockpitKey =
  // Top nav
  | "nav.home"
  | "nav.trades"
  | "nav.operations"
  | "nav.money"
  | "nav.trust"
  | "nav.network"
  | "nav.admin"
  // Common
  | "common.back"
  | "common.continue"
  | "common.cancel"
  | "common.save"
  | "common.saving"
  | "common.saved"
  | "common.loading"
  | "common.loadingSession"
  | "common.signOut"
  | "common.userMenu"
  | "common.open"
  | "common.verify"
  | "common.track"
  | "common.search"
  // Login
  | "login.title"
  | "login.subtitle"
  | "login.email"
  | "login.password"
  | "login.signIn"
  | "login.demoLogin"
  | "login.backHome"
  | "login.alreadyOnboarded"
  | "login.beginOnboarding"
  | "login.drafts"
  // Join
  | "join.title"
  // Home
  | "home.welcome"
  | "home.subtitle"
  | "home.needsAttention"
  | "home.happeningNow"
  | "home.blocked"
  | "home.needsApproval"
  | "home.recentChanges"
  | "home.activeTradesCount"
  | "home.noUrgent"
  | "home.noBlockers"
  | "home.noApprovals"
  | "home.noActivity"
  // Trades list
  | "trades.title"
  | "trades.subtitle"
  | "trades.newTrade"
  | "trades.filter.active"
  | "trades.filter.drafts"
  | "trades.filter.history"
  | "trades.filter.all"
  | "trades.searchPlaceholder"
  | "trades.empty"
  | "trades.emptyFiltered"
  // Wizard
  | "wizard.title"
  | "wizard.subtitle"
  | "wizard.step1"
  | "wizard.step2"
  | "wizard.step3"
  | "wizard.step4"
  | "wizard.step5"
  | "wizard.step6"
  | "wizard.step1.title"
  | "wizard.step1.desc"
  | "wizard.step2.title"
  | "wizard.step2.desc"
  | "wizard.step3.title"
  | "wizard.step3.desc"
  | "wizard.step4.title"
  | "wizard.step4.desc"
  | "wizard.step5.title"
  | "wizard.step5.desc"
  | "wizard.step6.title"
  | "wizard.step6.desc"
  | "wizard.submit"
  | "wizard.draftRestored"
  // Trade workspace
  | "trade.nextAction"
  | "trade.summary"
  | "trade.timeline"
  | "trade.activity"
  | "trade.notFound"
  | "trade.notFoundDesc"
  | "trade.backToTrades"
  | "trade.allTrades"
  | "trade.showExpert"
  | "trade.hideExpert"
  | "trade.tab.documents"
  | "trade.tab.payments"
  | "trade.tab.compliance"
  | "trade.tab.messages"
  | "trade.tab.details"
  | "trade.perspective.buyer"
  | "trade.perspective.seller"
  | "trade.perspective.observer"
  // Operations
  | "ops.title"
  | "ops.subtitle"
  | "ops.activeTrades"
  | "ops.shipments"
  | "ops.assignedJobs"
  | "ops.bookings"
  | "ops.testRequests"
  | "ops.inspections"
  | "ops.declarations"
  | "ops.nationalFlow"
  | "ops.pendingClearances"
  // Money
  | "money.title"
  | "money.subtitle"
  | "money.outstanding"
  | "money.paid"
  | "money.opportunities"
  | "money.yourBids"
  | "money.activeLoans"
  | "money.crossBorder"
  | "money.fxAlerts"
  // Trust
  | "trust.title"
  | "trust.subtitle"
  | "trust.yourPassport"
  | "trust.verifyByGtid"
  | "trust.kybTier"
  | "trust.trustScore"
  | "trust.lifecycle"
  | "trust.type"
  | "trust.country"
  | "trust.sanctionsCleared"
  | "trust.sanctionsHit"
  // Network
  | "net.title"
  | "net.subtitle"
  | "net.savedContacts"
  | "net.corridors"
  | "net.noContacts"
  | "net.noContactsDesc"
  // Footer
  | "footer.nonCustodial"
  | "footer.aiGoverned"
  | "footer.sovereign";

type CockpitDict = Record<CockpitLocale, Partial<Record<CockpitKey, string>>>;

export const cockpitDict: CockpitDict = {
  en: {
    "nav.home": "Home",
    "nav.trades": "Trades",
    "nav.operations": "Operations",
    "nav.money": "Money",
    "nav.trust": "Trust",
    "nav.network": "Network",
    "nav.admin": "Admin",
    "common.back": "Back",
    "common.continue": "Continue",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.saving": "Saving…",
    "common.saved": "Saved",
    "common.loading": "Loading…",
    "common.loadingSession": "Loading session…",
    "common.signOut": "Sign out",
    "common.userMenu": "User menu",
    "common.open": "Open",
    "common.verify": "Verify",
    "common.track": "Track",
    "common.search": "Search",
    "login.title": "Sign in to SGTX",
    "login.subtitle": "Use your work email and password.",
    "login.email": "Work email",
    "login.password": "Password",
    "login.signIn": "Sign in",
    "login.demoLogin": "Demo login — click any portal",
    "login.backHome": "← Back to home",
    "login.alreadyOnboarded": "Already onboarded? Sign in",
    "login.beginOnboarding": "Begin onboarding",
    "login.drafts": "drafts",
    "join.title": "Join SGTX",
    "home.welcome": "Welcome back",
    "home.subtitle": "Here's what needs your attention today.",
    "home.needsAttention": "Needs your attention",
    "home.happeningNow": "Happening now",
    "home.blocked": "Blocked",
    "home.needsApproval": "Needs your approval",
    "home.recentChanges": "Recent changes",
    "home.activeTradesCount": "active trades in execution",
    "home.noUrgent": "No urgent items. You're all caught up.",
    "home.noBlockers": "No blockers. All trades are on track.",
    "home.noApprovals": "Nothing pending your approval right now.",
    "home.noActivity": "No recent activity.",
    "trades.title": "Trades",
    "trades.subtitle": "total",
    "trades.newTrade": "New trade request",
    "trades.filter.active": "active",
    "trades.filter.drafts": "drafts",
    "trades.filter.history": "history",
    "trades.filter.all": "all",
    "trades.searchPlaceholder": "Search by commodity, USTN, or counterparty…",
    "trades.empty": "You don't have any trades yet. Start by creating a new trade request.",
    "trades.emptyFiltered": "No trades match this filter.",
    "wizard.title": "New trade request",
    "wizard.subtitle": "6 steps · save-draft automatic · resumable from drafts",
    "wizard.step1": "Trade need",
    "wizard.step2": "Commercial terms",
    "wizard.step3": "Logistics",
    "wizard.step4": "Compliance",
    "wizard.step5": "Finance",
    "wizard.step6": "Review",
    "wizard.step1.title": "What are you trading?",
    "wizard.step1.desc": "Tell us the product, quantity, and where it needs to go.",
    "wizard.step2.title": "Commercial terms",
    "wizard.step2.desc": "Who is the counterparty? What are the price, Incoterm, and payment terms?",
    "wizard.step3.title": "Logistics",
    "wizard.step3.desc": "How will the goods be transported?",
    "wizard.step4.title": "Compliance (auto-generated)",
    "wizard.step4.desc": "The platform determines the required documents based on the destination jurisdiction.",
    "wizard.step5.title": "Finance (optional)",
    "wizard.step5.desc": "Do you need financing for this trade?",
    "wizard.step6.title": "Review and submit",
    "wizard.step6.desc": "Read the summary below. The platform generates the USTN, contract, and document requirements automatically.",
    "wizard.submit": "Create trade request",
    "wizard.draftRestored": "Draft restored",
    "trade.nextAction": "Next action",
    "trade.summary": "Summary",
    "trade.timeline": "Timeline",
    "trade.activity": "Recent activity",
    "trade.notFound": "Trade not found",
    "trade.notFoundDesc": "No trade with this USTN is visible to your tenant.",
    "trade.backToTrades": "Back to trades",
    "trade.allTrades": "All trades",
    "trade.showExpert": "Show expert view",
    "trade.hideExpert": "Hide expert view",
    "trade.tab.documents": "Documents",
    "trade.tab.payments": "Payments",
    "trade.tab.compliance": "Compliance",
    "trade.tab.messages": "Messages",
    "trade.tab.details": "Details",
    "trade.perspective.buyer": "Buyer",
    "trade.perspective.seller": "Seller",
    "trade.perspective.observer": "Observer",
    "ops.title": "Operations",
    "ops.subtitle": "Your operational queue. Each item links to the trade it belongs to.",
    "ops.activeTrades": "Your active trades",
    "ops.shipments": "Shipments",
    "ops.assignedJobs": "Assigned jobs",
    "ops.bookings": "Bookings & B/L",
    "ops.testRequests": "Test requests",
    "ops.inspections": "Inspections",
    "ops.declarations": "Customs declarations",
    "ops.nationalFlow": "National trade flow",
    "ops.pendingClearances": "Pending clearances",
    "money.title": "Money",
    "money.subtitle": "Your financial position — invoices, financing, settlement.",
    "money.outstanding": "Outstanding invoices",
    "money.paid": "Paid / settled",
    "money.opportunities": "Financing opportunities (open RFQs)",
    "money.yourBids": "Your bids",
    "money.activeLoans": "Active loans",
    "money.crossBorder": "Cross-border flow",
    "money.fxAlerts": "FX / settlement alerts",
    "trust.title": "Trust",
    "trust.subtitle": "Your trust passport and public GTID verification.",
    "trust.yourPassport": "Your trust passport",
    "trust.verifyByGtid": "Verify a tenant by GTID",
    "trust.kybTier": "KYB tier",
    "trust.trustScore": "Trust score",
    "trust.lifecycle": "Lifecycle",
    "trust.type": "Type",
    "trust.country": "Country",
    "trust.sanctionsCleared": "✓ Sanctions cleared",
    "trust.sanctionsHit": "✗ Sanctions hit",
    "net.title": "Network",
    "net.subtitle": "Your counterparties and the trade corridors you've used.",
    "net.savedContacts": "Saved contacts",
    "net.corridors": "Trade corridors",
    "net.noContacts": "No saved contacts yet.",
    "net.noContactsDesc": "When you create a trade request, the counterparty is added to your network automatically.",
    "footer.nonCustodial": "Non-Custodial",
    "footer.aiGoverned": "AI-Governed",
    "footer.sovereign": "Sovereign",
  },
  ar: {
    "nav.home": "الرئيسية",
    "nav.trades": "الصفقات",
    "nav.operations": "العمليات",
    "nav.money": "المالية",
    "nav.trust": "الثقة",
    "nav.network": "الشبكة",
    "nav.admin": "الإدارة",
    "common.back": "رجوع",
    "common.continue": "متابعة",
    "common.cancel": "إلغاء",
    "common.save": "حفظ",
    "common.saving": "جارٍ الحفظ…",
    "common.saved": "تم الحفظ",
    "common.loading": "جارٍ التحميل…",
    "common.loadingSession": "جارٍ تحميل الجلسة…",
    "common.signOut": "تسجيل الخروج",
    "common.userMenu": "قائمة المستخدم",
    "common.open": "فتح",
    "common.verify": "تحقق",
    "common.track": "تتبع",
    "common.search": "بحث",
    "login.title": "تسجيل الدخول إلى SGTX",
    "login.subtitle": "استخدم بريد العمل وكلمة المرور.",
    "login.email": "بريد العمل",
    "login.password": "كلمة المرور",
    "login.signIn": "تسجيل الدخول",
    "login.demoLogin": "تسجيل تجريبي — اختر أي بوابة",
    "login.backHome": "→ العودة للرئيسية",
    "login.alreadyOnboarded": "تم التسجيل بالفعل؟ سجّل الدخول",
    "login.beginOnboarding": "ابدأ التسجيل",
    "login.drafts": "المسودات",
    "join.title": "الانضمام إلى SGTX",
    "home.welcome": "مرحبًا بعودتك",
    "home.subtitle": "إليك ما يحتاج اهتمامك اليوم.",
    "home.needsAttention": "بحاجة إلى اهتمامك",
    "home.happeningNow": "يحدث الآن",
    "home.blocked": "محظور",
    "home.needsApproval": "بحاجة إلى موافقتك",
    "home.recentChanges": "التغييرات الأخيرة",
    "home.activeTradesCount": "صفقات نشطة قيد التنفيذ",
    "home.noUrgent": "لا توجد أمور عاجلة. أنت على اطلاع بكل شيء.",
    "home.noBlockers": "لا توجد حواجز. جميع الصفقات على المسار الصحيح.",
    "home.noApprovals": "لا ي شيء بانتظار موافقتك الآن.",
    "home.noActivity": "لا يوجد نشاط reciente.",
    "trades.title": "الصفقات",
    "trades.subtitle": "الإجمالي",
    "trades.newTrade": "طلب صفقة جديد",
    "trades.filter.active": "نشط",
    "trades.filter.drafts": "مسودات",
    "trades.filter.history": "السجل",
    "trades.filter.all": "الكل",
    "trades.searchPlaceholder": "ابحث بالسلعة أو USTN أو الطرف المقابل…",
    "trades.empty": "ليس لديك أي صفقات بعد. ابدأ بإنشاء طلب صفقة جديد.",
    "trades.emptyFiltered": "لا توجد صفقات تطابق هذا التصفية.",
    "wizard.title": "طلب صفقة جديد",
    "wizard.subtitle": "6 خطوات · حفظ تلقائي · قابل للاستئناف من المسودات",
    "wizard.step1": "الحاجة",
    "wizard.step2": "الشروط التجارية",
    "wizard.step3": "الخدمات اللوجستية",
    "wizard.step4": "الامتثال",
    "wizard.step5": "التمويل",
    "wizard.step6": "المراجعة",
    "wizard.step1.title": "ماذا تتداول؟",
    "wizard.step1.desc": "أخبرنا بالمنتج والكمية وإلى أين يذهب.",
    "wizard.step2.title": "الشروط التجارية",
    "wizard.step2.desc": "من هو الطرف المقابل؟ ما هي السعر وشروط الإنكوترم والدفع؟",
    "wizard.step3.title": "الخدمات اللوجستية",
    "wizard.step3.desc": "كيف سيتم نقل البضائع؟",
    "wizard.step4.title": "الامتثال (مولّد تلقائيًا)",
    "wizard.step4.desc": "تحدد المنصة المستندات المطلوبة بناءً على الوجهة.",
    "wizard.step5.title": "التمويل (اختياري)",
    "wizard.step5.desc": "هل تحتاج إلى تمويل لهذه الصفقة؟",
    "wizard.step6.title": "المراجعة والإرسال",
    "wizard.step6.desc": "اقرأ الملخص أدناه. تُنشئ المنصة USTN والعقد ومتطلبات المستندات تلقائيًا.",
    "wizard.submit": "إنشاء طلب الصفقة",
    "wizard.draftRestored": "تمت استعادة المسودة",
    "trade.nextAction": "الإجراء التالي",
    "trade.summary": "ملخص",
    "trade.timeline": "الخط الزمني",
    "trade.activity": "النشاط الأخير",
    "trade.notFound": "الصفقة غير موجودة",
    "trade.notFoundDesc": "لا توجد صفقة بهذا USTN مرئية لمستأجرك.",
    "trade.backToTrades": "العودة إلى الصفقات",
    "trade.allTrades": "كل الصفقات",
    "trade.showExpert": "إظهار العرض المتقدم",
    "trade.hideExpert": "إخفاء العرض المتقدم",
    "trade.tab.documents": "المستندات",
    "trade.tab.payments": "المدفوعات",
    "trade.tab.compliance": "الامتثال",
    "trade.tab.messages": "الرسائل",
    "trade.tab.details": "التفاصيل",
    "trade.perspective.buyer": "المشتري",
    "trade.perspective.seller": "البائع",
    "trade.perspective.observer": "مراقب",
    "ops.title": "العمليات",
    "ops.subtitle": "قائمة العمليات الخاصة بك. كل عنصر يربط بالصفقة التي ينتمي إليها.",
    "ops.activeTrades": "صفقاتك النشطة",
    "ops.shipments": "الشحنات",
    "ops.assignedJobs": "المهام المسندة",
    "ops.bookings": "الحجوزات وبوليصة الشحن",
    "ops.testRequests": "طلبات الاختبار",
    "ops.inspections": "التفتيشات",
    "ops.declarations": "البيانات الجمركية",
    "ops.nationalFlow": "تدفق التجارة الوطني",
    "ops.pendingClearances": "التخليصات المعلقة",
    "money.title": "المالية",
    "money.subtitle": "مركزك المالي — الفواتير والتمويل والتسوية.",
    "money.outstanding": "الفواتير المستحقة",
    "money.paid": "مدفوعة / مسواة",
    "money.opportunities": "فرص التمويل (طلبات مفتوحة)",
    "money.yourBids": "عروضك",
    "money.activeLoans": "القروض النشطة",
    "money.crossBorder": "التدفق العابر للحدود",
    "money.fxAlerts": "تنبيهات الفوركس / التسوية",
    "trust.title": "الثقة",
    "trust.subtitle": "جواز ثقتك والتحقق العام من GTID.",
    "trust.yourPassport": "جواز الثقة الخاص بك",
    "trust.verifyByGtid": "تحقق من مستأجر عبر GTID",
    "trust.kybTier": "مستوى KYB",
    "trust.trustScore": "درجة الثقة",
    "trust.lifecycle": "دورة الحياة",
    "trust.type": "النوع",
    "trust.country": "الدولة",
    "trust.sanctionsCleared": "✓ خلو العقوبات",
    "trust.sanctionsHit": "✗ مخالفة للعقوبات",
    "net.title": "الشبكة",
    "net.subtitle": "الأطراف المقابلة وممرات التجارة التي استخدمتها.",
    "net.savedContacts": "جهات الاتصال المحفوظة",
    "net.corridors": "ممرات التجارة",
    "net.noContacts": "لا توجد جهات اتصال محفوظة بعد.",
    "net.noContactsDesc": "عند إنشاء طلب صفقة، تُضاف الجهة المقابلة إلى شبكتك تلقائيًا.",
    "footer.nonCustodial": "غير أمين",
    "footer.aiGoverned": "محكوم بالذكاء",
    "footer.sovereign": "سيادي",
  },
  fr: {
    "nav.home": "Accueil",
    "nav.trades": "Transactions",
    "nav.operations": "Opérations",
    "nav.money": "Finances",
    "nav.trust": "Confiance",
    "nav.network": "Réseau",
    "nav.admin": "Admin",
    "common.back": "Retour",
    "common.continue": "Continuer",
    "common.cancel": "Annuler",
    "common.save": "Enregistrer",
    "common.saving": "Enregistrement…",
    "common.saved": "Enregistré",
    "common.loading": "Chargement…",
    "common.loadingSession": "Chargement de session…",
    "common.signOut": "Déconnexion",
    "common.userMenu": "Menu utilisateur",
    "common.open": "Ouvrir",
    "common.verify": "Vérifier",
    "common.track": "Suivre",
    "common.search": "Rechercher",
    "login.title": "Se connecter à SGTX",
    "login.subtitle": "Utilisez votre e-mail professionnel et votre mot de passe.",
    "login.email": "E-mail professionnel",
    "login.password": "Mot de passe",
    "login.signIn": "Se connecter",
    "login.demoLogin": "Connexion démo — cliquez sur un portail",
    "login.backHome": "← Retour à l'accueil",
    "login.alreadyOnboarded": "Déjà inscrit ? Se connecter",
    "login.beginOnboarding": "Commencer l'inscription",
    "login.drafts": "brouillons",
    "join.title": "Rejoindre SGTX",
    "home.welcome": "Bon retour",
    "home.subtitle": "Voici ce qui nécessite votre attention aujourd'hui.",
    "home.needsAttention": "Nécessite votre attention",
    "home.happeningNow": "En cours",
    "home.blocked": "Bloqué",
    "home.needsApproval": "Nécessite votre approbation",
    "home.recentChanges": "Changements récents",
    "home.activeTradesCount": "transactions actives en exécution",
    "home.noUrgent": "Aucun élément urgent. Vous êtes à jour.",
    "home.noBlockers": "Aucun blocage. Toutes les transactions sont sur la bonne voie.",
    "home.noApprovals": "Rien en attente de votre approbation.",
    "home.noActivity": "Aucune activité récente.",
    "trades.title": "Transactions",
    "trades.subtitle": "total",
    "trades.newTrade": "Nouvelle demande de transaction",
    "trades.filter.active": "actives",
    "trades.filter.drafts": "brouillons",
    "trades.filter.history": "historique",
    "trades.filter.all": "toutes",
    "trades.searchPlaceholder": "Rechercher par produit, USTN ou contrepartie…",
    "trades.empty": "Vous n'avez pas encore de transactions. Commencez par créer une demande.",
    "trades.emptyFiltered": "Aucune transaction ne correspond à ce filtre.",
    "wizard.title": "Nouvelle demande de transaction",
    "wizard.subtitle": "6 étapes · sauvegarde automatique · reprise depuis les brouillons",
    "wizard.step1": "Besoin",
    "wizard.step2": "Conditions",
    "wizard.step3": "Logistique",
    "wizard.step4": "Conformité",
    "wizard.step5": "Financement",
    "wizard.step6": "Révision",
    "wizard.step1.title": "Que négociez-vous ?",
    "wizard.step1.desc": "Dites-nous le produit, la quantité et la destination.",
    "wizard.step2.title": "Conditions commerciales",
    "wizard.step2.desc": "Qui est la contrepartie ? Prix, Incoterm et modalités de paiement.",
    "wizard.step3.title": "Logistique",
    "wizard.step3.desc": "Comment les marchandises seront-elles transportées ?",
    "wizard.step4.title": "Conformité (générée automatiquement)",
    "wizard.step4.desc": "La plateforme détermine les documents requis selon la destination.",
    "wizard.step5.title": "Financement (optionnel)",
    "wizard.step5.desc": "Avez-vous besoin de financement pour cette transaction ?",
    "wizard.step6.title": "Révision et envoi",
    "wizard.step6.desc": "Lisez le résumé. La plateforme génère l'USTN, le contrat et les documents requis.",
    "wizard.submit": "Créer la demande",
    "wizard.draftRestored": "Brouillon restauré",
    "trade.nextAction": "Action suivante",
    "trade.summary": "Résumé",
    "trade.timeline": "Chronologie",
    "trade.activity": "Activité récente",
    "trade.notFound": "Transaction introuvable",
    "trade.notFoundDesc": "Aucune transaction avec cet USTN visible pour votre tenant.",
    "trade.backToTrades": "Retour aux transactions",
    "trade.allTrades": "Toutes les transactions",
    "trade.showExpert": "Afficher la vue expert",
    "trade.hideExpert": "Masquer la vue expert",
    "trade.tab.documents": "Documents",
    "trade.tab.payments": "Paiements",
    "trade.tab.compliance": "Conformité",
    "trade.tab.messages": "Messages",
    "trade.tab.details": "Détails",
    "trade.perspective.buyer": "Acheteur",
    "trade.perspective.seller": "Vendeur",
    "trade.perspective.observer": "Observateur",
    "ops.title": "Opérations",
    "ops.subtitle": "Votre file d'opérations. Chaque élément renvoie à sa transaction.",
    "ops.activeTrades": "Vos transactions actives",
    "ops.shipments": "Expéditions",
    "ops.assignedJobs": "Tâches assignées",
    "ops.bookings": "Réservations & B/L",
    "ops.testRequests": "Demandes d'analyse",
    "ops.inspections": "Inspections",
    "ops.declarations": "Déclarations douanières",
    "ops.nationalFlow": "Flux commercial national",
    "ops.pendingClearances": "Dédouanements en attente",
    "money.title": "Finances",
    "money.subtitle": "Votre position financière — factures, financement, règlement.",
    "money.outstanding": "Factures en attente",
    "money.paid": "Payées / réglées",
    "money.opportunities": "Opportunités de financement (RFQ ouvertes)",
    "money.yourBids": "Vos offres",
    "money.activeLoans": "Prêts actifs",
    "money.crossBorder": "Flux transfrontalier",
    "money.fxAlerts": "Alertes FX / règlement",
    "trust.title": "Confiance",
    "trust.subtitle": "Votre passeport de confiance et vérification GTID publique.",
    "trust.yourPassport": "Votre passeport de confiance",
    "trust.verifyByGtid": "Vérifier un tenant par GTID",
    "trust.kybTier": "Niveau KYB",
    "trust.trustScore": "Score de confiance",
    "trust.lifecycle": "Cycle de vie",
    "trust.type": "Type",
    "trust.country": "Pays",
    "trust.sanctionsCleared": "✓ Sanctions levées",
    "trust.sanctionsHit": "✗ Sanctions touchées",
    "net.title": "Réseau",
    "net.subtitle": "Vos contreparties et les corridors commerciaux utilisés.",
    "net.savedContacts": "Contacts enregistrés",
    "net.corridors": "Corridors commerciaux",
    "net.noContacts": "Aucun contact enregistré.",
    "net.noContactsDesc": "Lorsque vous créez une demande, la contrepartie est ajoutée automatiquement.",
    "footer.nonCustodial": "Non-custodial",
    "footer.aiGoverned": "Gouverné par IA",
    "footer.sovereign": "Souverain",
  },
  zh: {
    "nav.home": "主页",
    "nav.trades": "交易",
    "nav.operations": "运营",
    "nav.money": "财务",
    "nav.trust": "信任",
    "nav.network": "网络",
    "nav.admin": "管理",
    "common.back": "返回",
    "common.continue": "继续",
    "common.cancel": "取消",
    "common.save": "保存",
    "common.saving": "保存中…",
    "common.saved": "已保存",
    "common.loading": "加载中…",
    "common.loadingSession": "加载会话…",
    "common.signOut": "退出登录",
    "common.userMenu": "用户菜单",
    "common.open": "打开",
    "common.verify": "验证",
    "common.track": "追踪",
    "common.search": "搜索",
    "login.title": "登录 SGTX",
    "login.subtitle": "使用您的工作邮箱和密码。",
    "login.email": "工作邮箱",
    "login.password": "密码",
    "login.signIn": "登录",
    "login.demoLogin": "演示登录 — 点击任意门户",
    "login.backHome": "← 返回主页",
    "login.alreadyOnboarded": "已注册？登录",
    "login.beginOnboarding": "开始注册",
    "login.drafts": "草稿",
    "join.title": "加入 SGTX",
    "home.welcome": "欢迎回来",
    "home.subtitle": "这是今天需要您关注的内容。",
    "home.needsAttention": "需要您关注",
    "home.happeningNow": "正在进行",
    "home.blocked": "已阻塞",
    "home.needsApproval": "需要您批准",
    "home.recentChanges": "最近更改",
    "home.activeTradesCount": "笔正在执行的交易",
    "home.noUrgent": "没有紧急事项。您已全部处理完毕。",
    "home.noBlockers": "没有阻塞。所有交易都在正轨上。",
    "home.noApprovals": "现在没有待批准的事项。",
    "home.noActivity": "没有最近的活动。",
    "trades.title": "交易",
    "trades.subtitle": "总计",
    "trades.newTrade": "新建交易请求",
    "trades.filter.active": "活跃",
    "trades.filter.drafts": "草稿",
    "trades.filter.history": "历史",
    "trades.filter.all": "全部",
    "trades.searchPlaceholder": "按商品、USTN 或交易对手搜索…",
    "trades.empty": "您还没有任何交易。开始创建一个新交易请求。",
    "trades.emptyFiltered": "没有符合此筛选的交易。",
    "wizard.title": "新建交易请求",
    "wizard.subtitle": "6 步 · 自动保存草稿 · 可从草稿恢复",
    "wizard.step1": "需求",
    "wizard.step2": "商业条款",
    "wizard.step3": "物流",
    "wizard.step4": "合规",
    "wizard.step5": "融资",
    "wizard.step6": "审核",
    "wizard.step1.title": "您在交易什么？",
    "wizard.step1.desc": "告诉我们产品、数量和目的地。",
    "wizard.step2.title": "商业条款",
    "wizard.step2.desc": "交易对手是谁？价格、贸易术语和付款条件。",
    "wizard.step3.title": "物流",
    "wizard.step3.desc": "货物将如何运输？",
    "wizard.step4.title": "合规（自动生成）",
    "wizard.step4.desc": "平台根据目的地确定所需文件。",
    "wizard.step5.title": "融资（可选）",
    "wizard.step5.desc": "您需要为此交易融资吗？",
    "wizard.step6.title": "审核并提交",
    "wizard.step6.desc": "阅读下面的摘要。平台会自动生成 USTN、合同和文件要求。",
    "wizard.submit": "创建交易请求",
    "wizard.draftRestored": "已恢复草稿",
    "trade.nextAction": "下一步",
    "trade.summary": "摘要",
    "trade.timeline": "时间线",
    "trade.activity": "最近活动",
    "trade.notFound": "交易未找到",
    "trade.notFoundDesc": "您的租户看不到此 USTN 的交易。",
    "trade.backToTrades": "返回交易",
    "trade.allTrades": "所有交易",
    "trade.showExpert": "显示专家视图",
    "trade.hideExpert": "隐藏专家视图",
    "trade.tab.documents": "文件",
    "trade.tab.payments": "付款",
    "trade.tab.compliance": "合规",
    "trade.tab.messages": "消息",
    "trade.tab.details": "详情",
    "trade.perspective.buyer": "买方",
    "trade.perspective.seller": "卖方",
    "trade.perspective.observer": "观察者",
    "ops.title": "运营",
    "ops.subtitle": "您的运营队列。每个项目链接到其所属的交易。",
    "ops.activeTrades": "您的活跃交易",
    "ops.shipments": "货运",
    "ops.assignedJobs": "分配的任务",
    "ops.bookings": "预订和提单",
    "ops.testRequests": "测试请求",
    "ops.inspections": "检查",
    "ops.declarations": "海关申报",
    "ops.nationalFlow": "国家贸易流",
    "ops.pendingClearances": "待清关",
    "money.title": "财务",
    "money.subtitle": "您的财务状况 — 发票、融资、结算。",
    "money.outstanding": "未付发票",
    "money.paid": "已付 / 已结算",
    "money.opportunities": "融资机会（开放的 RFQ）",
    "money.yourBids": "您的出价",
    "money.activeLoans": "活跃贷款",
    "money.crossBorder": "跨境流量",
    "money.fxAlerts": "外汇/结算警报",
    "trust.title": "信任",
    "trust.subtitle": "您的信任护照和公开 GTID 验证。",
    "trust.yourPassport": "您的信任护照",
    "trust.verifyByGtid": "通过 GTID 验证租户",
    "trust.kybTier": "KYB 级别",
    "trust.trustScore": "信任分数",
    "trust.lifecycle": "生命周期",
    "trust.type": "类型",
    "trust.country": "国家",
    "trust.sanctionsCleared": "✓ 制裁已清除",
    "trust.sanctionsHit": "✗ 制裁命中",
    "net.title": "网络",
    "net.subtitle": "您的交易对手和使用的贸易走廊。",
    "net.savedContacts": "保存的联系人",
    "net.corridors": "贸易走廊",
    "net.noContacts": "尚无保存的联系人。",
    "net.noContactsDesc": "创建交易请求时，交易对手会自动添加到您的网络。",
    "footer.nonCustodial": "非托管",
    "footer.aiGoverned": "AI 治理",
    "footer.sovereign": "主权",
  },
};
