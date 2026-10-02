// About dialog body. `#` is the dialog title (h2); `##` is a section (h3).

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeHref(href) {
  const h = href.trim();
  if (!h || /[\s"<>]/.test(h)) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(h) && !/^https?:/i.test(h)) return "";
  return h;
}

function replaceLinks(s) {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf("[", i);
    const mid = start < 0 ? -1 : s.indexOf("](", start);
    if (start < 0 || mid < 0) {
      out += s.slice(i);
      break;
    }
    let depth = 1;
    let j = mid + 2;
    for (; j < s.length; j++) {
      if (s[j] === "(") depth += 1;
      else if (s[j] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) {
      out += s.slice(i);
      break;
    }
    out += s.slice(i, start);
    const label = s.slice(start + 1, mid);
    const safe = safeHref(s.slice(mid + 2, j));
    if (!safe) out += label;
    else {
      const attrs = /^https?:/i.test(safe) ? ' target="_blank" rel="noopener noreferrer"' : "";
      out += `<a href="${escapeHtml(safe)}"${attrs}>${label}</a>`;
    }
    i = j + 1;
  }
  return out;
}

function autolink(s) {
  return s.replace(/(?<![="'])https?:\/\/[^\s<]+/g, (url) => {
    const safe = safeHref(url);
    if (!safe) return url;
    return `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
}

function inline(s) {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  return autolink(replaceLinks(t));
}

export function renderAboutMarkdown(md) {
  const lines = String(md).replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let para = [];
  let list = [];
  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^(#{1,2})\s+(.+)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length === 1 ? 2 : 3;
      const id = level === 2 ? ' id="about-title"' : "";
      out.push(`<h${level}${id}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (line.startsWith("- ")) {
      flushPara();
      list.push(line.slice(2));
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return out.join("");
}
