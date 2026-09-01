import { parse } from 'acorn';
import {
  PROBABILITY_FUNCTION_HELPER_NAMES,
} from '../content/probabilityExpressionContract';

type AstNode = {
  type: string;
  start: number;
  end: number;
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  [key: string]: any;
};

export type SafeExpressionLimits = {
  readonly maxSourceBytes: number;
  readonly maxAstNodes: number;
  readonly maxDepth: number;
  readonly maxSteps: number;
  readonly maxArrayElements: number;
};

export const PROBABILITY_EXPRESSION_LIMITS: SafeExpressionLimits = Object.freeze({
  maxSourceBytes: 32 * 1024,
  maxAstNodes: 2_000,
  maxDepth: 64,
  maxSteps: 50_000,
  maxArrayElements: 10_000,
});

const FORBIDDEN_PROPERTIES = new Set(['constructor', 'prototype', '__proto__']);
export const APPROVED_MATH_CONSTANT_NAMES = Object.freeze([
  'E', 'LN10', 'LN2', 'LOG10E', 'LOG2E', 'PI', 'SQRT1_2', 'SQRT2',
] as const);

/** All deterministic ECMAScript 2022 Math functions. Math.random is deliberately excluded. */
export const APPROVED_MATH_FUNCTION_NAMES = Object.freeze([
  'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh', 'cbrt', 'ceil', 'clz32',
  'cos', 'cosh', 'exp', 'expm1', 'floor', 'fround', 'hypot', 'imul', 'log', 'log10', 'log1p',
  'log2', 'max', 'min', 'pow', 'round', 'sign', 'sin', 'sinh', 'sqrt', 'tan', 'tanh', 'trunc',
] as const);

const MATH_CONSTANTS = new Set<string>(APPROVED_MATH_CONSTANT_NAMES);
const MATH_FUNCTIONS = new Set<string>(APPROVED_MATH_FUNCTION_NAMES);
const PROBABILITY_HELPERS = new Set<string>(PROBABILITY_FUNCTION_HELPER_NAMES);
const ARRAY_PROBABILITY_HELPERS = new Set([
  'errlist', 'componentSpacing', 'spacingLagged', 'ppew', 'ppet', 'slideppetw',
]);

export const APPROVED_PROBABILITY_INPUT_FIELDS = new Set([
  'i', 'clusterIndex', 'stimIndex', 'userTotalResponses', 'userCorrectResponses',
  'questionSuccessCount', 'questionFailureCount', 'questionTotalTests', 'questionStudyTrialCount',
  'questionSecsSinceLastShown', 'questionSecsSinceFirstShown', 'questionSecsPracticingOthers',
  'questionTimeHistory', 'questionSpacingLagged', 'stimSecsSinceLastShown', 'stimSecsSinceFirstShown',
  'stimSecsPracticingOthers', 'stimSuccessCount', 'stimFailureCount', 'stimTotalTests',
  'crowdStimSuccessCount', 'crowdStimFailureCount', 'crowdStimTotalTests', 'stimStudyTrialCount',
  'stimTimeHistory', 'stimSpacingLagged', 'responseSuccessCount', 'responseFailureCount',
  'responseOutcomeHistory', 'responseSecsSinceLastShown', 'responseStudyTrialCount',
  'responseTotalTests', 'responseTimeHistory', 'responseSpacingLagged', 'stimParameters',
  'clusterPreviousCalculatedProbabilities', 'clusterOutcomeHistory',
  'stimPreviousCalculatedProbabilities', 'stimOutcomeHistory', 'overallOutcomeHistory',
  'overallStudyHistory',
]);

const APPROVED_PROBABILITY_ARRAY_FIELDS = new Set([
  'questionTimeHistory', 'questionSpacingLagged', 'stimTimeHistory', 'stimSpacingLagged',
  'responseOutcomeHistory', 'responseTimeHistory', 'responseSpacingLagged', 'stimParameters',
  'clusterPreviousCalculatedProbabilities', 'clusterOutcomeHistory',
  'stimPreviousCalculatedProbabilities', 'stimOutcomeHistory', 'overallOutcomeHistory',
  'overallStudyHistory',
]);

export class SafeExpressionError extends Error {
  readonly fieldPath: string;
  readonly line: number | undefined;
  readonly column: number | undefined;

  constructor(message: string, fieldPath: string, node?: AstNode) {
    const line = node?.loc?.start.line;
    const column = node?.loc ? node.loc.start.column + 1 : undefined;
    super(`${fieldPath}${line === undefined ? '' : `:${line}:${column}`}: ${message}`);
    this.name = 'SafeExpressionError';
    this.fieldPath = fieldPath;
    this.line = line;
    this.column = column;
  }
}

export type CompiledSafeProgram = {
  readonly source: string;
  readonly fieldPath: string;
  readonly ast: AstNode;
  readonly outputFields: ReadonlySet<string>;
  readonly limits: SafeExpressionLimits;
};

function fail(message: string, fieldPath: string, node?: AstNode): never {
  throw new SafeExpressionError(message, fieldPath, node);
}

function isNode(value: unknown): value is AstNode {
  return Boolean(value && typeof value === 'object' && typeof (value as AstNode).type === 'string');
}

function countAndBoundAst(root: AstNode, fieldPath: string, limits: SafeExpressionLimits): void {
  let count = 0;
  const visit = (node: AstNode, depth: number) => {
    count += 1;
    if (count > limits.maxAstNodes) fail(`expression exceeds ${limits.maxAstNodes} AST nodes`, fieldPath, node);
    if (depth > limits.maxDepth) fail(`expression exceeds AST depth ${limits.maxDepth}`, fieldPath, node);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc') continue;
      if (isNode(value)) visit(value, depth + 1);
      else if (Array.isArray(value)) {
        for (const item of value) if (isNode(item)) visit(item, depth + 1);
      }
    }
  };
  visit(root, 1);
}

function staticPropertyName(node: AstNode, fieldPath: string): string {
  if (node.computed || node.property?.type !== 'Identifier') {
    fail('computed property access is not allowed', fieldPath, node);
  }
  const name = String(node.property.name || '');
  if (!name || FORBIDDEN_PROPERTIES.has(name)) fail(`property "${name}" is not allowed`, fieldPath, node);
  return name;
}

function collectProbabilityOutputs(root: AstNode, fieldPath: string): Set<string> {
  const outputs = new Set<string>(['probability', 'available']);
  const visit = (node: AstNode) => {
    if (node.type === 'AssignmentExpression' && node.left?.type === 'MemberExpression'
      && node.left.object?.type === 'Identifier' && node.left.object.name === 'p') {
      const name = staticPropertyName(node.left, fieldPath);
      if (APPROVED_PROBABILITY_INPUT_FIELDS.has(name)) {
        fail(`model input p.${name} is read-only`, fieldPath, node.left);
      }
      outputs.add(name);
      if (outputs.size > 128) fail('formula defines more than 128 output fields', fieldPath, node);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc') continue;
      if (isNode(value)) visit(value);
      else if (Array.isArray(value)) for (const item of value) if (isNode(item)) visit(item);
    }
  };
  visit(root);
  return outputs;
}

type ValidationContext = {
  readonly fieldPath: string;
  readonly outputFields: ReadonlySet<string>;
  readonly locals: Map<string, 'let' | 'const'>;
};

function isStaticallyApprovedArray(node: AstNode): boolean {
  if (node.type === 'MemberExpression' && !node.computed
    && node.object?.type === 'Identifier' && node.object.name === 'p'
    && node.property?.type === 'Identifier') {
    return APPROVED_PROBABILITY_ARRAY_FIELDS.has(node.property.name);
  }
  if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && !node.callee.computed
    && node.callee.property?.type === 'Identifier') {
    const method = node.callee.property.name;
    return method === 'slice' || (node.callee.object?.type === 'Identifier'
      && node.callee.object.name === 'pFunc' && ARRAY_PROBABILITY_HELPERS.has(method));
  }
  return false;
}

function validateMember(node: AstNode, context: ValidationContext): void {
  const property = staticPropertyName(node, context.fieldPath);
  const object = node.object as AstNode;
  if (object.type === 'Identifier' && object.name === 'p') {
    if (!APPROVED_PROBABILITY_INPUT_FIELDS.has(property) && !context.outputFields.has(property)) {
      fail(`p.${property} is not an approved model input or formula output`, context.fieldPath, node);
    }
    return;
  }
  if (object.type === 'Identifier' && object.name === 'Math') {
    if (!MATH_CONSTANTS.has(property) && !MATH_FUNCTIONS.has(property)) {
      fail(`Math.${property} is not an approved mathematical primitive`, context.fieldPath, node);
    }
    return;
  }
  if (object.type === 'Identifier' && object.name === 'pFunc') {
    if (!PROBABILITY_HELPERS.has(property)) {
      fail(`pFunc.${property} is not an approved probability helper`, context.fieldPath, node);
    }
    return;
  }
  if (property === 'length' || property === 'slice') {
    if (!isStaticallyApprovedArray(object)) fail(`.${property} requires an approved numeric array`, context.fieldPath, node);
    validateExpression(object, context);
    return;
  }
  fail(`member access .${property} is not allowed`, context.fieldPath, node);
}

function validateExpression(node: AstNode, context: ValidationContext): void {
  switch (node.type) {
    case 'Literal':
      if (!['number', 'boolean', 'string'].includes(typeof node.value) || node.regex || node.bigint !== undefined) {
        fail('only numeric, Boolean, and bounded string literals are allowed', context.fieldPath, node);
      }
      if (typeof node.value === 'string' && node.value.length > 256) fail('string literal exceeds 256 characters', context.fieldPath, node);
      return;
    case 'Identifier':
      if (!context.locals.has(node.name) && !['p', 'pFunc', 'Math'].includes(node.name)) {
        fail(`identifier "${node.name}" is not allowed`, context.fieldPath, node);
      }
      return;
    case 'UnaryExpression':
      if (!['+', '-', '!'].includes(node.operator)) fail(`unary operator ${node.operator} is not allowed`, context.fieldPath, node);
      validateExpression(node.argument, context);
      return;
    case 'BinaryExpression':
      if (!['+', '-', '*', '/', '%', '**', '<', '<=', '>', '>=', '==', '!=', '===', '!=='].includes(node.operator)) {
        fail(`binary operator ${node.operator} is not allowed`, context.fieldPath, node);
      }
      validateExpression(node.left, context);
      validateExpression(node.right, context);
      return;
    case 'LogicalExpression':
      if (!['&&', '||'].includes(node.operator)) fail(`logical operator ${node.operator} is not allowed`, context.fieldPath, node);
      validateExpression(node.left, context);
      validateExpression(node.right, context);
      return;
    case 'ConditionalExpression':
      validateExpression(node.test, context);
      validateExpression(node.consequent, context);
      validateExpression(node.alternate, context);
      return;
    case 'MemberExpression':
      if (node.computed) {
        if (!isStaticallyApprovedArray(node.object)) fail('computed access is allowed only for approved numeric arrays', context.fieldPath, node);
        validateExpression(node.object, context);
        validateExpression(node.property, context);
        return;
      }
      validateMember(node, context);
      return;
    case 'CallExpression': {
      if (node.optional || node.arguments.some((argument: AstNode) => argument.type === 'SpreadElement')) {
        fail('optional calls and spread arguments are not allowed', context.fieldPath, node);
      }
      if (node.callee?.type !== 'MemberExpression') fail('only approved Math, pFunc, and array slice calls are allowed', context.fieldPath, node);
      const property = staticPropertyName(node.callee, context.fieldPath);
      const object = node.callee.object as AstNode;
      const approved = (object.type === 'Identifier' && object.name === 'Math' && MATH_FUNCTIONS.has(property))
        || (object.type === 'Identifier' && object.name === 'pFunc' && PROBABILITY_HELPERS.has(property))
        || property === 'slice';
      if (!approved) fail(`call to .${property} is not allowed`, context.fieldPath, node);
      validateMember(node.callee, context);
      for (const argument of node.arguments) validateExpression(argument, context);
      return;
    }
    case 'AssignmentExpression':
      if (node.operator !== '=') fail('only simple assignment is allowed', context.fieldPath, node);
      if (node.left?.type === 'Identifier') {
        if (context.locals.get(node.left.name) !== 'let') fail(`cannot assign to ${node.left.name}`, context.fieldPath, node.left);
      } else if (node.left?.type === 'MemberExpression' && node.left.object?.type === 'Identifier' && node.left.object.name === 'p') {
        const property = staticPropertyName(node.left, context.fieldPath);
        if (!context.outputFields.has(property) || APPROVED_PROBABILITY_INPUT_FIELDS.has(property)) {
          fail(`cannot assign to p.${property}`, context.fieldPath, node.left);
        }
      } else {
        fail('assignment target must be a let local or approved p output', context.fieldPath, node.left);
      }
      validateExpression(node.right, context);
      return;
    default:
      fail(`syntax ${node.type} is not allowed`, context.fieldPath, node);
  }
}

function validateStatement(node: AstNode, context: ValidationContext, topLevel: boolean): void {
  switch (node.type) {
    case 'EmptyStatement': return;
    case 'ExpressionStatement': validateExpression(node.expression, context); return;
    case 'VariableDeclaration':
      if (!['let', 'const'].includes(node.kind)) fail('only let and const declarations are allowed', context.fieldPath, node);
      for (const declaration of node.declarations as AstNode[]) {
        if (declaration.id?.type !== 'Identifier' || !declaration.init) fail('locals require a simple name and initializer', context.fieldPath, declaration);
        if (['p', 'pFunc', 'Math'].includes(declaration.id.name) || context.locals.has(declaration.id.name)) {
          fail(`local "${declaration.id.name}" is reserved or duplicated`, context.fieldPath, declaration.id);
        }
        context.locals.set(declaration.id.name, node.kind);
        validateExpression(declaration.init, context);
      }
      return;
    case 'IfStatement':
      validateExpression(node.test, context);
      validateStatement(node.consequent, context, false);
      if (node.alternate) validateStatement(node.alternate, context, false);
      return;
    case 'BlockStatement':
      for (const statement of node.body) validateStatement(statement, context, false);
      return;
    case 'ReturnStatement':
      if (!topLevel || node.argument?.type !== 'Identifier' || node.argument.name !== 'p') {
        fail('only the terminal top-level "return p" is allowed', context.fieldPath, node);
      }
      return;
    default:
      fail(`statement ${node.type} is not allowed`, context.fieldPath, node);
  }
}

export function compileProbabilityExpression(
  source: string,
  fieldPath = 'calculateProbability',
  limits: SafeExpressionLimits = PROBABILITY_EXPRESSION_LIMITS,
): CompiledSafeProgram {
  if (typeof source !== 'string' || !source.trim()) fail('formula must be a non-empty string', fieldPath);
  if (new TextEncoder().encode(source).length > limits.maxSourceBytes) {
    fail(`formula exceeds ${limits.maxSourceBytes} bytes`, fieldPath);
  }
  let ast: AstNode;
  try {
    ast = parse(source, {
      ecmaVersion: 2022,
      sourceType: 'script',
      locations: true,
      allowReturnOutsideFunction: true,
    }) as unknown as AstNode;
  } catch (error: unknown) {
    const parseError = error as Error & { loc?: { line: number; column: number } };
    const node = parseError.loc ? {
      type: 'ParseError', start: 0, end: 0,
      loc: { start: parseError.loc, end: parseError.loc },
    } : undefined;
    fail(parseError.message.replace(/\s*\(\d+:\d+\)$/, ''), fieldPath, node);
  }
  countAndBoundAst(ast!, fieldPath, limits);
  const body = ast!.body as AstNode[];
  if (!body.length || body[body.length - 1]?.type !== 'ReturnStatement') {
    fail('formula must end with "return p"', fieldPath, body[body.length - 1] || ast!);
  }
  const outputs = collectProbabilityOutputs(ast!, fieldPath);
  const context: ValidationContext = { fieldPath, outputFields: outputs, locals: new Map() };
  body.forEach((statement, index) => validateStatement(statement, context, index === body.length - 1));
  return Object.freeze({ source, fieldPath, ast: ast!, outputFields: outputs, limits });
}

type RuntimeContext = {
  readonly program: CompiledSafeProgram;
  readonly p: Record<string, unknown>;
  readonly pFunc: Record<string, (...args: any[]) => unknown>;
  readonly locals: Record<string, unknown>;
  readonly localKinds: Map<string, 'let' | 'const'>;
  steps: number;
};

function step(context: RuntimeContext, node: AstNode): void {
  consumeSteps(context, node, 1);
}

function consumeSteps(context: RuntimeContext, node: AstNode, amount: number): void {
  context.steps += amount;
  if (context.steps > context.program.limits.maxSteps) {
    fail(`formula exceeded ${context.program.limits.maxSteps} evaluation steps`, context.program.fieldPath, node);
  }
}

function estimateHelperSteps(name: string, args: unknown[]): number {
  const largestArray = args.reduce<number>(
    (largest, value) => Array.isArray(value) ? Math.max(largest, value.length) : largest,
    0,
  );
  if (['slideppetw', 'ppes', 'ppesFromTimes'].includes(name)) return Math.max(1, largestArray * largestArray);
  return Math.max(1, largestArray * 5);
}

function requireSafeArray(value: unknown, context: RuntimeContext, node: AstNode): unknown[] {
  if (!Array.isArray(value)) fail('array operation requires an approved array value', context.program.fieldPath, node);
  if (value.length > context.program.limits.maxArrayElements) {
    fail(`array exceeds ${context.program.limits.maxArrayElements} elements`, context.program.fieldPath, node);
  }
  return value;
}

function evaluateMember(node: AstNode, context: RuntimeContext): unknown {
  const object = evaluateExpression(node.object, context);
  if (node.computed) {
    const array = requireSafeArray(object, context, node);
    const index = evaluateExpression(node.property, context);
    if (!Number.isInteger(index) || Number(index) < 0) fail('array index must be a non-negative integer', context.program.fieldPath, node.property);
    return array[Number(index)];
  }
  const property = staticPropertyName(node, context.program.fieldPath);
  if (object === context.p) return context.p[property];
  if (object === Math) return (Math as any)[property];
  if (object === context.pFunc) return context.pFunc[property];
  const array = requireSafeArray(object, context, node);
  if (property === 'length') return array.length;
  if (property === 'slice') return array.slice.bind(array);
  fail(`array property .${property} is not allowed`, context.program.fieldPath, node);
}

function requireFiniteNumericResult(value: unknown, context: RuntimeContext, node: AstNode): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('mathematical operation produced a non-finite number', context.program.fieldPath, node);
  }
  return value;
}

function evaluateExpression(node: AstNode, context: RuntimeContext): any {
  step(context, node);
  switch (node.type) {
    case 'Literal': return node.value;
    case 'Identifier':
      if (node.name === 'p') return context.p;
      if (node.name === 'pFunc') return context.pFunc;
      if (node.name === 'Math') return Math;
      return context.locals[node.name];
    case 'UnaryExpression': {
      const value = evaluateExpression(node.argument, context);
      if (node.operator === '!') return !value;
      const numeric = requireFiniteNumericResult(value, context, node.argument);
      return node.operator === '-' ? -numeric : numeric;
    }
    case 'BinaryExpression': {
      const left = evaluateExpression(node.left, context);
      const right = evaluateExpression(node.right, context);
      switch (node.operator) {
        case '==': return left == right; // Preserve authored formula semantics without executing JavaScript.
        case '!=': return left != right;
        case '===': return left === right;
        case '!==': return left !== right;
        case '<': return Number(left) < Number(right);
        case '<=': return Number(left) <= Number(right);
        case '>': return Number(left) > Number(right);
        case '>=': return Number(left) >= Number(right);
        default: {
          const a = requireFiniteNumericResult(left, context, node.left);
          const b = requireFiniteNumericResult(right, context, node.right);
          const result = node.operator === '+' ? a + b
            : node.operator === '-' ? a - b
              : node.operator === '*' ? a * b
                : node.operator === '/' ? a / b
                  : node.operator === '%' ? a % b
                    : a ** b;
          return requireFiniteNumericResult(result, context, node);
        }
      }
    }
    case 'LogicalExpression': {
      const left = evaluateExpression(node.left, context);
      return node.operator === '&&' ? (left && evaluateExpression(node.right, context)) : (left || evaluateExpression(node.right, context));
    }
    case 'ConditionalExpression':
      return evaluateExpression(node.test, context)
        ? evaluateExpression(node.consequent, context)
        : evaluateExpression(node.alternate, context);
    case 'MemberExpression': return evaluateMember(node, context);
    case 'CallExpression': {
      const property = staticPropertyName(node.callee, context.program.fieldPath);
      const receiver = evaluateExpression(node.callee.object, context);
      const args = node.arguments.map((argument: AstNode) => evaluateExpression(argument, context));
      let result: unknown;
      if (receiver === Math) result = (Math as any)[property](...args);
      else if (receiver === context.pFunc) {
        consumeSteps(context, node, estimateHelperSteps(property, args));
        result = context.pFunc[property]?.(...args.map((value: unknown) => Array.isArray(value) ? [...value] : value));
      }
      else {
        const array = requireSafeArray(receiver, context, node);
        const sliced = array.slice(...args.map(Number));
        result = sliced;
        consumeSteps(context, node, sliced.length);
      }
      if (Array.isArray(result)) return requireSafeArray(result, context, node);
      if (typeof result === 'number') return requireFiniteNumericResult(result, context, node);
      return result;
    }
    case 'AssignmentExpression': {
      const value = evaluateExpression(node.right, context);
      if (node.left.type === 'Identifier') context.locals[node.left.name] = value;
      else context.p[staticPropertyName(node.left, context.program.fieldPath)] = value;
      return value;
    }
    default: return fail(`syntax ${node.type} is not executable`, context.program.fieldPath, node);
  }
}

type StatementResult = { returned: boolean };

function evaluateStatement(node: AstNode, context: RuntimeContext): StatementResult {
  step(context, node);
  switch (node.type) {
    case 'EmptyStatement': return { returned: false };
    case 'ExpressionStatement': evaluateExpression(node.expression, context); return { returned: false };
    case 'VariableDeclaration':
      for (const declaration of node.declarations as AstNode[]) {
        const value = evaluateExpression(declaration.init, context);
        requireFiniteNumericResult(value, context, declaration.init);
        context.locals[declaration.id.name] = value;
        context.localKinds.set(declaration.id.name, node.kind);
      }
      return { returned: false };
    case 'IfStatement':
      return evaluateStatement(evaluateExpression(node.test, context) ? node.consequent : node.alternate || { type: 'EmptyStatement', start: node.start, end: node.end, loc: node.loc }, context);
    case 'BlockStatement':
      for (const statement of node.body as AstNode[]) {
        const result = evaluateStatement(statement, context);
        if (result.returned) return result;
      }
      return { returned: false };
    case 'ReturnStatement': return { returned: true };
    default: return fail(`statement ${node.type} is not executable`, context.program.fieldPath, node);
  }
}

function copyModelInput(value: unknown, field: string, program: CompiledSafeProgram): unknown {
  if (Array.isArray(value)) {
    if (value.length > program.limits.maxArrayElements) fail(`p.${field} exceeds ${program.limits.maxArrayElements} elements`, program.fieldPath);
    return value.map((item, index) => {
      const numeric = Number(item);
      if (!Number.isFinite(numeric)) fail(`p.${field}[${index}] must be finite`, program.fieldPath);
      return numeric;
    });
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) fail(`p.${field} must be finite`, program.fieldPath);
  return numeric;
}

export function createProbabilityModelSnapshot(input: Record<string, unknown>, program: CompiledSafeProgram): Record<string, unknown> {
  const snapshot = Object.create(null) as Record<string, unknown>;
  for (const field of APPROVED_PROBABILITY_INPUT_FIELDS) {
    if (input[field] !== undefined) snapshot[field] = copyModelInput(input[field], field, program);
  }
  return snapshot;
}

export function interpretProbabilityExpression(
  program: CompiledSafeProgram,
  input: Record<string, unknown>,
  helpers: Record<string, (...args: any[]) => unknown>,
): Record<string, unknown> {
  const safeHelpers = Object.create(null) as Record<string, (...args: any[]) => unknown>;
  for (const name of PROBABILITY_HELPERS) {
    if (typeof helpers[name] !== 'function') fail(`approved helper pFunc.${name} is unavailable`, program.fieldPath);
    safeHelpers[name] = helpers[name]!;
  }
  const p = createProbabilityModelSnapshot(input, program);
  const context: RuntimeContext = {
    program,
    p,
    pFunc: safeHelpers,
    locals: Object.create(null),
    localKinds: new Map(),
    steps: 0,
  };
  let returned = false;
  for (const statement of program.ast.body as AstNode[]) {
    const result = evaluateStatement(statement, context);
    if (result.returned) { returned = true; break; }
  }
  if (!returned) fail('formula did not return p', program.fieldPath, program.ast);
  const probability = p.probability;
  if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) {
    fail('p.probability must be finite and within [0,1]', program.fieldPath, program.ast);
  }
  if (p.available !== undefined && typeof p.available !== 'boolean') {
    fail('p.available must be Boolean when supplied', program.fieldPath, program.ast);
  }
  for (const field of program.outputFields) {
    const value = p[field];
    if (value === undefined || field === 'probability' || field === 'available') continue;
    if (typeof value === 'number' && Number.isFinite(value)) continue;
    if (typeof value === 'boolean') continue;
    if (typeof value === 'string' && value.length <= 256) continue;
    fail(`diagnostic p.${field} must be a finite number, Boolean, or string of at most 256 characters`, program.fieldPath, program.ast);
  }
  return p;
}

export function isApprovedProbabilityArrayField(name: string): boolean {
  return APPROVED_PROBABILITY_ARRAY_FIELDS.has(name);
}

export type CompiledSafeBooleanExpression = {
  readonly source: string;
  readonly fieldPath: string;
  readonly ast: AstNode;
  readonly identifiers: ReadonlySet<string>;
  readonly limits: SafeExpressionLimits;
};

function validateBooleanExpression(node: AstNode, fieldPath: string, identifiers: ReadonlySet<string>): void {
  switch (node.type) {
    case 'Literal':
      if (!['number', 'boolean'].includes(typeof node.value)) fail('condition literals must be numeric or Boolean', fieldPath, node);
      return;
    case 'Identifier':
      if (!identifiers.has(node.name)) fail(`condition identifier "${node.name}" is not allowed`, fieldPath, node);
      return;
    case 'UnaryExpression':
      if (!['!', '+', '-'].includes(node.operator)) fail(`condition unary operator ${node.operator} is not allowed`, fieldPath, node);
      validateBooleanExpression(node.argument, fieldPath, identifiers);
      return;
    case 'BinaryExpression':
      if (!['+', '-', '*', '/', '%', '<', '<=', '>', '>=', '==', '!=', '===', '!=='].includes(node.operator)) {
        fail(`condition operator ${node.operator} is not allowed`, fieldPath, node);
      }
      validateBooleanExpression(node.left, fieldPath, identifiers);
      validateBooleanExpression(node.right, fieldPath, identifiers);
      return;
    case 'LogicalExpression':
      if (!['&&', '||'].includes(node.operator)) fail(`condition operator ${node.operator} is not allowed`, fieldPath, node);
      validateBooleanExpression(node.left, fieldPath, identifiers);
      validateBooleanExpression(node.right, fieldPath, identifiers);
      return;
    default:
      fail(`condition syntax ${node.type} is not allowed`, fieldPath, node);
  }
}

export function compileSafeBooleanExpression(
  source: string,
  identifiers: ReadonlySet<string>,
  fieldPath: string,
  limits: SafeExpressionLimits,
): CompiledSafeBooleanExpression {
  if (new TextEncoder().encode(source).length > limits.maxSourceBytes) fail(`condition exceeds ${limits.maxSourceBytes} bytes`, fieldPath);
  let program: AstNode;
  try {
    program = parse(source, { ecmaVersion: 2022, sourceType: 'script', locations: true }) as unknown as AstNode;
  } catch (error: unknown) {
    const parseError = error as Error & { loc?: { line: number; column: number } };
    const node = parseError.loc ? {
      type: 'ParseError', start: 0, end: 0,
      loc: { start: parseError.loc, end: parseError.loc },
    } : undefined;
    fail(parseError.message.replace(/\s*\(\d+:\d+\)$/, ''), fieldPath, node);
  }
  countAndBoundAst(program!, fieldPath, limits);
  const body = program!.body as AstNode[];
  if (body.length !== 1 || body[0]?.type !== 'ExpressionStatement') fail('condition must contain exactly one expression', fieldPath, program!);
  validateBooleanExpression(body[0].expression, fieldPath, identifiers);
  return Object.freeze({ source, fieldPath, ast: body[0].expression, identifiers, limits });
}

function evaluateBooleanAst(
  node: AstNode,
  values: Readonly<Record<string, boolean | number>>,
  compiled: CompiledSafeBooleanExpression,
  state: { steps: number },
): any {
  state.steps += 1;
  if (state.steps > compiled.limits.maxSteps) fail(`condition exceeded ${compiled.limits.maxSteps} evaluation steps`, compiled.fieldPath, node);
  switch (node.type) {
    case 'Literal': return node.value;
    case 'Identifier': return values[node.name] ?? false;
    case 'UnaryExpression': {
      const value = evaluateBooleanAst(node.argument, values, compiled, state);
      if (node.operator === '!') return !value;
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) fail('condition produced a non-finite number', compiled.fieldPath, node);
      return node.operator === '-' ? -numberValue : numberValue;
    }
    case 'LogicalExpression': {
      const left = evaluateBooleanAst(node.left, values, compiled, state);
      return node.operator === '&&'
        ? left && evaluateBooleanAst(node.right, values, compiled, state)
        : left || evaluateBooleanAst(node.right, values, compiled, state);
    }
    case 'BinaryExpression': {
      const left = evaluateBooleanAst(node.left, values, compiled, state);
      const right = evaluateBooleanAst(node.right, values, compiled, state);
      switch (node.operator) {
        case '==': return left == right;
        case '!=': return left != right;
        case '===': return left === right;
        case '!==': return left !== right;
        case '<': return Number(left) < Number(right);
        case '<=': return Number(left) <= Number(right);
        case '>': return Number(left) > Number(right);
        case '>=': return Number(left) >= Number(right);
        default: {
          const a = Number(left);
          const b = Number(right);
          if (!Number.isFinite(a) || !Number.isFinite(b)) fail('condition arithmetic requires finite numbers', compiled.fieldPath, node);
          const result = node.operator === '+' ? a + b
            : node.operator === '-' ? a - b
              : node.operator === '*' ? a * b
                : node.operator === '/' ? a / b
                  : a % b;
          if (!Number.isFinite(result)) fail('condition produced a non-finite number', compiled.fieldPath, node);
          return result;
        }
      }
    }
    default: return fail(`condition syntax ${node.type} is not executable`, compiled.fieldPath, node);
  }
}

export function interpretSafeBooleanExpression(
  compiled: CompiledSafeBooleanExpression,
  values: Readonly<Record<string, boolean | number>>,
): boolean {
  return Boolean(evaluateBooleanAst(compiled.ast, values, compiled, { steps: 0 }));
}
