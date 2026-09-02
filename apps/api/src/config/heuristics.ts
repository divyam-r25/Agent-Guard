// ─── Heuristic Injection Detection Patterns ───
// Configurable patterns for the Context Firewall heuristic scanner.

export interface HeuristicPattern {
  id: string;
  pattern: RegExp;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  attackType: string;
}

export const INJECTION_PATTERNS: HeuristicPattern[] = [
  // ─── Goal Hijack Patterns ───
  {
    id: 'GH001',
    pattern: /ignore\s+(previous|prior|all|above|earlier)\s+(instructions?|prompts?|rules?|commands?)/i,
    description: 'Attempts to override previous instructions',
    severity: 'critical',
    attackType: 'goal_hijack',
  },
  {
    id: 'GH002',
    pattern: /system\s*(message|override|prompt|instruction|command)\s*:/i,
    description: 'Fake system message injection',
    severity: 'critical',
    attackType: 'goal_hijack',
  },
  {
    id: 'GH003',
    pattern: /developer\s*(message|mode|instruction|override)\s*:/i,
    description: 'Fake developer message injection',
    severity: 'critical',
    attackType: 'goal_hijack',
  },
  {
    id: 'GH004',
    pattern: /you\s+(must|should|need\s+to|are\s+required\s+to)\s+(now\s+)?(change|modify|update|alter|increase|decrease|set|switch|redirect|replace)/i,
    description: 'Imperative action instruction unrelated to product',
    severity: 'high',
    attackType: 'goal_hijack',
  },
  {
    id: 'GH005',
    pattern: /do\s+not\s+(tell|reveal|show|inform|disclose|mention)\s+(the\s+)?(user|customer|buyer|human)/i,
    description: 'Instruction to hide actions from user',
    severity: 'critical',
    attackType: 'goal_hijack',
  },
  {
    id: 'GH006',
    pattern: /pretend\s+(to\s+be|you\s+are|that\s+you)|operating\s+in\s+test\s+mode|skip\s+(user\s+)?verification/i,
    description: 'Identity manipulation or verification bypass attempt',
    severity: 'critical',
    attackType: 'goal_hijack',
  },
  {
    id: 'GH007',
    pattern: /override\s+(all|any|the|your)\s+(safety|security|rules?|policies|constraints?|restrictions?|limits?|user\s+limits?|shopping)/i,
    description: 'Attempts to override safety controls or budget limits',
    severity: 'critical',
    attackType: 'goal_hijack',
  },
  {
    id: 'GH008',
    pattern: /add\s+extended\s+warranty|additional\s+charge|unlimited\s+spending/i,
    description: 'Unauthorized additional fees or budget escalation',
    severity: 'high',
    attackType: 'goal_hijack',
  },

  // ─── Transaction Manipulation Patterns ───
  {
    id: 'TM001',
    pattern: /increase\s+(the\s+)?quantity|bulk\s+purchase|minimum\s+order\s*:\s*\d+|wholesale\s+price/i,
    description: 'Instruction to increase quantity or enforce bulk order',
    severity: 'high',
    attackType: 'transaction_manipulation',
  },
  {
    id: 'TM002',
    pattern: /change\s+(the\s+)?(shipping|delivery)\s*address|override\s+the\s+user'?s?\s+default\s+address/i,
    description: 'Instruction to change or override shipping address',
    severity: 'high',
    attackType: 'transaction_manipulation',
  },
  {
    id: 'TM003',
    pattern: /use\s+(this|the\s+following|alternative)\s+(payment|pay)\s*(method|option|card)|subscribing\s+to\s+our\s+monthly|auto-renewal/i,
    description: 'Instruction to change payment method or substitute recurring subscription',
    severity: 'high',
    attackType: 'transaction_manipulation',
  },
  {
    id: 'TM004',
    pattern: /ship\s+(to|them\s+to)\s+(the\s+)?(alternate|alternative|different|this|new|our\s+partner)\s*(address|warehouse)?|diversion\s+road/i,
    description: 'Instruction to redirect shipping destination',
    severity: 'high',
    attackType: 'transaction_manipulation',
  },
  {
    id: 'TM005',
    pattern: /add\s+(additional|extra|more)\s+(items?|products?|units?)\s+(to\s+(the\s+)?(cart|order))?|premium\s+shipping|handling\s+fee|redirect\s+the\s+purchase\s+to/i,
    description: 'Instruction to add extra items, hidden fees, or redirect merchant',
    severity: 'high',
    attackType: 'transaction_manipulation',
  },

  // ─── Data Hiding Patterns ───
  {
    id: 'DH001',
    pattern: /[\u200B\u200C\u200D\uFEFF\u2060\u2061\u2062\u2063\u2064]/,
    description: 'Zero-width/invisible characters detected',
    severity: 'medium',
    attackType: 'data_hiding',
  },
  {
    id: 'DH002',
    pattern: /<!--[\s\S]*?(ignore|override|system|instruction|command|execute)[\s\S]*?-->/i,
    description: 'HTML comment containing instructions',
    severity: 'high',
    attackType: 'data_hiding',
  },
  {
    id: 'DH003',
    pattern: /\[\/\/\]:\s*#\s*\(.*?(ignore|override|system|instruction).*?\)/i,
    description: 'Markdown comment containing instructions',
    severity: 'high',
    attackType: 'data_hiding',
  },
  {
    id: 'DH004',
    pattern: /(?:[A-Za-z0-9+/]{40,}={0,2})/,
    description: 'Potential base64-encoded payload',
    severity: 'medium',
    attackType: 'data_hiding',
  },

  // ─── Indirect Instruction Patterns ───
  {
    id: 'IND001',
    pattern: /when\s+(you\s+)?(process|checkout|complete|finalize|submit)\s+(this|the)\s+(order|purchase|transaction)|upon\s+(checkout|payment|completion)/i,
    description: 'Indirect conditional instruction targeting checkout process',
    severity: 'high',
    attackType: 'goal_hijack',
  },
  {
    id: 'IND002',
    pattern: /as\s+(an?\s+)?AI\s+(assistant|agent|model|shopping\s+bot),?\s+(you\s+(should|must|need\s+to|have\s+to))/i,
    description: 'Impersonates expected AI behavior to issue instructions',
    severity: 'critical',
    attackType: 'goal_hijack',
  },

  // ─── Unicode Confusable / Lookalike ───
  {
    id: 'UC001',
    pattern: /[\u0400-\u04FF\u0500-\u052F]{2,}.*(?:system|ignore|override|instruction)/i,
    description: 'Cyrillic/Unicode confusable characters in instruction context',
    severity: 'medium',
    attackType: 'data_hiding',
  },
  {
    id: 'UC002',
    // Cherokee characters commonly used in lookalike attacks
    pattern: /[\u13A0-\u13FF]{2,}/,
    description: 'Cherokee/unusual Unicode script block (possible confusable attack)',
    severity: 'medium',
    attackType: 'data_hiding',
  },

  // ─── System Prompt Impersonation ───
  {
    id: 'SPI001',
    pattern: /^\s*SYSTEM\s*[:：]\s*/im,
    description: 'SYSTEM: prefix in product content',
    severity: 'critical',
    attackType: 'goal_hijack',
  },
  {
    id: 'SPI002',
    pattern: /^\s*OVERRIDE\s*[:：]\s*/im,
    description: 'OVERRIDE: prefix attempting to hijack agent behavior',
    severity: 'critical',
    attackType: 'goal_hijack',
  },

  // ─── Multilingual Attacks ───
  {
    id: 'ML001',
    // Arabic: "ignore previous instructions"
    pattern: /تجاهل\s+التعليمات|تجاهل\s+الأوامر/,
    description: 'Arabic-language instruction override attempt',
    severity: 'high',
    attackType: 'goal_hijack',
  },
];

// Fields expected to contain product/merchant descriptions
export const ALLOWED_CONTENT_FIELDS = [
  'name', 'description', 'category', 'brand', 'color', 'size',
  'material', 'weight', 'dimensions',
];

// Fields that should never contain imperative instructions
export const SENSITIVE_FIELDS = [
  'description', 'reviews', 'metadata', 'notes', 'tags',
];
