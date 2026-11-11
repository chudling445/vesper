"""Reading the links you send her: fetch the page and reduce it to text.

Only public http(s) pages are read, redirects are checked one hop at a time,
and the body is capped, so a link can never make her poke at this machine or
pull in something enormous. Everything here is plain stdlib + requests, which
the project already depends on.
"""
import ipaddress
import re
import socket
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import requests

URL_RE = re.compile(r"https?://[^\s<>\"'`]+", re.I)
MAX_LINKS = 3          # links read per message
MAX_CHARS = 4000       # per page, after stripping tags
MAX_BYTES = 1_500_000  # never download more than this from one page
TIMEOUT = (5, 12)      # connect, read
USER_AGENT = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 Vesper/1.1")

_SKIP = {"script", "style", "noscript", "svg", "template", "iframe", "canvas"}
_BREAK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "section",
          "article", "blockquote", "pre", "td", "th", "ul", "ol", "table", "main"}
_CHROME = {"nav", "footer", "aside", "form", "button", "header"}  # menus and boilerplate


class _Text(HTMLParser):
    """Pull the readable text (and the title) out of an HTML page."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.title = ""
        self._skip = 0
        self._chrome = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self._in_title = True
        if tag in _SKIP:
            self._skip += 1
        elif tag in _CHROME:
            self._chrome += 1
        if tag in _BREAK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if tag in _SKIP and self._skip:
            self._skip -= 1
        elif tag in _CHROME and self._chrome:
            self._chrome -= 1
        if tag in _BREAK:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip and not self._chrome:
            self.parts.append(data)


def find(text):
    """The links in a message, in order, without duplicates."""
    seen, found = set(), []
    for raw in URL_RE.findall(text or ""):
        url = raw.rstrip(".,;:!?'\"")
        while url.endswith(")") and url.count("(") < url.count(")"):
            url = url[:-1].rstrip(".,;:!?'\"")  # a closing bracket in prose, not in the link
        key = url.lower()
        if key in seen:
            continue
        seen.add(key)
        found.append(url)
        if len(found) >= MAX_LINKS:
            break
    return found


def _public(url):
    """Refuse anything that is not a public http(s) host (no localhost, LAN, or metadata IPs)."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise ValueError("only http and https links can be opened")
    host = parts.hostname
    if not host:
        raise ValueError("that link has no host")
    port = parts.port or (443 if parts.scheme == "https" else 80)
    try:
        addresses = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise ValueError("that host could not be found") from None
    for info in addresses:
        if not ipaddress.ip_address(info[4][0]).is_global:
            raise ValueError("that address is local or private, so she will not open it")


def _response(url):
    """GET a URL, following redirects by hand so every hop is checked."""
    for _ in range(5):
        _public(url)
        response = requests.get(
            url,
            headers={"User-Agent": USER_AGENT,
                     "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1"},
            timeout=TIMEOUT,
            stream=True,
            allow_redirects=False,
        )
        location = response.headers.get("location")
        if response.is_redirect and location:
            response.close()
            url = urljoin(url, location)
            continue
        return response, url
    raise ValueError("the link redirected too many times")


def _clean_text(raw, truncated):
    text = re.sub(r"[ \t\f\v]+", " ", raw)
    text = re.sub(r"\s*\n\s*", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) > MAX_CHARS:
        cut = text[:MAX_CHARS]
        text = cut[:cut.rfind(" ")] if " " in cut else cut
        truncated = True
    return text, truncated


def _charset(body):
    """The charset the page declares in its first 2 KB, if any."""
    found = re.search(rb"charset\s*=\s*[\"']?([\w.:-]+)", body[:2048], re.I)
    return found.group(1).decode("ascii", "ignore") if found else None


def read(url):
    """One link -> {url, title, text} or {url, error}. Never raises."""
    try:
        response, final_url = _response(url)
        try:
            if response.status_code >= 400:
                return {"url": final_url, "error": f"the page answered HTTP {response.status_code}"}
            kind = (response.headers.get("content-type") or "").split(";")[0].strip().lower()
            if kind not in ("text/html", "application/xhtml+xml", "text/plain"):
                return {"url": final_url, "error": f"that is {kind or 'not a web page'}, not readable text"}
            body, truncated = b"", False
            for chunk in response.iter_content(65536):
                body += chunk
                if len(body) >= MAX_BYTES:
                    body, truncated = body[:MAX_BYTES], True
                    break
        finally:
            response.close()
        # requests defaults text/* to ISO-8859-1, which turns a UTF-8 page into
        # mojibake. Trust the header only when it names a charset, otherwise read
        # the page's own <meta charset>.
        declared = "charset" in (response.headers.get("content-type") or "").lower()
        encoding = (response.encoding if declared else None) or _charset(body) or "utf-8"
        try:
            html = body.decode(encoding, errors="replace")
        except LookupError:
            html = body.decode("utf-8", errors="replace")
        if kind == "text/plain":
            text, truncated = _clean_text(html, truncated)
            return {"url": final_url, "title": final_url, "text": text, "truncated": truncated}
        parser = _Text()
        parser.feed(html)
        parser.close()
        text, truncated = _clean_text("".join(parser.parts), truncated)
        title = " ".join(parser.title.split()) or final_url
        if not text:
            return {"url": final_url, "error": "the page had no readable text (it may need JavaScript)"}
        return {"url": final_url, "title": title, "text": text, "truncated": truncated}
    except requests.RequestException as error:
        return {"url": url, "error": f"the page could not be reached ({type(error).__name__})"}
    except ValueError as error:
        return {"url": url, "error": str(error)}


def as_context(pages):
    """The pages, written for the model to answer from."""
    lines = ["[Pages senpai linked in this message]"]
    for number, page in enumerate(pages, 1):
        if page.get("error"):
            lines.append(f"{number}. {page['url']} - could not be read: {page['error']}.")
            continue
        lines.append(f"{number}. {page['url']}\nTitle: {page['title']}")
        lines.append(f"Text:{' (cut short)' if page.get('truncated') else ''}\n{page['text']}")
    lines.append("[End of linked pages]")
    return "\n".join(lines)
