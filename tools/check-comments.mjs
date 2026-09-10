import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LanguageVariant, SyntaxKind } from 'typescript/unstable/ast';
import {
  computeLineStarts,
  createScanner,
  tokenIsIdentifierOrKeyword,
} from 'typescript/unstable/ast/scanner';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const JSX_EXTENSIONS = new Set(['.tsx', '.jsx']);
const RULE_HOME = 'CLAUDE.md section 7';
const EXCERPT_LIMIT = 78;
const BYTE_ORDER_MARK = 0xfeff;

const ENDS_EXPRESSION = new Set([
  SyntaxKind.Identifier,
  SyntaxKind.PrivateIdentifier,
  SyntaxKind.NumericLiteral,
  SyntaxKind.BigIntLiteral,
  SyntaxKind.StringLiteral,
  SyntaxKind.RegularExpressionLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateTail,
  SyntaxKind.CloseBracketToken,
  SyntaxKind.CloseBraceToken,
  SyntaxKind.GreaterThanToken,
  SyntaxKind.PlusPlusToken,
  SyntaxKind.MinusMinusToken,
  SyntaxKind.ExclamationToken,
  SyntaxKind.ThisKeyword,
  SyntaxKind.SuperKeyword,
  SyntaxKind.TrueKeyword,
  SyntaxKind.FalseKeyword,
  SyntaxKind.NullKeyword,
  SyntaxKind.AnyKeyword,
  SyntaxKind.UnknownKeyword,
  SyntaxKind.NeverKeyword,
  SyntaxKind.StringKeyword,
  SyntaxKind.NumberKeyword,
  SyntaxKind.BooleanKeyword,
  SyntaxKind.BigIntKeyword,
  SyntaxKind.SymbolKeyword,
  SyntaxKind.ObjectKeyword,
  SyntaxKind.UndefinedKeyword,
  SyntaxKind.ConstKeyword,
]);

const CONTROL_PAREN_HEADS = new Set([
  SyntaxKind.IfKeyword,
  SyntaxKind.WhileKeyword,
  SyntaxKind.ForKeyword,
  SyntaxKind.SwitchKeyword,
  SyntaxKind.CatchKeyword,
  SyntaxKind.WithKeyword,
]);

const isComment = (token) =>
  token === SyntaxKind.SingleLineCommentTrivia || token === SyntaxKind.MultiLineCommentTrivia;

const isTrivia = (token) =>
  token === SyntaxKind.WhitespaceTrivia ||
  token === SyntaxKind.NewLineTrivia ||
  token === SyntaxKind.ConflictMarkerTrivia;

function findComments(text, jsx) {
  const scanner = createScanner(false, jsx ? LanguageVariant.JSX : LanguageVariant.Standard, text);
  const comments = [];
  const parenHeads = [];
  let previous = SyntaxKind.Unknown;
  let previousFollowedADot = false;
  let closedParenHead = SyntaxKind.Unknown;

  const record = (sink) => {
    sink.push({ pos: scanner.getTokenStart(), text: scanner.getTokenText() });
  };

  const advancePrevious = (token) => {
    previousFollowedADot =
      previous === SyntaxKind.DotToken || previous === SyntaxKind.QuestionDotToken;
    previous = token;
  };

  const startExpression = () => {
    previous = SyntaxKind.Unknown;
    previousFollowedADot = false;
  };

  const previousEndsExpression = () => {
    if (previous === SyntaxKind.CloseParenToken) return !CONTROL_PAREN_HEADS.has(closedParenHead);
    if (previousFollowedADot && tokenIsIdentifierOrKeyword(previous)) return true;
    return ENDS_EXPRESSION.has(previous);
  };

  const nextSignificant = (sink) => {
    for (;;) {
      const token = scanner.scan();
      if (isComment(token)) {
        record(sink);
        continue;
      }
      if (isTrivia(token)) continue;
      return token;
    }
  };

  const scanJsxExpressionContainer = (sink) => {
    startExpression();
    return scanRegion(sink, true) === SyntaxKind.CloseBraceToken;
  };

  function scanRegion(sink, stopAtCloseBrace) {
    for (;;) {
      let token = scanner.scan();
      if (token === SyntaxKind.EndOfFile) return token;
      if (isComment(token)) {
        record(sink);
        continue;
      }
      if (isTrivia(token)) continue;

      if (
        (token === SyntaxKind.SlashToken || token === SyntaxKind.SlashEqualsToken) &&
        !previousEndsExpression()
      ) {
        token = scanner.reScanSlashToken();
      }

      if (token === SyntaxKind.OpenParenToken) parenHeads.push(previous);
      if (token === SyntaxKind.CloseParenToken) {
        closedParenHead = parenHeads.pop() ?? SyntaxKind.Unknown;
      }

      if (token === SyntaxKind.TemplateHead) {
        const end = scanTemplateSubstitutions(sink);
        if (end === SyntaxKind.EndOfFile) return end;
        advancePrevious(SyntaxKind.TemplateTail);
        continue;
      }

      if (token === SyntaxKind.OpenBraceToken) {
        const end = scanRegion(sink, true);
        if (end === SyntaxKind.EndOfFile) return end;
        advancePrevious(SyntaxKind.CloseBraceToken);
        continue;
      }

      if (token === SyntaxKind.CloseBraceToken && stopAtCloseBrace) return token;

      if (jsx && token === SyntaxKind.LessThanToken) {
        advancePrevious(
          readJsxElement(sink) ? SyntaxKind.GreaterThanToken : SyntaxKind.LessThanToken,
        );
        continue;
      }

      advancePrevious(token);
    }
  }

  function scanTemplateSubstitutions(sink) {
    for (;;) {
      const end = scanRegion(sink, true);
      if (end !== SyntaxKind.CloseBraceToken) return SyntaxKind.EndOfFile;
      const token = scanner.reScanTemplateToken(false);
      if (token === SyntaxKind.TemplateTail) return token;
      if (token !== SyntaxKind.TemplateMiddle) return SyntaxKind.EndOfFile;
    }
  }

  function readJsxElement(sink) {
    const resume = scanner.getTokenEnd();
    const outerPrevious = previous;
    const outerPreviousFollowedADot = previousFollowedADot;
    const outerParenDepth = parenHeads.length;
    const staged = [];
    if (readJsxElementBody(staged)) {
      sink.push(...staged);
      return true;
    }
    scanner.resetTokenState(resume);
    parenHeads.length = outerParenDepth;
    previous = outerPrevious;
    previousFollowedADot = outerPreviousFollowedADot;
    return false;
  }

  function readJsxElementBody(sink) {
    let token = nextSignificant(sink);

    if (token !== SyntaxKind.GreaterThanToken) {
      if (!tokenIsIdentifierOrKeyword(token)) return false;
      scanner.scanJsxIdentifier();
      token = nextSignificant(sink);

      while (token === SyntaxKind.DotToken || token === SyntaxKind.ColonToken) {
        token = nextSignificant(sink);
        if (!tokenIsIdentifierOrKeyword(token)) return false;
        scanner.scanJsxIdentifier();
        token = nextSignificant(sink);
      }

      for (;;) {
        if (token === SyntaxKind.GreaterThanToken) break;
        if (token === SyntaxKind.SlashToken) {
          return nextSignificant(sink) === SyntaxKind.GreaterThanToken;
        }
        if (token === SyntaxKind.OpenBraceToken) {
          if (!scanJsxExpressionContainer(sink)) return false;
          token = nextSignificant(sink);
          continue;
        }
        if (!tokenIsIdentifierOrKeyword(token)) return false;
        scanner.scanJsxIdentifier();
        token = nextSignificant(sink);
        while (token === SyntaxKind.ColonToken) {
          token = nextSignificant(sink);
          if (!tokenIsIdentifierOrKeyword(token)) return false;
          scanner.scanJsxIdentifier();
          token = nextSignificant(sink);
        }
        if (token !== SyntaxKind.EqualsToken) continue;
        token = nextSignificant(sink);
        if (token === SyntaxKind.StringLiteral) {
          token = nextSignificant(sink);
          continue;
        }
        if (token === SyntaxKind.OpenBraceToken) {
          if (!scanJsxExpressionContainer(sink)) return false;
          token = nextSignificant(sink);
          continue;
        }
        return false;
      }
    }

    for (;;) {
      const child = scanner.scanJsxToken();
      if (child === SyntaxKind.JsxText || child === SyntaxKind.JsxTextAllWhiteSpaces) continue;
      if (child === SyntaxKind.OpenBraceToken) {
        if (!scanJsxExpressionContainer(sink)) return false;
        continue;
      }
      if (child === SyntaxKind.LessThanSlashToken) {
        for (;;) {
          const closing = nextSignificant(sink);
          if (closing === SyntaxKind.GreaterThanToken) return true;
          if (closing === SyntaxKind.EndOfFile) return false;
        }
      }
      if (child !== SyntaxKind.LessThanToken) return false;
      if (!readJsxElementBody(sink)) return false;
    }
  }

  scanRegion(comments, false);
  return comments;
}

function locate(lineStarts, pos) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (lineStarts[middle] <= pos) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: pos - lineStarts[low] + 1 };
}

function excerpt(text) {
  const firstLine = text.split('\n', 1)[0].trim();
  return firstLine.length > EXCERPT_LIMIT ? `${firstLine.slice(0, EXCERPT_LIMIT - 1)}…` : firstLine;
}

function listCandidateFiles() {
  let output;
  try {
    output = execFileSync(
      'git',
      ['ls-files', '-z', '--deduplicate', '--cached', '--others', '--exclude-standard'],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (error) {
    console.error(
      'check:comments: could not list files with git.\n' +
        '  The check enumerates tracked and not-ignored files so that .gitignore stays the\n' +
        '  single source of truth for what is part of the repository.\n' +
        `  ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(2);
  }
  const files = output
    .split('\0')
    .filter((file) => file !== '' && EXTENSIONS.includes(extname(file)));
  return [...new Set(files)].sort();
}

const files = listCandidateFiles();
const violations = [];
let scanned = 0;

for (const file of files) {
  let text;
  try {
    text = readFileSync(resolve(REPO_ROOT, file), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }
  if (text.charCodeAt(0) === BYTE_ORDER_MARK) text = text.slice(1);
  scanned += 1;
  const comments = findComments(text, JSX_EXTENSIONS.has(extname(file)));
  if (comments.length === 0) continue;
  const lineStarts = computeLineStarts(text);
  for (const comment of comments) {
    violations.push({ file, ...locate(lineStarts, comment.pos), text: excerpt(comment.text) });
  }
}

if (violations.length > 0) {
  console.error(`check:comments: ${violations.length} comment(s) in files that must carry none\n`);
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}:${violation.column}`);
    console.error(`    ${violation.text}\n`);
  }
  console.error(
    `Source, config and script files carry no comments (${RULE_HOME}); .gitignore is the\n` +
      'sole exception. Explanation belongs in CLAUDE.md, in docs/decisions/, or in the spec —\n' +
      'somewhere it can be found and reviewed. Name things so that no comment is wanted.',
  );
  process.exit(1);
}

console.log(
  `check:comments: ${scanned} files scanned (${EXTENSIONS.join(', ')}), no comments found`,
);
