import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================
// 0. ENVIRONMENT VARIABLES (move to backend in production)
// ============================================================
const HF_API_KEY = process.env.REACT_APP_HF_API_KEY || 'hf_demo_key';
const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY || 'gsk_demo_key';

// ============================================================
// 1. REAL API SERVICES (Hugging Face + Groq) – with error fallbacks
// ============================================================
async function callHuggingFace(model, inputs) {
  const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${HF_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs),
  });
  if (!response.ok) throw new Error(`HF API error: ${response.status}`);
  return response.json();
}

async function callGroq(messages) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama3-8b-8192', messages, temperature: 0.2 }),
  });
  if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
  const data = await response.json();
  return data.choices[0].message.content;
}

// ============================================================
// 2. MOCK DATA & HELPERS (replace with real endpoints)
// ============================================================

// ----- Mock GTID resolution with checksum validation -----
function validateGTIDChecksum(gtid) {
  const pattern = /^SGTX-[A-Z]{2}-[A-Z]{3}-\d{6}-[A-F0-9]{4}$/;
  if (!pattern.test(gtid)) return false;
  const digits = gtid.match(/\d/g)?.map(Number) || [];
  const sum = digits.reduce((a,b) => a+b, 0);
  const expected = parseInt(gtid.slice(-1), 16);
  return (sum % 16) === expected;
}

async function resolveGTID(gtid) {
  await new Promise(r => setTimeout(r, 300));
  if (!validateGTIDChecksum(gtid)) return null;
  const mockSellers = {
    'SGTX-VN-TRD-002139-7F3A': {
      gtid: 'SGTX-VN-TRD-002139-7F3A',
      legalName: 'Mekong Fresh Co.',
      jurisdiction: 'Vietnam',
      trustScore: 91,
      sanctionsCleared: true,
      lastTrade: '2026-05-12',
      isSavedContact: true,
      logoUrl: 'https://via.placeholder.com/32?text=MF',
      recentlyTraded: true, // for "recent" badge
    },
    'SGTX-EG-TRD-000456-1397': {
      gtid: 'SGTX-EG-TRD-000456-1397',
      legalName: 'Nile Foods',
      jurisdiction: 'Egypt',
      trustScore: 88,
      sanctionsCleared: true,
      lastTrade: '2026-05-05',
      isSavedContact: true,
      logoUrl: 'https://via.placeholder.com/32?text=NF',
      recentlyTraded: false,
    },
    'SGTX-IN-AGR-004812-9X1B': {
      gtid: 'SGTX-IN-AGR-004812-9X1B',
      legalName: 'Bombay Fresh Export',
      jurisdiction: 'India',
      trustScore: 92,
      sanctionsCleared: true,
      lastTrade: '2026-04-28',
      isSavedContact: true,
      logoUrl: 'https://via.placeholder.com/32?text=BF',
      recentlyTraded: false,
    },
  };
  return mockSellers[gtid] || null;
}

// ----- Mock ports database (UN/LOCODE style) -----
const portsDB = {
  Egypt: [
    { code: 'EGALY', name: 'Alexandria', sanctioned: false },
    { code: 'EGDAM', name: 'Damietta', sanctioned: false },
    { code: 'EGPSD', name: 'Port Said', sanctioned: false },
    { code: 'EGSOK', name: 'Sokhna', sanctioned: false },
  ],
  Vietnam: [
    { code: 'VNHCM', name: 'Ho Chi Minh City', sanctioned: false },
    { code: 'VNDAD', name: 'Da Nang', sanctioned: false },
    { code: 'VNHPH', name: 'Hai Phong', sanctioned: false },
  ],
  Germany: [
    { code: 'DEHAM', name: 'Hamburg', sanctioned: false },
    { code: 'DEBRE', name: 'Bremerhaven', sanctioned: false },
  ],
  UAE: [
    { code: 'AEJEA', name: 'Jebel Ali', sanctioned: false },
    { code: 'AEAUH', name: 'Abu Dhabi', sanctioned: false },
  ],
};

// ----- Mock HS database for product autofill & product dropdown by commodity type -----
const productsByCommodityType = {
  'Fresh Fruits': [
    { hsCode: '0805.10', name: 'Oranges', dualUse: false },
    { hsCode: '0805.50', name: 'Lemons', dualUse: false },
    { hsCode: '0804.50', name: 'Mangoes', dualUse: false },
  ],
  'Frozen Fruits': [
    { hsCode: '0811.10', name: 'Frozen Strawberries', dualUse: false },
    { hsCode: '0811.20', name: 'Frozen Raspberries', dualUse: false },
  ],
  'Textiles': [
    { hsCode: '5208.11', name: 'Cotton Fabric', dualUse: true },
    { hsCode: '5407.10', name: 'Polyester Fabric', dualUse: false },
  ],
  'Vegetables': [
    { hsCode: '0702.00', name: 'Tomatoes', dualUse: false },
  ],
};
const hsDatabase = {
  '0805.10': { name: 'Oranges', commodityType: 'Fresh Fruits', dualUse: false },
  '0805.50': { name: 'Lemons', commodityType: 'Fresh Fruits', dualUse: false },
  '0811.10': { name: 'Frozen Strawberries', commodityType: 'Frozen Fruits', dualUse: false },
  '5208.11': { name: 'Cotton Fabric', commodityType: 'Textiles', dualUse: true },
};

// ----- AI Product Specification (enhanced with compatibility warnings & temperature) -----
async function getProductSpec(productName, commodityType) {
  try {
    const prompt = `Generate a JSON object for product specification of "${productName}" (commodity type: ${commodityType}) for international trade. Include fields like grade, variety, size range, brix, defects, packaging type. If commodity type includes "Frozen", also include "temperature" field with type "readonly", default "-18°C", and allow override. Only output valid JSON.`;
    const result = await callHuggingFace('google/flan-t5-large', { inputs: prompt });
    let text = typeof result === 'string' ? result : result[0]?.generated_text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const schema = JSON.parse(jsonMatch[0]);
      if (commodityType === 'Frozen Fruits' && !schema.temperature) {
        schema.temperature = { type: 'readonly', value: '-18°C', override: false, overrideValue: '' };
      }
      return { confidence: 85, schema, fallback: false };
    }
    throw new Error('No JSON found');
  } catch (error) {
    try {
      const groqResult = await callGroq([
        { role: 'system', content: 'You are a trade assistant. Return a JSON object with specification fields for the given product.' },
        { role: 'user', content: `Generate product spec for ${productName} (${commodityType}) as JSON. Include fields: grade, variety, size_range, brix, defects. If frozen, include temperature field.` }
      ]);
      const jsonMatch = groqResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const schema = JSON.parse(jsonMatch[0]);
        if (commodityType === 'Frozen Fruits' && !schema.temperature) {
          schema.temperature = { type: 'readonly', value: '-18°C', override: false, overrideValue: '' };
        }
        return { confidence: 80, schema, fallback: false };
      }
      throw new Error('Groq no JSON');
    } catch (e) {
      if (productName.toLowerCase().includes('orange')) {
        return {
          confidence: 60,
          schema: {
            variety: { type: 'select', options: ['Valencia', 'Navel', 'Blood Orange'], default: 'Valencia' },
            sizeRange: { type: 'select', options: ['72-80 mm', '80-88 mm'], default: '72-80 mm' },
            brix: { type: 'number', min: 10, max: 16, default: 11.5, unit: '°Bx' },
          },
          fallback: true,
        };
      }
      if (commodityType === 'Frozen Fruits') {
        return {
          confidence: 60,
          schema: {
            variety: { type: 'select', options: ['Festival', 'Camarosa', 'Albion'], default: 'Festival' },
            grade: { type: 'select', options: ['Grade A', 'Grade B', 'Grade C'], default: 'Grade A' },
            temperature: { type: 'readonly', value: '-18°C', override: false, overrideValue: '' },
          },
          fallback: true,
        };
      }
      return { confidence: 50, schema: null, fallback: true };
    }
  }
}

// Check if spec values conflict with industry norms (mock)
function getSpecCompatibilityWarning(productName, specValues) {
  if (productName.toLowerCase().includes('orange') && specValues.sizeRange === '88-96 mm') {
    return 'Warning: Size range 88-96 mm may exceed standard carton capacity for export. Consider using larger boxes.';
  }
  return null;
}

// AI Container Advisor (fixed with logging)
async function getContainerAdvisor(totalWeightKg, product) {
  try {
    const prompt = `Total weight: ${totalWeightKg} kg of ${product}. Suggest number and type of reefer containers (20ft or 40ft HC). Return JSON: { "containers": number, "type": string, "explanation": string }`;
    const result = await callGroq([{ role: 'user', content: prompt }]);
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('Invalid JSON');
  } catch (error) {
    const containers = Math.ceil(totalWeightKg / 22000);
    return { containers, type: '40ft HC reefer', explanation: `Based on ${totalWeightKg} kg, we suggest ${containers} × 40' HC reefers.` };
  }
}

// Marketplace attribution (mock)
async function checkMarketplaceAttribution(buyerGtid, sellerGtid) {
  await new Promise(r => setTimeout(r, 200));
  if (buyerGtid === 'buyer-demo' && sellerGtid === 'SGTX-VN-TRD-002139-7F3A') {
    return { attributed: true, partnerName: 'AgriConnect Marketplace', attributionDate: '2026-04-01', revenueShare: 3.5 };
  }
  return { attributed: false, partnerName: null, attributionDate: null };
}

// OPA permission check (mock)
async function checkOPAPermission(buyerGtid, action) {
  // Mock: always true for trade.request.create, and trader mode = DUAL with Buyer context
  return { allowed: true, reason: null };
}

// Generate Loom hash (mock)
function generateLoomHash(data) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

// Create Smart Inbox item for seller (mock)
async function createSmartInboxItem(sellerGtid, tradeRequest) {
  console.log(`Smart Inbox item created for seller ${sellerGtid}: New trade request ${tradeRequest.id}`);
  return { success: true };
}

// AI Consult for dual-use and commodity mixing warnings
async function aiConsult(tradeData) {
  const warnings = [];
  // Check commodity mixing
  const commodities = tradeData.containers.flatMap(c => c.commodities.map(comm => comm.productName));
  if (commodities.includes('Apples') && commodities.includes('Kiwis')) {
    warnings.push({ type: 'warning', message: 'Apples and kiwis should be shipped in separate containers or with dividers to avoid ethylene damage.' });
  }
  // Dual-use already handled by governor, but AI may add extra conditions
  if (tradeData.dualUseDetected) {
    warnings.push({ type: 'condition', message: 'Dual-use goods require an export licence. Please upload the licence before proceeding.' });
  }
  return warnings;
}

// Enhanced Governor with full checks
async function governorPrescreen(tradeData) {
  // 1. OPA permission check
  const opa = await checkOPAPermission(tradeData.buyerGtid, 'trade.request.create');
  if (!opa.allowed) {
    return { verdict: 'DENY', conditions: [{ conditionId: 'permission_denied', label: opa.reason || 'You do not have permission to create trade requests.', actionUrl: null }] };
  }

  // 2. Jurisdiction blocklist (WasmEdge style)
  const blockedJurisdictions = ['North Korea', 'Syria', 'Iran'];
  if (blockedJurisdictions.includes(tradeData.destinationCountry)) {
    return { verdict: 'DENY', conditions: [{ conditionId: 'jurisdiction_blocked', label: `Destination country ${tradeData.destinationCountry} is blocked.`, actionUrl: null }] };
  }

  // 3. Port validation per container and shipments
  for (let container of tradeData.containers) {
    const ports = portsDB[container.destinationCountry] || [];
    const portValid = ports.some(p => p.name === container.portOfDischarge && !p.sanctioned);
    if (!portValid) {
      return { verdict: 'DENY', conditions: [{ conditionId: 'invalid_port', label: `Port ${container.portOfDischarge} is not valid for ${container.destinationCountry}.`, actionUrl: null }] };
    }
  }
  if (tradeData.multiShipmentEnabled) {
    for (let shipment of tradeData.shipments) {
      const ports = portsDB[shipment.destinationCountry] || [];
      const portValid = ports.some(p => p.name === shipment.portOfDischarge && !p.sanctioned);
      if (!portValid) {
        return { verdict: 'DENY', conditions: [{ conditionId: 'invalid_port_shipment', label: `Shipment ${shipment.id} port ${shipment.portOfDischarge} is invalid.`, actionUrl: null }] };
      }
    }
  }

  // 4. Dual-use goods screening
  if (tradeData.dualUseDetected) {
    return { verdict: 'CONDITIONAL', conditions: [{ conditionId: 'dual_use_license', label: 'Dual‑use goods require an export licence.', actionUrl: '/licenses' }] };
  }

  // 5. AI Consult for additional warnings
  const aiWarnings = await aiConsult(tradeData);
  if (aiWarnings.length > 0) {
    const conditions = aiWarnings.map(w => ({ conditionId: 'ai_consult', label: w.message, actionUrl: null }));
    return { verdict: 'CONDITIONAL', conditions };
  }

  return { verdict: 'ALLOW', conditions: [] };
}

// Generate plain language message (Groq)
async function generateTenantMessage(verdict, conditions) {
  try {
    const prompt = `Verdict: ${verdict}. Conditions: ${JSON.stringify(conditions)}. Write a short, plain English explanation for a trade user.`;
    const message = await callGroq([{ role: 'user', content: prompt }]);
    return message;
  } catch {
    return `Your trade request cannot be submitted because: ${conditions.map(c => c.label).join(', ')}. Please resolve and try again.`;
  }
}

// Draft save/load with expiry (localStorage mock)
const DRAFT_KEY = 'sgtx_trade_draft';
const DRAFT_EXPIRY_DAYS = 14;
async function saveDraft(data) {
  const draft = { data, timestamp: Date.now() };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  console.log('Draft saved', data);
  return { success: true };
}
async function loadDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  const draft = JSON.parse(raw);
  const ageDays = (Date.now() - draft.timestamp) / (1000 * 3600 * 24);
  if (ageDays > DRAFT_EXPIRY_DAYS) {
    localStorage.removeItem(DRAFT_KEY);
    return null;
  }
  return draft.data;
}

// Logging service (mock)
function logEvent(action, details) {
  console.log(`[LOG] ${action}:`, details);
  // In production, send to backend
}

// ============================================================
// 3. SUB-COMPONENTS (Enhanced)
// ============================================================

// 360° Trust Portrait Modal
const TrustPortraitModal = ({ isOpen, onClose, seller }) => {
  const [portrait, setPortrait] = useState(null);
  useEffect(() => {
    if (isOpen && seller) {
      callGroq([{ role: 'user', content: `Generate a short trust portrait for seller ${seller.legalName} (GTID ${seller.gtid}) including trade history, payment behaviour, and news. Keep under 100 words.` }])
        .then(setPortrait)
        .catch(() => setPortrait('Unable to load trust portrait at this time.'));
    }
  }, [isOpen, seller]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0F172A] border border-cyan-500/30 rounded-3xl p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">360° Trust Portrait: {seller?.legalName}</h3>
          <button onClick={onClose} className="text-white/50 hover:text-white">✕</button>
        </div>
        <div className="text-white/80 text-sm space-y-2">
          <p><strong>GTID:</strong> {seller?.gtid}</p>
          <p><strong>Trust Score:</strong> {seller?.trustScore}</p>
          <p><strong>Sanctions Cleared:</strong> {seller?.sanctionsCleared ? '✅ Yes' : '⚠️ Pending'}</p>
          <p><strong>AI Summary:</strong> {portrait || 'Loading...'}</p>
        </div>
        <button onClick={onClose} className="mt-4 w-full py-2 rounded-xl bg-cyan-400 text-black">Close</button>
      </div>
    </div>
  );
};

// Saved Contacts Modal (Enhanced with keyboard nav, fuzzy search, icons, recent badge)
const SavedContactsModal = ({ isOpen, onClose, onSelect }) => {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const contacts = [
    { gtid: 'SGTX-VN-TRD-002139-7F3A', name: 'Mekong Fresh Co.', trust: 91, lastTrade: '2026-05-12', sanctionsCleared: true, logoUrl: 'https://via.placeholder.com/32?text=MF', recent: true },
    { gtid: 'SGTX-IN-AGR-004812-9X1B', name: 'Bombay Fresh Export', trust: 92, lastTrade: '2026-04-28', sanctionsCleared: true, logoUrl: 'https://via.placeholder.com/32?text=BF', recent: false },
    { gtid: 'SGTX-EG-TRD-000456-1397', name: 'Nile Foods', trust: 88, lastTrade: '2026-05-05', sanctionsCleared: true, logoUrl: 'https://via.placeholder.com/32?text=NF', recent: false },
  ];
  const filtered = contacts.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.gtid.includes(search));
  
  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);
  
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      onSelect(filtered[selectedIndex]);
      onClose();
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" role="dialog" aria-label="Saved contacts">
      <div className="bg-[#0F172A] border border-cyan-500/30 rounded-3xl p-6 w-full max-w-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">Saved Contacts</h3>
          <button onClick={onClose} aria-label="Close" className="text-white/50 hover:text-white">✕</button>
        </div>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search by name or GTID..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedIndex(-1); }}
          onKeyDown={handleKeyDown}
          className="w-full rounded-2xl border border-white/10 bg-[#0A1024] px-4 py-3 mb-4 outline-none"
          aria-label="Search contacts"
        />
        <div className="space-y-2 max-h-96 overflow-y-auto" role="listbox">
          {filtered.map((c, idx) => (
            <button
              key={c.gtid}
              onClick={() => { onSelect(c); onClose(); }}
              className={`w-full text-left p-3 rounded-2xl border border-white/10 bg-black/20 hover:border-cyan-400/40 transition-all ${idx === selectedIndex ? 'bg-cyan-500/20 border-cyan-400' : ''}`}
              role="option"
              aria-selected={idx === selectedIndex}
            >
              <div className="flex items-center gap-3">
                <img src={c.logoUrl} alt="" className="w-8 h-8 rounded-full" />
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      {c.recent && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-200">Recent</span>}
                    </div>
                    <div className="flex gap-1">
                      <span className={`text-xs px-2 py-1 rounded-full ${c.trust >= 80 ? 'bg-emerald-500/20 text-emerald-200' : c.trust >= 50 ? 'bg-amber-500/20 text-amber-200' : 'bg-red-500/20 text-red-200'}`}>
                        Trust {c.trust}
                      </span>
                      {c.sanctionsCleared && <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-200" aria-label="Sanctions cleared">🛡️</span>}
                    </div>
                  </div>
                  <div className="text-xs text-white/50 mt-1">{c.gtid}</div>
                  <div className="text-xs text-white/40">Last trade: {c.lastTrade}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// Plain Language Decision Panel (Enhanced with Groq message)
const PlainLanguageDecisionPanel = ({ verdict, conditions, onClose, onRetry, tenantMessage }) => {
  if (!verdict || verdict === 'ALLOW') return null;
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0F172A] border border-red-500/30 rounded-3xl p-6 max-w-lg w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-red-400">Action Blocked</h3>
          <button onClick={onClose} className="text-white/50 hover:text-white">✕</button>
        </div>
        <p className="text-white/80 mb-4">{tenantMessage || (verdict === 'DENY' ? 'Your trade request cannot be submitted.' : 'Additional steps are required.')}</p>
        <ul className="space-y-3 mb-6">
          {conditions.map((c, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="text-red-400 mt-1">❌</span>
              <div>
                <div className="text-white">{c.label}</div>
                {c.actionUrl && <button className="text-cyan-400 text-xs underline mt-1">Resolve</button>}
              </div>
            </li>
          ))}
        </ul>
        <button onClick={onRetry} className="w-full py-3 rounded-xl bg-cyan-400 text-black font-medium">Try Again</button>
      </div>
    </div>
  );
};

// Dynamic Spec Fields (Enhanced with compatibility warning & temperature override)
const DynamicSpecFields = ({ schema, values, onChange, confidence, onReset, onSaveTemplate, warning, commodityType }) => {
  const [tempOverride, setTempOverride] = useState(false);
  if (!schema) return null;
  return (
    <div className="mt-3 p-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/20">
      <div className="flex justify-between items-center mb-3">
        <div className="text-xs text-cyan-300">AI‑generated specifications (confidence {confidence}%)</div>
        <div className="flex gap-2">
          <button onClick={onReset} className="text-xs px-2 py-1 rounded bg-cyan-400/20 text-cyan-200">Reset to AI</button>
          <button onClick={onSaveTemplate} className="text-xs px-2 py-1 rounded bg-white/10 text-white/70">Save as template</button>
        </div>
      </div>
      {warning && <div className="mb-3 p-2 rounded-lg bg-amber-500/20 text-amber-200 text-sm">{warning}</div>}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Object.entries(schema).map(([key, field]) => {
          if (field.type === 'readonly') {
            const isOverridden = values[`${key}_override`];
            const currentValue = isOverridden ? values[`${key}_override_value`] : field.value;
            return (
              <div key={key}>
                <label className="text-xs text-white/50 block mb-1">{key.replace(/([A-Z])/g, ' $1').trim()}</label>
                {!isOverridden ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-xl border border-white/10 bg-[#0A1024] px-3 py-2 text-sm text-white/70">{currentValue}</div>
                    <button onClick={() => onChange(`${key}_override`, true)} className="text-xs text-cyan-300">Override</button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <input type="text" value={currentValue} onChange={(e) => onChange(`${key}_override_value`, e.target.value)} className="flex-1 rounded-xl border border-white/10 bg-[#0A1024] px-3 py-2 text-sm" />
                    <button onClick={() => onChange(`${key}_override`, false)} className="text-xs text-red-300">Reset</button>
                  </div>
                )}
              </div>
            );
          }
          return (
            <div key={key}>
              <label className="text-xs text-white/50 block mb-1">{key.replace(/([A-Z])/g, ' $1').trim()}</label>
              {field.type === 'select' && (
                <select value={values[key] || field.default} onChange={(e) => onChange(key, e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-3 py-2 text-sm">
                  {field.options.map(opt => <option key={opt}>{opt}</option>)}
                </select>
              )}
              {field.type === 'number' && (
                <div className="flex items-center gap-1">
                  <input type="number" value={values[key] || field.default} onChange={(e) => onChange(key, parseFloat(e.target.value))} step="0.5" className="flex-1 rounded-xl border border-white/10 bg-[#0A1024] px-3 py-2 text-sm" />
                  {field.unit && <span className="text-xs text-white/50">{field.unit}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Bulk Edit Modal with Undo
const BulkEditModal = ({ isOpen, onClose, containers, setContainers, currentContainerIdx }) => {
  const [action, setAction] = useState('copyCommodity');
  const [targetRange, setTargetRange] = useState({ from: 0, to: containers.length - 1 });
  const [pattern, setPattern] = useState('');
  const [previousContainers, setPreviousContainers] = useState(null);
  const [showUndo, setShowUndo] = useState(false);
  if (!isOpen) return null;
  const handleApply = () => {
    const newContainers = [...containers];
    setPreviousContainers(JSON.parse(JSON.stringify(containers)));
    if (action === 'copyCommodity') {
      const sourceCommodities = containers[currentContainerIdx]?.commodities || [];
      for (let i = targetRange.from; i <= targetRange.to && i < newContainers.length; i++) {
        newContainers[i].commodities = JSON.parse(JSON.stringify(sourceCommodities));
      }
    } else if (action === 'copySettings') {
      const source = containers[currentContainerIdx];
      for (let i = targetRange.from; i <= targetRange.to && i < newContainers.length; i++) {
        newContainers[i].countryOfOrigin = source.countryOfOrigin;
        newContainers[i].destinationCountry = source.destinationCountry;
        newContainers[i].portOfDischarge = source.portOfDischarge;
        newContainers[i].palletized = source.palletized;
        newContainers[i].palletSize = source.palletSize;
        newContainers[i].customPalletSize = source.customPalletSize;
      }
    } else if (action === 'incrementOverride' && pattern) {
      for (let i = targetRange.from; i <= targetRange.to && i < newContainers.length; i++) {
        newContainers[i].destinationOverride = pattern.replace(/\{n\}/g, (i+1).toString());
      }
    }
    setContainers(newContainers);
    setShowUndo(true);
    setTimeout(() => setShowUndo(false), 10000);
  };
  const handleUndo = () => {
    if (previousContainers) {
      setContainers(previousContainers);
      setPreviousContainers(null);
      setShowUndo(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0F172A] border border-cyan-500/30 rounded-3xl p-6 w-full max-w-md">
        <h3 className="text-xl font-semibold mb-4">Bulk Edit</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-white/50">Action</label>
            <select value={action} onChange={(e) => setAction(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-3 py-2">
              <option value="copyCommodity">Copy current container's commodities to range</option>
              <option value="copySettings">Copy container settings (origin, destination, port, pallet) to range</option>
              <option value="incrementOverride">Generate destination override pattern</option>
            </select>
          </div>
          <div className="flex gap-2">
            <div><label>From container</label><input type="number" value={targetRange.from} onChange={(e) => setTargetRange({...targetRange, from: parseInt(e.target.value)})} className="w-20 rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /></div>
            <div><label>To container</label><input type="number" value={targetRange.to} onChange={(e) => setTargetRange({...targetRange, to: parseInt(e.target.value)})} className="w-20 rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /></div>
          </div>
          {action === 'incrementOverride' && (
            <div><label>Pattern (use {n})</label><input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="Warehouse {n}" className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-3 py-2" /></div>
          )}
          <div className="flex gap-2 pt-4">
            <button onClick={handleApply} className="flex-1 py-2 rounded-xl bg-cyan-400 text-black">Apply</button>
            <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/10">Cancel</button>
          </div>
          {showUndo && (
            <div className="mt-2 p-2 rounded-lg bg-green-500/20 text-green-200 flex justify-between items-center">
              <span>Changes applied. You can undo.</span>
              <button onClick={handleUndo} className="underline text-sm">Undo</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Express Mode Preview Panel (with confidence highlighting)
const ExpressPreview = ({ parsedData, onConfirm, onEdit }) => {
  if (!parsedData) return null;
  const lowConfidenceFields = [];
  if (parsedData.confidence.containers < 80) lowConfidenceFields.push('containers');
  if (parsedData.confidence.origin < 80) lowConfidenceFields.push('origin');
  if (parsedData.confidence.destination < 80) lowConfidenceFields.push('destination');
  parsedData.commodities?.forEach((c, idx) => {
    if (c.confidence < 80) lowConfidenceFields.push(`commodity ${idx+1}`);
  });
  return (
    <div className="mt-4 p-4 rounded-2xl bg-cyan-500/10 border border-cyan-400/30">
      <h4 className="text-sm font-semibold mb-2">AI Extracted Data</h4>
      {lowConfidenceFields.length > 0 && (
        <div className="mb-2 p-2 rounded-lg bg-amber-500/20 text-amber-200 text-sm">
          ⚠️ Low confidence for: {lowConfidenceFields.join(', ')}. Please verify.
        </div>
      )}
      <div className="space-y-2 text-sm">
        <div className={parsedData.confidence.containers < 80 ? 'text-amber-200' : ''}>
          <span className="text-white/50">Containers:</span> {parsedData.containersCount} (conf {parsedData.confidence.containers}%)
        </div>
        <div><span className="text-white/50">Commodities:</span> {parsedData.commodities?.map(c => `${c.productName} (${c.confidence}%)`).join(', ')}</div>
        <div className={parsedData.confidence.origin < 80 || parsedData.confidence.destination < 80 ? 'text-amber-200' : ''}>
          <span className="text-white/50">Origin/Destination:</span> {parsedData.origin} → {parsedData.destination}
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={onConfirm} className="px-4 py-1 rounded-lg bg-cyan-400 text-black text-sm">Confirm & Fill Form</button>
        <button onClick={onEdit} className="px-4 py-1 rounded-lg border border-white/10 text-sm">Edit Manually</button>
      </div>
    </div>
  );
};

// Voice Input Modal
const VoiceInputModal = ({ isOpen, onClose, onTranscription }) => {
  const [transcript, setTranscript] = useState('');
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef(null);
  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        setTranscript(text);
        setRecording(false);
      };
      recognitionRef.current = recognition;
    }
  }, []);
  const startRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
      setRecording(true);
    } else {
      alert('Speech recognition not supported');
    }
  };
  const handleConfirm = () => {
    onTranscription(transcript);
    onClose();
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0F172A] border border-cyan-500/30 rounded-3xl p-6 w-full max-w-md">
        <h3 className="text-xl font-semibold mb-4">Voice Input</h3>
        <button onClick={startRecording} className="mb-4 px-4 py-2 rounded-xl bg-red-500 text-white">{recording ? 'Recording...' : 'Start Recording'}</button>
        <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A1024] p-3 h-32" placeholder="Your transcribed text will appear here..." />
        <div className="flex gap-2 mt-4">
          <button onClick={handleConfirm} className="flex-1 py-2 rounded-xl bg-cyan-400 text-black">Use Text</button>
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/10">Cancel</button>
        </div>
      </div>
    </div>
  );
};

// Multi‑shipment Commodity Override Modal
const CommodityOverrideModal = ({ isOpen, onClose, shipment, onSave, productsByCommodityType }) => {
  const [commodities, setCommodities] = useState(shipment.commoditiesOverride || []);
  const addCommodity = () => {
    setCommodities([...commodities, { id: Date.now(), commodityType: 'Fresh Fruits', productName: '', hsCode: '', packaging: '', numberOfPallets: 0, netWeightPerUnit: 0, netWeightUnit: 'kg', notes: '' }]);
  };
  const updateCommodity = (idx, field, value) => {
    const updated = [...commodities];
    updated[idx][field] = value;
    setCommodities(updated);
  };
  const removeCommodity = (idx) => {
    setCommodities(commodities.filter((_, i) => i !== idx));
  };
  const handleSave = () => {
    onSave(commodities);
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0F172A] border border-cyan-500/30 rounded-3xl p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
        <h3 className="text-xl font-semibold mb-4">Override Commodities for Shipment #{shipment.id}</h3>
        {commodities.map((comm, idx) => (
          <div key={comm.id} className="rounded-xl border border-white/10 bg-black/20 p-3 mb-3">
            <div className="flex justify-between items-start mb-2"><span className="text-sm font-medium">Commodity {idx+1}</span><button onClick={() => removeCommodity(idx)} className="text-red-300 text-xs">Remove</button></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><label className="text-xs text-white/50">Type</label><select value={comm.commodityType} onChange={(e) => updateCommodity(idx, 'commodityType', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1"><option>Fresh Fruits</option><option>Frozen Fruits</option><option>Vegetables</option><option>Textiles</option></select></div>
              <div><label className="text-xs text-white/50">HS Code / Product</label><input value={comm.hsCode} onChange={(e) => updateCommodity(idx, 'hsCode', e.target.value)} placeholder="e.g., 0805.10" className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1 mb-1" /><input value={comm.productName} onChange={(e) => updateCommodity(idx, 'productName', e.target.value)} placeholder="Product name" className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /></div>
              <div><label className="text-xs text-white/50">Packaging</label><input value={comm.packaging} onChange={(e) => updateCommodity(idx, 'packaging', e.target.value)} placeholder="Boxes (10 kg)" className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /></div>
              <div><label className="text-xs text-white/50">Pallets</label><input type="number" value={comm.numberOfPallets} onChange={(e) => updateCommodity(idx, 'numberOfPallets', parseInt(e.target.value) || 0)} className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /></div>
              <div><label className="text-xs text-white/50">Net weight/unit</label><div className="flex gap-1"><input type="number" value={comm.netWeightPerUnit} onChange={(e) => updateCommodity(idx, 'netWeightPerUnit', parseFloat(e.target.value))} className="flex-1 rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /><select value={comm.netWeightUnit} onChange={(e) => updateCommodity(idx, 'netWeightUnit', e.target.value)} className="w-16 rounded-xl border border-white/10 bg-[#0A1024] px-1 py-1"><option>kg</option><option>lb</option></select></div></div>
              <div><label className="text-xs text-white/50">Notes</label><input value={comm.notes} onChange={(e) => updateCommodity(idx, 'notes', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /></div>
            </div>
          </div>
        ))}
        <button onClick={addCommodity} className="mt-2 text-xs px-3 py-1 rounded-full bg-cyan-400/20 text-cyan-200">+ Add commodity</button>
        <div className="flex gap-2 mt-4">
          <button onClick={handleSave} className="flex-1 py-2 rounded-xl bg-cyan-400 text-black">Save Overrides</button>
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/10">Cancel</button>
        </div>
      </div>
    </div>
  );
};

// Remove Container Confirmation Modal
const RemoveContainerModal = ({ isOpen, onClose, onConfirm, containerNumber }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0F172A] border border-cyan-500/30 rounded-3xl p-6 w-full max-w-md">
        <h3 className="text-xl font-semibold mb-4">Remove Container</h3>
        <p className="text-white/80 mb-4">Are you sure you want to remove Container {containerNumber}? This action cannot be undone.</p>
        <div className="flex gap-2">
          <button onClick={onConfirm} className="flex-1 py-2 rounded-xl bg-red-500 text-white">Remove</button>
          <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-white/10">Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 4. MAIN COMPONENT (Fully Enhanced)
// ============================================================
export default function SGTXBuyerTradeRequestUltimate() {
  // UI modes
  const [guidedMode, setGuidedMode] = useState(true);
  const [expressMode, setExpressMode] = useState(false);
  const [expressText, setExpressText] = useState('');
  const [expressParsed, setExpressParsed] = useState(null);
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  // Seller state
  const [sellerInput, setSellerInput] = useState('');
  const [seller, setSeller] = useState(null);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerSuggestions, setSellerSuggestions] = useState([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const sellerDebounce = useRef(null);
  const [showTrustPortrait, setShowTrustPortrait] = useState(false);

  // Containers state (with reorder support)
  const [containers, setContainers] = useState([
    {
      id: 'c1',
      countryOfOrigin: 'Vietnam',
      destinationCountry: 'Egypt',
      portOfDischarge: 'Alexandria',
      palletized: true,
      palletSize: 'EUR 800×1200 mm',
      customPalletSize: '',
      destinationOverride: '',
      showDestinationOverride: false,
      notes: '',
      commodities: [
        {
          id: 'co1',
          commodityType: 'Fresh Fruits',
          productName: 'Valencia Oranges',
          hsCode: '0805.10',
          packaging: 'Boxes (10 kg cartons)',
          numberOfPallets: 22,
          netWeightPerUnit: 10,
          netWeightUnit: 'kg',
          grossWeightPerUnit: 10.5,
          layersPerPallet: 11,
          cartonsPerLayer: 10,
          notes: 'Stack max 5 layers',
          dynamicSpec: { variety: 'Valencia', sizeRange: '72-80 mm', brix: 11.5 },
          specSchema: null,
          specConfidence: 0,
          specLoading: false,
          specWarning: null,
          palletSizeAllocations: [], // for dynamic pallet per size
        },
      ],
    },
  ]);
  const nextId = useRef({ container: 2, commodity: 2 });

  // Multi‑shipment
  const [multiShipmentEnabled, setMultiShipmentEnabled] = useState(false);
  const [shipments, setShipments] = useState([
    { id: 1, deliveryDate: '2026-07-15', portOfDischarge: 'Alexandria', containersCount: 1, destinationCountry: 'Egypt', commoditiesOverride: null },
  ]);
  const [showCommodityOverrideModal, setShowCommodityOverrideModal] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState(null);

  // Global notes & AI suggestion
  const [globalNotes, setGlobalNotes] = useState('');
  const [globalNotesSuggestion, setGlobalNotesSuggestion] = useState('');

  // AI Container Advisor
  const [advisorSuggestion, setAdvisorSuggestion] = useState(null);
  const [showAdvisor, setShowAdvisor] = useState(false);

  // Marketplace attribution
  const [attribution, setAttribution] = useState(null);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  // Governor & submission
  const [submitting, setSubmitting] = useState(false);
  const [governorDecision, setGovernorDecision] = useState(null);
  const [showDecisionPanel, setShowDecisionPanel] = useState(false);
  const [tenantMessage, setTenantMessage] = useState('');

  // Draft auto‑save & expiry reminder
  const [lastSaved, setLastSaved] = useState(null);
  const [draftExpiryWarning, setDraftExpiryWarning] = useState(null);
  const autoSaveTimer = useRef(null);

  // Bulk edit modal
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [currentContainerIdx, setCurrentContainerIdx] = useState(0);

  // Remove container confirmation
  const [removeContainerIdx, setRemoveContainerIdx] = useState(null);

  // Progress indicator (required fields)
  const requiredFields = ['countryOfOrigin', 'destinationCountry', 'portOfDischarge'];
  const completionPercent = useMemo(() => {
    let total = 0, filled = 0;
    containers.forEach(c => {
      requiredFields.forEach(f => { total++; if (c[f]) filled++; });
      c.commodities.forEach(comm => { total++; if (comm.productName) filled++; });
    });
    return total === 0 ? 0 : Math.round((filled / total) * 100);
  }, [containers]);

  // ============================================================
  // Helper functions
  // ============================================================
  const getTotalWeightKg = useCallback(() => {
    let total = 0;
    containers.forEach(container => {
      container.commodities.forEach(comm => {
        const weightPerUnit = comm.grossWeightPerUnit || comm.netWeightPerUnit * 1.05;
        total += weightPerUnit * (comm.numberOfPallets || 0) * (comm.layersPerPallet || 1) * (comm.cartonsPerLayer || 1);
      });
    });
    return total;
  }, [containers]);

  // Load dynamic product spec with warning
  const loadProductSpec = async (containerIdx, commodityIdx) => {
    const comm = containers[containerIdx].commodities[commodityIdx];
    if (!comm.productName || comm.specLoading) return;
    const newContainers = [...containers];
    newContainers[containerIdx].commodities[commodityIdx].specLoading = true;
    setContainers(newContainers);
    try {
      const specData = await getProductSpec(comm.productName, comm.commodityType);
      if (specData.schema) {
        const defaultSpec = {};
        Object.entries(specData.schema).forEach(([key, field]) => { defaultSpec[key] = field.default; });
        newContainers[containerIdx].commodities[commodityIdx].dynamicSpec = defaultSpec;
        newContainers[containerIdx].commodities[commodityIdx].specSchema = specData.schema;
        newContainers[containerIdx].commodities[commodityIdx].specConfidence = specData.confidence;
        const warning = getSpecCompatibilityWarning(comm.productName, defaultSpec);
        newContainers[containerIdx].commodities[commodityIdx].specWarning = warning;
      } else {
        newContainers[containerIdx].commodities[commodityIdx].specSchema = null;
      }
    } catch (error) {
      console.error('Product spec failed', error);
      newContainers[containerIdx].commodities[commodityIdx].specSchema = null;
    } finally {
      newContainers[containerIdx].commodities[commodityIdx].specLoading = false;
      setContainers(newContainers);
    }
  };

  // GTID Autocomplete (mock suggestions with recent badge)
  useEffect(() => {
    if (sellerInput.trim().length > 2) {
      const mockSuggestions = [
        { gtid: 'SGTX-VN-TRD-002139-7F3A', name: 'Mekong Fresh Co.', recent: true },
        { gtid: 'SGTX-EG-TRD-000456-1397', name: 'Nile Foods', recent: false },
      ].filter(s => s.gtid.includes(sellerInput) || s.name.toLowerCase().includes(sellerInput.toLowerCase()));
      setSellerSuggestions(mockSuggestions);
    } else {
      setSellerSuggestions([]);
    }
  }, [sellerInput]);

  const handleSellerKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => Math.min(prev + 1, sellerSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
      const selected = sellerSuggestions[selectedSuggestionIndex];
      setSellerInput(selected.gtid);
      setSellerSuggestions([]);
      resolveGTID(selected.gtid).then(setSeller);
    }
  };

  // Seller resolution debounced
  useEffect(() => {
    if (sellerDebounce.current) clearTimeout(sellerDebounce.current);
    sellerDebounce.current = setTimeout(async () => {
      if (sellerInput.trim().length > 0) {
        setSellerLoading(true);
        const resolved = await resolveGTID(sellerInput);
        setSellerLoading(false);
        if (resolved) setSeller(resolved);
        else setSeller(null);
      }
    }, 300);
    return () => clearTimeout(sellerDebounce.current);
  }, [sellerInput]);

  // Update commodity field (including gross weight, layers, cartons)
  const updateCommodityField = (containerIdx, commodityIdx, field, value) => {
    const newContainers = [...containers];
    const comm = newContainers[containerIdx].commodities[commodityIdx];
    comm[field] = value;
    if (field === 'netWeightPerUnit') {
      comm.grossWeightPerUnit = parseFloat((value * 1.05).toFixed(2));
    }
    if (field === 'layersPerPallet' || field === 'cartonsPerLayer') {
      const layers = comm.layersPerPallet || 1;
      const cartons = comm.cartonsPerLayer || 1;
      const totalCartons = layers * cartons;
      const netWeight = comm.netWeightPerUnit || 0;
      const totalNetWeight = totalCartons * netWeight;
      // Optionally update number of pallets? Not auto.
    }
    setContainers(newContainers);
    if (field === 'productName' && value && value !== '') {
      loadProductSpec(containerIdx, commodityIdx);
    }
    if (field === 'hsCode' && value) {
      const hs = hsDatabase[value];
      if (hs) {
        comm.productName = hs.name;
        comm.commodityType = hs.commodityType;
        setContainers(newContainers);
        loadProductSpec(containerIdx, commodityIdx);
      }
    }
  };

  // Dynamic pallet per size: manage allocations
  const updatePalletSizeAllocation = (containerIdx, commodityIdx, sizeIndex, field, value) => {
    const newContainers = [...containers];
    const allocations = newContainers[containerIdx].commodities[commodityIdx].palletSizeAllocations || [];
    if (!allocations[sizeIndex]) allocations[sizeIndex] = { size: '', pallets: 0 };
    allocations[sizeIndex][field] = value;
    const totalPallets = allocations.reduce((sum, a) => sum + (parseInt(a.pallets) || 0), 0);
    newContainers[containerIdx].commodities[commodityIdx].numberOfPallets = totalPallets;
    newContainers[containerIdx].commodities[commodityIdx].palletSizeAllocations = allocations;
    setContainers(newContainers);
  };

  const addPalletSizeAllocation = (containerIdx, commodityIdx) => {
    const newContainers = [...containers];
    const allocations = newContainers[containerIdx].commodities[commodityIdx].palletSizeAllocations || [];
    allocations.push({ size: '', pallets: 0 });
    newContainers[containerIdx].commodities[commodityIdx].palletSizeAllocations = allocations;
    setContainers(newContainers);
  };

  const addCommodity = (containerIdx) => {
    const newContainers = [...containers];
    newContainers[containerIdx].commodities.push({
      id: `co${nextId.current.commodity++}`,
      commodityType: 'Fresh Fruits',
      productName: '',
      hsCode: '',
      packaging: '',
      numberOfPallets: 0,
      netWeightPerUnit: 0,
      netWeightUnit: 'kg',
      grossWeightPerUnit: 0,
      layersPerPallet: 1,
      cartonsPerLayer: 1,
      notes: '',
      dynamicSpec: {},
      specSchema: null,
      specConfidence: 0,
      specLoading: false,
      specWarning: null,
      palletSizeAllocations: [],
    });
    setContainers(newContainers);
  };

  const removeCommodity = (containerIdx, commodityIdx) => {
    const newContainers = [...containers];
    newContainers[containerIdx].commodities.splice(commodityIdx, 1);
    setContainers(newContainers);
  };

  // Container count via number input
  const handleContainerCountChange = (count) => {
    const newCount = Math.max(1, parseInt(count) || 1);
    const currentCount = containers.length;
    if (newCount > currentCount) {
      const newContainers = [...containers];
      for (let i = currentCount; i < newCount; i++) {
        newContainers.push({
          id: `c${nextId.current.container++}`,
          countryOfOrigin: containers[0].countryOfOrigin,
          destinationCountry: containers[0].destinationCountry,
          portOfDischarge: containers[0].portOfDischarge,
          palletized: containers[0].palletized,
          palletSize: containers[0].palletSize,
          customPalletSize: '',
          destinationOverride: '',
          showDestinationOverride: false,
          notes: '',
          commodities: [],
        });
      }
      setContainers(newContainers);
    } else if (newCount < currentCount) {
      setContainers(containers.slice(0, newCount));
    }
  };

  const cloneContainer = (containerIdx) => {
    const original = containers[containerIdx];
    const newContainer = JSON.parse(JSON.stringify(original));
    newContainer.id = `c${nextId.current.container++}`;
    newContainer.commodities.forEach(c => { c.id = `co${nextId.current.commodity++}`; });
    const newContainers = [...containers];
    newContainers.splice(containerIdx + 1, 0, newContainer);
    setContainers(newContainers);
  };

  const removeContainer = (containerIdx) => {
    if (containers.length <= 1) return;
    setRemoveContainerIdx(containerIdx);
  };
  const confirmRemoveContainer = () => {
    if (removeContainerIdx !== null) {
      const newContainers = [...containers];
      newContainers.splice(removeContainerIdx, 1);
      setContainers(newContainers);
      setRemoveContainerIdx(null);
    }
  };

  const updateContainerField = (containerIdx, field, value) => {
    const newContainers = [...containers];
    newContainers[containerIdx][field] = value;
    setContainers(newContainers);
  };

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(containers);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);
    setContainers(items);
  };

  // Multi‑shipment handlers
  const addShipment = () => {
    const newId = shipments.length + 1;
    setShipments([...shipments, { id: newId, deliveryDate: '2026-09-15', portOfDischarge: 'Hamburg', containersCount: 1, destinationCountry: containers[0]?.destinationCountry || 'Egypt', commoditiesOverride: null }]);
  };
  const cloneShipment = (id) => {
    const original = shipments.find(s => s.id === id);
    const newId = shipments.length + 1;
    setShipments([...shipments, { ...original, id: newId }]);
  };
  const removeShipment = (id) => {
    if (shipments.length <= 1) return;
    setShipments(shipments.filter(s => s.id !== id));
  };
  const updateShipment = (id, field, value) => {
    setShipments(shipments.map(s => s.id === id ? { ...s, [field]: value } : s));
  };
  const bulkShiftDates = (days) => {
    setShipments(shipments.map(s => ({
      ...s,
      deliveryDate: new Date(new Date(s.deliveryDate).getTime() + days * 86400000).toISOString().slice(0,10)
    })));
  };
  const editShipmentCommodities = (shipment) => {
    setSelectedShipment(shipment);
    setShowCommodityOverrideModal(true);
  };
  const saveShipmentCommodities = (commodities) => {
    setShipments(shipments.map(s => s.id === selectedShipment.id ? { ...s, commoditiesOverride: commodities } : s));
  };

  // AI Container Advisor effect with logging
  useEffect(() => {
    const totalWeight = getTotalWeightKg();
    if (totalWeight > 0 && !advisorSuggestion) {
      getContainerAdvisor(totalWeight, 'product').then(adv => {
        setAdvisorSuggestion(adv);
        setShowAdvisor(true);
      });
    }
  }, [getTotalWeightKg, advisorSuggestion]);

  const acceptAdvisorSuggestion = () => {
    if (advisorSuggestion.containers) {
      handleContainerCountChange(advisorSuggestion.containers);
      logEvent('CONTAINER_ADVISOR_ACCEPT', { suggestion: advisorSuggestion, previousCount: containers.length, newCount: advisorSuggestion.containers });
    }
    setShowAdvisor(false);
  };

  // Marketplace attribution
  useEffect(() => {
    if (seller) {
      checkMarketplaceAttribution('buyer-demo', seller.gtid).then(setAttribution);
    }
  }, [seller]);

  // Draft auto‑save with expiry check
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      const draft = { containers, multiShipmentEnabled, shipments, globalNotes, seller };
      saveDraft(draft);
      setLastSaved(new Date());
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draftObj = JSON.parse(raw);
        const ageDays = (Date.now() - draftObj.timestamp) / (1000 * 3600 * 24);
        if (ageDays > 11) setDraftExpiryWarning(`Your draft will expire in ${14 - Math.floor(ageDays)} days.`);
        else setDraftExpiryWarning(null);
      }
    }, 30000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [containers, multiShipmentEnabled, shipments, globalNotes, seller]);

  // Load draft on mount
  useEffect(() => {
    loadDraft().then(draft => {
      if (draft) {
        if (draft.containers) setContainers(draft.containers);
        if (draft.multiShipmentEnabled !== undefined) setMultiShipmentEnabled(draft.multiShipmentEnabled);
        if (draft.shipments) setShipments(draft.shipments);
        if (draft.globalNotes) setGlobalNotes(draft.globalNotes);
        if (draft.seller) setSeller(draft.seller);
      }
    });
  }, []);

  // Global notes AI suggestion
  const handleGlobalNotesSuggest = async () => {
    try {
      const suggestion = await callGroq([{ role: 'user', content: `Suggest 2‑3 global notes for a trade involving ${containers[0]?.commodities[0]?.productName} from ${containers[0]?.countryOfOrigin} to ${containers[0]?.destinationCountry}. Keep concise.` }]);
      setGlobalNotesSuggestion(suggestion);
    } catch { setGlobalNotesSuggestion('Seller to provide phytosanitary certificate and certificate of origin. Ensure reefers are pre‑cooled appropriately.'); }
  };

  // Express Mode AI parsing (real Groq)
  const handleExpressParse = async () => {
    if (!expressText.trim()) return;
    try {
      const prompt = `Parse the following trade request into structured JSON with fields: containersCount, origin, destination, commodities (array of {productName, confidence}). Also provide confidence scores for each field (0-100). Only output JSON. Text: ${expressText}`;
      const result = await callGroq([{ role: 'user', content: prompt }]);
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setExpressParsed({
          containersCount: parsed.containersCount || 1,
          origin: parsed.origin || '',
          destination: parsed.destination || '',
          commodities: parsed.commodities || [],
          confidence: parsed.confidence || { containers: 90, origin: 90, destination: 90 },
        });
      } else {
        throw new Error('No JSON');
      }
    } catch (error) {
      alert('Could not parse text. Please try rephrasing or use structured form.');
    }
  };
  const confirmExpressParsed = () => {
    if (expressParsed) {
      handleContainerCountChange(expressParsed.containersCount);
      const newContainers = containers.map((c, idx) => {
        if (idx === 0) {
          return {
            ...c,
            countryOfOrigin: expressParsed.origin,
            destinationCountry: expressParsed.destination,
            commodities: c.commodities.map(comm => ({ ...comm, productName: expressParsed.commodities[0]?.productName || comm.productName }))
          };
        }
        return c;
      });
      setContainers(newContainers);
      setExpressMode(false);
      setExpressParsed(null);
    }
  };

  // Submit handler with enhanced Governor, Loom hash, Smart Inbox, logging
  const handleSubmit = async () => {
    setSubmitting(true);
    let dualUseDetected = false;
    containers.forEach(c => {
      c.commodities.forEach(comm => {
        const hs = hsDatabase[comm.hsCode];
        if (hs?.dualUse) dualUseDetected = true;
      });
    });
    const tradeData = {
      buyerGtid: 'buyer-demo',
      sellerGtid: seller?.gtid,
      containers: containers.map(c => ({
        countryOfOrigin: c.countryOfOrigin,
        destinationCountry: c.destinationCountry,
        portOfDischarge: c.portOfDischarge,
        palletized: c.palletized,
        palletSize: c.palletSize === 'Custom' ? c.customPalletSize : c.palletSize,
        commodities: c.commodities.map(comm => ({ ...comm })),
      })),
      multiShipmentEnabled,
      shipments: multiShipmentEnabled ? shipments.map(s => ({ ...s, destinationCountry: s.destinationCountry || containers[0]?.destinationCountry })) : [],
      globalNotes,
      destinationCountry: containers[0]?.destinationCountry,
      dualUseDetected,
    };
    const gov = await governorPrescreen(tradeData);
    if (gov.verdict !== 'ALLOW') {
      const msg = await generateTenantMessage(gov.verdict, gov.conditions);
      setTenantMessage(msg);
      setGovernorDecision(gov);
      setShowDecisionPanel(true);
      setSubmitting(false);
      return;
    }
    // ALLOW: generate Loom hash, create Smart Inbox item, log
    const loomHash = generateLoomHash(tradeData);
    logEvent('TRADE_ALLOWED', { tradeData, loomHash });
    await createSmartInboxItem(seller?.gtid, { id: `TR-${Date.now()}`, ...tradeData });
    console.log('Trade request ALLOWED, submitting:', tradeData);
    alert('Trade request submitted successfully! (mock)');
    setSubmitting(false);
  };

  // Render container card (enhanced with all new fields)
  const getFlagUrl = (countryCode) => `https://flagcdn.com/24x18/${countryCode.slice(0,2).toLowerCase()}.png`;
  const countryToCode = { Vietnam: 'vn', Egypt: 'eg', Germany: 'de', UAE: 'ae', India: 'in' };
  
  const renderContainer = (container, idx) => {
    const portsForDestination = portsDB[container.destinationCountry] || [];
    const portValid = portsForDestination.some(p => p.name === container.portOfDischarge && !p.sanctioned);
    return (
      <Draggable key={container.id} draggableId={container.id} index={idx}>
        {(provided) => (
          <div ref={provided.innerRef} {...provided.draggableProps} className="rounded-2xl border border-white/10 bg-black/20 p-4 mb-6">
            <div className="flex justify-between items-center mb-4">
              <div {...provided.dragHandleProps} className="cursor-grab text-white/50 text-xl">⋮⋮</div>
              <h4 className="text-lg font-medium">Container {idx+1}</h4>
              <div className="flex gap-2">
                <button onClick={() => { setCurrentContainerIdx(idx); setBulkEditOpen(true); }} className="text-xs px-3 py-1 rounded-full bg-cyan-400/20 text-cyan-200">Bulk</button>
                <button onClick={() => cloneContainer(idx)} className="text-xs px-3 py-1 rounded-full bg-cyan-400/20 text-cyan-200">Clone</button>
                {containers.length > 1 && <button onClick={() => removeContainer(idx)} className="text-xs px-3 py-1 rounded-full bg-red-500/20 text-red-200">Remove</button>}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div title="Country where the goods originate">
                <label className="text-xs text-white/50">Country of Origin</label>
                <div className="flex items-center gap-2">
                  <img src={getFlagUrl(countryToCode[container.countryOfOrigin] || 'un')} alt="" className="w-5 h-4" />
                  <select value={container.countryOfOrigin} onChange={(e) => updateContainerField(idx, 'countryOfOrigin', e.target.value)} className="flex-1 rounded-xl border border-white/10 bg-[#0A1024] px-3 py-2 text-sm">
                    <option>Vietnam</option><option>Egypt</option><option>India</option><option>Germany</option><option>UAE</option>
                  </select>
                </div>
              </div>
              <div title="Destination country of the shipment">
                <label className="text-xs text-white/50">Destination Country</label>
                <div className="flex items-center gap-2">
                  <img src={getFlagUrl(countryToCode[container.destinationCountry] || 'un')} alt="" className="w-5 h-4" />
                  <select value={container.destinationCountry} onChange={(e) => updateContainerField(idx, 'destinationCountry', e.target.value)} className="flex-1 rounded-xl border border-white/10 bg-[#0A1024] px-3 py-2 text-sm">
                    <option>Egypt</option><option>Germany</option><option>UAE</option><option>Vietnam</option>
                  </select>
                </div>
              </div>
              <div title="Port where goods will be discharged">
                <label className="text-xs text-white/50">Port of Discharge</label>
                <select value={container.portOfDischarge} onChange={(e) => updateContainerField(idx, 'portOfDischarge', e.target.value)} className={`w-full rounded-xl border ${!portValid ? 'border-red-500' : 'border-white/10'} bg-[#0A1024] px-3 py-2 text-sm`} disabled={!container.destinationCountry}>
                  {portsForDestination.map(p => <option key={p.code}>{p.name}</option>)}
                </select>
                {!portValid && <div className="text-xs text-red-400 mt-1">⚠️ Invalid or sanctioned port</div>}
              </div>
              <div><label className="text-xs text-white/50">Palletized</label><input type="checkbox" checked={container.palletized} onChange={(e) => updateContainerField(idx, 'palletized', e.target.checked)} className="ml-2 w-5 h-5" /></div>
              {container.palletized && (
                <div>
                  <label className="text-xs text-white/50">Pallet Size</label>
                  <select value={container.palletSize} onChange={(e) => updateContainerField(idx, 'palletSize', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-3 py-2 text-sm">
                    <option>EUR 800×1200 mm</option><option>ISO 1000×1200 mm</option><option>Custom</option>
                  </select>
                  {container.palletSize === 'Custom' && (
                    <input type="text" value={container.customPalletSize || ''} onChange={(e) => updateContainerField(idx, 'customPalletSize', e.target.value)} placeholder="e.g., 1200×1000 mm" className="mt-1 w-full rounded-xl border border-white/10 bg-[#0A1024] px-3 py-1 text-sm" />
                  )}
                </div>
              )}
              <div>
                <label className="text-xs text-white/50">Destination Override</label>
                {!container.showDestinationOverride ? (
                  <button onClick={() => updateContainerField(idx, 'showDestinationOverride', true)} className="text-cyan-300 text-xs underline">Override</button>
                ) : (
                  <input value={container.destinationOverride || ''} onChange={(e) => updateContainerField(idx, 'destinationOverride', e.target.value)} placeholder="e.g., Free Zone" className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-3 py-2 text-sm" />
                )}
              </div>
            </div>
            <div className="border-t border-white/10 my-3 pt-3">
              <div className="flex justify-between items-center mb-2"><span className="text-sm font-medium">Commodities</span><button onClick={() => addCommodity(idx)} className="text-xs px-3 py-1 rounded-full bg-cyan-400/20 text-cyan-200">+ Add commodity</button></div>
              {container.commodities.map((comm, ci) => (
                <div key={comm.id} className="rounded-xl border border-white/5 bg-[#0A1024]/50 p-3 mb-3">
                  <div className="flex justify-between items-start mb-2"><span className="text-sm font-medium">Commodity {ci+1}</span><button onClick={() => removeCommodity(idx, ci)} className="text-red-300 text-xs">Remove</button></div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <label className="text-xs text-white/50">Type</label>
                      <select value={comm.commodityType} onChange={(e) => updateCommodityField(idx, ci, 'commodityType', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1">
                        <option>Fresh Fruits</option><option>Frozen Fruits</option><option>Vegetables</option><option>Textiles</option><option>Other</option>
                      </select>
                      {comm.commodityType === 'Other' && (
                        <input type="text" placeholder="Specify other type" className="mt-1 w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" />
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-white/50">HS Code / Product</label>
                      <select value={comm.hsCode} onChange={(e) => updateCommodityField(idx, ci, 'hsCode', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1 mb-1">
                        <option value="">Select product</option>
                        {(productsByCommodityType[comm.commodityType] || []).map(p => (
                          <option key={p.hsCode} value={p.hsCode}>{p.hsCode} - {p.name}</option>
                        ))}
                      </select>
                      <input value={comm.productName} onChange={(e) => updateCommodityField(idx, ci, 'productName', e.target.value)} placeholder="Product name" className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" />
                    </div>
                    <div><label className="text-xs text-white/50">Packaging</label><input value={comm.packaging} onChange={(e) => updateCommodityField(idx, ci, 'packaging', e.target.value)} placeholder="Boxes (10 kg)" className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /></div>
                    <div><label className="text-xs text-white/50">Pallets</label><input type="number" value={comm.numberOfPallets} onChange={(e) => updateCommodityField(idx, ci, 'numberOfPallets', parseInt(e.target.value) || 0)} className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /></div>
                    <div>
                      <label className="text-xs text-white/50">Net weight/unit</label>
                      <div className="flex gap-1"><input type="number" value={comm.netWeightPerUnit} onChange={(e) => updateCommodityField(idx, ci, 'netWeightPerUnit', parseFloat(e.target.value))} className="flex-1 rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /><select value={comm.netWeightUnit} onChange={(e) => updateCommodityField(idx, ci, 'netWeightUnit', e.target.value)} className="w-16 rounded-xl border border-white/10 bg-[#0A1024] px-1 py-1"><option>kg</option><option>lb</option></select></div>
                    </div>
                    <div><label className="text-xs text-white/50">Gross weight/unit</label><input type="number" value={comm.grossWeightPerUnit} onChange={(e) => updateCommodityField(idx, ci, 'grossWeightPerUnit', parseFloat(e.target.value))} className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /></div>
                    <div><label className="text-xs text-white/50">Layers per pallet</label><input type="number" value={comm.layersPerPallet} onChange={(e) => updateCommodityField(idx, ci, 'layersPerPallet', parseInt(e.target.value) || 1)} className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /></div>
                    <div><label className="text-xs text-white/50">Cartons per layer</label><input type="number" value={comm.cartonsPerLayer} onChange={(e) => updateCommodityField(idx, ci, 'cartonsPerLayer', parseInt(e.target.value) || 1)} className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /></div>
                    <div><label className="text-xs text-white/50">Notes</label><input value={comm.notes} onChange={(e) => updateCommodityField(idx, ci, 'notes', e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" /></div>
                  </div>
                  {/* Dynamic pallet size allocations (if spec includes sizeRange as select) */}
                  {comm.specSchema?.sizeRange && comm.specSchema.sizeRange.type === 'select' && (
                    <div className="mt-2 p-2 border-t border-white/10">
                      <div className="flex justify-between items-center"><span className="text-xs text-white/50">Pallet allocation per size</span><button onClick={() => addPalletSizeAllocation(idx, ci)} className="text-xs text-cyan-300">+ Add size</button></div>
                      {(comm.palletSizeAllocations || []).map((alloc, allocIdx) => (
                        <div key={allocIdx} className="flex gap-2 mt-1">
                          <select value={alloc.size} onChange={(e) => updatePalletSizeAllocation(idx, ci, allocIdx, 'size', e.target.value)} className="flex-1 rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1 text-sm">
                            <option value="">Select size</option>
                            {comm.specSchema.sizeRange.options.map(opt => <option key={opt}>{opt}</option>)}
                          </select>
                          <input type="number" value={alloc.pallets} onChange={(e) => updatePalletSizeAllocation(idx, ci, allocIdx, 'pallets', parseInt(e.target.value) || 0)} placeholder="Pallets" className="w-24 rounded-xl border border-white/10 bg-[#0A1024] px-2 py-1" />
                        </div>
                      ))}
                    </div>
                  )}
                  {comm.specLoading && <div className="text-xs text-cyan-300 mt-2">AI generating specifications...</div>}
                  {!comm.specLoading && comm.specSchema && (
                    <DynamicSpecFields
                      schema={comm.specSchema}
                      values={comm.dynamicSpec || {}}
                      onChange={(key, val) => {
                        const newContainers = [...containers];
                        newContainers[idx].commodities[ci].dynamicSpec = { ...newContainers[idx].commodities[ci].dynamicSpec, [key]: val };
                        const warning = getSpecCompatibilityWarning(comm.productName, newContainers[idx].commodities[ci].dynamicSpec);
                        newContainers[idx].commodities[ci].specWarning = warning;
                        setContainers(newContainers);
                      }}
                      confidence={comm.specConfidence}
                      onReset={() => loadProductSpec(idx, ci)}
                      onSaveTemplate={() => alert('Template saved (mock)')}
                      warning={comm.specWarning}
                      commodityType={comm.commodityType}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <main className="min-h-screen bg-[#050816] text-white p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <section className="rounded-3xl border border-cyan-500/20 bg-white/5 p-8 backdrop-blur-xl">
          <div className="flex justify-between items-start">
            <div><div className="text-cyan-300 uppercase tracking-[0.3em] text-xs mb-3">SGTX Constitutional Runtime</div><h1 className="text-5xl font-semibold">New Trade Request</h1><p className="text-white/60 mt-2">AI‑native structured trade execution</p></div>
            <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-emerald-200">Governor Online</div><div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-cyan-200">AI Advisory Active</div></div>
          </div>
        </section>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-9 space-y-6">
            {/* Mode toggles */}
            <div className="flex justify-between items-center">
              <div className="flex gap-3">
                <button onClick={() => setGuidedMode(true)} className={`px-4 py-2 rounded-xl ${guidedMode ? 'bg-cyan-400 text-black' : 'border border-white/10'}`}>Guided Mode</button>
                <button onClick={() => setGuidedMode(false)} className={`px-4 py-2 rounded-xl ${!guidedMode ? 'bg-cyan-400 text-black' : 'border border-white/10'}`}>Expert Mode</button>
              </div>
              <button onClick={() => setExpressMode(!expressMode)} className={`px-4 py-2 rounded-xl ${expressMode ? 'bg-cyan-400 text-black' : 'border border-white/10'}`}>{expressMode ? 'Disable Express Mode' : 'AI Express Mode'}</button>
            </div>

            {expressMode ? (
              <div className="rounded-3xl border border-cyan-400/20 bg-cyan-500/5 p-6">
                <div className="flex gap-2 mb-2">
                  <textarea rows={4} value={expressText} onChange={(e) => setExpressText(e.target.value)} placeholder="Describe your trade in plain English..." className="flex-1 rounded-2xl bg-black/20 border border-white/10 p-4 resize-none" />
                  <button onClick={() => setShowVoiceModal(true)} className="px-4 py-2 rounded-xl bg-purple-500 text-white">🎤 Voice</button>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleExpressParse} className="px-5 py-2 rounded-xl bg-cyan-400 text-black">Parse with AI</button>
                  <button onClick={() => setExpressMode(false)} className="px-5 py-2 rounded-xl border border-white/10">Switch to Structured Form</button>
                </div>
                <ExpressPreview parsedData={expressParsed} onConfirm={confirmExpressParsed} onEdit={() => setExpressParsed(null)} />
              </div>
            ) : (
              <>
                {/* Seller Selection (Enhanced) */}
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
                  <h2 className="text-2xl font-semibold mb-4">Seller Selection</h2>
                  <div className="flex gap-4">
                    <div className="flex-1 relative">
                      <label className="text-sm text-white/50 block mb-2">GTID / Company Name</label>
                      <div className="flex gap-2">
                        <input
                          value={sellerInput}
                          onChange={(e) => setSellerInput(e.target.value)}
                          onKeyDown={handleSellerKeyDown}
                          placeholder="SGTX-VN-TRD-002139-7F3A"
                          className="flex-1 rounded-2xl border border-cyan-400/20 bg-[#0A1024] px-5 py-4"
                          aria-label="Seller GTID"
                        />
                        <button onClick={() => setShowContactsModal(true)} className="px-5 py-4 rounded-2xl border border-white/10">📂 Contacts</button>
                      </div>
                      {sellerSuggestions.length > 0 && (
                        <ul className="absolute z-10 w-full bg-[#0F172A] border border-cyan-500/30 rounded-xl mt-1 max-h-60 overflow-auto">
                          {sellerSuggestions.map((sug, i) => (
                            <li key={sug.gtid} className={`px-4 py-2 cursor-pointer hover:bg-cyan-500/20 ${i === selectedSuggestionIndex ? 'bg-cyan-500/20' : ''} flex justify-between`} onClick={() => { setSellerInput(sug.gtid); setSellerSuggestions([]); resolveGTID(sug.gtid).then(setSeller); }}>
                              <span>{sug.name} ({sug.gtid})</span>
                              {sug.recent && <span className="text-xs bg-blue-500/20 text-blue-200 px-2 rounded-full">Recent</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                      {sellerLoading && <div className="text-xs text-cyan-300 mt-2">Resolving...</div>}
                      {seller && (
                        <div className="mt-4 p-4 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <img src={seller.logoUrl || 'https://via.placeholder.com/40'} alt="" className="w-10 h-10 rounded-full" />
                            <div>
                              <div className="font-semibold">{seller.legalName}</div>
                              <div className="text-sm text-white/50">{seller.gtid} · {seller.jurisdiction}</div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs ${seller.trustScore >= 80 ? 'bg-emerald-500/20 text-emerald-200' : seller.trustScore >= 50 ? 'bg-amber-500/20 text-amber-200' : 'bg-red-500/20 text-red-200'}`}>Trust {seller.trustScore}</span>
                            {seller.sanctionsCleared && <span className="px-2 py-1 rounded-full bg-blue-500/20 text-blue-200 text-xs">🛡️ Cleared</span>}
                            {seller.isSavedContact && <span className="px-2 py-1 rounded-full bg-cyan-500/20 text-cyan-200 text-xs">Saved Contact</span>}
                            <button onClick={() => setShowTrustPortrait(true)} className="text-cyan-300 text-xs underline">360° Trust Portrait</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Container Count & Containers with Drag & Drop */}
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h2 className="text-2xl font-semibold">Containers</h2>
                      <div className="text-xs text-white/40 mt-1">Completion: {completionPercent}%</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        <label className="text-xs text-white/50 mr-2">Number of Containers:</label>
                        <input type="number" min="1" value={containers.length} onChange={(e) => handleContainerCountChange(e.target.value)} className="w-20 rounded-xl border border-white/10 bg-[#0A1024] px-3 py-2 text-sm" />
                      </div>
                      <button onClick={() => handleContainerCountChange(containers.length + 1)} className="px-4 py-2 rounded-xl bg-cyan-400 text-black">+ Add Container</button>
                    </div>
                  </div>
                  <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="containers">
                      {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef}>
                          {containers.map((c, idx) => renderContainer(c, idx))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </section>

                {/* Global Notes */}
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
                  <div className="flex justify-between items-center mb-2"><h3 className="text-xl font-semibold">Global Notes</h3><button onClick={handleGlobalNotesSuggest} className="text-xs px-3 py-1 rounded-full bg-cyan-400/20 text-cyan-200">✨ Suggest</button></div>
                  {globalNotesSuggestion && <div className="mb-2 p-2 rounded-lg bg-cyan-500/10 text-sm text-cyan-200">{globalNotesSuggestion} <button onClick={() => setGlobalNotes(globalNotesSuggestion)} className="underline ml-2">Apply</button></div>}
                  <textarea rows={3} value={globalNotes} onChange={(e) => setGlobalNotes(e.target.value)} placeholder="Additional instructions for seller..." className="w-full rounded-2xl bg-black/20 border border-white/10 p-4 resize-none" />
                  <div className="text-right text-xs text-white/40 mt-1">{globalNotes.length}/2000 characters</div>
                </section>

                {/* AI Container Advisor Banner */}
                {showAdvisor && advisorSuggestion && (
                  <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-4 flex justify-between items-center">
                    <div><span className="text-amber-200">💡 AI Container Advisor:</span> {advisorSuggestion.explanation}</div>
                    <div className="flex gap-2">
                      <button onClick={acceptAdvisorSuggestion} className="px-3 py-1 rounded-lg bg-amber-400 text-black text-sm">Accept</button>
                      <button onClick={() => setShowAdvisor(false)} className="px-3 py-1 rounded-lg border border-amber-400/20 text-amber-200 text-sm">Dismiss</button>
                    </div>
                  </div>
                )}

                {/* Multi‑shipment */}
                <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold">Multi‑shipment Contract</h3>
                    <button onClick={() => setMultiShipmentEnabled(!multiShipmentEnabled)} className={`px-4 py-2 rounded-xl ${multiShipmentEnabled ? 'bg-cyan-400 text-black' : 'border border-white/10'}`}>{multiShipmentEnabled ? 'Enabled' : 'Disabled'}</button>
                  </div>
                  {multiShipmentEnabled && (
                    <div>
                      <div className="flex gap-2 mb-3"><button onClick={() => bulkShiftDates(7)} className="text-xs px-3 py-1 rounded-full bg-white/10">+7 days</button><button onClick={() => bulkShiftDates(-7)} className="text-xs px-3 py-1 rounded-full bg-white/10">-7 days</button><button onClick={addShipment} className="text-xs px-3 py-1 rounded-full bg-cyan-400/20 text-cyan-200">+ Add Shipment</button></div>
                      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b border-white/10"><tr><th>#</th><th>Delivery Date</th><th>Destination</th><th>Port</th><th>Containers</th><th>Commodities</th><th>Actions</th></tr></thead><tbody>
                        {shipments.map(s => (
                          <tr key={s.id} className="border-b border-white/5">
                            <td className="p-2">#{s.id}</td>
                            <td className="p-2"><input type="date" value={s.deliveryDate} onChange={(e) => updateShipment(s.id, 'deliveryDate', e.target.value)} className="bg-transparent border border-white/10 rounded px-2 py-1" /></td>
                            <td className="p-2">
                              <select value={s.destinationCountry || containers[0]?.destinationCountry} onChange={(e) => updateShipment(s.id, 'destinationCountry', e.target.value)} className="bg-transparent border border-white/10 rounded px-2 py-1">
                                <option>Egypt</option><option>Germany</option><option>UAE</option>
                              </select>
                            </td>
                            <td className="p-2">
                              <select value={s.portOfDischarge} onChange={(e) => updateShipment(s.id, 'portOfDischarge', e.target.value)} className="bg-transparent border border-white/10 rounded px-2 py-1">
                                {(portsDB[s.destinationCountry || containers[0]?.destinationCountry] || []).map(p => <option key={p.code}>{p.name}</option>)}
                              </select>
                            </td>
                            <td className="p-2"><input type="number" value={s.containersCount} onChange={(e) => updateShipment(s.id, 'containersCount', parseInt(e.target.value))} className="w-16 bg-transparent border border-white/10 rounded px-2 py-1" /></td>
                            <td className="p-2"><button onClick={() => editShipmentCommodities(s)} className="text-cyan-300 text-xs">Edit</button></td>
                            <td className="p-2"><button onClick={() => cloneShipment(s.id)} className="text-cyan-300 mr-2">Clone</button><button onClick={() => removeShipment(s.id)} className="text-red-300">Remove</button></td>
                          </tr>
                        ))}
                      </tbody></table></div>
                    </div>
                  )}
                </section>

                {/* Marketplace Attribution */}
                {attribution && attribution.attributed && (
                  <div className="rounded-3xl border border-amber-500/20 bg-amber-500/10 p-4 flex justify-between">
                    <span>⚠️ This trade will be attributed to {attribution.partnerName} (revenue share {attribution.revenueShare}%).</span>
                    <button onClick={() => setShowDisputeModal(true)} className="underline text-amber-200">Dispute within 72h</button>
                  </div>
                )}

                {/* Draft Expiry Warning */}
                {draftExpiryWarning && (
                  <div className="rounded-3xl border border-orange-500/20 bg-orange-500/10 p-3 text-orange-200 text-sm">{draftExpiryWarning}</div>
                )}

                {/* Submit */}
                <div className="flex justify-between items-center pt-4">
                  <div className="text-xs text-white/40">Last saved: {lastSaved ? lastSaved.toLocaleTimeString() : 'never'}</div>
                  <button onClick={handleSubmit} disabled={submitting} className="px-8 py-4 rounded-2xl bg-cyan-400 text-black text-lg font-semibold shadow-2xl shadow-cyan-500/20 hover:scale-105 transition-all disabled:opacity-50">Submit Trade Request</button>
                </div>
              </>
            )}
          </div>

          {/* Right Sidebar – AI Copilot */}
          <aside className="col-span-3">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5 sticky top-6 space-y-5">
              <h3 className="text-xl font-semibold">AI Operational Copilot</h3>
              <button className="w-full text-left rounded-2xl border border-white/10 bg-black/20 p-4 hover:bg-white/5">Recommend best Incoterm</button>
              <button className="w-full text-left rounded-2xl border border-white/10 bg-black/20 p-4 hover:bg-white/5">Explain required certificates</button>
              <button className="w-full text-left rounded-2xl border border-white/10 bg-black/20 p-4 hover:bg-white/5">Optimize pallet arrangement</button>
              <button className="w-full text-left rounded-2xl border border-white/10 bg-black/20 p-4 hover:bg-white/5">Estimate freight range</button>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
                <div className="text-sm text-cyan-200">Freight Intelligence</div>
                <div className="text-xs text-white/50 mt-2">Est. freight: $4,200–$4,900<br />Transit: 18‑22 days<br />Route risk: Low</div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Modals */}
      <SavedContactsModal isOpen={showContactsModal} onClose={() => setShowContactsModal(false)} onSelect={(contact) => { setSeller(contact); setSellerInput(contact.gtid); }} />
      <TrustPortraitModal isOpen={showTrustPortrait} onClose={() => setShowTrustPortrait(false)} seller={seller} />
      <PlainLanguageDecisionPanel verdict={governorDecision?.verdict} conditions={governorDecision?.conditions} onClose={() => setShowDecisionPanel(false)} onRetry={() => { setShowDecisionPanel(false); handleSubmit(); }} tenantMessage={tenantMessage} />
      <BulkEditModal isOpen={bulkEditOpen} onClose={() => setBulkEditOpen(false)} containers={containers} setContainers={setContainers} currentContainerIdx={currentContainerIdx} />
      <VoiceInputModal isOpen={showVoiceModal} onClose={() => setShowVoiceModal(false)} onTranscription={(text) => setExpressText(text)} />
      <RemoveContainerModal isOpen={removeContainerIdx !== null} onClose={() => setRemoveContainerIdx(null)} onConfirm={confirmRemoveContainer} containerNumber={(removeContainerIdx !== null ? removeContainerIdx+1 : '')} />
      <CommodityOverrideModal isOpen={showCommodityOverrideModal} onClose={() => setShowCommodityOverrideModal(false)} shipment={selectedShipment || {}} onSave={saveShipmentCommodities} productsByCommodityType={productsByCommodityType} />
      {showDisputeModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F172A] border border-cyan-500/30 rounded-3xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold mb-4">Dispute Attribution</h3>
            <textarea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="Why do you dispute this attribution?" className="w-full rounded-xl border border-white/10 bg-[#0A1024] p-3 h-32" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => { alert('Dispute submitted'); setShowDisputeModal(false); }} className="flex-1 py-2 rounded-xl bg-cyan-400 text-black">Submit</button>
              <button onClick={() => setShowDisputeModal(false)} className="flex-1 py-2 rounded-xl border border-white/10">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}