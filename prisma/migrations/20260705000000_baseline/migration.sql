-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gtid" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "traderMode" TEXT NOT NULL DEFAULT 'NONE',
    "kybTier" INTEGER NOT NULL DEFAULT 1,
    "trustScore" INTEGER NOT NULL DEFAULT 70,
    "trustConfidence" REAL,
    "kybStatus" TEXT,
    "pepStatus" TEXT,
    "lifecycleState" TEXT NOT NULL DEFAULT 'VERIFIED',
    "sanctionsCleared" BOOLEAN NOT NULL DEFAULT true,
    "defiAllowed" BOOLEAN NOT NULL DEFAULT false,
    "anonymousRfqOptOut" BOOLEAN NOT NULL DEFAULT false,
    "city" TEXT,
    "logoColor" TEXT,
    "sector" TEXT,
    "bankSwift" TEXT,
    "bankName" TEXT,
    "bankBranch" TEXT,
    "bankCity" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNo" TEXT,
    "bankCurrency" TEXT,
    "bankIbanFormat" TEXT,
    "globalNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "allowRoleSwitching" BOOLEAN NOT NULL DEFAULT false,
    "defaultTraderMode" TEXT NOT NULL DEFAULT 'NONE',
    "activeTraderMode" TEXT NOT NULL DEFAULT 'NONE',
    "avatarColor" TEXT,
    "passwordHash" TEXT,
    "totpSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Employee_tenantGtid_fkey" FOREIGN KEY ("tenantGtid") REFERENCES "Tenant" ("gtid") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "buyerGtid" TEXT NOT NULL,
    "sellerGtid" TEXT NOT NULL,
    "commodity" TEXT NOT NULL,
    "commodityHs" TEXT,
    "incoterm" TEXT NOT NULL,
    "grossWeightKg" INTEGER NOT NULL,
    "netWeightKg" INTEGER NOT NULL,
    "tradeValueUsd" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "originPort" TEXT NOT NULL,
    "destPort" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "destCountry" TEXT NOT NULL,
    "phase" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'INITIATED',
    "healthScore" INTEGER NOT NULL DEFAULT 85,
    "multiShipment" BOOLEAN NOT NULL DEFAULT false,
    "sgtxFeeUsd" REAL,
    "coldChain" BOOLEAN NOT NULL DEFAULT false,
    "containerCount" INTEGER NOT NULL DEFAULT 1,
    "orderBy" TEXT,
    "orderValue" TEXT,
    "paymentTerms" TEXT,
    "paymentTermsDetails" TEXT,
    "packaging" TEXT,
    "globalNotes" TEXT,
    "specialInstructions" TEXT,
    "transportMode" TEXT,
    "equipmentType" TEXT,
    "equipmentCount" INTEGER,
    "alternativePorts" TEXT,
    "earliestDeliveryDate" DATETIME,
    "preferredDeliveryDate" DATETIME,
    "latestDeliveryDate" DATETIME,
    "transitTimeDays" INTEGER,
    "insuranceRequirement" TEXT,
    "insuranceType" TEXT,
    "insuranceResponsibleParty" TEXT,
    "insuranceCoveragePct" INTEGER,
    "insuranceCurrency" TEXT,
    "settlementStructure" TEXT,
    "paymentTiming" TEXT,
    "creditPeriod" TEXT,
    "creditPeriodCustomDays" INTEGER,
    "commercialPriority" TEXT,
    "financingInterest" TEXT,
    "bankInstrument" TEXT,
    "settlementFlexibility" TEXT,
    "balanceTiming" TEXT,
    "settlementDocuments" TEXT,
    "originalDocsRequired" BOOLEAN,
    "documentLanguage" TEXT,
    "blType" TEXT,
    "optionalQcInspection" BOOLEAN NOT NULL DEFAULT false,
    "qcInspectionType" TEXT,
    "qcInspectionFeeUsd" REAL,
    "labTestsRequested" TEXT,
    "labTestsFeeUsd" REAL,
    "optionalServicesTotalUsd" REAL,
    "readinessScore" INTEGER,
    "readinessMissing" TEXT,
    "tradeCriticality" TEXT,
    "criticalitySuggested" TEXT,
    "criticalityConfidence" REAL,
    "criticalityAdjustmentReason" TEXT,
    "masterContractId" TEXT,
    "parentUstn" TEXT,
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "logisticsModeGtids" TEXT,
    "logisticsRfqSummary" TEXT,
    "buyerCustomsBrokerGtid" TEXT,
    "sellerCustomsBrokerGtid" TEXT,
    "buyerCustomsBrokerAssignedAt" DATETIME,
    "sellerCustomsBrokerAssignedAt" DATETIME,
    CONSTRAINT "Trade_buyerGtid_fkey" FOREIGN KEY ("buyerGtid") REFERENCES "Tenant" ("gtid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Trade_sellerGtid_fkey" FOREIGN KEY ("sellerGtid") REFERENCES "Tenant" ("gtid") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BuyerSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "buyerGtid" TEXT NOT NULL,
    "buyerLegalName" TEXT NOT NULL,
    "buyerCountry" TEXT NOT NULL,
    "buyerCity" TEXT,
    "buyerAddress" TEXT,
    "buyerTaxId" TEXT,
    "consigneeSameAsBuyer" BOOLEAN NOT NULL DEFAULT false,
    "consigneeJson" TEXT,
    "notifyPartiesJson" TEXT,
    "documentDispatchAddressesJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BuyerSubmission_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "contractVersion" INTEGER NOT NULL DEFAULT 1,
    "contractType" TEXT NOT NULL,
    "governingLaw" TEXT NOT NULL DEFAULT 'EGYPTIAN_LAW',
    "arbitrationClause" TEXT NOT NULL,
    "arbitrationSeat" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "contractJson" TEXT,
    "contractHtml" TEXT,
    "hashSha256" TEXT,
    "signedBy" TEXT,
    "signedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TradeContract_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "vesselName" TEXT,
    "vesselImo" TEXT,
    "containerNo" TEXT,
    "containerCount" INTEGER NOT NULL DEFAULT 1,
    "carrierGtid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "originPort" TEXT NOT NULL,
    "destPort" TEXT NOT NULL,
    "etd" DATETIME,
    "eta" DATETIME,
    "departedAt" DATETIME,
    "arrivedAt" DATETIME,
    "releasedAt" DATETIME,
    "coldChainTemp" REAL,
    "lat" REAL,
    "lng" REAL,
    "driverName" TEXT,
    "truckNumber" TEXT,
    "loadingDate" DATETIME,
    "warehouseArrivalTime" DATETIME,
    "warehouseDepartureTime" DATETIME,
    "portCheckInTime" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shipment_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Shipment_carrierGtid_fkey" FOREIGN KEY ("carrierGtid") REFERENCES "Tenant" ("gtid") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeContainer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "originCountry" TEXT NOT NULL,
    "destCountry" TEXT NOT NULL,
    "port" TEXT NOT NULL,
    "palletized" BOOLEAN NOT NULL DEFAULT true,
    "palletSize" TEXT,
    "destOverride" TEXT,
    "notes" TEXT,
    "containerSize" TEXT,
    "commodities" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeContainer_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "buyerGtid" TEXT NOT NULL,
    "sellerGtid" TEXT,
    "incoterm" TEXT,
    "parsedSpecs" TEXT,
    "multiShipmentSchedule" TEXT,
    "globalNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUIRED',
    "uploadedBy" TEXT,
    "fileSizeKb" INTEGER,
    "hashSha256" TEXT,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "docName" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "issuingAuthority" TEXT,
    "format" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentRequirement_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT,
    "actorGtid" TEXT,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Activity_actorGtid_fkey" FOREIGN KEY ("actorGtid") REFERENCES "Tenant" ("gtid") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actorGtid" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimelineEvent_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "senderGtid" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isAi" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TradeMessage_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "amountUsd" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payerGtid" TEXT NOT NULL,
    "payeeGtid" TEXT NOT NULL,
    "ublXml" TEXT,
    "dueDate" DATETIME,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InboxItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "tradeId" TEXT,
    "category" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "deadline" DATETIME,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "snoozedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboxItem_tenantGtid_fkey" FOREIGN KEY ("tenantGtid") REFERENCES "Tenant" ("gtid") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InboxItem_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "ustn" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FILED',
    "filedByGtid" TEXT NOT NULL,
    "respondentGtid" TEXT,
    "claimAmountUsd" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "aiRootCause" TEXT,
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Dispute_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancingRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "tradeId" TEXT NOT NULL,
    "borrowerGtid" TEXT NOT NULL,
    "shipmentSeq" INTEGER,
    "ustn" TEXT,
    "amountUsd" REAL NOT NULL,
    "totalTradeValue" REAL NOT NULL,
    "financingType" TEXT NOT NULL,
    "tenorDays" INTEGER NOT NULL,
    "preferredSettlement" TEXT NOT NULL,
    "preferredCurrency" TEXT NOT NULL DEFAULT 'USD',
    "collateralType" TEXT NOT NULL,
    "specialInstructions" TEXT,
    "recommendedLtv" REAL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "creditScore" INTEGER,
    "defaultProbability" REAL,
    "creditIntelligence" TEXT,
    "biddingWindowEndsAt" DATETIME,
    "blendedApr" REAL,
    "feeUsd" REAL,
    "feeLockStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancingRequest_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancingRequest_borrowerGtid_fkey" FOREIGN KEY ("borrowerGtid") REFERENCES "Tenant" ("gtid") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancingBid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bidId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "financierGtid" TEXT NOT NULL,
    "amountOffered" REAL NOT NULL,
    "apr" REAL NOT NULL,
    "settlementMethod" TEXT NOT NULL,
    "collateralRequired" TEXT NOT NULL,
    "conditions" TEXT,
    "noteToBorrower" TEXT,
    "isDeFi" BOOLEAN NOT NULL DEFAULT false,
    "deFiProtocol" TEXT,
    "deFiRiskAcknowledgedAt" DATETIME,
    "matchScore" INTEGER NOT NULL DEFAULT 0,
    "encryptedPayload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancingBid_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancingRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancingBid_financierGtid_fkey" FOREIGN KEY ("financierGtid") REFERENCES "Tenant" ("gtid") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancierPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "financierGtid" TEXT NOT NULL,
    "acceptedBorrowerCountries" TEXT NOT NULL,
    "minTrustScore" INTEGER NOT NULL DEFAULT 70,
    "minTradeValue" REAL NOT NULL DEFAULT 10000,
    "maxFinancedPerRequest" REAL NOT NULL DEFAULT 500000,
    "preferredFinancingTypes" TEXT NOT NULL,
    "preferredSettlementMethods" TEXT NOT NULL,
    "excludedCommodities" TEXT NOT NULL,
    "geographicMode" TEXT NOT NULL DEFAULT 'ALL',
    "geographicList" TEXT,
    "minTrancheSize" REAL NOT NULL DEFAULT 10000,
    "defaultAprBenchmark" REAL NOT NULL DEFAULT 5.0,
    "enableDeFi" BOOLEAN NOT NULL DEFAULT false,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "webhookUrl" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FinancingRfqLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "financierGtid" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "deliveredVia" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DELIVERED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancingRfqLog_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancingRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancingAgreement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agreementId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "masterContractHash" TEXT NOT NULL,
    "witnessClauseText" TEXT NOT NULL,
    "borrowerSignedAt" DATETIME,
    "financierSignedAt" DATETIME,
    "governorSignedAt" DATETIME,
    "governorSignature" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_SIGNATURES',
    "totalAcceptedAmount" REAL NOT NULL,
    "blendedApr" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancingAgreement_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancingRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancingAgreementAnnex" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agreementId" TEXT NOT NULL,
    "bidId" TEXT NOT NULL,
    "financierGtid" TEXT NOT NULL,
    "amountFinanced" REAL NOT NULL,
    "apr" REAL NOT NULL,
    "tenorDays" INTEGER NOT NULL,
    "repaymentSchedule" TEXT NOT NULL,
    "collateralTerms" TEXT NOT NULL,
    "feeUsd" REAL NOT NULL,
    "borrowerNetProceeds" REAL NOT NULL,
    "financierSignedAt" DATETIME,
    "disbursedAt" DATETIME,
    "pspSplitReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancingAgreementAnnex_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "FinancingAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancingAgreementAnnex_bidId_fkey" FOREIGN KEY ("bidId") REFERENCES "FinancingBid" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancingRepayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "annexId" TEXT,
    "financierGtid" TEXT NOT NULL,
    "amountUsd" REAL NOT NULL,
    "method" TEXT NOT NULL,
    "txReference" TEXT,
    "detectedVia" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "repaidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancingRepayment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FinancingRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeFiProtocol" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'Ethereum',
    "riskScore" INTEGER NOT NULL DEFAULT 85,
    "tvlUsd" REAL NOT NULL DEFAULT 0,
    "auditStatus" TEXT NOT NULL DEFAULT 'AUDITED',
    "lastExploit" TEXT,
    "governanceActivity" TEXT NOT NULL DEFAULT 'ACTIVE',
    "healthColor" TEXT NOT NULL DEFAULT 'GREEN',
    "contractAddress" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DeFiPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "annexId" TEXT NOT NULL,
    "protocolName" TEXT NOT NULL,
    "borrowerGtid" TEXT NOT NULL,
    "financierGtid" TEXT NOT NULL,
    "principalUsd" REAL NOT NULL,
    "healthFactor" REAL NOT NULL DEFAULT 2.0,
    "predictedHealth24h" REAL,
    "collateralUsd" REAL NOT NULL,
    "debtUsd" REAL NOT NULL,
    "liquidationThreshold" REAL NOT NULL DEFAULT 0.8,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastCheckedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeFiPosition_annexId_fkey" FOREIGN KEY ("annexId") REFERENCES "FinancingAgreementAnnex" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StablecoinStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "pegUsd" REAL NOT NULL DEFAULT 1.0,
    "deviationPct" REAL NOT NULL DEFAULT 0.0,
    "oracle" TEXT NOT NULL DEFAULT 'CoinGecko',
    "freezeNewPositions" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LabTest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "labGtid" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "sampleRef" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "result" TEXT,
    "passFail" TEXT,
    "parameters" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabTest_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LabTest_labGtid_fkey" FOREIGN KEY ("labGtid") REFERENCES "Tenant" ("gtid") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QcInspection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "qcGtid" TEXT NOT NULL,
    "inspectionType" TEXT NOT NULL,
    "inspectorName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "result" TEXT,
    "defectCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "actionPlan" TEXT,
    "conditionalPassStatus" TEXT,
    "actionPlanDeadline" DATETIME,
    "defectsJson" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QcInspection_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QcInspection_qcGtid_fkey" FOREIGN KEY ("qcGtid") REFERENCES "Tenant" ("gtid") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomsDeclaration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT NOT NULL,
    "brokerGtid" TEXT,
    "declarationNo" TEXT,
    "regime" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dutyUsd" REAL,
    "etaXml" TEXT,
    "nafezaStatus" TEXT,
    "clearedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomsDeclaration_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CustomsDeclaration_brokerGtid_fkey" FOREIGN KEY ("brokerGtid") REFERENCES "Tenant" ("gtid") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceQuotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "tradeId" TEXT,
    "ustn" TEXT,
    "providerGtid" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "feeUsd" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "validityDays" INTEGER NOT NULL DEFAULT 7,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "notes" TEXT,
    "vessel" TEXT,
    "voyage" TEXT,
    "etd" DATETIME,
    "eta" DATETIME,
    "sampleInstructions" TEXT,
    "inspectionDate" TEXT,
    "inspectionLocation" TEXT,
    "acceptedByGtid" TEXT,
    "acceptedAt" DATETIME,
    "invoiceId" TEXT,
    "paymentStage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceQuotation_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceQuotation_providerGtid_fkey" FOREIGN KEY ("providerGtid") REFERENCES "Tenant" ("gtid") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntegrationHealth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPERATIONAL',
    "latencyMs" INTEGER NOT NULL DEFAULT 420,
    "errorRate" REAL NOT NULL DEFAULT 0.4,
    "uptime30d" REAL NOT NULL DEFAULT 99.94,
    "lastIncident" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GovernorDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "decisionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorGtid" TEXT,
    "actorEmployeeId" TEXT,
    "traderMode" TEXT,
    "resourceUstn" TEXT,
    "payload" TEXT,
    "verdict" TEXT NOT NULL,
    "conditions" TEXT,
    "tenantMessage" TEXT,
    "loomHash" TEXT NOT NULL,
    "previousHash" TEXT,
    "signature" TEXT NOT NULL,
    "pqcSignature" TEXT,
    "moduleVersions" TEXT,
    "aiConfidence" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LoomVerificationToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Jurisdiction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryCode" TEXT NOT NULL,
    "countryName" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'STANDARD',
    "defiAllowed" BOOLEAN NOT NULL DEFAULT true,
    "pspList" TEXT,
    "notes" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SuspiciousActivityReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportType" TEXT NOT NULL,
    "detectionRule" TEXT NOT NULL,
    "involvedUstns" TEXT NOT NULL,
    "parties" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "draftStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "filingReference" TEXT,
    "governorDecisionId" TEXT,
    "loomHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SavedContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerGtid" TEXT NOT NULL,
    "contactGtid" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactType" TEXT NOT NULL,
    "relationship" TEXT,
    "trustPortrait" TEXT,
    "healthScore" INTEGER NOT NULL DEFAULT 70,
    "trustScore" INTEGER NOT NULL DEFAULT 70,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "autoSaved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TradeReadiness" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "companyScore" INTEGER NOT NULL DEFAULT 0,
    "bankingScore" INTEGER NOT NULL DEFAULT 0,
    "tradeScore" INTEGER NOT NULL DEFAULT 0,
    "securityScore" INTEGER NOT NULL DEFAULT 0,
    "legalScore" INTEGER NOT NULL DEFAULT 0,
    "checklist" TEXT NOT NULL,
    "lastCalculated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "QesSignature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT,
    "signerGtid" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signatureType" TEXT NOT NULL,
    "legalEffect" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "certificateId" TEXT,
    "certificateFp" TEXT,
    "documentHash" TEXT NOT NULL,
    "signatureValue" TEXT NOT NULL,
    "documentType" TEXT,
    "hybridMode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "QesRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "documentSha256" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "ustn" TEXT,
    "signerGtid" TEXT NOT NULL,
    "signerTsp" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "tspRequestUrl" TEXT,
    "certificateRef" TEXT,
    "callbackUrl" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "QesEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "tsp" TEXT NOT NULL,
    "certificateRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "enrolledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DeviceTrust" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'NEW',
    "passkeyEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenIp" TEXT,
    "lastSeenCountry" TEXT,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SessionRiskEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "description" TEXT NOT NULL,
    "ipAddress" TEXT,
    "countryCode" TEXT,
    "metadata" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EvidencePackage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "packageType" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "contents" TEXT NOT NULL,
    "fileSizeKb" INTEGER,
    "loomHash" TEXT,
    "generatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ComplianceScreening" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT,
    "tenantGtid" TEXT NOT NULL,
    "screeningType" TEXT NOT NULL,
    "verdict" TEXT NOT NULL DEFAULT 'CLEAR',
    "dataSource" TEXT NOT NULL,
    "details" TEXT,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "overrideMultisig" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SessionAuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "eventType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ipAddress" TEXT,
    "loomHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShipQuoteRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT,
    "sellerGtid" TEXT NOT NULL,
    "baseServiceType" TEXT NOT NULL,
    "originPort" TEXT NOT NULL,
    "destinationPort" TEXT NOT NULL,
    "containerDetails" TEXT NOT NULL,
    "addOnServices" TEXT NOT NULL,
    "targetLines" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShipQuote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "shipperLineGtid" TEXT NOT NULL,
    "baseFee" REAL NOT NULL,
    "addOnFees" TEXT,
    "totalFee" REAL NOT NULL,
    "validityHours" INTEGER NOT NULL DEFAULT 48,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OpaPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1.0.0',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastReloaded" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "multisigApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TenantBusinessUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TenantDepartment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TenantCostCenter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "departmentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TenantApprovalGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "memberEmails" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TenantApprovalPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "threshold" REAL NOT NULL,
    "requiredApprovals" INTEGER NOT NULL DEFAULT 2,
    "approvalGroupIds" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TenantLifecycleHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "fromState" TEXT NOT NULL,
    "toState" TEXT NOT NULL,
    "reason" TEXT,
    "changedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TrustPassport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "triScore" INTEGER NOT NULL DEFAULT 0,
    "triConfidence" INTEGER NOT NULL DEFAULT 0,
    "triStatus" TEXT NOT NULL DEFAULT 'Developing',
    "settlementReliability" INTEGER NOT NULL DEFAULT 0,
    "complianceHealth" INTEGER NOT NULL DEFAULT 0,
    "documentationQuality" INTEGER NOT NULL DEFAULT 0,
    "financingPerformance" INTEGER NOT NULL DEFAULT 0,
    "disputeResolution" INTEGER NOT NULL DEFAULT 0,
    "customsPerformance" INTEGER NOT NULL DEFAULT 0,
    "logisticsPerformance" INTEGER NOT NULL DEFAULT 0,
    "tradeVolumeConsistency" INTEGER NOT NULL DEFAULT 0,
    "verifiedIdentifiers" TEXT NOT NULL,
    "complianceSummary" TEXT NOT NULL,
    "financingSummary" TEXT,
    "disputeSummary" TEXT,
    "trustGraphReference" TEXT,
    "credentialHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "loomHash" TEXT,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrustPassportToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "passportId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sharedWithGtid" TEXT,
    "dimensions" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "accessedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TrustPassportRevocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "passportId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "revokedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ContainerReleaseAuthorisation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorisationId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "containerNo" TEXT NOT NULL,
    "releaseStatus" TEXT NOT NULL,
    "holdReason" TEXT,
    "requestId" TEXT,
    "terminalId" TEXT,
    "issuedAt" DATETIME,
    "validUntil" DATETIME,
    "mandatorySummary" TEXT,
    "creditSummary" TEXT,
    "disputeStatus" TEXT NOT NULL DEFAULT 'NONE',
    "disputeId" TEXT,
    "digitalSignature" TEXT,
    "revocationReason" TEXT,
    "revokedAt" DATETIME,
    "gateOutAt" DATETIME,
    "gateOperatorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FeePaymentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "tradeId" TEXT,
    "shipmentId" TEXT,
    "stage" TEXT NOT NULL,
    "payerGtid" TEXT NOT NULL,
    "totalAmountUsd" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "splits" TEXT NOT NULL,
    "pspSelected" TEXT,
    "pspReference" TEXT,
    "feeLockStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "deferred" BOOLEAN NOT NULL DEFAULT false,
    "deferredStatus" TEXT,
    "guaranteeExpiry" DATETIME,
    "autoChargeAuthorised" BOOLEAN NOT NULL DEFAULT false,
    "expiryActionTaken" TEXT,
    "lateFeeAccrued" REAL NOT NULL DEFAULT 0,
    "dueDate" DATETIME,
    "paidAt" DATETIME,
    "governmentApiCalls" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LateFeeEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feePaymentRequestId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "daysLate" INTEGER NOT NULL,
    "lateFeeAmount" REAL NOT NULL,
    "totalDue" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IntegrationConnectorLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "logId" TEXT NOT NULL,
    "apiName" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "ustn" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestBody" TEXT NOT NULL,
    "responseBody" TEXT,
    "statusCode" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "errorMessage" TEXT,
    "retryScheduledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BankSettlementInstruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instructionId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "tradeId" TEXT,
    "fromIban" TEXT NOT NULL,
    "toIban" TEXT NOT NULL,
    "fromBic" TEXT,
    "toBic" TEXT,
    "amountUsd" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "valueDate" DATETIME,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "transactionRef" TEXT,
    "settledAt" DATETIME,
    "bankBic" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProviderServiceCatalogue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerGtid" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "route" TEXT,
    "vehicleType" TEXT,
    "containerType" TEXT,
    "feeUsd" REAL NOT NULL,
    "feeUnit" TEXT NOT NULL DEFAULT 'flat',
    "transitDays" INTEGER,
    "sailingFreq" TEXT,
    "analytes" TEXT,
    "aqlLevel" TEXT,
    "validFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ProviderPerformance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerGtid" TEXT NOT NULL,
    "onTimeDeliveryPct" REAL NOT NULL DEFAULT 85,
    "disputeRate" REAL NOT NULL DEFAULT 0.05,
    "invoiceAccuracyPct" REAL NOT NULL DEFAULT 95,
    "riskScore" INTEGER NOT NULL DEFAULT 70,
    "totalJobs" INTEGER NOT NULL DEFAULT 0,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "avgTurnaroundDays" REAL NOT NULL DEFAULT 3,
    "benchmarkQuartile" INTEGER NOT NULL DEFAULT 2,
    "performanceSummary" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "IncotermServiceMapping" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incoterm" TEXT NOT NULL,
    "servicesJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DisputeMediation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "senderGtid" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "messageText" TEXT,
    "offerAmountUsd" REAL,
    "offerConditions" TEXT,
    "translatedText" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "sentimentScore" REAL,
    "sentimentFlag" TEXT,
    "signature" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisputeMediation_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DisputeEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "packageHash" TEXT NOT NULL,
    "loomHash" TEXT,
    "contents" TEXT NOT NULL,
    "verificationToken" TEXT,
    "fileSizeKb" INTEGER,
    "compiledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisputeEvidence_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DisputeExpert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "expertType" TEXT NOT NULL,
    "expertGtid" TEXT,
    "expertName" TEXT NOT NULL,
    "invitedByGtid" TEXT NOT NULL,
    "message" TEXT,
    "secureLink" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "opinionText" TEXT,
    "acceptedAt" DATETIME,
    "opinionPostedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisputeExpert_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SettlementProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "proposalType" TEXT NOT NULL,
    "amountUsd" REAL,
    "conditions" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "buyerAccepted" BOOLEAN NOT NULL DEFAULT false,
    "sellerAccepted" BOOLEAN NOT NULL DEFAULT false,
    "buyerAcceptedAt" DATETIME,
    "sellerAcceptedAt" DATETIME,
    "addendumSigned" BOOLEAN NOT NULL DEFAULT false,
    "acceptanceDeadline" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SettlementProposal_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArbitrationCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "arbitrationBody" TEXT NOT NULL,
    "claimLanguage" TEXT NOT NULL DEFAULT 'en',
    "caseFormData" TEXT NOT NULL,
    "claimNarrative" TEXT,
    "evidencePackageHash" TEXT,
    "loomHash" TEXT,
    "pdfUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArbitrationCase_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SgtxFeeDispute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feeDisputeId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "feeAmountUsd" REAL NOT NULL,
    "feeRateApplied" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "aiRecommendation" TEXT,
    "aiAnalysis" TEXT,
    "status" TEXT NOT NULL DEFAULT 'FILED',
    "refundAmountUsd" REAL,
    "multisigApprovals" TEXT,
    "filedByGtid" TEXT NOT NULL,
    "filedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME
);

-- CreateTable
CREATE TABLE "QcOverrideFlag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT,
    "inspectionId" TEXT,
    "ustn" TEXT NOT NULL,
    "originalAiDetection" TEXT NOT NULL,
    "inspectorClassification" TEXT NOT NULL,
    "inspectorReason" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL,
    "photoHashes" TEXT,
    "flaggedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QcOverrideFlag_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DisputePrediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT NOT NULL,
    "filerWinProbability" REAL NOT NULL,
    "predictedAwardMin" REAL,
    "predictedAwardMax" REAL,
    "confidence" REAL NOT NULL,
    "summary" TEXT NOT NULL,
    "features" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisputePrediction_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TriHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "triScore" INTEGER NOT NULL,
    "confidence" REAL NOT NULL,
    "componentScores" TEXT NOT NULL,
    "calculatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShipmentRiskAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "shipmentRiskScore" INTEGER NOT NULL,
    "customsDelayProbability" REAL,
    "docRejectionRisk" TEXT,
    "routeForecast" TEXT,
    "recommendations" TEXT,
    "explanation" TEXT,
    "modelVersion" TEXT,
    "assessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FinancingRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "financingRequestId" TEXT,
    "recommendation" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "rationale" TEXT,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RiskModelMetadata" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modelName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "accuracy" REAL NOT NULL DEFAULT 0.85,
    "driftDetected" BOOLEAN NOT NULL DEFAULT false,
    "deployedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" DATETIME
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,
    "loomHash" TEXT,
    "withdrawnAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DsrRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "details" TEXT,
    "fulfilledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DataBreachNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affectedCount" INTEGER NOT NULL DEFAULT 0,
    "notifiedDpc" BOOLEAN NOT NULL DEFAULT false,
    "notifiedAt" DATETIME,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TradeMemoryEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT,
    "tenantGtid" TEXT,
    "category" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventValue" REAL,
    "eventMetadata" TEXT,
    "anonymizedId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PredictiveInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT,
    "ustn" TEXT,
    "insightType" TEXT NOT NULL,
    "prediction" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "summary" TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AnomalyDetectionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityRef" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "anomalyType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "aiSummary" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PalletDetail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT,
    "ustn" TEXT NOT NULL,
    "shipmentId" TEXT,
    "palletId" TEXT,
    "packingPlanId" TEXT,
    "sscc" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "layerPosition" INTEGER,
    "layerIndex" INTEGER,
    "layerPatterns" TEXT,
    "totalCartons" INTEGER,
    "totalWeightKg" REAL,
    "loaded" BOOLEAN NOT NULL DEFAULT false,
    "loadedAt" DATETIME,
    "loadedBy" TEXT,
    "scanMethod" TEXT,
    "product" TEXT,
    "commodityHs" TEXT,
    "lotNumber" TEXT,
    "netWeightKg" REAL,
    "grossWeightKg" REAL,
    "originCountry" TEXT,
    "treatmentStatus" TEXT,
    "qrData" TEXT,
    "qrCodeData" TEXT,
    "loomHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PalletDetail_packingPlanId_fkey" FOREIGN KEY ("packingPlanId") REFERENCES "PackingPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BarcodePrintJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tradeId" TEXT,
    "ustn" TEXT NOT NULL,
    "palletIds" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'ZPL',
    "template" TEXT NOT NULL DEFAULT 'Standard',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "printedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BarcodeScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sscc" TEXT NOT NULL,
    "ustn" TEXT,
    "scannedByGtid" TEXT,
    "scanLocation" TEXT,
    "scanType" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affectedSystems" TEXT,
    "rootCause" TEXT,
    "resolution" TEXT,
    "postMortemText" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME
);

-- CreateTable
CREATE TABLE "ThreatFinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cveId" TEXT,
    "mitreTactic" TEXT,
    "mitreTechnique" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "remediatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SlaMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "component" TEXT NOT NULL,
    "availabilityPct" REAL NOT NULL,
    "p95LatencyMs" REAL,
    "errorRatePct" REAL,
    "uptimeWindow" TEXT NOT NULL,
    "measuredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StatusPageEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "component" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MaintenanceWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scheduledStart" DATETIME NOT NULL,
    "scheduledEnd" DATETIME NOT NULL,
    "affectedComponents" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "tradeId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueDate" DATETIME,
    "assignedToGtid" TEXT,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "FeedbackTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "url" TEXT,
    "userAgent" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MultisigRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestType" TEXT NOT NULL,
    "requesterGtid" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "approvals" TEXT NOT NULL DEFAULT '[]',
    "authorisedApproverGtids" TEXT,
    "requiredApprovals" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "executedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ConfigurationHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configKey" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedByGtid" TEXT NOT NULL,
    "changeReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MarketplacePartner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partnerGtid" TEXT NOT NULL,
    "partnerName" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "revenueSharePct" REAL NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "agreementSignedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PartnerLeadAttribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partnerGtid" TEXT NOT NULL,
    "buyerGtid" TEXT NOT NULL,
    "sellerGtid" TEXT NOT NULL,
    "revenueSharePct" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "disputedAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WebhookDeliveryLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partnerGtid" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "deliveredAt" DATETIME,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PackingPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT,
    "tradeId" TEXT,
    "ustn" TEXT NOT NULL,
    "sellerGtid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "planData" TEXT,
    "layerPatterns" TEXT NOT NULL,
    "totalCartons" INTEGER NOT NULL,
    "totalPallets" INTEGER NOT NULL,
    "totalNetKg" REAL NOT NULL,
    "totalGrossKg" REAL NOT NULL,
    "carbonFootprintKg" REAL,
    "loomHash" TEXT,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DistressedCargoListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "listingId" TEXT,
    "tradeId" TEXT NOT NULL,
    "shipmentId" TEXT,
    "ustn" TEXT NOT NULL,
    "sellerGtid" TEXT NOT NULL,
    "declarerGtid" TEXT,
    "commodity" TEXT NOT NULL,
    "description" TEXT,
    "quantityKg" REAL NOT NULL,
    "affectedWeightKg" REAL,
    "conditionScore" REAL NOT NULL DEFAULT 100,
    "conditionNotes" TEXT,
    "conditionTags" TEXT,
    "conditionConfidence" REAL DEFAULT 0.8,
    "originalValueUsd" REAL NOT NULL,
    "listingPriceUsd" REAL,
    "suggestedPriceMin" REAL,
    "suggestedPriceMax" REAL,
    "triagePath" TEXT,
    "remainingShelfLifeDays" INTEGER,
    "predictedShelfLifeDays" INTEGER,
    "privacyOptIn" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "privacyLevel" TEXT NOT NULL DEFAULT 'ANONYMOUS',
    "outreachActive" BOOLEAN NOT NULL DEFAULT false,
    "outreachWindowEndsAt" DATETIME,
    "recommendedPrice" REAL,
    "floorPrice" REAL,
    "pricingExplanation" TEXT,
    "listingPrice" REAL,
    "microUstn" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DistressedCargoOffer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offerId" TEXT,
    "listingId" TEXT NOT NULL,
    "buyerGtid" TEXT NOT NULL,
    "offerAmountUsd" REAL NOT NULL,
    "amountUsd" REAL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expressNegotiation" BOOLEAN NOT NULL DEFAULT false,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DistressedCargoOffer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "DistressedCargoListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CausalAttribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "disputeId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityRef" TEXT NOT NULL,
    "rootCauses" TEXT NOT NULL,
    "aiSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CausalAttribution_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FeeLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "tradeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalAmountUsd" REAL NOT NULL,
    "sgtxFeeUsd" REAL NOT NULL,
    "providerFeesJson" TEXT NOT NULL,
    "kvVersion" INTEGER NOT NULL DEFAULT 1,
    "frozenAt" DATETIME,
    "activatedAt" DATETIME,
    "releasedAt" DATETIME,
    "frozenReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "feeLockId" TEXT,
    "stage" TEXT NOT NULL,
    "amountUsd" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "pspProvider" TEXT,
    "pspReference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "splitJson" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "FeeCalculation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "tradeValueUsd" REAL NOT NULL,
    "sgtxFeeUsd" REAL NOT NULL,
    "providerFeesJson" TEXT NOT NULL,
    "totalFeesUsd" REAL NOT NULL,
    "stage" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CommodityPackingDefault" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hsCode" TEXT NOT NULL,
    "commodityName" TEXT NOT NULL,
    "defaultPackaging" TEXT NOT NULL,
    "cartonsPerPallet" INTEGER NOT NULL,
    "netWeightPerCarton" REAL NOT NULL,
    "grossWeightPerCarton" REAL NOT NULL,
    "tarePerCarton" REAL NOT NULL,
    "palletTareKg" REAL,
    "originCountry" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TreatmentRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commodityHs" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "destCountry" TEXT NOT NULL,
    "treatmentType" TEXT NOT NULL,
    "durationDays" INTEGER,
    "temperatureC" REAL,
    "facilityRequired" BOOLEAN NOT NULL DEFAULT false,
    "certificateRequired" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CountryMrl" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "country" TEXT NOT NULL,
    "commodityHs" TEXT NOT NULL,
    "pesticide" TEXT NOT NULL,
    "mrlMgKg" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PortSpecialRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portCode" TEXT NOT NULL,
    "portName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CommodityDynamicSchemaCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hsCode" TEXT NOT NULL,
    "originCountry" TEXT,
    "destCountry" TEXT,
    "port" TEXT,
    "schemaJson" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Port" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unlocode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PlatformFeatureToggle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "featureKey" TEXT NOT NULL,
    "featureName" TEXT NOT NULL,
    "featureCategory" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "canDeactivate" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" DATETIME,
    "deactivatedBy" TEXT,
    "reactivatedAt" DATETIME,
    "reactivatedBy" TEXT,
    "reason" TEXT,
    "config" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BreakGlassEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "targetGtid" TEXT NOT NULL,
    "triggerReason" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'HIGH',
    "initiatedBy" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "previousLifecycleState" TEXT,
    "loomHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SpecialRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rateId" TEXT NOT NULL,
    "targetGtid" TEXT NOT NULL,
    "rateType" TEXT NOT NULL,
    "rateValue" REAL NOT NULL,
    "originalRate" REAL NOT NULL,
    "reason" TEXT NOT NULL,
    "validFrom" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "grantedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GtidChat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "participant1Gtid" TEXT NOT NULL,
    "participant2Gtid" TEXT NOT NULL,
    "ustn" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "aiSummary" TEXT,
    "aiSummaryAt" DATETIME,
    "lastMessageAt" DATETIME,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GtidChatMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "senderGtid" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "attachments" TEXT,
    "isAi" BOOLEAN NOT NULL DEFAULT false,
    "readBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GtidChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "GtidChat" ("chatId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentCourierTracking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackingId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "documentId" TEXT,
    "tradeId" TEXT,
    "courierCompany" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderAddress" TEXT NOT NULL,
    "senderEmail" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "createdBy" TEXT NOT NULL,
    "courierStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "currentLocation" TEXT,
    "deliveredAt" DATETIME,
    "deliverySignature" TEXT,
    "trackingHistory" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TcnCorridor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "destCountry" TEXT NOT NULL,
    "originPort" TEXT NOT NULL,
    "destPort" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT NOT NULL,
    "passportJson" TEXT,
    "totalGates" INTEGER NOT NULL DEFAULT 0,
    "contractClauses" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TcnPortTwin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unlocode" TEXT NOT NULL,
    "corridorCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "facilities" TEXT,
    "digitizationScore" INTEGER NOT NULL DEFAULT 75,
    "cesHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TcnGovNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "apiEndpoint" TEXT,
    "integrationStatus" TEXT NOT NULL DEFAULT 'STUB',
    "trustScore" INTEGER NOT NULL DEFAULT 80,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TcnComplianceGate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gateCode" TEXT NOT NULL,
    "corridorCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gateType" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT true,
    "slaHours" INTEGER NOT NULL DEFAULT 24,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TcnAnalytics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "corridorCode" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "totalValueUsd" REAL NOT NULL DEFAULT 0,
    "avgTransitDays" REAL NOT NULL DEFAULT 0,
    "avgDwellHours" REAL NOT NULL DEFAULT 0,
    "complianceRate" REAL NOT NULL DEFAULT 0,
    "exceptionRate" REAL NOT NULL DEFAULT 0,
    "topCommodities" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TradeCorridor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "corridorCode" TEXT NOT NULL,
    "corridorName" TEXT NOT NULL,
    "corridorNameAr" TEXT,
    "corridorType" TEXT NOT NULL DEFAULT 'RORO',
    "originCountry" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "destCountry" TEXT,
    "originPorts" TEXT NOT NULL,
    "destinationPorts" TEXT NOT NULL,
    "originPort" TEXT,
    "destPort" TEXT,
    "transitDays" INTEGER,
    "corridorOwnerGtid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "operationalStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "verificationMultisig" TEXT,
    "lastVerifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TradeLanePassport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "corridorCode" TEXT NOT NULL,
    "passportVersion" INTEGER NOT NULL DEFAULT 1,
    "commonIncoterms" TEXT NOT NULL,
    "typicalCargoTypes" TEXT NOT NULL,
    "averageTransitDays" INTEGER NOT NULL,
    "cargoTypeCapabilities" TEXT,
    "financeEligibility" TEXT NOT NULL DEFAULT 'HIGH',
    "insuranceAvailability" REAL NOT NULL DEFAULT 95.0,
    "requiredCertificates" TEXT NOT NULL,
    "passportConfidence" REAL NOT NULL DEFAULT 0.8,
    "sourceRegulations" TEXT,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loomHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GovernmentNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryCode" TEXT NOT NULL,
    "authorityName" TEXT NOT NULL,
    "authorityNameAr" TEXT,
    "authorityType" TEXT NOT NULL,
    "authorityLevel" TEXT NOT NULL DEFAULT 'NATIONAL',
    "nodeGtid" TEXT,
    "nodePermissions" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "portUnlocode" TEXT,
    "corridorCodes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PortDigitalTwin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portUnlocode" TEXT NOT NULL,
    "portName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "portCapacity" TEXT,
    "portCapacityCurrent" TEXT,
    "portCongestionLevel" TEXT NOT NULL DEFAULT 'LOW',
    "portOperatingHours" TEXT,
    "inspectionFacilities" TEXT,
    "customsFacilities" TEXT,
    "corridorMappings" TEXT,
    "roroCapacity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "coldStorageAvailable" BOOLEAN NOT NULL DEFAULT true,
    "inspectionAvailable" BOOLEAN NOT NULL DEFAULT true,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loomHash" TEXT
);

-- CreateTable
CREATE TABLE "CorridorComplianceGate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "corridorCode" TEXT NOT NULL,
    "gateType" TEXT NOT NULL,
    "gateCondition" TEXT NOT NULL,
    "gateMessage" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CorridorAnalytics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "corridorCode" TEXT NOT NULL,
    "measurementPeriod" DATETIME NOT NULL,
    "volume" INTEGER NOT NULL DEFAULT 0,
    "gmvUsd" REAL NOT NULL DEFAULT 0,
    "averageTransitDays" REAL NOT NULL DEFAULT 0,
    "onTimePerformance" REAL NOT NULL DEFAULT 0,
    "documentDelayRate" REAL NOT NULL DEFAULT 0,
    "customsClearanceHours" REAL NOT NULL DEFAULT 0,
    "portCongestionHours" REAL NOT NULL DEFAULT 0,
    "financingDemand" INTEGER NOT NULL DEFAULT 0,
    "topProducts" TEXT,
    "privacyEpsilon" REAL NOT NULL DEFAULT 0.1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RoRoVesselSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "corridorCode" TEXT NOT NULL,
    "vesselName" TEXT NOT NULL,
    "vesselImo" TEXT,
    "vesselOperator" TEXT,
    "departurePort" TEXT NOT NULL,
    "arrivalPort" TEXT NOT NULL,
    "etd" DATETIME NOT NULL,
    "eta" DATETIME NOT NULL,
    "transitDays" INTEGER NOT NULL,
    "trailerCapacity" INTEGER NOT NULL DEFAULT 0,
    "vehicleCapacity" INTEGER NOT NULL DEFAULT 0,
    "reeferCapacity" INTEGER NOT NULL DEFAULT 0,
    "maxLoaM" REAL,
    "maxBeamM" REAL,
    "rampCapacityT" REAL,
    "bookingStatus" TEXT NOT NULL DEFAULT 'OPEN',
    "availableSlots" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RoRoBooking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingRef" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "trailerSlots" INTEGER NOT NULL DEFAULT 0,
    "vehicleSlots" INTEGER NOT NULL DEFAULT 0,
    "reeferSlots" INTEGER NOT NULL DEFAULT 0,
    "cargoDetails" TEXT,
    "bookingStatus" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RoRoCargoManifest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "manifestId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "scheduleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RoRoCargoItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "manifestId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "licensePlate" TEXT,
    "driverName" TEXT,
    "driverLicense" TEXT,
    "lengthM" REAL,
    "widthM" REAL,
    "heightM" REAL,
    "weightKg" REAL,
    "reeferTempC" REAL,
    "cargoDescription" TEXT,
    "hsCode" TEXT,
    "rollOnStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "rollOffStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "rollOnAt" DATETIME,
    "rollOffAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT,
    "certificateType" TEXT NOT NULL,
    "issuer" TEXT,
    "subjectCn" TEXT,
    "certificatePem" TEXT NOT NULL,
    "privateKeyEnc" TEXT,
    "serialNumber" TEXT,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "uploadedByGtid" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PspHealthLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pspName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "healthScore" INTEGER NOT NULL DEFAULT 85,
    "uptime30d" REAL NOT NULL DEFAULT 99.5,
    "avgSettlementDays" INTEGER NOT NULL DEFAULT 1,
    "feePct" REAL NOT NULL DEFAULT 1.5,
    "fxSpreadPct" REAL NOT NULL DEFAULT 0.5,
    "countriesSupported" TEXT NOT NULL DEFAULT '[]',
    "currenciesSupported" TEXT NOT NULL DEFAULT '[]',
    "lastHealthCheckAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "aggregatorName" TEXT,
    "latencyMs" INTEGER,
    "errorRate" REAL,
    "status" TEXT,
    "checkedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PaymentAggregator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "countryCodes" TEXT NOT NULL DEFAULT '[]',
    "supportedCurrencies" TEXT NOT NULL DEFAULT '[]',
    "supportsSplit" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "fallbackPriority" INTEGER NOT NULL DEFAULT 0,
    "apiEndpoint" TEXT,
    "uptimeScore" REAL NOT NULL DEFAULT 99.0,
    "lastHealthCheck" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BankReconciliationFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankBic" TEXT NOT NULL,
    "fileDate" DATETIME NOT NULL,
    "format" TEXT NOT NULL,
    "fileContent" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "settlementCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmountUsd" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReleaseOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "overrideToken" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "OneClickTrigger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "tradeId" TEXT,
    "triggerType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "orchestrationStatus" TEXT,
    "cargoxStatus" TEXT,
    "cargoxAcid" TEXT,
    "nafezaStatus" TEXT,
    "feeLockId" TEXT,
    "governorDecisionId" TEXT,
    "nafezaCompletedAt" DATETIME,
    "cbeCompletedAt" DATETIME,
    "cargoxCompletedAt" DATETIME,
    "etaReference" TEXT,
    "etaCompletedAt" DATETIME,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 3,
    "stepsJson" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SettlementInstruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instructionId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "tradeId" TEXT,
    "payerGtid" TEXT NOT NULL,
    "payeeGtid" TEXT NOT NULL,
    "amountUsd" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "frozenReason" TEXT,
    "pspProvider" TEXT,
    "pspSelected" TEXT,
    "pspReference" TEXT,
    "settledAt" DATETIME,
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "cancelWindowEndsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SettlementConfirmation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instructionId" TEXT NOT NULL,
    "confirmationRef" TEXT NOT NULL,
    "pspProvider" TEXT NOT NULL,
    "amountUsd" REAL NOT NULL,
    "settledAt" DATETIME NOT NULL,
    "webhookPayload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MicroContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "microUstn" TEXT NOT NULL,
    "parentUstn" TEXT NOT NULL,
    "tradeId" TEXT,
    "buyerGtid" TEXT NOT NULL,
    "sellerGtid" TEXT NOT NULL,
    "commodity" TEXT NOT NULL,
    "quantityKg" REAL NOT NULL,
    "priceUsd" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MilestonePaymentSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "tradeId" TEXT,
    "scheduleJson" TEXT NOT NULL,
    "totalMilestones" INTEGER NOT NULL DEFAULT 0,
    "completedMilestones" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" REAL,
    "preapproved" BOOLEAN NOT NULL DEFAULT false,
    "preapprovedBy" TEXT,
    "preapprovedAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DeferredFee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "feePaymentRequestId" TEXT,
    "amountUsd" REAL NOT NULL,
    "guaranteeAmount" REAL,
    "payerGtid" TEXT,
    "payeeGtid" TEXT,
    "feeType" TEXT,
    "trigger" TEXT,
    "triggeredAt" DATETIME,
    "guaranteeExpiry" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GUARANTEE_HELD',
    "autoChargeAuthorised" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PackingList" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packingPlanId" TEXT,
    "ustn" TEXT NOT NULL,
    "contentJson" TEXT NOT NULL,
    "contents" TEXT,
    "listId" TEXT,
    "loomHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ColdChainAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "shipmentId" TEXT,
    "containerNo" TEXT,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "temperature" REAL,
    "threshold" REAL,
    "duration" INTEGER,
    "predictedShelfLifeDays" INTEGER,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReInspectionRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT,
    "originalInspectionId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "requestedByGtid" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sameProvider" BOOLEAN NOT NULL DEFAULT false,
    "newQcProviderGtid" TEXT,
    "evidenceNote" TEXT,
    "feeUsd" REAL,
    "acceptedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "scheduledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TriDispute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filerGtid" TEXT NOT NULL,
    "contestedGtid" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'FILED',
    "resolution" TEXT,
    "resolvedByGtid" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AddonActivation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "addonId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "activatedByGtid" TEXT,
    "activatedAt" DATETIME,
    "deactivatedAt" DATETIME,
    "configJson" TEXT,
    "multisigRequired" BOOLEAN NOT NULL DEFAULT false,
    "multisigApproved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ChaosExperiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentName" TEXT NOT NULL,
    "experimentType" TEXT NOT NULL,
    "target" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "resultJson" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GtidSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "TenantVerifiedId" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "identifierType" TEXT NOT NULL,
    "identifierValue" TEXT NOT NULL,
    "verifiedAt" DATETIME,
    "verifiedBy" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GtidRevocationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gtid" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "revokedByGtid" TEXT NOT NULL,
    "revokedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reactivatedAt" DATETIME
);

-- CreateTable
CREATE TABLE "GtidResolutionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resolvedGtid" TEXT NOT NULL,
    "requesterGtid" TEXT,
    "requesterIp" TEXT,
    "resolvedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TenantOnboardingState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "stepData" TEXT,
    "stepDataJson" TEXT,
    "completedSteps" TEXT NOT NULL DEFAULT '[]',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "sandboxActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RoleJourneyCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "roleType" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReadinessChecklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantGtid" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dismissedUntil" DATETIME,
    "lastCheckedAt" DATETIME
);

-- CreateTable
CREATE TABLE "CountryPhysicalDocumentRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "countryCode" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "InfraAnomaly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "anomalyType" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "description" TEXT,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "InfrastructurePrediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetType" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "prediction" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "predictedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedFailureAt" DATETIME,
    "modelVersion" TEXT,
    "features" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PspAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "instructionId" TEXT,
    "ustn" TEXT NOT NULL,
    "pspProvider" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "amountUsd" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pspReference" TEXT,
    "pspName" TEXT,
    "pspSignature" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "pspResponse" TEXT,
    "errorMessage" TEXT,
    "failReason" TEXT,
    "attemptedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PspAttempt_instructionId_fkey" FOREIGN KEY ("instructionId") REFERENCES "SettlementInstruction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TradeDigitalTwinScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "ustn" TEXT,
    "scenarioType" TEXT NOT NULL,
    "inputParams" TEXT NOT NULL,
    "outputResults" TEXT,
    "aiSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SIMULATED',
    "createdByGtid" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "shipmentId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "label" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "blocksDelivery" BOOLEAN NOT NULL DEFAULT false,
    "blocksSettlement" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" DATETIME,
    "confirmedByGtid" TEXT,
    "actorGtid" TEXT,
    "evidenceHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "listingId" TEXT,
    "ustn" TEXT NOT NULL,
    "insurerGtid" TEXT NOT NULL,
    "claimAmountUsd" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FILED',
    "description" TEXT,
    "evidenceJson" TEXT,
    "filedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BookingConfirmation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "shipmentId" TEXT,
    "carrierGtid" TEXT NOT NULL,
    "vesselName" TEXT,
    "voyageNumber" TEXT,
    "bookingDate" DATETIME,
    "containerNo" TEXT,
    "pol" TEXT,
    "pod" TEXT,
    "eta" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "rawText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShipmentHold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ustn" TEXT NOT NULL,
    "shipmentId" TEXT,
    "holdType" TEXT NOT NULL,
    "holdReason" TEXT NOT NULL,
    "reason" TEXT,
    "actionPlanId" TEXT,
    "holdStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "released" BOOLEAN NOT NULL DEFAULT false,
    "placedByGtid" TEXT,
    "placedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    "releasedByGtid" TEXT,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "ContainerReleasePreadvice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "preadviceId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "containerNo" TEXT,
    "terminalCode" TEXT,
    "shippingLineGtid" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" DATETIME,
    "metadata" TEXT
);

-- CreateTable
CREATE TABLE "StuckTradeAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alertId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "tradeId" TEXT,
    "stuckReason" TEXT NOT NULL,
    "stuckSince" DATETIME NOT NULL,
    "currentStatus" TEXT,
    "hoursOverdue" INTEGER,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "escalationAction" TEXT,
    "lastEscalatedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "resolvedAt" DATETIME,
    "resolution" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LatePaymentPenalty" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "penaltyId" TEXT NOT NULL,
    "ustn" TEXT NOT NULL,
    "instructionId" TEXT,
    "originalAmountUsd" REAL NOT NULL,
    "penaltyAmountUsd" REAL NOT NULL,
    "daysLate" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCRING',
    "accruedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MonthlyStatement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "statementId" TEXT NOT NULL,
    "tenantGtid" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "totalAmountUsd" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "lineItemsJson" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "QcActionPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "inspectionId" TEXT,
    "ustn" TEXT NOT NULL,
    "actionPlan" TEXT,
    "actions" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" DATETIME,
    "completedAt" DATETIME,
    "completedBy" TEXT,
    "verifiedBy" TEXT,
    "createdByGtid" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_gtid_key" ON "Tenant"("gtid");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_tenantGtid_idx" ON "Employee"("tenantGtid");

-- CreateIndex
CREATE UNIQUE INDEX "Trade_ustn_key" ON "Trade"("ustn");

-- CreateIndex
CREATE INDEX "Trade_buyerGtid_idx" ON "Trade"("buyerGtid");

-- CreateIndex
CREATE INDEX "Trade_sellerGtid_idx" ON "Trade"("sellerGtid");

-- CreateIndex
CREATE INDEX "Trade_status_idx" ON "Trade"("status");

-- CreateIndex
CREATE INDEX "Trade_parentUstn_idx" ON "Trade"("parentUstn");

-- CreateIndex
CREATE INDEX "Trade_masterContractId_idx" ON "Trade"("masterContractId");

-- CreateIndex
CREATE INDEX "Trade_isSandbox_idx" ON "Trade"("isSandbox");

-- CreateIndex
CREATE INDEX "Trade_createdAt_idx" ON "Trade"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerSubmission_submissionId_key" ON "BuyerSubmission"("submissionId");

-- CreateIndex
CREATE INDEX "BuyerSubmission_tradeId_idx" ON "BuyerSubmission"("tradeId");

-- CreateIndex
CREATE INDEX "BuyerSubmission_ustn_idx" ON "BuyerSubmission"("ustn");

-- CreateIndex
CREATE INDEX "BuyerSubmission_buyerGtid_idx" ON "BuyerSubmission"("buyerGtid");

-- CreateIndex
CREATE UNIQUE INDEX "TradeContract_contractId_key" ON "TradeContract"("contractId");

-- CreateIndex
CREATE INDEX "TradeContract_tradeId_idx" ON "TradeContract"("tradeId");

-- CreateIndex
CREATE INDEX "TradeContract_ustn_idx" ON "TradeContract"("ustn");

-- CreateIndex
CREATE INDEX "TradeContract_status_idx" ON "TradeContract"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TradeDraft_draftId_key" ON "TradeDraft"("draftId");

-- CreateIndex
CREATE INDEX "DocumentRequirement_tradeId_idx" ON "DocumentRequirement"("tradeId");

-- CreateIndex
CREATE INDEX "DocumentRequirement_docType_idx" ON "DocumentRequirement"("docType");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentRequirement_tradeId_docType_key" ON "DocumentRequirement"("tradeId", "docType");

-- CreateIndex
CREATE INDEX "Activity_tradeId_createdAt_idx" ON "Activity"("tradeId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_actorGtid_createdAt_idx" ON "Activity"("actorGtid", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_action_idx" ON "Activity"("action");

-- CreateIndex
CREATE INDEX "Invoice_tradeId_idx" ON "Invoice"("tradeId");

-- CreateIndex
CREATE INDEX "Invoice_payerGtid_status_idx" ON "Invoice"("payerGtid", "status");

-- CreateIndex
CREATE INDEX "InboxItem_tenantGtid_dismissed_priority_idx" ON "InboxItem"("tenantGtid", "dismissed", "priority");

-- CreateIndex
CREATE INDEX "InboxItem_tenantGtid_createdAt_idx" ON "InboxItem"("tenantGtid", "createdAt");

-- CreateIndex
CREATE INDEX "InboxItem_tradeId_idx" ON "InboxItem"("tradeId");

-- CreateIndex
CREATE INDEX "InboxItem_category_idx" ON "InboxItem"("category");

-- CreateIndex
CREATE INDEX "Dispute_tradeId_idx" ON "Dispute"("tradeId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "Dispute_filedByGtid_idx" ON "Dispute"("filedByGtid");

-- CreateIndex
CREATE INDEX "Dispute_createdAt_idx" ON "Dispute"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancingRequest_requestId_key" ON "FinancingRequest"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancingBid_bidId_key" ON "FinancingBid"("bidId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancierPreference_financierGtid_key" ON "FinancierPreference"("financierGtid");

-- CreateIndex
CREATE UNIQUE INDEX "FinancingAgreement_agreementId_key" ON "FinancingAgreement"("agreementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancingAgreementAnnex_bidId_key" ON "FinancingAgreementAnnex"("bidId");

-- CreateIndex
CREATE UNIQUE INDEX "DeFiProtocol_name_key" ON "DeFiProtocol"("name");

-- CreateIndex
CREATE UNIQUE INDEX "DeFiPosition_annexId_key" ON "DeFiPosition"("annexId");

-- CreateIndex
CREATE UNIQUE INDEX "StablecoinStatus_symbol_key" ON "StablecoinStatus"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceQuotation_quoteId_key" ON "ServiceQuotation"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationHealth_name_key" ON "IntegrationHealth"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GovernorDecision_decisionId_key" ON "GovernorDecision"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "LoomVerificationToken_token_key" ON "LoomVerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Jurisdiction_countryCode_key" ON "Jurisdiction"("countryCode");

-- CreateIndex
CREATE INDEX "SavedContact_ownerGtid_idx" ON "SavedContact"("ownerGtid");

-- CreateIndex
CREATE UNIQUE INDEX "TradeReadiness_tenantGtid_key" ON "TradeReadiness"("tenantGtid");

-- CreateIndex
CREATE UNIQUE INDEX "QesRequest_requestId_key" ON "QesRequest"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "QesEnrollment_tenantGtid_key" ON "QesEnrollment"("tenantGtid");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceTrust_deviceFingerprint_key" ON "DeviceTrust"("deviceFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "OpaPolicy_name_key" ON "OpaPolicy"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TrustPassport_tenantGtid_key" ON "TrustPassport"("tenantGtid");

-- CreateIndex
CREATE UNIQUE INDEX "TrustPassportToken_token_key" ON "TrustPassportToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerReleaseAuthorisation_authorisationId_key" ON "ContainerReleaseAuthorisation"("authorisationId");

-- CreateIndex
CREATE UNIQUE INDEX "FeePaymentRequest_requestId_key" ON "FeePaymentRequest"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnectorLog_logId_key" ON "IntegrationConnectorLog"("logId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnectorLog_idempotencyKey_key" ON "IntegrationConnectorLog"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BankSettlementInstruction_instructionId_key" ON "BankSettlementInstruction"("instructionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPerformance_providerGtid_key" ON "ProviderPerformance"("providerGtid");

-- CreateIndex
CREATE UNIQUE INDEX "IncotermServiceMapping_incoterm_key" ON "IncotermServiceMapping"("incoterm");

-- CreateIndex
CREATE UNIQUE INDEX "DisputeEvidence_disputeId_key" ON "DisputeEvidence"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "DisputeEvidence_verificationToken_key" ON "DisputeEvidence"("verificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "DisputeExpert_secureLink_key" ON "DisputeExpert"("secureLink");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementProposal_proposalId_key" ON "SettlementProposal"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ArbitrationCase_caseId_key" ON "ArbitrationCase"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "SgtxFeeDispute_feeDisputeId_key" ON "SgtxFeeDispute"("feeDisputeId");

-- CreateIndex
CREATE UNIQUE INDEX "DisputePrediction_disputeId_key" ON "DisputePrediction"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskModelMetadata_modelName_key" ON "RiskModelMetadata"("modelName");

-- CreateIndex
CREATE UNIQUE INDEX "PalletDetail_sscc_key" ON "PalletDetail"("sscc");

-- CreateIndex
CREATE INDEX "PalletDetail_packingPlanId_idx" ON "PalletDetail"("packingPlanId");

-- CreateIndex
CREATE INDEX "PalletDetail_ustn_idx" ON "PalletDetail"("ustn");

-- CreateIndex
CREATE INDEX "PalletDetail_shipmentId_idx" ON "PalletDetail"("shipmentId");

-- CreateIndex
CREATE INDEX "MultisigRequest_status_requestType_idx" ON "MultisigRequest"("status", "requestType");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePartner_partnerGtid_key" ON "MarketplacePartner"("partnerGtid");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePartner_apiKey_key" ON "MarketplacePartner"("apiKey");

-- CreateIndex
CREATE INDEX "PackingPlan_ustn_idx" ON "PackingPlan"("ustn");

-- CreateIndex
CREATE INDEX "PackingPlan_sellerGtid_idx" ON "PackingPlan"("sellerGtid");

-- CreateIndex
CREATE UNIQUE INDEX "DistressedCargoListing_listingId_key" ON "DistressedCargoListing"("listingId");

-- CreateIndex
CREATE INDEX "DistressedCargoListing_sellerGtid_status_idx" ON "DistressedCargoListing"("sellerGtid", "status");

-- CreateIndex
CREATE INDEX "DistressedCargoListing_ustn_idx" ON "DistressedCargoListing"("ustn");

-- CreateIndex
CREATE UNIQUE INDEX "DistressedCargoOffer_offerId_key" ON "DistressedCargoOffer"("offerId");

-- CreateIndex
CREATE INDEX "DistressedCargoOffer_listingId_status_idx" ON "DistressedCargoOffer"("listingId", "status");

-- CreateIndex
CREATE INDEX "DistressedCargoOffer_buyerGtid_idx" ON "DistressedCargoOffer"("buyerGtid");

-- CreateIndex
CREATE INDEX "FeeLock_ustn_status_idx" ON "FeeLock"("ustn", "status");

-- CreateIndex
CREATE INDEX "FeeLock_tradeId_idx" ON "FeeLock"("tradeId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_idempotencyKey_key" ON "PaymentAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Port_unlocode_key" ON "Port"("unlocode");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFeatureToggle_featureKey_key" ON "PlatformFeatureToggle"("featureKey");

-- CreateIndex
CREATE UNIQUE INDEX "BreakGlassEvent_eventId_key" ON "BreakGlassEvent"("eventId");

-- CreateIndex
CREATE INDEX "BreakGlassEvent_targetGtid_idx" ON "BreakGlassEvent"("targetGtid");

-- CreateIndex
CREATE INDEX "BreakGlassEvent_status_idx" ON "BreakGlassEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SpecialRate_rateId_key" ON "SpecialRate"("rateId");

-- CreateIndex
CREATE INDEX "SpecialRate_targetGtid_idx" ON "SpecialRate"("targetGtid");

-- CreateIndex
CREATE INDEX "SpecialRate_rateType_idx" ON "SpecialRate"("rateType");

-- CreateIndex
CREATE INDEX "SpecialRate_isActive_idx" ON "SpecialRate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "GtidChat_chatId_key" ON "GtidChat"("chatId");

-- CreateIndex
CREATE INDEX "GtidChat_participant1Gtid_idx" ON "GtidChat"("participant1Gtid");

-- CreateIndex
CREATE INDEX "GtidChat_participant2Gtid_idx" ON "GtidChat"("participant2Gtid");

-- CreateIndex
CREATE INDEX "GtidChat_ustn_idx" ON "GtidChat"("ustn");

-- CreateIndex
CREATE INDEX "GtidChat_status_idx" ON "GtidChat"("status");

-- CreateIndex
CREATE INDEX "GtidChatMessage_chatId_idx" ON "GtidChatMessage"("chatId");

-- CreateIndex
CREATE INDEX "GtidChatMessage_senderGtid_idx" ON "GtidChatMessage"("senderGtid");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCourierTracking_trackingId_key" ON "DocumentCourierTracking"("trackingId");

-- CreateIndex
CREATE INDEX "DocumentCourierTracking_ustn_idx" ON "DocumentCourierTracking"("ustn");

-- CreateIndex
CREATE INDEX "DocumentCourierTracking_courierStatus_idx" ON "DocumentCourierTracking"("courierStatus");

-- CreateIndex
CREATE INDEX "DocumentCourierTracking_trackingNumber_idx" ON "DocumentCourierTracking"("trackingNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TcnCorridor_code_key" ON "TcnCorridor"("code");

-- CreateIndex
CREATE INDEX "TcnCorridor_type_idx" ON "TcnCorridor"("type");

-- CreateIndex
CREATE INDEX "TcnCorridor_status_idx" ON "TcnCorridor"("status");

-- CreateIndex
CREATE INDEX "TcnCorridor_originCountry_idx" ON "TcnCorridor"("originCountry");

-- CreateIndex
CREATE INDEX "TcnCorridor_destCountry_idx" ON "TcnCorridor"("destCountry");

-- CreateIndex
CREATE UNIQUE INDEX "TcnPortTwin_unlocode_key" ON "TcnPortTwin"("unlocode");

-- CreateIndex
CREATE INDEX "TcnPortTwin_corridorCode_idx" ON "TcnPortTwin"("corridorCode");

-- CreateIndex
CREATE INDEX "TcnPortTwin_country_idx" ON "TcnPortTwin"("country");

-- CreateIndex
CREATE UNIQUE INDEX "TcnGovNode_nodeCode_key" ON "TcnGovNode"("nodeCode");

-- CreateIndex
CREATE INDEX "TcnGovNode_type_idx" ON "TcnGovNode"("type");

-- CreateIndex
CREATE INDEX "TcnGovNode_country_idx" ON "TcnGovNode"("country");

-- CreateIndex
CREATE INDEX "TcnGovNode_integrationStatus_idx" ON "TcnGovNode"("integrationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "TcnComplianceGate_gateCode_key" ON "TcnComplianceGate"("gateCode");

-- CreateIndex
CREATE INDEX "TcnComplianceGate_corridorCode_idx" ON "TcnComplianceGate"("corridorCode");

-- CreateIndex
CREATE INDEX "TcnComplianceGate_gateType_idx" ON "TcnComplianceGate"("gateType");

-- CreateIndex
CREATE INDEX "TcnAnalytics_corridorCode_idx" ON "TcnAnalytics"("corridorCode");

-- CreateIndex
CREATE INDEX "TcnAnalytics_period_idx" ON "TcnAnalytics"("period");

-- CreateIndex
CREATE UNIQUE INDEX "TradeCorridor_corridorCode_key" ON "TradeCorridor"("corridorCode");

-- CreateIndex
CREATE INDEX "TradeCorridor_corridorCode_idx" ON "TradeCorridor"("corridorCode");

-- CreateIndex
CREATE INDEX "TradeLanePassport_corridorCode_idx" ON "TradeLanePassport"("corridorCode");

-- CreateIndex
CREATE UNIQUE INDEX "GovernmentNode_nodeGtid_key" ON "GovernmentNode"("nodeGtid");

-- CreateIndex
CREATE INDEX "GovernmentNode_countryCode_idx" ON "GovernmentNode"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "PortDigitalTwin_portUnlocode_key" ON "PortDigitalTwin"("portUnlocode");

-- CreateIndex
CREATE INDEX "PortDigitalTwin_portUnlocode_idx" ON "PortDigitalTwin"("portUnlocode");

-- CreateIndex
CREATE INDEX "CorridorComplianceGate_corridorCode_idx" ON "CorridorComplianceGate"("corridorCode");

-- CreateIndex
CREATE INDEX "CorridorAnalytics_corridorCode_idx" ON "CorridorAnalytics"("corridorCode");

-- CreateIndex
CREATE UNIQUE INDEX "RoRoVesselSchedule_scheduleId_key" ON "RoRoVesselSchedule"("scheduleId");

-- CreateIndex
CREATE INDEX "RoRoVesselSchedule_corridorCode_idx" ON "RoRoVesselSchedule"("corridorCode");

-- CreateIndex
CREATE INDEX "RoRoVesselSchedule_scheduleId_idx" ON "RoRoVesselSchedule"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "RoRoBooking_bookingRef_key" ON "RoRoBooking"("bookingRef");

-- CreateIndex
CREATE INDEX "RoRoBooking_scheduleId_idx" ON "RoRoBooking"("scheduleId");

-- CreateIndex
CREATE INDEX "RoRoBooking_ustn_idx" ON "RoRoBooking"("ustn");

-- CreateIndex
CREATE UNIQUE INDEX "RoRoCargoManifest_manifestId_key" ON "RoRoCargoManifest"("manifestId");

-- CreateIndex
CREATE INDEX "RoRoCargoManifest_ustn_idx" ON "RoRoCargoManifest"("ustn");

-- CreateIndex
CREATE INDEX "RoRoCargoManifest_manifestId_idx" ON "RoRoCargoManifest"("manifestId");

-- CreateIndex
CREATE INDEX "RoRoCargoItem_manifestId_idx" ON "RoRoCargoItem"("manifestId");

-- CreateIndex
CREATE INDEX "Certificate_tenantGtid_certificateType_status_idx" ON "Certificate"("tenantGtid", "certificateType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PspHealthLog_pspName_key" ON "PspHealthLog"("pspName");

-- CreateIndex
CREATE INDEX "PspHealthLog_aggregatorName_checkedAt_idx" ON "PspHealthLog"("aggregatorName", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAggregator_name_key" ON "PaymentAggregator"("name");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliationFile_fileHash_key" ON "BankReconciliationFile"("fileHash");

-- CreateIndex
CREATE INDEX "BankReconciliationFile_bankBic_fileDate_idx" ON "BankReconciliationFile"("bankBic", "fileDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseOverride_overrideToken_key" ON "ReleaseOverride"("overrideToken");

-- CreateIndex
CREATE INDEX "ReleaseOverride_ustn_idx" ON "ReleaseOverride"("ustn");

-- CreateIndex
CREATE UNIQUE INDEX "OneClickTrigger_ustn_key" ON "OneClickTrigger"("ustn");

-- CreateIndex
CREATE INDEX "OneClickTrigger_ustn_status_idx" ON "OneClickTrigger"("ustn", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementInstruction_instructionId_key" ON "SettlementInstruction"("instructionId");

-- CreateIndex
CREATE INDEX "SettlementInstruction_ustn_status_idx" ON "SettlementInstruction"("ustn", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementConfirmation_confirmationRef_key" ON "SettlementConfirmation"("confirmationRef");

-- CreateIndex
CREATE INDEX "SettlementConfirmation_instructionId_idx" ON "SettlementConfirmation"("instructionId");

-- CreateIndex
CREATE UNIQUE INDEX "MicroContract_microUstn_key" ON "MicroContract"("microUstn");

-- CreateIndex
CREATE INDEX "MicroContract_parentUstn_idx" ON "MicroContract"("parentUstn");

-- CreateIndex
CREATE UNIQUE INDEX "MilestonePaymentSchedule_ustn_key" ON "MilestonePaymentSchedule"("ustn");

-- CreateIndex
CREATE INDEX "MilestonePaymentSchedule_ustn_idx" ON "MilestonePaymentSchedule"("ustn");

-- CreateIndex
CREATE INDEX "DeferredFee_ustn_status_idx" ON "DeferredFee"("ustn", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PackingList_packingPlanId_key" ON "PackingList"("packingPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "PackingList_listId_key" ON "PackingList"("listId");

-- CreateIndex
CREATE INDEX "PackingList_ustn_idx" ON "PackingList"("ustn");

-- CreateIndex
CREATE INDEX "PackingList_packingPlanId_idx" ON "PackingList"("packingPlanId");

-- CreateIndex
CREATE INDEX "ColdChainAlert_ustn_idx" ON "ColdChainAlert"("ustn");

-- CreateIndex
CREATE UNIQUE INDEX "ReInspectionRequest_requestId_key" ON "ReInspectionRequest"("requestId");

-- CreateIndex
CREATE INDEX "ReInspectionRequest_ustn_status_idx" ON "ReInspectionRequest"("ustn", "status");

-- CreateIndex
CREATE INDEX "ReInspectionRequest_requestedByGtid_status_idx" ON "ReInspectionRequest"("requestedByGtid", "status");

-- CreateIndex
CREATE INDEX "ReInspectionRequest_newQcProviderGtid_status_idx" ON "ReInspectionRequest"("newQcProviderGtid", "status");

-- CreateIndex
CREATE INDEX "TriDispute_contestedGtid_status_idx" ON "TriDispute"("contestedGtid", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AddonActivation_addonId_key" ON "AddonActivation"("addonId");

-- CreateIndex
CREATE INDEX "ChaosExperiment_status_idx" ON "ChaosExperiment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "GtidSequence_entityType_country_key" ON "GtidSequence"("entityType", "country");

-- CreateIndex
CREATE INDEX "TenantVerifiedId_tenantGtid_idx" ON "TenantVerifiedId"("tenantGtid");

-- CreateIndex
CREATE UNIQUE INDEX "TenantVerifiedId_tenantGtid_identifierType_key" ON "TenantVerifiedId"("tenantGtid", "identifierType");

-- CreateIndex
CREATE INDEX "GtidRevocationLog_gtid_idx" ON "GtidRevocationLog"("gtid");

-- CreateIndex
CREATE INDEX "GtidResolutionLog_resolvedGtid_idx" ON "GtidResolutionLog"("resolvedGtid");

-- CreateIndex
CREATE UNIQUE INDEX "TenantOnboardingState_tenantGtid_key" ON "TenantOnboardingState"("tenantGtid");

-- CreateIndex
CREATE INDEX "RoleJourneyCompletion_employeeId_roleType_idx" ON "RoleJourneyCompletion"("employeeId", "roleType");

-- CreateIndex
CREATE UNIQUE INDEX "RoleJourneyCompletion_employeeId_roleType_stepId_key" ON "RoleJourneyCompletion"("employeeId", "roleType", "stepId");

-- CreateIndex
CREATE INDEX "ReadinessChecklist_tenantGtid_idx" ON "ReadinessChecklist"("tenantGtid");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessChecklist_tenantGtid_itemName_key" ON "ReadinessChecklist"("tenantGtid", "itemName");

-- CreateIndex
CREATE INDEX "CountryPhysicalDocumentRequirement_countryCode_idx" ON "CountryPhysicalDocumentRequirement"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "CountryPhysicalDocumentRequirement_countryCode_documentType_key" ON "CountryPhysicalDocumentRequirement"("countryCode", "documentType");

-- CreateIndex
CREATE INDEX "InfraAnomaly_status_severity_idx" ON "InfraAnomaly"("status", "severity");

-- CreateIndex
CREATE INDEX "InfraAnomaly_target_idx" ON "InfraAnomaly"("target");

-- CreateIndex
CREATE INDEX "InfrastructurePrediction_targetType_prediction_idx" ON "InfrastructurePrediction"("targetType", "prediction");

-- CreateIndex
CREATE UNIQUE INDEX "PspAttempt_attemptId_key" ON "PspAttempt"("attemptId");

-- CreateIndex
CREATE INDEX "PspAttempt_ustn_status_idx" ON "PspAttempt"("ustn", "status");

-- CreateIndex
CREATE INDEX "PspAttempt_pspProvider_status_idx" ON "PspAttempt"("pspProvider", "status");

-- CreateIndex
CREATE INDEX "PspAttempt_instructionId_idx" ON "PspAttempt"("instructionId");

-- CreateIndex
CREATE UNIQUE INDEX "TradeDigitalTwinScenario_scenarioId_key" ON "TradeDigitalTwinScenario"("scenarioId");

-- CreateIndex
CREATE INDEX "TradeDigitalTwinScenario_ustn_status_idx" ON "TradeDigitalTwinScenario"("ustn", "status");

-- CreateIndex
CREATE INDEX "TradeDigitalTwinScenario_scenarioType_idx" ON "TradeDigitalTwinScenario"("scenarioType");

-- CreateIndex
CREATE INDEX "Milestone_ustn_status_idx" ON "Milestone"("ustn", "status");

-- CreateIndex
CREATE INDEX "Milestone_shipmentId_type_idx" ON "Milestone"("shipmentId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_claimId_key" ON "InsuranceClaim"("claimId");

-- CreateIndex
CREATE INDEX "InsuranceClaim_ustn_status_idx" ON "InsuranceClaim"("ustn", "status");

-- CreateIndex
CREATE INDEX "InsuranceClaim_listingId_idx" ON "InsuranceClaim"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingConfirmation_bookingId_key" ON "BookingConfirmation"("bookingId");

-- CreateIndex
CREATE INDEX "BookingConfirmation_ustn_idx" ON "BookingConfirmation"("ustn");

-- CreateIndex
CREATE INDEX "BookingConfirmation_shipmentId_idx" ON "BookingConfirmation"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentHold_ustn_holdStatus_idx" ON "ShipmentHold"("ustn", "holdStatus");

-- CreateIndex
CREATE INDEX "ShipmentHold_shipmentId_idx" ON "ShipmentHold"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerReleasePreadvice_preadviceId_key" ON "ContainerReleasePreadvice"("preadviceId");

-- CreateIndex
CREATE INDEX "ContainerReleasePreadvice_ustn_idx" ON "ContainerReleasePreadvice"("ustn");

-- CreateIndex
CREATE UNIQUE INDEX "StuckTradeAlert_alertId_key" ON "StuckTradeAlert"("alertId");

-- CreateIndex
CREATE INDEX "StuckTradeAlert_ustn_status_idx" ON "StuckTradeAlert"("ustn", "status");

-- CreateIndex
CREATE INDEX "StuckTradeAlert_severity_idx" ON "StuckTradeAlert"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "LatePaymentPenalty_penaltyId_key" ON "LatePaymentPenalty"("penaltyId");

-- CreateIndex
CREATE INDEX "LatePaymentPenalty_ustn_status_idx" ON "LatePaymentPenalty"("ustn", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyStatement_statementId_key" ON "MonthlyStatement"("statementId");

-- CreateIndex
CREATE INDEX "MonthlyStatement_tenantGtid_month_idx" ON "MonthlyStatement"("tenantGtid", "month");

-- CreateIndex
CREATE UNIQUE INDEX "QcActionPlan_planId_key" ON "QcActionPlan"("planId");

-- CreateIndex
CREATE INDEX "QcActionPlan_ustn_status_idx" ON "QcActionPlan"("ustn", "status");

-- CreateIndex
CREATE INDEX "QcActionPlan_inspectionId_idx" ON "QcActionPlan"("inspectionId");

