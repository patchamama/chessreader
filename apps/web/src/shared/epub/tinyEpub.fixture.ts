import { strToU8, zipSync } from 'fflate'

/** A 1x1 PNG. */
export const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

const xhtml = (head: string, body: string) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>x</title>${head}</head><body>${body}</body></html>`

/** A tiny EPUB: OPF, nav, NCX, four spine documents, a stylesheet and an image. */
export function tinyEpub(options: { nav?: boolean } = {}): Uint8Array {
  const nav = options.nav ?? true
  return zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'OEBPS/content.opf': strToU8(`<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Mi libro</dc:title></metadata><manifest>
      ${nav ? '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' : ''}
      <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
      <item id="css" href="Styles/book.css" media-type="text/css"/>
      <item id="img" href="Images/d%201.png" media-type="image/png"/>
      <item id="c0" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>
      <item id="c1" href="Text/c1.xhtml" media-type="application/xhtml+xml"/>
      <item id="c2" href="Text/c2.xhtml" media-type="application/xhtml+xml"/>
      <item id="c3" href="Text/c3.xhtml" media-type="application/xhtml+xml"/>
    </manifest><spine toc="ncx"><itemref idref="c0"/><itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/></spine></package>`),
    'OEBPS/nav.xhtml': strToU8(xhtml('', '<nav epub:type="toc"><ol><li><a href="Text/c1.xhtml#start">5. El cambio</a></li><li><a href="Text/c3.xhtml">Final</a></li></ol></nav>')),
    'OEBPS/toc.ncx': strToU8('<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint playOrder="1"><navLabel><text>Capítulo NCX</text></navLabel><content src="Text/c1.xhtml"/></navPoint></navMap></ncx>'),
    'OEBPS/Styles/book.css': strToU8('/* c */ @import url(x.css); body { margin: 0 } span.h3 { font-weight: bold; font-size: 130% } p { background: url(../Images/bg.png); text-indent: 1em } @font-face { font-family: X; src: url(x.ttf) }'),
    'OEBPS/Images/d 1.png': PNG,
    'OEBPS/Text/cover.xhtml': strToU8(xhtml('', '<div/>')),
    'OEBPS/Text/c1.xhtml': strToU8(xhtml('<link rel="stylesheet" type="text/css" href="../Styles/book.css"/>', '<h1>5. El<br/>cambio</h1><p><span class="h3">Sub</span></p><div/><p>1.e4 e5</p><p><img src="../Images/d%201.png" alt="Diagrama 1"/></p><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="../Images/d 1.png"/></svg>')),
    'OEBPS/Text/c2.xhtml': strToU8(xhtml('<style>p.x { color: red }</style>', '<p>more text</p>')),
    'OEBPS/Text/c3.xhtml': strToU8(xhtml('', '<h2>Heading <em>only</em></h2><p>end</p>')),
  })
}
